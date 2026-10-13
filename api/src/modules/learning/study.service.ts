import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  courseDocuments,
  courseModules,
  courses,
  entitlements,
  lessonProgress,
  lessons,
} from '../../db/schema/index'
import { forbidden, notFound } from '../../lib/errors'
import { signedUrl } from '../../lib/storage'

/**
 * Studying a course you are entitled to.
 *
 * The catalog shows a course to anybody; this serves the inside of it, and the
 * difference between the two is one row in `entitlements`. Every function here
 * starts by proving that row exists, because the thing being handed out is the
 * product.
 *
 * Video and documents stay in private storage and are signed on demand rather
 * than written into the curriculum: a curriculum is read once and kept on
 * screen for an hour, and a URL minted at that moment would be a link anyone
 * could copy out of the page and share. Asking for the media per lesson, as it
 * is opened, keeps each link short-lived and tied to one request.
 */

/** How long a player's URL stays good. Long enough for a lesson and a pause,
 *  short enough that a copied link is not a distribution channel. */
const PLAY_TTL = 4 * 3600

/** Watched this far and the lesson counts as done. Not 100%: nobody sits
 *  through the credits, and a lesson that will not tick over is worse than one
 *  that ticks over a minute early. */
const COMPLETE_AT = 0.9

export interface Access {
  courseId: number
  /** Null means lifetime. */
  expiresAt: Date | null
}

/**
 * Proves this member may study this course, or refuses.
 *
 * Refuses with 403 rather than 404: the course exists and they can see it in
 * the catalog, so pretending otherwise would be a lie that helps nobody.
 */
export async function requireAccess(userId: number, courseId: number): Promise<Access> {
  const [row] = await db
    .select({ expiresAt: entitlements.expiresAt, status: entitlements.status })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.courseId, courseId)))
    .orderBy(asc(entitlements.expiresAt))
    .limit(1)

  if (!row || row.status === 'revoked') {
    throw forbidden('You do not have access to this course.')
  }
  const expiresAt = row.expiresAt ? new Date(String(row.expiresAt)) : null
  if (row.status === 'expired' || (expiresAt && expiresAt.getTime() < Date.now())) {
    throw forbidden('Your access to this course has ended.')
  }
  return { courseId, expiresAt }
}

export interface StudyLesson {
  id: number
  moduleId: number | null
  type: 'video' | 'document' | 'quiz'
  title: string
  subtitle: string | null
  description: string | null
  durationSeconds: number
  isPreview: boolean
  /** Whether there is a file behind it. The file itself is asked for by
   *  `playLesson`, one lesson at a time. */
  hasVideo: boolean
  hasDocument: boolean
  progress: {
    lastPositionSeconds: number
    maxPositionSeconds: number
    completedAt: string | null
    lastWatchedAt: string | null
  }
}

/**
 * The whole course, as the player needs it.
 *
 * Modules in teaching order with their lessons inside, lessons that belong to
 * no module after them, and this member's own progress on each — one query for
 * the lessons and one for the progress, rather than one per lesson.
 */
