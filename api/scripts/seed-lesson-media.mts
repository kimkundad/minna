/**
 * Puts a real video and a real PDF behind the demo courses' lessons.
 *
 *   npx tsx scripts/seed-lesson-media.mts
 *
 * The seeded courses have titles, lengths and modules but nothing to play, so
 * the learning room shows "ยังไม่ได้อัปโหลดไฟล์" on every lesson. This gives
 * them something, which is what makes the player, the progress rule and the
 * document reader testable at all.
 *
 * One upload, not one per course. The same two files stand in for every
 * lesson — they are demonstration content, not the school's material, and
 * copying 26 MB fifteen times to say the same thing would be 390 MB of storage
 * spent on a stand-in. Access is still checked per course, because the check is
 * on the entitlement and not on where the file happens to live.
 *
 * Idempotent: a lesson that already has a file keeps it, and the shared upload
 * happens once.
 */
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { db } from '../src/db/client'
import { courseDocuments, courseModules, courses, lessons } from '../src/db/schema/index'
import { isStorageConfigured, listFiles, storageRoot, uploadFile } from '../src/lib/storage'

/**
 * How long the video actually is, read out of the file.
 *
 * It matters because the 90% rule is measured against the length recorded on
 * the lesson: a lesson claiming nine minutes with a seven-second file can never
 * be finished, however long somebody sits there. The stand-in's real length is
 * the honest number, so it is the one written down — and the lengths in the
 * catalog shrink accordingly, which is correct for a stand-in and will grow
 * back when real lessons are uploaded through the admin.
 *
 * Read from the mp4's own `mvhd` box rather than with a tool, so this needs
 * nothing installed.
 */
function mp4Seconds(buf: Buffer): number | null {
  const at = buf.indexOf(Buffer.from('mvhd'))
  if (at < 0) return null
  const version = buf.readUInt8(at + 4)
  if (version === 1) {
    const timescale = buf.readUInt32BE(at + 8 + 16)
    const duration = Number(buf.readBigUInt64BE(at + 8 + 20))
    return timescale ? duration / timescale : null
  }
  const timescale = buf.readUInt32BE(at + 8 + 8)
  const duration = buf.readUInt32BE(at + 8 + 12)
  return timescale ? duration / timescale : null
}

const SOURCE = '../frontend/public/course'
const VIDEO = `${SOURCE}/video.mp4`
const PDF = `${SOURCE}/file.pdf`

/**
 * Outside `content/`, so both are served only through a signed URL that
 * expires — which is the whole point of putting lesson material behind an
 * entitlement.
 */
const SHARED = 'courses/shared/demo'

if (!isStorageConfigured()) {
  console.error('storage is not configured — nothing to upload to')
  process.exit(1)
}
for (const f of [VIDEO, PDF]) {
  if (!existsSync(f)) {
    console.error(`missing ${f}`)
    process.exit(1)
  }
}

/** Uploads once, and finds the earlier copy on a second run. */
async function shared(name: string, file: string, contentType: string): Promise<string> {
  const folder = `${storageRoot()}/${SHARED}`
  const { files } = await listFiles(folder, { limit: 200 }).catch(() => ({ files: [] }))
  const found = files.find((f) => f.path.includes(name.replace(/\.[^.]+$/, '')))
  if (found) {
    console.log(`  ${name} already uploaded — ${found.path}`)
    return found.path
  }

  const body = await readFile(file)
  console.log(`  uploading ${name} (${(body.length / 1024 / 1024).toFixed(1)} MB)…`)
  const stored = await uploadFile({
    folder: SHARED,
    filename: name,
    body: new Uint8Array(body),
    contentType,
  })
  console.log(`  stored at ${stored.path}`)
  return stored.path
}

const videoPath = await shared('demo-lesson.mp4', VIDEO, 'video/mp4')
const pdfPath = await shared('demo-handbook.pdf', PDF, 'application/pdf')
console.log('')

/* ---------------- every video lesson that has nothing ---------------- */

const videoSeconds = Math.round(mp4Seconds(await readFile(VIDEO)) ?? 0)
if (!videoSeconds) {
  console.error('could not read the video length out of the file')
  process.exit(1)
}

