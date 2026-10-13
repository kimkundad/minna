/**
 * A German teacher, with two courses and a test on each.
 *
 *   npx tsx scripts/seed-german.mts
 *
 * Made for trying the teacher's side of the admin against something real: an
 * account that holds the role, courses that belong to it and nobody else, and
 * quizzes with both kinds of question, because the two behave differently —
 * the choices are marked the moment they are sent, the written answer waits
 * for a teacher to read it.
 *
 * German because the catalog is otherwise all Japanese: a teacher who can see
 * only their own courses is easier to believe when their courses are obviously
 * not everybody else's.
 *
 * Idempotent. A slug that exists is left alone, so running it twice neither
 * duplicates a course nor resets anybody's progress. The account's password is
 * only set when the account is created — a second run does not reset it.
 */
import { and, eq, isNull } from 'drizzle-orm'
import argon2 from 'argon2'
import { db } from '../src/db/client'
import {
  categories,
  courseInstructors,
  courseModules,
  courses,
  lessons,
  quizChoices,
  quizQuestions,
  quizzes,
  roles,
  teacherProfiles,
  userRoles,
  users,
} from '../src/db/schema/index'

/* ---------------- who ---------------- */

const TEACHER = {
  email: 'lehrer.de@minna.local',
  password: 'Deutsch-2026!',
  firstName: 'อันนา',
  lastName: 'ชมิดท์',
  displayName: 'อ. อันนา ชมิดท์ (Anna Schmidt)',
  shortName: 'Anna Schmidt',
  headline: 'ภาษาเยอรมัน A1–B1 · อดีตล่ามประจำสถานทูต',
  bio:
    '<p>สอนภาษาเยอรมันให้คนไทยมา 9 ปี เคยเป็นล่ามประจำสถานทูต และเตรียมสอบ Goethe-Zertifikat ให้ผู้เรียนกว่า 400 คน</p>' +
    '<p>เชื่อว่าไวยากรณ์เยอรมันไม่ได้ยากอย่างที่กลัวกัน แค่ต้องเจอมันเป็นลำดับที่ถูกต้อง</p>',
  credentials: 'Goethe-Zertifikat C2 · MA Germanistik, Universität Wien',
  yearsExperience: 9,
  slug: 'anna-schmidt',
}

/* ---------------- the categories to file them under ---------------- */

const CATEGORY = { slug: 'german', name: 'ภาษาเยอรมัน', icon: 'globe' }
const SUBCATEGORIES = [
  { slug: 'german-beginner', name: 'ปูพื้นฐาน', icon: 'book-open' },
  { slug: 'german-grammar', name: 'ไวยากรณ์', icon: 'pen' },
]

/* ---------------- what ---------------- */

interface Question {
  type: 'single' | 'multiple' | 'essay'
  text: string
  /** First is the right one; `correctCount` says how many of the first ones are. */
  choices?: string[]
  correctCount?: number
  maxLength?: number
}

interface Seed {
  slug: string
  title: string
  shortDesc: string
  description: string
  outcomes: string[]
  audience: string[]
  category: string
  level: 'beginner' | 'intermediate' | 'advanced'
  price: number
  normalPrice: number | null
  modules: { title: string; lessons: { title: string; minutes: number; preview?: boolean }[] }[]
  quiz: { title: string; passPct: number; questions: Question[] }
}

