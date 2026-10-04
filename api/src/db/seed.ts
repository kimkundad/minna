/**
 * Starting data for a fresh database: the three roles, one admin, the category
 * tree, VAT and contact settings, two packages, and one sample course complete
 * enough to walk the whole flow — browse, buy, watch, take the quiz, have the
 * essay reviewed.
 *
 * Safe to re-run: every insert is keyed on something unique and skipped when
 * the row is already there.
 */
import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import { db, pool } from './client'
import {
  categories,
  courseDocuments,
  courseInstructors,
  courseModules,
  courses,
  lessons,
  packageCourses,
  packages,
  quizChoices,
  quizQuestions,
  quizzes,
  roles,
  siteSettings,
  userRoles,
  users,
} from './schema/index'

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@minna.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026'

/** Baht to satang, the unit every money column uses. */
const baht = (n: number) => Math.round(n * 100)

async function seedRoles() {
  const names = ['admin', 'teacher', 'student'] as const
  for (const name of names) {
    const existing = await db.select().from(roles).where(eq(roles.name, name)).limit(1)
    if (existing.length === 0) await db.insert(roles).values({ name })
  }
  const all = await db.select().from(roles)
  return new Map(all.map((r) => [r.name, r.id]))
}

async function seedAdmin(roleIds: Map<string, number>) {
  const found = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1)
  if (found[0]) return found[0].id

  const passwordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id })
  await db.insert(users).values({
    email: ADMIN_EMAIL,
    passwordHash,
    firstName: 'Minna',
    lastName: 'Admin',
    locale: 'th',
    privacyAcceptedAt: new Date(),
    emailVerifiedAt: new Date(),
  })
  const [created] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1)
  if (!created) throw new Error('admin user was not created')

  const adminRole = roleIds.get('admin')
  if (adminRole) await db.insert(userRoles).values({ userId: created.id, roleId: adminRole })
  return created.id
}

type CategorySeed = { name: string; slug: string; icon?: string; children: CategorySeed[] }

const CATEGORY_TREE: CategorySeed[] = [
  {
    name: 'ภาษาญี่ปุ่น',
    slug: 'japanese',
    icon: 'language',
    children: [
      { name: 'สนทนา', slug: 'japanese-conversation', children: [] },
      { name: 'ไวยากรณ์', slug: 'japanese-grammar', children: [] },
      { name: 'เตรียมสอบ JLPT', slug: 'japanese-jlpt', children: [] },
      { name: 'คันจิ', slug: 'japanese-kanji', children: [] },
    ],
  },
  {
    name: 'ภาษาอังกฤษ',
    slug: 'english',
    icon: 'language',
    children: [
      { name: 'สนทนา', slug: 'english-conversation', children: [] },
      { name: 'ภาษาอังกฤษธุรกิจ', slug: 'english-business', children: [] },
      { name: 'เตรียมสอบ', slug: 'english-exam', children: [] },
    ],
  },
  {
    name: 'ภาษาจีน',
    slug: 'chinese',
    icon: 'language',
    children: [
      { name: 'สนทนา', slug: 'chinese-conversation', children: [] },
      { name: 'เตรียมสอบ HSK', slug: 'chinese-hsk', children: [] },
    ],
  },
]

async function upsertCategory(node: CategorySeed, parentId: number | null, sortOrder: number) {
  const found = await db.select().from(categories).where(eq(categories.slug, node.slug)).limit(1)
  let id = found[0]?.id
  if (!id) {
    await db.insert(categories).values({
      name: node.name,
      slug: node.slug,
      icon: node.icon ?? null,
      parentId,
      sortOrder,
    })
    const [created] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, node.slug))
      .limit(1)
    id = created!.id
  }
  let i = 0
  for (const child of node.children) {
    await upsertCategory(child, id, i++)
  }
  return id
}

async function seedCategories() {
  let i = 0
  const ids = new Map<string, number>()
  for (const node of CATEGORY_TREE) {
    ids.set(node.slug, await upsertCategory(node, null, i++))
  }
  const all = await db.select().from(categories)
  for (const c of all) ids.set(c.slug, c.id)
  return ids
}

