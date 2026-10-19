/**
 * What a teacher is told about their own classes.
 *
 *   npx tsx scripts/smoke-teacher-numbers.mts
 *
 * Until now a teacher could not find out that anybody had bought their course
 * at all: the sales screens are admin-only, the dashboard sent them no counts,
 * and the course list carried no figure. They could only infer it from
 * somebody sitting a quiz.
 *
 * Two numbers answer it, and this checks both against rows written by hand so
 * the expected answer is known rather than read back from the same query.
 *
 * The counts are deliberately about people, not money: whether a teacher sees
 * revenue depends on whether they are paid a share of it, which is a business
 * decision nobody has made yet.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courseInstructors, courses, entitlements, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const stamp = Date.now()
const password = 'Str0ng-Pass!2026'
const teacherEmail = `smoke-nums-t${stamp}@example.com`
const otherEmail = `smoke-nums-o${stamp}@example.com`
const learnerEmails = [0, 1, 2].map((n) => `smoke-nums-l${n}-${stamp}@example.com`)

async function account(email: string, role?: 'teacher') {
  const made = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'ท',
      lastName: 'ส',
      birthdate: '1990-01-01',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const id = (await made.json()).user.id as number
  if (role) {
    const { execFileSync } = await import('node:child_process')
    execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, role], { shell: true, stdio: 'ignore' })
  }
  const again = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ email, password }),
  })
  return { id, token: (await again.json()).accessToken as string }
}

const call = (path: string, token: string) =>
  fetch(API + path, { headers: { Authorization: `Bearer ${token}` } })

const T = await account(teacherEmail, 'teacher')
const O = await account(otherEmail, 'teacher')
const learners = []
for (const email of learnerEmails) learners.push(await account(email))

const madeCourses: number[] = []

try {
  /* ---- two courses for our teacher, one for somebody else ---- */

  async function makeCourse(owner: { id: number; token: string }, title: string) {
    const res = await fetch(`${API}/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({
        title,
        slug: `${title}-${stamp}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        categoryId: 2,
        price: 100000,
        level: 'beginner',
        contentLocale: 'th',
        status: 'approved',
        instructorIds: [owner.id],
      }),
    })
    const made = (await res.json()).data
    if (made?.id) madeCourses.push(made.id)
    return made?.id as number
  }

  const mine1 = await makeCourse(T, `nums-a`)
  const mine2 = await makeCourse(T, `nums-b`)
  const theirs = await makeCourse(O, `nums-c`)
  check('three courses made', Boolean(mine1 && mine2 && theirs))

  /**
   * Learner 0 is on both of our teacher's courses — which is the case that
   * tells `learners` and `enrolments` apart. Learner 1 is on one. Learner 2 is
   * only on the other teacher's course, and must not be counted at all.
   * One revoked row stands for access that was taken away.
   */
  await db.insert(entitlements).values([
    { userId: learners[0]!.id, courseId: mine1, source: 'purchase', status: 'active' },
    { userId: learners[0]!.id, courseId: mine2, source: 'purchase', status: 'active' },
    { userId: learners[1]!.id, courseId: mine1, source: 'free', status: 'active' },
    { userId: learners[2]!.id, courseId: theirs, source: 'purchase', status: 'active' },
    { userId: learners[2]!.id, courseId: mine2, source: 'purchase', status: 'revoked' },
  ])

  /* ---- the course list ---- */

  // scope=manage, because this is the admin list — a teacher's own courses,
  // drafts included. Without it the endpoint answers with the public
  // catalogue, which is the same for everybody and carries no counts.
  const list = await (await call('/courses?perPage=100&scope=manage', T.token)).json()
  const rows = list.data as { id: number; enrolmentCount: number }[]
  const a = rows.find((r) => r.id === mine1)
  const b = rows.find((r) => r.id === mine2)
  check('the teacher sees both of their courses', Boolean(a && b), `${rows.length} rows`)
  check("and none of the other teacher's", !rows.some((r) => r.id === theirs))
  check('the first course counts its two students', a?.enrolmentCount === 2, String(a?.enrolmentCount))
  check(
    'the second counts one, not the revoked one',
    b?.enrolmentCount === 1,
    String(b?.enrolmentCount),
  )

  /* ---- the dashboard ---- */

  const mine = (await (await call('/dashboard', T.token)).json()).data
  check('a teacher is given their own numbers', mine.teaching !== null)
  check('  and not the school-wide ones', mine.counts === null)
  check(
    '  three enrolments across their courses',
    mine.teaching?.enrolments === 3,
    String(mine.teaching?.enrolments),
  )
  check(
    '  but two people, because one studies both',
    mine.teaching?.learners === 2,
    String(mine.teaching?.learners),
  )
  check('  two courses live', mine.teaching?.publishedCourses === 2, String(mine.teaching?.publishedCourses))

  const theirsDash = (await (await call('/dashboard', O.token)).json()).data
  check(
    "the other teacher's numbers are their own",
    theirsDash.teaching?.enrolments === 1,
    String(theirsDash.teaching?.enrolments),
  )

  /* ---- and still no money ---- */

  const asText = JSON.stringify(mine)
  check(
    'nothing about revenue reaches a teacher',
    !/revenue|refunded|recentOrders":\[\{/.test(asText),
    asText.slice(0, 80),
  )
  check('the orders list is still refused', (await call('/orders?perPage=5', T.token)).status >= 400)
} finally {
  if (madeCourses.length) {
    await db.delete(entitlements).where(inArray(entitlements.courseId, madeCourses))
    await db.delete(courseInstructors).where(inArray(courseInstructors.courseId, madeCourses))
    await db.delete(courses).where(inArray(courses.id, madeCourses))
  }
  for (const email of [teacherEmail, otherEmail, ...learnerEmails]) {
    await db.delete(users).where(eq(users.email, email))
  }
  console.log('\n  cleaned up the accounts and the courses')
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
