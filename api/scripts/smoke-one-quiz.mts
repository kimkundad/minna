/**
 * One quiz per course.
 *
 *   npx tsx scripts/smoke-one-quiz.mts
 *
 * The questions are stored against the course and the results are counted per
 * course, so a second quiz lesson is not a second test — it is two rows in the
 * curriculum pointing at one quiz, with nothing to say which is which. The
 * admin hides the option; this is the rule behind it.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courseInstructors, courseModules, courses, lessons, teacherProfiles, users } from '../src/db/schema/index'

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
const email = `smoke-quiz-${Date.now()}@example.com`
const made = await call('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password,
    firstName: 'ทด',
    lastName: 'สอบ',
    birthdate: '1990-01-15',
    acceptedTerms: true,
    locale: 'th',
    memberType: 'student',
  }),
})
const adminId = made.body.user.id as number
await db.execute(sql`
  INSERT INTO user_roles (user_id, role_id) SELECT ${adminId}, id FROM roles WHERE name = 'admin'
`)
const login = await call('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
})
const token = login.body.accessToken as string
console.log(`  admin: ${email}\n`)

let courseId: number | null = null

try {
  // Every course needs somebody who teaches it, so borrow a real teacher.
  const [teacher] = await db
    .select({ id: teacherProfiles.userId })
    .from(teacherProfiles)
    .limit(1)
  if (!teacher) throw new Error('no teacher to attach a course to')

  // A course of its own, so nothing here depends on what the demo data holds.
  const created = await call(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'คอร์สทดสอบกฎหนึ่งแบบทดสอบ',
        slug: `smoke-one-quiz-${Date.now()}`,
        price: 0,
        accessType: 'lifetime',
        contentLocale: 'th',
        status: 'draft',
        instructorIds: [teacher.id],
      }),
    },
    token,
  )
  check('a course can be made to test with', created.status === 201, String(created.status))
  courseId = created.body.data.id as number

  const mod = await call(
    `/courses/${courseId}/modules`,
    { method: 'POST', body: JSON.stringify({ title: 'บทเรียน', sortOrder: 1 }) },
    token,
  )
  const moduleId = mod.body.data.id as number

  const lesson = (type: string, title: string) =>
    call(
      `/courses/${courseId}/lessons`,
      {
        method: 'POST',
        // A video lesson has to have a file; the rule under test is about quizzes,
        // so this one is satisfied rather than argued with.
        body: JSON.stringify({
          moduleId,
          type,
          title,
          sortOrder: 1,
          ...(type === 'video' ? { videoPath: 'minna/courses/shared/demo/demo-lesson.mp4' } : {}),
        }),
      },
      token,
    )

  check('an ordinary lesson is fine', (await lesson('video', 'บทที่ 1')).status === 201)
  const firstQuiz = await lesson('quiz', 'แบบทดสอบท้ายคอร์ส')
  check('and so is the first quiz', firstQuiz.status === 201, String(firstQuiz.status))
  const quizId = firstQuiz.body.data.id as number

  const second = await lesson('quiz', 'แบบทดสอบอีกอัน')
  check('a second quiz is refused', second.status === 409, String(second.status))
  check(
    '  and the message names the one that exists',
    String(second.body?.error?.message ?? '').includes('แบบทดสอบท้ายคอร์ส'),
    String(second.body?.error?.message ?? ''),
  )

  // The other way in: an ordinary lesson turned into a quiz.
  const video = await lesson('video', 'บทที่ 2')
  check('another ordinary lesson still goes in', video.status === 201, JSON.stringify(video.body).slice(0, 120))
  const turned = await call(
    `/courses/${courseId}/lessons/${video.body.data.id}`,
    { method: 'PATCH', body: JSON.stringify({ type: 'quiz' }) },
    token,
  )
  check('nor can another lesson be turned into one', turned.status === 409, String(turned.status))

  // And the quiz itself stays editable.
  const renamed = await call(
    `/courses/${courseId}/lessons/${quizId}`,
    { method: 'PATCH', body: JSON.stringify({ type: 'quiz', title: 'แบบทดสอบ (แก้ชื่อ)' }) },
    token,
  )
  check('while the quiz itself can still be edited', renamed.status === 200, String(renamed.status))

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), eq(lessons.type, 'quiz')))
  check('one quiz on the course, still', Number(n) === 1, String(n))

  // Deleting it makes room for another, which is how a quiz gets replaced.
  check(
    'removing it frees the slot',
    (await call(`/courses/${courseId}/lessons/${quizId}`, { method: 'DELETE' }, token)).status === 204,
  )
  check(
    '  so a new one can be added',
    (await lesson('quiz', 'แบบทดสอบชุดใหม่')).status === 201,
  )
} finally {
  if (courseId) {
    await db.delete(lessons).where(eq(lessons.courseId, courseId))
    await db.delete(courseModules).where(eq(courseModules.courseId, courseId))
    await db.delete(courseInstructors).where(eq(courseInstructors.courseId, courseId))
    await db.delete(courses).where(eq(courses.id, courseId))
  }
  await db.delete(users).where(eq(users.id, adminId))
  console.log('\n  cleaned up')
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
