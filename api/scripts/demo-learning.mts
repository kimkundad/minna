/**
 * Fills the quiz-results, access-rights and lesson-Q&A screens so they can be
 * looked at, and empties them again.
 *
 *   npx tsx scripts/demo-learning.mts up
 *   npx tsx scripts/demo-learning.mts down
 *
 * Quiz attempts and lesson questions have no public end yet — nothing but this
 * puts a row in those tables. Everything is attached to accounts whose email
 * starts `demo.learner`, and `down` removes exactly those.
 */
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  courseInstructors,
  entitlements,
  lessonQuestions,
  lessons,
  quizAttemptAnswers,
  quizAttempts,
  quizChoices,
  quizQuestions,
  quizzes,
  roles,
  userRoles,
  users,
} from '../src/db/schema/index'
import { hashPassword } from '../src/lib/password'

const MODE = process.argv[2] ?? 'up'

const victims = await db
  .select({ id: users.id })
  .from(users)
  .where(like(users.email, 'demo.learner%'))
const ids = victims.map((v) => v.id)

if (MODE === 'down') {
  if (ids.length) {
    const attempts = await db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(inArray(quizAttempts.userId, ids))
    const attemptIds = attempts.map((a) => a.id)
    if (attemptIds.length) {
      await db.delete(quizAttemptAnswers).where(inArray(quizAttemptAnswers.attemptId, attemptIds))
      await db.delete(quizAttempts).where(inArray(quizAttempts.id, attemptIds))
    }
    await db.delete(lessonQuestions).where(inArray(lessonQuestions.userId, ids))
    await db.delete(entitlements).where(inArray(entitlements.userId, ids))
    await db.delete(userRoles).where(inArray(userRoles.userId, ids))
    await db.delete(users).where(inArray(users.id, ids))
  }
  console.log(`cleared ${ids.length} demo learner(s) and everything they did`)
  process.exit(0)
}

if (ids.length) {
  console.log('demo learners are already there — run `down` first to replace them')
  process.exit(0)
}

const [quiz] = await db.select().from(quizzes).limit(1)
if (!quiz) {
  console.log('no quiz to attempt — nothing to do')
  process.exit(0)
}

const questions = await db
  .select({ id: quizQuestions.id, type: quizQuestions.type })
  .from(quizQuestions)
  .where(eq(quizQuestions.quizId, quiz.id))
  .orderBy(quizQuestions.sortOrder)

const choices = await db
  .select({ id: quizChoices.id, questionId: quizChoices.questionId, isCorrect: quizChoices.isCorrect })
  .from(quizChoices)
  .where(inArray(quizChoices.questionId, questions.map((q) => q.id)))

const [studentRole] = await db.select().from(roles).where(eq(roles.name, 'student')).limit(1)
const hash = await hashPassword('DemoLearn!2026')

const [firstLesson] = await db
  .select({ id: lessons.id })
  .from(lessons)
  .where(eq(lessons.courseId, quiz.courseId!))
  .limit(1)

const [teacher] = await db
  .select({ userId: courseInstructors.userId })
  .from(courseInstructors)
  .where(eq(courseInstructors.courseId, quiz.courseId!))
  .limit(1)

/** Enough of a spread that the averages and the per-question rates mean
 *  something: some pass, some fail, one never finishes. */
const PEOPLE = [
  { name: 'Araya', surname: 'K.', score: 95, wrongIndexes: [] as number[] },
  { name: 'Boonmee', surname: 'S.', score: 80, wrongIndexes: [2] },
  { name: 'Chalida', surname: 'P.', score: 60, wrongIndexes: [2, 3] },
  { name: 'Danai', surname: 'W.', score: 40, wrongIndexes: [1, 2, 3] },
  { name: 'Einar', surname: 'L.', score: null, wrongIndexes: [] },
]

const QUESTIONS_ASKED = [
  'อาจารย์คะ ตรงนาทีที่ 4 ออกเสียง つ กับ す ต่างกันยังไงคะ ฟังแล้วเหมือนกันเลย',
  'ทำไมบางคำถึงเขียนด้วยคาตาคานะ ทั้งที่เป็นคำญี่ปุ่นครับ',
  'มีไฟล์ฝึกเขียนฮิรางานะให้ดาวน์โหลดไหมครับ',
]

let n = 0
for (const p of PEOPLE) {
  n += 1
  const [res] = await db.insert(users).values({
    email: `demo.learner.${n}@example.com`,
    passwordHash: hash,
    firstName: p.name,
    lastName: p.surname,
    birthdate: '1998-05-20',
    locale: 'th',
    status: 'active',
    emailVerifiedAt: new Date(),
  })
  const userId = Number(res.insertId)
  if (studentRole) await db.insert(userRoles).values({ userId, roleId: studentRole.id })

  await db.insert(entitlements).values({
    userId,
    courseId: quiz.courseId!,
    source: 'admin',
    status: 'active',
    expiresAt: new Date(Date.now() + 86400000 * 365),
  })

  const finished = p.score !== null
  const [att] = await db.insert(quizAttempts).values({
    quizId: quiz.id,
    userId,
    attemptNo: 1,
    scorePct: p.score,
    passed: finished && p.score! >= quiz.passPct,
    startedAt: new Date(Date.now() - 86400000 * n),
    submittedAt: finished ? new Date(Date.now() - 86400000 * n + 1800000) : null,
  })

  if (finished) {
    const attemptId = Number(att.insertId)
    for (const [i, q] of questions.entries()) {
      const wrong = p.wrongIndexes.includes(i)
      const pool = choices.filter((c) => c.questionId === q.id)
      const picked = pool.find((c) => (wrong ? !c.isCorrect : c.isCorrect)) ?? pool[0]
      if (!picked) continue
      await db.insert(quizAttemptAnswers).values({
        attemptId,
        questionId: q.id,
        selectedChoiceIds: [picked.id],
        isCorrect: !wrong,
      })
    }
  }

  // The first three learners ask a question; one of them already has an answer.
  const asked = QUESTIONS_ASKED[n - 1]
  if (asked && firstLesson) {
    const [qres] = await db.insert(lessonQuestions).values({
      lessonId: firstLesson.id,
      courseId: quiz.courseId!,
      userId,
      body: asked,
      createdAt: new Date(Date.now() - 86400000 * (4 - n)),
    })
    if (n === 3 && teacher) {
      await db.insert(lessonQuestions).values({
        lessonId: firstLesson.id,
        courseId: quiz.courseId!,
        userId: teacher.userId,
        parentId: Number(qres.insertId),
        body: 'มีค่ะ อยู่ในเอกสารประกอบบทที่ 1 ดาวน์โหลดได้จากหน้าบทเรียนเลยค่ะ',
        isInstructor: true,
      })
      await db
        .update(lessonQuestions)
        .set({ answeredAt: new Date() })
        .where(eq(lessonQuestions.id, Number(qres.insertId)))
    }
  }
}

console.log(`added ${PEOPLE.length} learners with attempts, access and questions`)
process.exit(0)