const COURSES: Seed[] = [
  {
    slug: 'german-a1-first-steps',
    title: 'เยอรมัน A1 เริ่มจากศูนย์ พูดได้ใน 30 วัน',
    shortDesc: 'ทักทาย แนะนำตัว สั่งอาหาร ถามทาง — ประโยคที่ใช้จริงตั้งแต่วันแรกที่ถึงเยอรมนี',
    description:
      '<p>คอร์สแรกสำหรับคนที่ยังไม่เคยแตะภาษาเยอรมันเลย เริ่มจากการออกเสียงที่คนไทยมักพลาด แล้วไล่ไปทีละสถานการณ์</p>' +
      '<p>ทุกบทจบด้วยบทสนทนาสั้นๆ ที่เอาไปใช้ได้ทันที ไม่ใช่ตัวอย่างในตำราที่ไม่มีใครพูดจริง</p>',
    outcomes: [
      'ออกเสียง ö ü ä และ ch ได้ถูกต้อง',
      'แนะนำตัว บอกอาชีพและที่มาได้',
      'สั่งอาหาร ถามราคา ถามทางได้ด้วยตัวเอง',
      'รู้จัก der/die/das และผันกริยาปัจจุบันได้',
    ],
    audience: [
      'คนที่ไม่เคยเรียนภาษาเยอรมันมาก่อน',
      'คนที่กำลังจะไปเรียนต่อหรือทำงานที่เยอรมนี',
      'คนที่เคยเรียนแล้วลืมหมด อยากเริ่มใหม่ให้ถูกทาง',
    ],
    category: 'german-beginner',
    level: 'beginner',
    price: 149000,
    normalPrice: 199000,
    modules: [
      {
        title: 'บทที่ 1 · เสียงและตัวอักษร',
        lessons: [
          { title: 'ตัวอักษรเยอรมันและเสียงที่ไม่มีในภาษาไทย', minutes: 12, preview: true },
          { title: 'ö ü ä — สามเสียงที่ตัดสินว่าคุณฟังออกหรือไม่', minutes: 14 },
          { title: 'ch, sch, z — ออกเสียงให้เจ้าของภาษาเข้าใจ', minutes: 11 },
        ],
      },
      {
        title: 'บทที่ 2 · ทักทายและแนะนำตัว',
        lessons: [
          { title: 'Guten Tag / Hallo — ทักทายให้ถูกกาลเทศะ', minutes: 9 },
          { title: 'Ich heiße… Ich komme aus… — แนะนำตัวครบใน 4 ประโยค', minutes: 15 },
          { title: 'du หรือ Sie — คำถามที่คนไทยถามผิดบ่อยที่สุด', minutes: 13 },
        ],
      },
      {
        title: 'บทที่ 3 · ใช้ชีวิตประจำวัน',
        lessons: [
          { title: 'ในร้านอาหาร — สั่ง จ่าย และขอเช็คบิล', minutes: 16 },
          { title: 'ถามทางและเข้าใจคำตอบ', minutes: 14 },
          { title: 'ตัวเลข ราคา และเวลา', minutes: 12 },
        ],
      },
    ],
    quiz: {
      title: 'แบบทดสอบท้ายคอร์ส — เยอรมัน A1',
      passPct: 60,
      questions: [
        {
          type: 'single',
          text: '"Guten Morgen" ใช้ทักทายช่วงเวลาใด',
          choices: ['ตอนเช้า', 'ตอนบ่าย', 'ตอนเย็น', 'ใช้ได้ทุกเวลา'],
        },
        {
          type: 'single',
          text: 'ประโยค "Ich heiße Anna" แปลว่าอะไร',
          choices: ['ฉันชื่ออันนา', 'ฉันมาจากอันนา', 'ฉันอายุ 20 ปี', 'ยินดีที่ได้รู้จัก'],
        },
        {
          type: 'single',
          text: 'คำนำหน้านามแบบชี้เฉพาะในภาษาเยอรมันมีกี่เพศ',
          choices: ['3 เพศ — der, die, das', '2 เพศ — der, die', '1 เพศ — das', 'ไม่มีเพศ'],
        },
        {
          type: 'single',
          text: 'จะถามราคาเป็นภาษาเยอรมันว่าอย่างไร',
          choices: [
            'Was kostet das?',
            'Wo ist das?',
            'Wie heißt du?',
            'Woher kommst du?',
          ],
        },
        {
          type: 'multiple',
          text: 'ข้อใดเป็นสระกลายเสียง (Umlaut) (เลือกได้มากกว่าหนึ่งข้อ)',
          choices: ['ä', 'ö', 'e', 'o'],
          correctCount: 2,
        },
        {
          type: 'essay',
          text: 'เขียนแนะนำตัวเป็นภาษาเยอรมัน 4–5 ประโยค บอกชื่อ อายุ มาจากไหน ทำอาชีพอะไร และเรียนภาษาเยอรมันเพราะอะไร',
          maxLength: 800,
        },
      ],
    },
  },
  {
    slug: 'german-cases-made-clear',
    title: 'ไวยากรณ์เยอรมัน 4 การก เข้าใจได้จริง',
    shortDesc: 'Nominativ Akkusativ Dativ Genitiv — เลิกท่องตาราง แล้วดูว่าแต่ละการกใช้เมื่อไหร่',
    description:
      '<p>การกคือจุดที่คนเรียนเยอรมันส่วนใหญ่ถอดใจ ไม่ใช่เพราะมันยาก แต่เพราะถูกสอนให้ท่องตารางก่อนจะเข้าใจว่าตารางนั้นมีไว้ทำอะไร</p>' +
      '<p>คอร์สนี้เริ่มจากคำถามว่า "ใครทำอะไรกับใคร" แล้วค่อยให้ตารางตามมาทีหลัง</p>',
    outcomes: [
      'แยก Nominativ กับ Akkusativ ได้โดยไม่ต้องท่อง',
      'รู้ว่าเมื่อไหร่ต้องใช้ Dativ และทำไม',
      'ผันคำนำหน้านามและคำคุณศัพท์ได้ถูกการก',
      'ใช้บุพบทที่บังคับการกได้อย่างมั่นใจ',
    ],
    audience: [
      'คนที่เรียน A1 จบแล้วแต่ยังงงกับการก',
      'คนที่เตรียมสอบ Goethe A2–B1',
      'คนที่พูดได้แต่ผันผิดตลอด',
    ],
    category: 'german-grammar',
    level: 'intermediate',
    price: 189000,
    normalPrice: null,
    modules: [
      {
        title: 'บทที่ 1 · การกคืออะไร',
        lessons: [
          { title: 'ทำไมภาษาเยอรมันต้องมีการก', minutes: 13, preview: true },
          { title: 'Nominativ — ใครเป็นคนทำ', minutes: 15 },
          { title: 'Akkusativ — ทำอะไร', minutes: 17 },
        ],
      },
      {
        title: 'บทที่ 2 · Dativ และ Genitiv',
        lessons: [
          { title: 'Dativ — ทำให้ใคร', minutes: 18 },
          { title: 'กริยาที่บังคับ Dativ ที่ต้องจำ', minutes: 14 },
          { title: 'Genitiv — ของใคร และทำไมคนเยอรมันเลี่ยงมัน', minutes: 12 },
        ],
      },
      {
        title: 'บทที่ 3 · บุพบทกับการก',
        lessons: [
          { title: 'บุพบทที่บังคับ Akkusativ', minutes: 16 },
          { title: 'บุพบทที่บังคับ Dativ', minutes: 16 },
          { title: 'Wechselpräpositionen — บุพบทสองหน้า', minutes: 19 },
        ],
      },
    ],
    quiz: {
      title: 'แบบทดสอบท้ายคอร์ส — 4 การก',
      passPct: 70,
      questions: [
        {
          type: 'single',
          text: 'ใน "Der Mann liest das Buch" คำว่า "das Buch" เป็นการกใด',
          choices: ['Akkusativ', 'Nominativ', 'Dativ', 'Genitiv'],
        },
        {
          type: 'single',
          text: 'กริยา "helfen" บังคับให้ใช้การกใด',
          choices: ['Dativ', 'Akkusativ', 'Nominativ', 'Genitiv'],
        },
        {
          type: 'single',
          text: 'คำนำหน้านาม der เมื่อเป็น Dativ เปลี่ยนเป็นอะไร',
          choices: ['dem', 'den', 'des', 'der'],
        },
        {
          type: 'multiple',
          text: 'ข้อใดเป็นบุพบทที่บังคับ Dativ เสมอ (เลือกได้มากกว่าหนึ่งข้อ)',
          choices: ['mit', 'aus', 'für', 'ohne'],
          correctCount: 2,
        },
        {
          type: 'single',
          text: 'Wechselpräposition ใช้ Akkusativ เมื่อใด',
          choices: [
            'เมื่อบอกการเคลื่อนที่ไปยังที่หนึ่ง (wohin?)',
            'เมื่อบอกตำแหน่งที่อยู่นิ่ง (wo?)',
            'ใช้ Akkusativ เสมอ',
            'ใช้ Dativ เสมอ',
          ],
        },
        {
          type: 'essay',
          text: 'แต่งประโยคภาษาเยอรมัน 4 ประโยค ให้ใช้ Nominativ, Akkusativ, Dativ และ Wechselpräposition อย่างละ 1 ประโยค พร้อมบอกว่าประโยคไหนใช้การกใดและเพราะอะไร',
          maxLength: 1000,
        },
      ],
    },
  },
]