const SETTINGS: { key: string; value: string; group: string }[] = [
  // 7% VAT already inside the displayed price, which is how Thai storefronts
  // normally quote. Flip vat_inclusive to false to add it at checkout instead.
  { key: 'vat_percent', value: '7', group: 'billing' },
  { key: 'vat_inclusive', value: 'true', group: 'billing' },
  { key: 'contact_email', value: '', group: 'contact' },
  { key: 'contact_phone', value: '', group: 'contact' },
  { key: 'facebook_url', value: '', group: 'social' },
  { key: 'instagram_url', value: '', group: 'social' },
  { key: 'youtube_url', value: '', group: 'social' },
  { key: 'line_url', value: '', group: 'social' },
]

async function seedSettings() {
  for (const s of SETTINGS) {
    const found = await db.select().from(siteSettings).where(eq(siteSettings.key, s.key)).limit(1)
    if (!found[0]) await db.insert(siteSettings).values(s)
  }
}

async function seedPackages(courseId: number) {
  const defs = [
    {
      name: 'รายปี — เรียนได้ทุกคอร์ส',
      slug: 'annual-all-access',
      description: 'เข้าถึงคอร์สในแพ็กเกจได้ทั้งหมดเป็นเวลา 1 ปี',
      price: baht(4900),
      durationDays: 365,
      isPopular: true,
      sortOrder: 1,
      benefits: [
        { text: 'เรียนได้ทุกคอร์สในแพ็กเกจ', included: true },
        { text: 'เอกสารประกอบครบทุกบท', included: true },
        { text: 'ถาม–ตอบกับผู้สอน', included: true },
        { text: 'คอร์สนอกแพ็กเกจ', included: false },
      ],
    },
    {
      name: 'รายปี — ภาษาญี่ปุ่น',
      slug: 'annual-japanese',
      description: 'เฉพาะคอร์สภาษาญี่ปุ่น เป็นเวลา 1 ปี',
      price: baht(2900),
      durationDays: 365,
      isPopular: false,
      sortOrder: 2,
      benefits: [
        { text: 'คอร์สภาษาญี่ปุ่นทั้งหมด', included: true },
        { text: 'เอกสารประกอบครบทุกบท', included: true },
        { text: 'คอร์สภาษาอื่น', included: false },
      ],
    },
  ]

  for (const d of defs) {
    const found = await db.select().from(packages).where(eq(packages.slug, d.slug)).limit(1)
    if (found[0]) continue
    await db.insert(packages).values(d)
    const [created] = await db.select().from(packages).where(eq(packages.slug, d.slug)).limit(1)
    if (created) await db.insert(packageCourses).values({ packageId: created.id, courseId })
  }
}

const COURSE_SLUG = 'japanese-for-beginners'

