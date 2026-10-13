/**
 * A couple of free courses, for testing the paths that only a free course takes.
 *
 *   npx tsx scripts/seed-free-courses.mts
 *
 * Free is its own case throughout: no payment page, no tax invoice block,
 * entitlement granted the moment it is claimed, and a card that says
 * "ลงทะเบียนเรียนฟรี" rather than offering a basket. One free course in the
 * catalog means testing any of that twice in a row needs a second account.
 *
 * Idempotent: a slug that already exists is left alone, so running it again
 * neither duplicates a course nor resets anybody's progress.
 *
 * Covers for the cards come from Unsplash into `content/`, the one folder
 * served without a signature — a cover has to load for somebody who has not
 * signed in.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  categories,
  courseInstructors,
  courseModules,
  courses,
  lessons,
  teacherProfiles,
  users,
} from '../src/db/schema/index'
import { isStorageConfigured, uploadFile } from '../src/lib/storage'

interface Seed {
  slug: string
  title: string
  shortDesc: string
  description: string
  outcomes: string[]
  audience: string[]
  category: string
  teacher: string
  level: 'beginner' | 'intermediate' | 'advanced'
  photoId: string
  modules: { title: string; lessons: { title: string; minutes: number; preview?: boolean }[] }[]
}

const COURSES: Seed[] = [
  {
    slug: 'free-hiragana-7-days',
    title: 'ฮิรางานะใน 7 วัน เขียนได้ อ่านออก',
    shortDesc: 'เริ่มจากศูนย์จริงๆ วันละ 7 ตัว ครบ 46 ตัวใน 1 สัปดาห์ พร้อมใบฝึกเขียนทุกบท',
    description:
      '<p>คอร์สแรกของคนที่ยังอ่านภาษาญี่ปุ่นไม่ออกเลย เราแบ่งฮิรางานะ 46 ตัวออกเป็น 7 วัน วันละไม่เกิน 15 นาที</p>' +
      '<p>แต่ละบทมีลำดับขีดให้ดูช้าๆ คำศัพท์ที่ใช้ตัวอักษรของวันนั้น และแบบฝึกอ่านสั้นๆ ท้ายบท จบคอร์สนี้แล้วอ่านป้าย เมนู และชื่อสถานีได้</p>',
    outcomes: [
      'อ่านและเขียนฮิรางานะได้ครบทั้ง 46 ตัว',
      'จำลำดับขีดที่ถูกต้อง ไม่ติดนิสัยเขียนผิด',
      'อ่านคำง่ายๆ ในชีวิตประจำวันได้ด้วยตัวเอง',
      'พร้อมต่อคาตาคานะและคอร์สสนทนาเบื้องต้น',
    ],
    audience: [
      'คนที่ไม่เคยเรียนภาษาญี่ปุ่นมาก่อน',
      'คนที่เคยเริ่มแล้วเลิกกลางคัน อยากเริ่มใหม่ให้จบ',
      'นักเรียนที่กำลังจะเรียนภาษาญี่ปุ่นเทอมหน้า',
    ],
    category: 'japanese',
    teacher: 'aiko.tanaka@minna.local',
    level: 'beginner',
    photoId: 'photo-1545048702-79362596cdc9',
    modules: [
      {
        title: 'เริ่มต้น',
        lessons: [
          { title: 'ภาษาญี่ปุ่นมีตัวอักษรกี่ชุด และเริ่มที่ไหนก่อน', minutes: 8, preview: true },
          { title: 'วันที่ 1 — あ い う え お', minutes: 14 },
          { title: 'วันที่ 2 — か き く け こ', minutes: 13 },
        ],
      },
      {
        title: 'ครึ่งทาง',
        lessons: [
          { title: 'วันที่ 3 — さ し す せ そ', minutes: 13 },
          { title: 'วันที่ 4 — た ち つ て と', minutes: 14 },
          { title: 'วันที่ 5 — な に ぬ ね の', minutes: 12 },
        ],
      },
      {
        title: 'ปิดท้าย',
        lessons: [
          { title: 'วันที่ 6 — は ま や ら わ', minutes: 15 },
          { title: 'วันที่ 7 — เสียงขุ่น เสียงควบ และตัวสะกด', minutes: 16 },
          { title: 'ทบทวนรวบยอด อ่านป้ายและเมนูจริง', minutes: 12 },
        ],
      },
    ],
  },
  {
    slug: 'free-japanese-greetings',
    title: 'ทักทายภาษาญี่ปุ่น 20 ประโยคแรก',
    shortDesc: 'ประโยคที่ใช้จริงตั้งแต่วันแรก ทักทาย แนะนำตัว ขอบคุณ ขอโทษ พร้อมไฟล์เสียงเจ้าของภาษา',
    description:
      '<p>ไม่ต้องรอให้อ่านตัวอักษรออกก่อน คอร์สนี้ให้คุณพูดได้ก่อน 20 ประโยคที่คนญี่ปุ่นใช้ทุกวัน</p>' +
      '<p>แต่ละบทสั้นกว่า 10 นาที มีเสียงให้พูดตามทีละคำ และอธิบายว่าประโยคไหนใช้กับใคร — เพราะภาษาญี่ปุ่นผิดระดับความสุภาพแล้วความหมายเปลี่ยน</p>',
    outcomes: [
      'ทักทายได้ถูกเวลาและถูกระดับความสุภาพ',
      'แนะนำตัวเองสั้นๆ ได้ด้วยความมั่นใจ',
      'ขอบคุณ ขอโทษ และขอความช่วยเหลือเป็น',
      'ออกเสียงตามเจ้าของภาษาได้ใกล้เคียง',
    ],
    audience: [
      'คนที่กำลังจะไปเที่ยวญี่ปุ่นเร็วๆ นี้',
      'คนที่อยากลองว่าชอบภาษาญี่ปุ่นไหมก่อนลงคอร์สยาว',
      'คนทำงานที่มีเพื่อนร่วมงานชาวญี่ปุ่น',
    ],
    category: 'japanese-conversation',
    teacher: 'kenji.sato@minna.local',
    level: 'beginner',
    photoId: 'photo-1528360983277-13d401cdc186',
    modules: [
      {
        title: 'ทักทาย',
        lessons: [
          { title: 'おはよう / こんにちは / こんばんは ใช้ตอนไหน', minutes: 9, preview: true },
          { title: 'สวัสดีครั้งแรกกับคนที่เพิ่งเจอ', minutes: 8 },
        ],
      },
      {
        title: 'แนะนำตัว',
        lessons: [
          { title: 'บอกชื่อ อาชีพ และมาจากไหน', minutes: 11 },
          { title: 'ถามกลับอย่างสุภาพ', minutes: 9 },
        ],
      },
      {
        title: 'มารยาทประจำวัน',
        lessons: [
          { title: 'ขอบคุณและขอโทษ 5 ระดับ', minutes: 12 },
          { title: 'ขอความช่วยเหลือเมื่อไม่เข้าใจ', minutes: 10 },
        ],
      },
    ],
  },
]

const WIDTH = 1280
const HEIGHT = 720

const cats = await db.select({ id: categories.id, slug: categories.slug }).from(categories)
const catBySlug = new Map(cats.map((c) => [c.slug, c.id]))

const teachers = await db
  .select({ id: users.id, email: users.email })
  .from(teacherProfiles)
  .innerJoin(users, eq(users.id, teacherProfiles.userId))
const teacherByEmail = new Map(teachers.map((t) => [t.email, t.id]))

let made = 0
for (const seed of COURSES) {
  const [existing] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.slug, seed.slug))
    .limit(1)
  if (existing) {
    console.log(`  ${seed.slug} already there, left alone`)
    continue
  }

  const categoryId = catBySlug.get(seed.category)
  const teacherId = teacherByEmail.get(seed.teacher)
  if (!categoryId || !teacherId) {
    console.log(`  SKIP ${seed.slug} — missing category or teacher`)
    continue
  }

  const [res] = await db.insert(courses).values({
    categoryId,
    title: seed.title,
    slug: seed.slug,
    shortDesc: seed.shortDesc,
    description: seed.description,
    outcomes: seed.outcomes,
    audience: seed.audience,
    level: seed.level,
    contentLocale: 'th',
    price: 0,
    normalPrice: null,
    // Free and forever: an expiry on a course nobody paid for is a rule with
    // nothing behind it.
    accessType: 'lifetime',
    accessDurationDays: null,
    status: 'approved',
    sellable: true,
    repurchase: false,
    badge: 'new',
    popularity: 3,
    publishedAt: new Date(),
  })
  const courseId = Number(res.insertId)

  await db.insert(courseInstructors).values({ courseId, userId: teacherId, sortOrder: 1 })

  let totalSeconds = 0
  let moduleOrder = 0
  for (const mod of seed.modules) {
    moduleOrder += 1
    const [modRes] = await db.insert(courseModules).values({
      courseId,
      title: mod.title,
      sortOrder: moduleOrder,
    })
    const moduleId = Number(modRes.insertId)

    let lessonOrder = 0
    for (const l of mod.lessons) {
      lessonOrder += 1
      const seconds = l.minutes * 60
      totalSeconds += seconds
      await db.insert(lessons).values({
        courseId,
        moduleId,
        type: 'video',
        title: l.title,
        durationSeconds: seconds,
        isPreview: l.preview ?? false,
        sortOrder: lessonOrder,
      })
    }
  }

  let thumbnailPath: string | null = null
  if (isStorageConfigured()) {
    const url = `https://images.unsplash.com/${seed.photoId}?auto=format&fit=crop&w=${WIDTH}&h=${HEIGHT}&q=72`
    const picture = await fetch(url)
    if (picture.ok) {
      const stored = await uploadFile({
        folder: `content/courses/${courseId}`,
        filename: `${seed.photoId}.jpg`,
        body: new Uint8Array(await picture.arrayBuffer()),
        contentType: 'image/jpeg',
      })
      thumbnailPath = stored.path
    } else {
      console.log(`      (no cover: ${picture.status} from Unsplash — the card draws its own art)`)
    }
  }

  await db
    .update(courses)
    .set({ thumbnailPath, durationSeconds: totalSeconds })
    .where(eq(courses.id, courseId))

  made += 1
  const lessonCount = seed.modules.reduce((n, m) => n + m.lessons.length, 0)
  console.log(
    `  ${seed.title}\n      /th/courses/${seed.slug} · ${lessonCount} lessons · ` +
      `${Math.round(totalSeconds / 60)} min · free`,
  )
}

console.log(made ? `\n  ${made} free courses published.\n` : '\n  nothing new to add.\n')
process.exit(0)