/* ---------------- the account ---------------- */

let [teacher] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, TEACHER.email))
  .limit(1)

if (!teacher) {
  const [res] = await db.insert(users).values({
    email: TEACHER.email,
    passwordHash: await argon2.hash(TEACHER.password),
    firstName: TEACHER.firstName,
    lastName: TEACHER.lastName,
    birthdate: '1988-04-12',
    locale: 'th',
    status: 'active',
    // Seeded, not signed up: nobody is going to click a link in a mailbox that
    // does not exist, and an unverified account cannot buy anything.
    emailVerifiedAt: new Date(),
    privacyAcceptedAt: new Date(),
  })
  teacher = { id: Number(res.insertId) }
  console.log(`  made the account ${TEACHER.email}`)
} else {
  console.log(`  ${TEACHER.email} already exists — leaving its password alone`)
}

for (const name of ['student', 'teacher'] as const) {
  const [role] = await db.select().from(roles).where(eq(roles.name, name)).limit(1)
  if (!role) continue
  const [held] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, teacher.id), eq(userRoles.roleId, role.id)))
    .limit(1)
  if (!held) await db.insert(userRoles).values({ userId: teacher.id, roleId: role.id })
}

const [profile] = await db
  .select({ userId: teacherProfiles.userId })
  .from(teacherProfiles)
  .where(eq(teacherProfiles.userId, teacher.id))
  .limit(1)