const [{ affectedRows: filled } = { affectedRows: 0 }] = await db
  .update(lessons)
  .set({ videoPath, durationSeconds: videoSeconds })
  .where(and(eq(lessons.type, 'video'), isNull(lessons.videoPath)))
console.log(`  ${filled} video lessons now have a file, ${videoSeconds}s each`)

// Also the ones filled by an earlier run, whose length still says what the seed
// invented for them.
await db
  .update(lessons)
  .set({ durationSeconds: videoSeconds })
  .where(and(eq(lessons.type, 'video'), eq(lessons.videoPath, videoPath)))

/**
 * And the placeholder paths an older seed left behind — `courses/1/videos/0.m3u8`
 * and the like, which point at nothing. A signed URL for a file that does not
 * exist fails silently in the player, which is the worst of the three possible
 * states: no video, no message, no idea why.
 *
 * Anything genuinely in the store is left alone, including real uploads made
 * through the admin.
 */
const root = storageRoot()
const [{ affectedRows: repaired } = { affectedRows: 0 }] = await db
  .update(lessons)
  .set({ videoPath, durationSeconds: videoSeconds })
  .where(
    and(
      eq(lessons.type, 'video'),
      isNotNull(lessons.videoPath),
      sql`${lessons.videoPath} NOT LIKE ${root + '/%'}`,
    ),
  )
if (repaired) console.log(`  ${repaired} lessons pointed at files that do not exist — repaired`)

/* ---------------- a document lesson per course, and a handbook ---------------- */

const published = await db
  .select({ id: courses.id, title: courses.title, slug: courses.slug })
  .from(courses)
  .where(eq(courses.status, 'approved'))

let madeLessons = 0
let madeDocs = 0

for (const course of published) {
  // One reader to look at, at the end of the course. Added rather than
  // converted: rewriting a lesson somebody wrote into a PDF would be editing
  // the course, which is not this script's business.
  const [existingDoc] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.courseId, course.id), eq(lessons.type, 'document')))
    .limit(1)

  if (!existingDoc) {
    const [last] = await db
      .select({ id: courseModules.id, sortOrder: courseModules.sortOrder })
      .from(courseModules)
      .where(eq(courseModules.courseId, course.id))
      .orderBy(sql`${courseModules.sortOrder} DESC`)
      .limit(1)

    const [tail] = await db
      .select({ sortOrder: lessons.sortOrder })
      .from(lessons)
      .where(eq(lessons.courseId, course.id))
      .orderBy(sql`${lessons.sortOrder} DESC`)
      .limit(1)

    await db.insert(lessons).values({
      courseId: course.id,
      moduleId: last?.id ?? null,
      type: 'document',
      title: 'เอกสารสรุปท้ายคอร์ส',
      subtitle: 'ดาวน์โหลดไว้ทบทวนได้',
      // No running time, so watching cannot finish it — the room says as much
      // and marks it read when it is opened.
      durationSeconds: 0,
      documentPath: pdfPath,
      isPreview: false,
      sortOrder: (tail?.sortOrder ?? 0) + 1,
    })
    madeLessons += 1
  }

  const [hasHandbook] = await db
    .select({ id: courseDocuments.id })
    .from(courseDocuments)
    .where(eq(courseDocuments.courseId, course.id))
    .limit(1)

  if (!hasHandbook) {
    await db.insert(courseDocuments).values({
      courseId: course.id,
      fileName: 'เอกสารประกอบคอร์ส.pdf',
      filePath: pdfPath,
      sizeBytes: (await readFile(PDF)).length,
    })
    madeDocs += 1
  }
}

console.log(`  ${madeLessons} document lessons added`)
console.log(`  ${madeDocs} course handbooks attached`)

// The catalog filters and sorts on the cached total, so it has to follow.
for (const course of published) {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${lessons.durationSeconds}), 0)` })
    .from(lessons)
    .where(eq(lessons.courseId, course.id))
  await db
    .update(courses)
    .set({ durationSeconds: Number(row?.total ?? 0) })
    .where(eq(courses.id, course.id))
}
console.log('  course lengths recomputed from their lessons')

const [{ count: withVideo } = { count: 0 }] = await db
  .select({ count: sql<number>`COUNT(*)` })
  .from(lessons)
  .where(isNotNull(lessons.videoPath))
console.log(`\n  ${withVideo} lessons now play something.\n`)

process.exit(0)