async function seedSampleCourse(adminId: number, categoryIds: Map<string, number>) {
  const found = await db.select().from(courses).where(eq(courses.slug, COURSE_SLUG)).limit(1)
  if (found[0]) return found[0].id

  await db.insert(courses).values({
    categoryId: categoryIds.get('japanese-conversation') ?? null,
    title: 'ภาษาญี่ปุ่นเบื้องต้นสำหรับผู้เริ่มต้น',
    slug: COURSE_SLUG,
    shortDesc:
      'เริ่มจากศูนย์ อ่านฮิรางานะคาตาคานะได้ พูดประโยคในชีวิตประจำวันได้ภายใน 8 สัปดาห์',
    description:
      'คอร์สปูพื้นฐานภาษาญี่ปุ่นสำหรับคนที่ไม่เคยเรียนมาก่อน เริ่มจากตัวอักษร การออกเสียง ' +
      'ไปจนถึงประโยคสนทนาที่ใช้ได้จริง พร้อมแบบฝึกหัดท้ายคอร์สและเอกสารประกอบให้ทบทวน',
    outcomes: [
      'อ่านและเขียนฮิรางานะกับคาตาคานะได้ครบทุกตัว',
      'แนะนำตัวเองและถามข้อมูลพื้นฐานเป็นภาษาญี่ปุ่นได้',
      'ใช้รูปประโยคพื้นฐานได้ถูกต้องตามสถานการณ์',
      'ฟังบทสนทนาช้า ๆ ในชีวิตประจำวันแล้วจับใจความได้',
    ],
    audience: [
      'ผู้ที่ไม่เคยเรียนภาษาญี่ปุ่นมาก่อน',
      'ผู้ที่เคยเรียนแล้วอยากทบทวนพื้นฐานใหม่',
      'ผู้ที่เตรียมตัวไปเที่ยวหรือทำงานที่ญี่ปุ่น',
    ],
    level: 'beginner',
    contentLocale: 'th',
    price: baht(1690),
    normalPrice: baht(1990),
    accessType: 'limited',
    accessDurationDays: 365,
    status: 'approved',
    sellable: true,
    repurchase: true,
    badge: 'recommended',
    featured: true,
    publishedAt: new Date(),
    createdBy: adminId,
    approvedBy: adminId,
    approvedAt: new Date(),
  })

  const [course] = await db.select().from(courses).where(eq(courses.slug, COURSE_SLUG)).limit(1)
  if (!course) throw new Error('sample course was not created')
  const courseId = course.id

  await db.insert(courseInstructors).values({
    courseId,
    userId: adminId,
    role: 'ผู้สอนหลัก',
    sortOrder: 0,
  })

  const moduleDefs: { title: string; lessons: Parameters<typeof buildLesson>[0][] }[] = [
    {
      title: 'ตัวอักษรและการออกเสียง',
      lessons: [
        { type: 'video', title: 'ฮิรางานะ 46 ตัว', durationSeconds: 1_080, isPreview: true },
        { type: 'video', title: 'คาตาคานะ 46 ตัว', durationSeconds: 1_260 },
        { type: 'document', title: 'ตารางตัวอักษรสำหรับพิมพ์', durationSeconds: 0 },
      ],
    },
    {
      title: 'ประโยคพื้นฐาน',
      lessons: [
        { type: 'video', title: 'แนะนำตัวเอง', durationSeconds: 1_500 },
        { type: 'video', title: 'การถามและบอกเวลา', durationSeconds: 1_320 },
        { type: 'video', title: 'การซื้อของ', durationSeconds: 1_440 },
      ],
    },
    {
      title: 'วัดผล',
      lessons: [{ type: 'quiz', title: 'แบบทดสอบท้ายคอร์ส', durationSeconds: 0 }],
    },
  ]

  let lessonSort = 0
  let quizLessonId: number | null = null
  let totalSeconds = 0

  for (const [mIndex, m] of moduleDefs.entries()) {
    await db.insert(courseModules).values({ courseId, title: m.title, sortOrder: mIndex })
    const mods = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId))
    const moduleId = mods.find((x) => x.title === m.title)?.id ?? null

    for (const l of m.lessons) {
      await db.insert(lessons).values(buildLesson(l, courseId, moduleId, lessonSort++))
      totalSeconds += l.durationSeconds
      if (l.type === 'quiz') {
        const rows = await db.select().from(lessons).where(eq(lessons.courseId, courseId))
        quizLessonId = rows.find((x) => x.type === 'quiz')?.id ?? null
      }
    }
  }

  await db.update(courses).set({ durationSeconds: totalSeconds }).where(eq(courses.id, courseId))

  await db.insert(courseDocuments).values({
    courseId,
    fileName: 'ตารางฮิรางานะ-คาตาคานะ.pdf',
    filePath: `courses/${courseId}/documents/kana-chart.pdf`,
    sizeBytes: 420_000,
  })

  await seedQuiz(courseId, quizLessonId)
  return courseId
}