if (!profile) {
  await db.insert(teacherProfiles).values({
    userId: teacher.id,
    displayName: TEACHER.displayName,
    shortName: TEACHER.shortName,
    headline: TEACHER.headline,
    bio: TEACHER.bio,
    languages: ['th', 'en'],
    credentials: TEACHER.credentials,
    yearsExperience: TEACHER.yearsExperience,
    slug: TEACHER.slug,
    listed: true,
  })
  console.log('  wrote the public teacher profile')
}

/* ---------------- the categories ---------------- */

async function category(slug: string, name: string, icon: string, parentId: number | null) {
  const [found] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1)
  if (found) return found.id
  const [last] = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId))
    .orderBy(categories.sortOrder)
  const [res] = await db.insert(categories).values({
    parentId,
    name,
    slug,
    icon,
    sortOrder: (last?.sortOrder ?? 0) + 10,
  })
  console.log(`  added the category ${name}`)
  return Number(res.insertId)
}

const parentId = await category(CATEGORY.slug, CATEGORY.name, CATEGORY.icon, null)
const subIds = new Map<string, number>()
for (const sub of SUBCATEGORIES) {
  subIds.set(sub.slug, await category(sub.slug, sub.name, sub.icon, parentId))
}

/* ---------------- the courses ---------------- */

let made = 0

