/**
 * Taking the course's test, and reading the result.
 *
 *   npx tsx scripts/smoke-quiz.mts
 *
 * The single most important thing here is what is *not* in any response: the
 * answer key. Retakes are unlimited, so a key that leaks once has leaked for
 * good — every payload is checked for `isCorrect` and for per-question
 * right/wrong, and none of them may carry it.
 *
 * Builds its own quiz on its own course, so the demo data can be anything.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  courseInstructors,
  courseModules,
  courses,
  entitlements,
  essaySubmissions,
  lessons,
  quizAttempts,
  quizChoices,
  quizQuestions,
  quizzes,
  teacherProfiles,
  users,
} from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

async function call(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

const password = 'Str0ng-Pass!2026'
async function member(tag: string) {
  const email = `smoke-quiz2-${tag}-${Date.now()}@example.com`
  const made = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '2000-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  return { email, id: made.body.user.id as number, token: made.body.accessToken as string }
}

const student = await member('a')
const outsider = await member('b')
console.log(`  student: ${student.email}\n`)

let courseId: number | null = null

try {
  /* ---------------- a course with a test on it ---------------- */

  const [teacher] = await db.select({ id: teacherProfiles.userId }).from(teacherProfiles).limit(1)
  if (!teacher) throw new Error('no teacher')

  const slug = `smoke-quiz-${Date.now()}`
  const [courseRes] = await db.insert(courses).values({
    title: 'คอร์สทดสอบแบบทดสอบ',
    slug,
    price: 0,
    accessType: 'lifetime',
    contentLocale: 'th',
    status: 'approved',
    sellable: true,
    publishedAt: new Date(),
  })
  courseId = Number(courseRes.insertId)
  await db.insert(courseInstructors).values({ courseId, userId: teacher.id, sortOrder: 1 })

  const [modRes] = await db.insert(courseModules).values({ courseId, title: 'บทเรียน', sortOrder: 1 })
  const [lessonRes] = await db.insert(lessons).values({
    courseId,
    moduleId: Number(modRes.insertId),
    type: 'quiz',
    title: 'แบบทดสอบท้ายคอร์ส',
    sortOrder: 1,
  })

  const [quizRes] = await db.insert(quizzes).values({
    courseId,
    lessonId: Number(lessonRes.insertId),
    title: 'แบบทดสอบท้ายคอร์ส',
    passPct: 60,
  })
  const quizId = Number(quizRes.insertId)

  // Two choice questions and one written one.
  const [q1] = await db.insert(quizQuestions).values({
    quizId,
    type: 'single',
    text: 'ฮิรางานะตัวแรกคือตัวอะไร',
    sortOrder: 1,
  })
  const [q2] = await db.insert(quizQuestions).values({
    quizId,
    type: 'multiple',
    text: 'ข้อใดเป็นสระ',
    sortOrder: 2,
  })
  const [q3] = await db.insert(quizQuestions).values({
    quizId,
    type: 'essay',
    text: 'เขียนแนะนำตัวเป็นภาษาญี่ปุ่น',
    maxLength: 500,
    sortOrder: 3,
  })
  const q1Id = Number(q1.insertId)
  const q2Id = Number(q2.insertId)
  const q3Id = Number(q3.insertId)

  await db.insert(quizChoices).values([
    { questionId: q1Id, text: 'あ', isCorrect: true, sortOrder: 1 },
    { questionId: q1Id, text: 'か', isCorrect: false, sortOrder: 2 },
    { questionId: q2Id, text: 'あ', isCorrect: true, sortOrder: 1 },
    { questionId: q2Id, text: 'い', isCorrect: true, sortOrder: 2 },
    { questionId: q2Id, text: 'さ', isCorrect: false, sortOrder: 3 },
  ])

  /* ---------------- who may see it ---------------- */

  check(
    'a member without the course cannot open the test',
    (await call(`/me/courses/${slug}/quiz`, {}, outsider.token)).status === 403,
  )

  await db.insert(entitlements).values({
    userId: student.id,
    courseId,
    source: 'free',
    status: 'active',
  })

  const paper = await call(`/me/courses/${slug}/quiz`, {}, student.token)
  check('a student on the course gets the paper', paper.status === 200, String(paper.status))
  check('with every question', paper.body.data.questions.length === 3, String(paper.body.data.questions.length))

  /* ---------------- and what it must never contain ---------------- */

  const asText = JSON.stringify(paper.body)
  check('no answer key in it', !asText.includes('isCorrect') && !asText.includes('is_correct'))
  check(
    '  nor a count of right answers per question',
    !/"correct"\s*:/.test(asText),
  )

  /* ---------------- answering it ---------------- */

  const started = await call(`/me/courses/${slug}/quiz/attempts`, { method: 'POST' }, student.token)
  check('an attempt can be started', started.status === 201, String(started.status))
  const attemptId = started.body.data.attemptId as number

  const again = await call(`/me/courses/${slug}/quiz/attempts`, { method: 'POST' }, student.token)
  check(
    'and asking twice carries on with the same one',
    again.status === 200 && again.body.data.attemptId === attemptId,
    String(again.body.data.attemptId),
  )

  const choices = (questionId: number) =>
    paper.body.data.questions.find((q: { id: number }) => q.id === questionId).choices as {
      id: number
      text: string
    }[]

  const draft = { [String(q1Id)]: [choices(q1Id)[0]!.id] }
  check(
    'a draft is kept while they work',
    (await call(
      `/me/quiz-attempts/${attemptId}/draft`,
      { method: 'PUT', body: JSON.stringify({ answers: draft }) },
      student.token,
    )).status === 200,
  )
  const resumed = await call(`/me/courses/${slug}/quiz/attempts`, { method: 'POST' }, student.token)
  check(
    '  and comes back if the tab is closed',
    JSON.stringify(resumed.body.data.draft) === JSON.stringify(draft),
    JSON.stringify(resumed.body.data.draft),
  )

  const blank = await call(
    `/me/quiz-attempts/${attemptId}/submit`,
    { method: 'POST', body: JSON.stringify({ answers: draft }) },
    student.token,
  )
  check('submitting with a question unanswered is refused', blank.status === 422, String(blank.status))

  /* ---------------- marking ---------------- */

  // One right, one deliberately half right: picking only one of two correct
  // options is not half a mark.
  const halfRight = await call(
    `/me/quiz-attempts/${attemptId}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({
        answers: {
          [String(q1Id)]: [choices(q1Id)[0]!.id],
          [String(q2Id)]: [choices(q2Id)[0]!.id],
        },
      }),
    },
    student.token,
  )
  check('a complete paper is marked', halfRight.status === 200, String(halfRight.status))
  check(
    '  half of a multiple-choice question is not half a mark',
    halfRight.body.data.scorePct === 50,
    `${halfRight.body.data.scorePct}%`,
  )
  check('  and 50% does not pass a 60% test', halfRight.body.data.passed === false)
  check(
    '  the result says nothing about which were wrong',
    !/questionId/.test(JSON.stringify(halfRight.body)),
    JSON.stringify(halfRight.body.data),
  )

  const twice = await call(
    `/me/quiz-attempts/${attemptId}/submit`,
    { method: 'POST', body: JSON.stringify({ answers: {} }) },
    student.token,
  )
  check('the same attempt cannot be submitted twice', twice.status === 409, String(twice.status))

  /* ---------------- a second go ---------------- */

  const retake = await call(`/me/courses/${slug}/quiz/attempts`, { method: 'POST' }, student.token)
  check('retaking starts a fresh attempt', retake.body.data.attemptNo === 2, String(retake.body.data.attemptNo))

  const allRight = await call(
    `/me/quiz-attempts/${retake.body.data.attemptId}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({
        answers: {
          [String(q1Id)]: [choices(q1Id)[0]!.id],
          [String(q2Id)]: [choices(q2Id)[0]!.id, choices(q2Id)[1]!.id],
        },
      }),
    },
    student.token,
  )
  check('all right is 100%', allRight.body.data.scorePct === 100, `${allRight.body.data.scorePct}%`)
  check('  and passes', allRight.body.data.passed === true)

  // Choices belonging to another question are not answers to this one.
  const retake2 = await call(`/me/courses/${slug}/quiz/attempts`, { method: 'POST' }, student.token)
  const cheat = await call(
    `/me/quiz-attempts/${retake2.body.data.attemptId}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({
        answers: {
          [String(q1Id)]: [choices(q2Id)[0]!.id],
          [String(q2Id)]: [choices(q2Id)[0]!.id, choices(q2Id)[1]!.id],
        },
      }),
    },
    student.token,
  )
  check(
    "another question's choices do not score",
    cheat.body.data.scorePct === 50,
    `${cheat.body.data.scorePct}%`,
  )

  /* ---------------- the written answer ---------------- */

  const essay = await call(
    `/me/quiz-questions/${q3Id}/essay`,
    { method: 'POST', body: JSON.stringify({ body: 'はじめまして、ทดสอบです。' }) },
    student.token,
  )
  check('a written answer can be sent', essay.status === 201, String(essay.status))
  const resend = await call(
    `/me/quiz-questions/${q3Id}/essay`,
    { method: 'POST', body: JSON.stringify({ body: 'ส่งซ้ำ' }) },
    student.token,
  )
  check('  and not sent again while a teacher has it', resend.status === 409, String(resend.status))

  /* ---------------- the result page ---------------- */

  const res = await call(`/me/courses/${slug}/result`, {}, student.token)
  check('the result reads back', res.status === 200, String(res.status))
  check('  with every attempt', res.body.data.attempts.length === 3, String(res.body.data.attempts.length))
  check('  newest first', res.body.data.attempts[0].attemptNo === 3)
  check('  and the best score kept', res.body.data.bestPct === 100, String(res.body.data.bestPct))
  check(
    '  the written answer is waiting',
    res.body.data.essays[0]?.status === 'pending',
    String(res.body.data.essays[0]?.status),
  )
  check(
    '  so the course is not complete yet',
    res.body.data.completed === false,
    String(res.body.data.completed),
  )
  check(
    '  and still no answer key anywhere',
    !/isCorrect|is_correct/.test(JSON.stringify(res.body)),
  )

  check(
    'somebody else cannot read it',
    (await call(`/me/courses/${slug}/result`, {}, outsider.token)).status === 403,
  )
} finally {
  if (courseId) {
    const quizRows = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.courseId, courseId))
    for (const q of quizRows) {
      await db.delete(essaySubmissions).where(eq(essaySubmissions.quizId, q.id))
      await db.delete(quizAttempts).where(eq(quizAttempts.quizId, q.id))
      await db.delete(quizQuestions).where(eq(quizQuestions.quizId, q.id))
      await db.delete(quizzes).where(eq(quizzes.id, q.id))
    }
    await db.delete(entitlements).where(eq(entitlements.courseId, courseId))
    await db.delete(lessons).where(eq(lessons.courseId, courseId))
    await db.delete(courseModules).where(eq(courseModules.courseId, courseId))
    await db.delete(courseInstructors).where(eq(courseInstructors.courseId, courseId))
    await db.delete(courses).where(eq(courses.id, courseId))
  }
  for (const who of [student, outsider]) await db.delete(users).where(eq(users.id, who.id))
  console.log('\n  cleaned up')
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
