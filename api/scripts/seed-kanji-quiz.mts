/**
 * The test for "คันจิ 300 ตัวแรก เขียนได้ อ่านออก".
 *
 *   npx tsx scripts/seed-kanji-quiz.mts            # fill it in
 *   npx tsx scripts/seed-kanji-quiz.mts --replace  # start the questions again
 *
 * Seven choice questions and one written one, drawn from what the course
 * actually teaches: stroke order, the counters, the days, the places.
 *
 * The right answer is the first choice in every question, which is what was
 * asked for. Worth knowing while testing: the quiz page shuffles the options
 * per question — deterministically, from the question's id — so the correct one
 * will not sit first on screen. That is on purpose; an answer key readable from
 * the markup is not a key anybody has to guess.
 */
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, quizChoices, quizQuestions, quizzes } from '../src/db/schema/index'

const SLUG = 'demo-japanese-kanji-300'
const replace = process.argv.includes('--replace')

interface Q {
  type: 'single' | 'multiple' | 'essay'
  text: string
  /** First is the right one. */
  choices?: string[]
  /** For a multiple-choice question: how many of the first ones are right. */
  correctCount?: number
  maxLength?: number
}

const QUESTIONS: Q[] = [
  {
    type: 'single',
    text: 'ข้อใดคือลำดับขีดที่ถูกต้องของคันจิโดยทั่วไป',
    choices: [
      'บนลงล่าง และซ้ายไปขวา',
      'ล่างขึ้นบน และขวาไปซ้าย',
      'เขียนเส้นตั้งก่อนเส้นนอนเสมอ',
      'เริ่มจากขีดที่ยาวที่สุดก่อน',
    ],
  },
  {
    type: 'single',
    text: '「山」 อ่านแบบคุนโยมิว่าอะไร และแปลว่าอะไร',
    choices: ['やま — ภูเขา', 'かわ — แม่น้ำ', 'た — นาข้าว', 'いし — ก้อนหิน'],
  },
  {
    type: 'single',
    text: 'ตัวเลข 「千」 มีค่าเท่าใด',
    choices: ['1,000', '100', '10,000', '100,000'],
  },
  {
    type: 'single',
    text: '「水曜日」 คือวันอะไร',
    choices: ['วันพุธ', 'วันจันทร์', 'วันศุกร์', 'วันอาทิตย์'],
  },
  {
    type: 'single',
    text: 'ส่วนประกอบ 「氵」 (สามจุดน้ำ) มักบอกความหมายเกี่ยวกับอะไร',
    choices: ['น้ำหรือของเหลว', 'ไฟหรือความร้อน', 'คนหรือร่างกาย', 'ต้นไม้หรือพืช'],
  },
  {
    type: 'single',
    text: '「駅」 หมายถึงสถานที่ใด',
    choices: ['สถานีรถไฟ', 'โรงพยาบาล', 'ธนาคาร', 'ไปรษณีย์'],
  },
  {
    type: 'multiple',
    text: 'ข้อใดเป็นคันจิที่ใช้เรียกคนในครอบครัว (เลือกได้มากกว่าหนึ่งข้อ)',
    choices: ['父 — พ่อ', '母 — แม่', '山 — ภูเขา', '駅 — สถานี'],
    correctCount: 2,
  },
  {
    type: 'essay',
    text: 'เลือกคันจิที่เรียนในคอร์สนี้มา 3 ตัว เขียนคำอ่าน ความหมาย และแต่งประโยคสั้นๆ ตัวละ 1 ประโยค',
    maxLength: 800,
  },
]

const [course] = await db
  .select({ id: courses.id, title: courses.title })
  .from(courses)
  .where(eq(courses.slug, SLUG))
  .limit(1)
if (!course) {
  console.error(`no course ${SLUG}`)
  process.exit(1)
}

const [quiz] = await db.select().from(quizzes).where(eq(quizzes.courseId, course.id)).limit(1)
if (!quiz) {
  console.error('that course has no quiz yet — add a quiz lesson in the admin first')
  process.exit(1)
}

const existing = await db
  .select({ id: quizQuestions.id })
  .from(quizQuestions)
  .where(eq(quizQuestions.quizId, quiz.id))

if (existing.length && !replace) {
  console.log(`  that quiz already has ${existing.length} questions — run with --replace to redo them`)
  process.exit(0)
}

if (existing.length) {
  await db.delete(quizChoices).where(
    inArray(
      quizChoices.questionId,
      existing.map((q) => q.id),
    ),
  )
  await db.delete(quizQuestions).where(eq(quizQuestions.quizId, quiz.id))
  console.log(`  removed ${existing.length} old questions`)
}

// The title the admin gave it was a placeholder; and 80% of seven questions is
// six, which is a hard line for a first test.
await db
  .update(quizzes)
  .set({ title: `แบบทดสอบท้ายคอร์ส — ${course.title}`, passPct: 70, timerMinutes: null })
  .where(eq(quizzes.id, quiz.id))

let order = 0
for (const q of QUESTIONS) {
  order += 1
  const [res] = await db.insert(quizQuestions).values({
    quizId: quiz.id,
    type: q.type,
    text: q.text,
    maxLength: q.maxLength ?? 1000,
    attachmentAllowed: q.type === 'essay',
    sortOrder: order,
  })

  if (!q.choices?.length) continue
  const correct = q.correctCount ?? 1
  await db.insert(quizChoices).values(
    q.choices.map((text, i) => ({
      questionId: Number(res.insertId),
      text,
      isCorrect: i < correct,
      sortOrder: i + 1,
    })),
  )
}

const [{ n } = { n: 0 }] = await db
  .select({ n: sql<number>`COUNT(*)` })
  .from(quizQuestions)
  .where(eq(quizQuestions.quizId, quiz.id))

console.log(`\n  ${course.title}`)
console.log(`  ${Number(n)} questions — 7 choice + 1 written · pass 70% · untimed`)
console.log(`  /th/quiz/${SLUG}\n`)
process.exit(0)