for (const seed of COURSES) {
  const [already] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.slug, seed.slug))
    .limit(1)
  if (already) {
    console.log(`  ${seed.slug} is already there`)
    continue
  }

  const [res] = await db.insert(courses).values({
    categoryId: subIds.get(seed.category) ?? parentId,
    title: seed.title,
    slug: seed.slug,
    shortDesc: seed.shortDesc,
    description: seed.description,
    outcomes: seed.outcomes,
    audience: seed.audience,
    level: seed.level,
    contentLocale: 'th',
    price: seed.price,
    normalPrice: seed.normalPrice,
    accessType: 'lifetime',
    accessDurationDays: null,
    status: 'approved',
    sellable: true,
    repurchase: false,
    badge: 'new',
    popularity: 2,
    publishedAt: new Date(),
  })
  const courseId = Number(res.insertId)
  await db.insert(courseInstructors).values({ courseId, userId: teacher.id, sortOrder: 1 })

  let totalSeconds = 0
  let lessonOrder = 0
  let moduleOrder = 0
  for (const mod of seed.modules) {
    moduleOrder += 1
    const [modRes] = await db.insert(courseModules).values({
      courseId,
      title: mod.title,
      sortOrder: moduleOrder,
    })
    const moduleId = Number(modRes.insertId)

    for (const lesson of mod.lessons) {
      lessonOrder += 1
      const seconds = lesson.minutes * 60
      totalSeconds += seconds
      await db.insert(lessons).values({
        courseId,
        moduleId,
        type: 'video',
        title: lesson.title,
        durationSeconds: seconds,
        isPreview: Boolean(lesson.preview),
        sortOrder: lessonOrder,
      })
    }
  }

  /* ---- the test, behind a lesson of its own ---- */

  lessonOrder += 1
  const [quizLesson] = await db.insert(lessons).values({
    courseId,
    moduleId: null,
    type: 'quiz',
    title: 'แบบทดสอบท้ายคอร์ส',
    subtitle: 'ทำได้ไม่จำกัดครั้ง',
    durationSeconds: 0,
    sortOrder: lessonOrder,
  })

  const [quizRes] = await db.insert(quizzes).values({
    courseId,
    lessonId: Number(quizLesson.insertId),
    title: seed.quiz.title,
    passPct: seed.quiz.passPct,
    timerMinutes: null,
  })
  const quizId = Number(quizRes.insertId)

  let questionOrder = 0
  for (const q of seed.quiz.questions) {
    questionOrder += 1
    const [qRes] = await db.insert(quizQuestions).values({
      quizId,
      type: q.type,
      text: q.text,
      maxLength: q.maxLength ?? 1000,
      attachmentAllowed: q.type === 'essay',
      sortOrder: questionOrder,
    })
    if (!q.choices?.length) continue
    const correct = q.correctCount ?? 1
    await db.insert(quizChoices).values(
      q.choices.map((text, i) => ({
        questionId: Number(qRes.insertId),
        text,
        // The right answers are stored first. The quiz page shuffles the
        // options per question, so this is not an order anybody sees.
        isCorrect: i < correct,
        sortOrder: i + 1,
      })),
    )
  }

  await db.update(courses).set({ durationSeconds: totalSeconds }).where(eq(courses.id, courseId))

  made += 1
  const choice = seed.quiz.questions.filter((q) => q.type !== 'essay').length
  console.log(
    `\n  ${seed.title}` +
      `\n      ${lessonOrder - 1} บทเรียน · ${Math.round(totalSeconds / 60)} นาที` +
      `\n      แบบทดสอบ ${choice} ปรนัย + ${seed.quiz.questions.length - choice} อัตนัย · ผ่าน ${seed.quiz.passPct}%`,
  )
}

console.log(`
  ──────────────────────────────────────────────
  เข้าหลังบ้านที่   ${process.env.ADMIN_URL ?? 'http://localhost:5173'}
  อีเมล            ${TEACHER.email}
  รหัสผ่าน          ${TEACHER.password}
  ──────────────────────────────────────────────
  ${made ? `${made} คอร์สใหม่` : 'ไม่มีคอร์สใหม่ที่ต้องเพิ่ม'}
`)
process.exit(0)