export async function curriculum(userId: number, courseId: number) {
  await requireAccess(userId, courseId)

  const [course] = await db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      shortDesc: courses.shortDesc,
      thumbnailPath: courses.thumbnailPath,
      contentLocale: courses.contentLocale,
      level: courses.level,
      durationSeconds: courses.durationSeconds,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1)
  if (!course) throw notFound('No such course.')

  const mods = await db
    .select({ id: courseModules.id, title: courseModules.title, sortOrder: courseModules.sortOrder })
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(asc(courseModules.sortOrder), asc(courseModules.id))

  const rows = await db
    .select({
      id: lessons.id,
      moduleId: lessons.moduleId,
      type: lessons.type,
      title: lessons.title,
      subtitle: lessons.subtitle,
      description: lessons.description,
      durationSeconds: lessons.durationSeconds,
      videoPath: lessons.videoPath,
      documentPath: lessons.documentPath,
      isPreview: lessons.isPreview,
      sortOrder: lessons.sortOrder,
      lastPositionSeconds: lessonProgress.lastPositionSeconds,
      maxPositionSeconds: lessonProgress.maxPositionSeconds,
      completedAt: lessonProgress.completedAt,
      lastWatchedAt: lessonProgress.lastWatchedAt,
    })
    .from(lessons)
    .leftJoin(
      lessonProgress,
      and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)),
    )
    .where(eq(lessons.courseId, courseId))
    .orderBy(asc(lessons.sortOrder), asc(lessons.id))

  const shaped: StudyLesson[] = rows.map((r) => ({
    id: r.id,
    moduleId: r.moduleId,
    type: r.type,
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    durationSeconds: r.durationSeconds,
    isPreview: r.isPreview,
    // Paths never leave the server. The browser is told a file exists, not
    // where it is.
    hasVideo: Boolean(r.videoPath),
    hasDocument: Boolean(r.documentPath),
    progress: {
      lastPositionSeconds: r.lastPositionSeconds ?? 0,
      maxPositionSeconds: r.maxPositionSeconds ?? 0,
      completedAt: r.completedAt ? String(r.completedAt) : null,
      lastWatchedAt: r.lastWatchedAt ? String(r.lastWatchedAt) : null,
    },
  }))

  const byModule = (moduleId: number | null) => shaped.filter((l) => l.moduleId === moduleId)

  const documents = await db
    .select({
      id: courseDocuments.id,
      fileName: courseDocuments.fileName,
      sizeBytes: courseDocuments.sizeBytes,
    })
    .from(courseDocuments)
    .where(eq(courseDocuments.courseId, courseId))

  return {
    course,
    modules: mods.map((m) => ({ ...m, lessons: byModule(m.id) })),
    /** Lessons hung on the course rather than on a module. */
    loose: byModule(null),
    documents,
    progress: summarise(shaped),
    /** Where to carry on: the first unfinished lesson, in teaching order. */
    resumeLessonId: resumeFrom(mods, shaped)?.id ?? null,
  }
}

