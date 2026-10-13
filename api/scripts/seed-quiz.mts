/**
 * A test on the demo courses, so the quiz and the result page have something
 * to show.
 *
 *   npx tsx scripts/seed-quiz.mts
 *
 * One quiz per course, which is the rule the catalog enforces. Each gets a few
 * choice questions and one written one, because the two tracks behave
 * differently — the choices are marked the moment they are sent, the written
 * answer waits for a teacher — and a demo with only one of them hides half the
 * screen.
 *
 * Idempotent: a course that already has a quiz is left alone.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courseModules, courses, lessons, quizChoices, quizQuestions, quizzes } from '../src/db/schema/index'

interface Seed {
  slug: string
  title: string
  passPct: number
  timerMinutes: number | null
  questions: {
    type: 'single' | 'multiple' | 'essay'
    text: string
    choices?: { text: string; correct?: boolean }[]
    maxLength?: number
  }[]
}

const SEEDS: Seed[] = [
  {
    slug: 'free-japanese-greetings',
    title: 'แบบทดสอบท้ายคอร์ส — ทักทายภาษาญี่ปุ่น',
    passPct: 60,
    timerMinutes: null,
    questions: [
      {
        type: 'single',
        text: '“おはようございます” ใช้ทักทายในช่วงเวลาใด',
        choices: [
          { text: 'เช้า', correct: true },
          { text: 'บ่าย' },
          { text: 'ค่ำ' },
          { text: 'ใช้ได้ทุกเวลา' },
        ],
      },
      {
        type: 'single',
        text: 'เมื่อเจอกันครั้งแรก ควรพูดว่าอะไร',
        choices: [
          { text: 'はじめまして', correct: true },
          { text: 'おやすみなさい' },
          { text: 'ごちそうさま' },
        ],
      },
      {
        type: 'multiple',
        text: 'ข้อใดเป็นคำขอบคุณ (เลือกได้มากกว่าหนึ่งข้อ)',
        choices: [
          { text: 'ありがとう', correct: true },
          { text: 'どうも', correct: true },
          { text: 'すみません' },
          { text: 'さようなら' },
        ],
      },
      {
        type: 'essay',
        text: 'เขียนแนะนำตัวเองเป็นภาษาญี่ปุ่นสั้นๆ (ชื่อ อาชีพ และมาจากไหน)',
        maxLength: 500,
      },
    ],
  },
  {
    slug: 'free-hiragana-7-days',
    title: 'แบบทดสอบท้ายคอร์ส — ฮิรางานะ',
    passPct: 70,
    timerMinutes: 10,
    questions: [
      {
        type: 'single',
        text: 'ฮิรางานะมีทั้งหมดกี่ตัว (ไม่นับเสียงขุ่นและเสียงควบ)',
        choices: [{ text: '46 ตัว', correct: true }, { text: '50 ตัว' }, { text: '26 ตัว' }],
      },
      {
        type: 'single',
        text: '“か” อ่านว่าอะไร',
        choices: [{ text: 'คะ', correct: true }, { text: 'สะ' }, { text: 'ทะ' }],
      },
      {
        type: 'multiple',
        text: 'ข้อใดเป็นสระในภาษาญี่ปุ่น (เลือกได้มากกว่าหนึ่งข้อ)',
        choices: [
          { text: 'あ', correct: true },
          { text: 'い', correct: true },
          { text: 'う', correct: true },
          { text: 'か' },
        ],
      },
      {
        type: 'essay',
        text: 'ยกตัวอย่างคำที่เขียนด้วยฮิรางานะล้วน 3 คำ พร้อมคำแปล',
        maxLength: 400,
      },
    ],
  },
]

let made = 0

for (const seed of SEEDS) {
  const [course] = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(eq(courses.slug, seed.slug))
    .limit(1)
  if (!course) {
    console.log(`  SKIP ${seed.slug} — no such course`)
    continue
  }

  const [already] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(eq(quizzes.courseId, course.id))
    .limit(1)
  if (already) {
    console.log(`  ${seed.slug} already has a test`)
    continue
  }

  // The lesson it sits behind, so it counts in the curriculum like any other.
  const [existingLesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.courseId, course.id), eq(lessons.type, 'quiz')))
    .limit(1)

  let lessonId = existingLesson?.id ?? null
  if (!lessonId) {
    const [lastModule] = await db
      .select({ id: courseModules.id })
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

    const [res] = await db.insert(lessons).values({
      courseId: course.id,
      moduleId: lastModule?.id ?? null,
      type: 'quiz',
      title: 'แบบทดสอบท้ายคอร์ส',
      subtitle: 'ทำได้ไม่จำกัดครั้ง',
      durationSeconds: 0,
      sortOrder: (tail?.sortOrder ?? 0) + 1,
    })
    lessonId = Number(res.insertId)
  }

  const [quizRes] = await db.insert(quizzes).values({
    courseId: course.id,
    lessonId,
    title: seed.title,
    passPct: seed.passPct,
    timerMinutes: seed.timerMinutes,
  })
  const quizId = Number(quizRes.insertId)

  let order = 0
  for (const q of seed.questions) {
    order += 1
    const [qRes] = await db.insert(quizQuestions).values({
      quizId,
      type: q.type,
      text: q.text,
      maxLength: q.maxLength ?? 1000,
      attachmentAllowed: q.type === 'essay',
      sortOrder: order,
    })
    const questionId = Number(qRes.insertId)

    if (q.choices?.length) {
      await db.insert(quizChoices).values(
        q.choices.map((c, i) => ({
          questionId,
          text: c.text,
          isCorrect: Boolean(c.correct),
          sortOrder: i + 1,
        })),
      )
    }
  }

  made += 1
  const choice = seed.questions.filter((q) => q.type !== 'essay').length
  console.log(
    `  ${course.title}\n      ${choice} choice + ${seed.questions.length - choice} written · pass ${seed.passPct}%` +
      (seed.timerMinutes ? ` · ${seed.timerMinutes} min` : ' · untimed'),
  )
}

console.log(made ? `\n  ${made} tests added.\n` : '\n  nothing new to add.\n')
process.exit(0)