function buildLesson(
  l: { type: 'video' | 'document' | 'quiz'; title: string; durationSeconds: number; isPreview?: boolean },
  courseId: number,
  moduleId: number | null,
  sortOrder: number,
) {
  return {
    courseId,
    moduleId,
    type: l.type,
    title: l.title,
    durationSeconds: l.durationSeconds,
    isPreview: l.isPreview ?? false,
    videoPath: l.type === 'video' ? `courses/${courseId}/videos/${sortOrder}.m3u8` : null,
    documentPath: l.type === 'document' ? `courses/${courseId}/documents/${sortOrder}.pdf` : null,
    sortOrder,
  }
}

const QUIZ_QUESTIONS: {
  type: 'single' | 'multiple' | 'essay'
  text: string
  choices?: { text: string; correct: boolean }[]
}[] = [
  {
    type: 'single',
    text: 'ตัวอักษร「あ」อ่านว่าอะไร',
    choices: [
      { text: 'อะ', correct: true },
      { text: 'อิ', correct: false },
      { text: 'อุ', correct: false },
      { text: 'เอะ', correct: false },
    ],
  },
  {
    type: 'multiple',
    text: 'ข้อใดเป็นคำทักทายภาษาญี่ปุ่น',
    choices: [
      { text: 'おはよう', correct: true },
      { text: 'こんにちは', correct: true },
      { text: 'ありがとう', correct: false },
      { text: 'こんばんは', correct: true },
    ],
  },
  {
    type: 'single',
    text: 'คาตาคานะใช้เขียนคำประเภทใดเป็นหลัก',
    choices: [
      { text: 'คำยืมจากภาษาต่างประเทศ', correct: true },
      { text: 'คำช่วย', correct: false },
      { text: 'ตัวเลขเท่านั้น', correct: false },
      { text: 'ชื่อจังหวัดในญี่ปุ่น', correct: false },
    ],
  },
  {
    type: 'multiple',
    text: 'ข้อใดใช้ได้เมื่อแนะนำตัวเอง',
    choices: [
      { text: 'はじめまして', correct: true },
      { text: 'わたしは…です', correct: true },
      { text: 'よろしくおねがいします', correct: true },
      { text: 'いただきます', correct: false },
    ],
  },
  {
    type: 'single',
    text: '「ありがとうございます」ใช้ในสถานการณ์ใด',
    choices: [
      { text: 'ขอบคุณ', correct: true },
      { text: 'ขอโทษ', correct: false },
      { text: 'ลาก่อน', correct: false },
      { text: 'ยินดีต้อนรับ', correct: false },
    ],
  },
  {
    type: 'essay',
    text: 'เขียนแนะนำตัวเองเป็นภาษาญี่ปุ่นอย่างน้อย 3 ประโยค พร้อมคำแปลภาษาไทย',
  },
]

async function seedQuiz(courseId: number, lessonId: number | null) {
  const found = await db.select().from(quizzes).where(eq(quizzes.courseId, courseId)).limit(1)
  if (found[0]) return

  await db.insert(quizzes).values({
    courseId,
    lessonId,
    title: 'แบบทดสอบ: ภาษาญี่ปุ่นเบื้องต้น',
    passPct: 80,
    timerMinutes: 15,
  })
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.courseId, courseId)).limit(1)
  if (!quiz) throw new Error('quiz was not created')

  for (const [i, q] of QUIZ_QUESTIONS.entries()) {
    await db.insert(quizQuestions).values({
      quizId: quiz.id,
      type: q.type,
      text: q.text,
      maxLength: 1000,
      attachmentAllowed: q.type === 'essay',
      sortOrder: i,
    })
    if (!q.choices) continue

    const rows = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id))
    const questionId = rows.find((r) => r.text === q.text)?.id
    if (!questionId) continue

    await db.insert(quizChoices).values(
      q.choices.map((c, ci) => ({
        questionId,
        text: c.text,
        isCorrect: c.correct,
        sortOrder: ci,
      })),
    )
  }
}

async function main() {
  const roleIds = await seedRoles()
  const adminId = await seedAdmin(roleIds)
  const categoryIds = await seedCategories()
  await seedSettings()
  const courseId = await seedSampleCourse(adminId, categoryIds)
  await seedPackages(courseId)

  console.log('Seed complete.')
  console.log(`  admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log('  Change that password before this ever reaches a real server.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