/** Counted here, so the player's ring and the account page cannot disagree. */
function summarise(list: StudyLesson[]) {
  const total = list.length
  const done = list.filter((l) => l.progress.completedAt !== null).length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

function resumeFrom(mods: { id: number }[], list: StudyLesson[]) {
  const order = new Map(mods.map((m, i) => [m.id, i]))
  return [...list]
    .sort(
      (a, b) =>
        (order.get(a.moduleId ?? -1) ?? 999) - (order.get(b.moduleId ?? -1) ?? 999) || a.id - b.id,
    )
    .find((l) => l.progress.completedAt === null)
}

/**
 * A URL that plays one lesson, for a few hours.
 *
 * The entitlement is checked against the lesson's own course rather than one
 * named by the caller: a lesson id is all the browser sends, and trusting it to
 * also say which course it belongs to would be trusting it to say what it has
 * access to.
 */
export async function playLesson(userId: number, lessonId: number) {
  const [lesson] = await db
    .select({
      id: lessons.id,
      courseId: lessons.courseId,
      type: lessons.type,
      title: lessons.title,
      durationSeconds: lessons.durationSeconds,
      videoPath: lessons.videoPath,
      documentPath: lessons.documentPath,
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1)
  if (!lesson) throw notFound('No such lesson.')

  await requireAccess(userId, lesson.courseId)

  const path = lesson.type === 'document' ? lesson.documentPath : lesson.videoPath
  if (!path) {
    // Honest about which of the two it is: a lesson with nothing uploaded is a
    // gap in the course, not a fault the reader can do anything about.
    throw notFound('That lesson has no file uploaded yet.')
  }

  const [progress] = await db
    .select({
      lastPositionSeconds: lessonProgress.lastPositionSeconds,
      maxPositionSeconds: lessonProgress.maxPositionSeconds,
      completedAt: lessonProgress.completedAt,
    })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
    .limit(1)

  return {
    lessonId: lesson.id,
    courseId: lesson.courseId,
    type: lesson.type,
    url: signedUrl(path, PLAY_TTL),
    expiresIn: PLAY_TTL,
    durationSeconds: lesson.durationSeconds,
    /** Where it was left, so the player can offer to carry on. */
    lastPositionSeconds: progress?.lastPositionSeconds ?? 0,
    maxPositionSeconds: progress?.maxPositionSeconds ?? 0,
    completedAt: progress?.completedAt ? String(progress.completedAt) : null,
  }
}

/**
 * A URL for one of the course's own handouts.
 *
 * Asked for as the download is clicked, like a lesson's file and for the same
 * reason: these links expire, and the curriculum is read once and left on
 * screen. The entitlement is checked against the document's own course, not one
 * the caller names.
 */
export async function documentLink(userId: number, documentId: number) {
  const [doc] = await db
    .select({
      id: courseDocuments.id,
      courseId: courseDocuments.courseId,
      fileName: courseDocuments.fileName,
      filePath: courseDocuments.filePath,
    })
    .from(courseDocuments)
    .where(eq(courseDocuments.id, documentId))
    .limit(1)
  if (!doc) throw notFound('No such document.')

  await requireAccess(userId, doc.courseId)

  return {
    id: doc.id,
    fileName: doc.fileName,
    url: signedUrl(doc.filePath, PLAY_TTL),
    expiresIn: PLAY_TTL,
  }
}

/**
 * Records how far through a lesson somebody is.
 *
 * `maxPositionSeconds` only ever goes up, and completion is measured against
 * it: scrubbing back to re-watch a minute must not undo a lesson already
 * earned. The furthest point is also what a second device has to beat, so two
 * tabs cannot talk each other backwards.
 *
 * The lesson's own length decides when it is finished, not a length the
 * browser sends — a client that reports a two-second video would otherwise
 * complete a course by asking nicely.
 */
export async function saveProgress(
  userId: number,
  lessonId: number,
  input: { positionSeconds: number; completed?: boolean },
) {
  const [lesson] = await db
    .select({ id: lessons.id, courseId: lessons.courseId, durationSeconds: lessons.durationSeconds })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1)
  if (!lesson) throw notFound('No such lesson.')

  await requireAccess(userId, lesson.courseId)

  const [existing] = await db
    .select({
      id: lessonProgress.id,
      maxPositionSeconds: lessonProgress.maxPositionSeconds,
      completedAt: lessonProgress.completedAt,
    })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
    .limit(1)

  // Clamped to the lesson's length: a position past the end is a bug or a lie,
  // and either way it should not be stored.
  const length = lesson.durationSeconds || 0
  const position = Math.max(0, Math.min(Math.round(input.positionSeconds), length || Infinity))
  const furthest = Math.max(position, existing?.maxPositionSeconds ?? 0)

  /**
   * What finishes a lesson.
   *
   * Something with a running time is finished by watching it, and only by
   * watching it: `completed` is ignored there, because a client that could set
   * it would be a client that could finish a course without opening one.
   *
   * Something without a running time — a document, a page to read — cannot be
   * measured that way, so opening it is the signal, and `completed` is how the
   * reader says so.
   */
  const enoughWatched = length > 0 && furthest >= length * COMPLETE_AT
  const finished = existing?.completedAt
    ? new Date(String(existing.completedAt))
    : (length > 0 ? enoughWatched : input.completed === true)
      ? new Date()
      : null

  if (existing) {
    await db
      .update(lessonProgress)
      .set({
        lastPositionSeconds: position,
        maxPositionSeconds: furthest,
        completedAt: finished,
        lastWatchedAt: new Date(),
      })
      .where(eq(lessonProgress.id, existing.id))
  } else {
    await db.insert(lessonProgress).values({
      userId,
      courseId: lesson.courseId,
      lessonId,
      lastPositionSeconds: position,
      maxPositionSeconds: furthest,
      completedAt: finished,
      lastWatchedAt: new Date(),
    })
  }

  // The course's totals come back with it, so the ring in the header and the
  // bar on the account page move without another request.
  const [counts] = await db
    .select({
      total: sql<number>`(SELECT COUNT(*) FROM lessons l WHERE l.course_id = ${lesson.courseId})`,
      done: sql<number>`(
        SELECT COUNT(*) FROM lesson_progress lp
        JOIN lessons l ON l.id = lp.lesson_id
        WHERE lp.user_id = ${userId}
          AND l.course_id = ${lesson.courseId}
          AND lp.completed_at IS NOT NULL
      )`,
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1)

  const total = Number(counts?.total ?? 0)
  const done = Math.min(Number(counts?.done ?? 0), total)

  return {
    lessonId,
    courseId: lesson.courseId,
    lastPositionSeconds: position,
    maxPositionSeconds: furthest,
    completedAt: finished ? finished.toISOString() : null,
    course: { done, total, pct: total ? Math.round((done / total) * 100) : 0 },
  }
}
