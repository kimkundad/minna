/**
 * Where one teacher's reach stops.
 *
 *   npx tsx scripts/smoke-teacher-boundary.mts
 *
 * Two teachers, one draft course belonging to the first, and every door the
 * second might try. The write side was already shut; what this exists to keep
 * shut is the read side, which was not — a teacher could pull any course in
 * the school by id, drafts included, because the check asked whether they were
 * staff rather than whether the course was theirs.
 *
 * The public's view is checked too: closing a window on a teacher is no good
 * if it closes one on a visitor reading a published course.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courseInstructors, courses, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const stamp = Date.now()
const emailA = `smoke-bdry-a${stamp}@example.com`
const emailB = `smoke-bdry-b${stamp}@example.com`
const password = 'Str0ng-Pass!2026'

async function teacher(email: string) {
  const made = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'ค',
      lastName: 'ร',
      birthdate: '1990-01-01',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const id = (await made.json()).user.id as number
  const { execFileSync } = await import('node:child_process')
  execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, 'teacher'], {
    shell: true,
    stdio: 'ignore',
  })
  // The role is on the row now, but the token was minted before it.
  const again = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ email, password }),
  })
  return { id, token: (await again.json()).accessToken as string }
}

/** The same, but holding the admin role instead of a teaching one. */
async function staffer(email: string) {
  const made = await teacher(email)
  const { execFileSync } = await import('node:child_process')
  execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, 'admin'], {
    shell: true,
    stdio: 'ignore',
  })
  const again = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ email, password }),
  })
  return { id: made.id, token: (await again.json()).accessToken as string }
}

/**  with a body, for the writes. */
function call2(path: string, token: string, init: RequestInit = {}) {
  return fetch(API + path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      Authorization: `Bearer ${token}`,
    },
  })
}

function call(path: string, token?: string, init: RequestInit = {}) {
  return fetch(API + path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

const emailC = `smoke-bdry-c${stamp}@example.com`

const A = await teacher(emailA)
const B = await teacher(emailB)
const C = await staffer(emailC)
let courseId: number | null = null
/** Anything else the run creates, so a failure halfway leaves nothing behind. */
const alsoMade: number[] = []

try {
  const made = await call('/courses', A.token, {
    method: 'POST',
    body: JSON.stringify({
      title: `ยังไม่เผยแพร่ ${stamp}`,
      slug: `draft-${stamp}`,
      categoryId: 2,
      price: 100000,
      level: 'beginner',
      contentLocale: 'th',
      status: 'draft',
      instructorIds: [A.id],
    }),
  })
  const created = (await made.json()).data
  courseId = created?.id ?? null
  check('a teacher can make their own course', made.status === 201, String(made.status))
  if (!courseId) throw new Error('no course to test against')

  /* ---------------- the owner still gets in ---------------- */

  check("the owner can read it", (await call(`/courses/${courseId}`, A.token)).status === 200)
  check('  and its curriculum', (await call(`/courses/${courseId}/curriculum`, A.token)).status === 200)
  check('  and its quiz', [200, 404].includes((await call(`/courses/${courseId}/quiz`, A.token)).status))

  /* ---------------- the other teacher does not ---------------- */

  const list = await (await call('/courses?perPage=100', B.token)).text()
  check("it stays out of the other teacher's list", !list.includes(`draft-${stamp}`))

  check(
    "the other teacher cannot read the draft by id",
    (await call(`/courses/${courseId}`, B.token)).status === 404,
    String((await call(`/courses/${courseId}`, B.token)).status),
  )
  check(
    '  nor by slug',
    (await call(`/courses/draft-${stamp}`, B.token)).status === 404,
  )
  check(
    '  nor its curriculum',
    (await call(`/courses/${courseId}/curriculum`, B.token)).status === 404,
  )
  check('  nor edit it', (await call(`/courses/${courseId}`, B.token, { method: 'PATCH', body: JSON.stringify({ title: 'hijacked' }) })).status === 403)
  check('  nor add a lesson', (await call(`/courses/${courseId}/lessons`, B.token, { method: 'POST', body: JSON.stringify({ type: 'video', title: 'x' }) })).status === 403)
  check('  nor read the answer key', (await call(`/courses/${courseId}/quiz`, B.token)).status === 403)
  check('  nor write a quiz onto it', (await call(`/courses/${courseId}/quiz`, B.token, { method: 'PUT', body: JSON.stringify({ title: 'x', passPct: 50 }) })).status === 403)

  /* ---------------- making one without the admin-only picker ---------------- */

  // The course form used to load the teacher list on open, which is admin-only,
  // so a teacher could not open the form at all — not even for their own course.
  check('a teacher still cannot read the teacher picker', (await call('/teachers', B.token)).status === 403)

  const bare = await call2('/courses', B.token, {
    method: 'POST',
    body: JSON.stringify({
      title: `ของครู B ${stamp}`,
      slug: `b-own-${stamp}`,
      categoryId: 2,
      price: 50000,
      level: 'beginner',
      contentLocale: 'th',
      status: 'draft',
    }),
  })
  const bareCourse = (await bare.json()).data
  if (bareCourse?.id) alsoMade.push(bareCourse.id)
  check('  and can still make a course, naming nobody', bare.status === 201, String(bare.status))

  const readBack = (await (await call(`/courses/${bareCourse.id}`, B.token)).json()).data
  check('  which is filed under them', readBack?.instructors?.[0]?.id === B.id, JSON.stringify(readBack?.instructors?.map((i: { id: number }) => i.id)))
  check('  so they can edit it', (await call2(`/courses/${bareCourse.id}`, B.token, { method: 'PATCH', body: JSON.stringify({ shortDesc: 'x' }) })).status === 200)
  check('  but cannot hand it to the other teacher', (await call2(`/courses/${bareCourse.id}`, B.token, { method: 'PATCH', body: JSON.stringify({ instructorIds: [A.id] }) })).status === 403)

  /* ---------------- signing a path is not a way round any of it ---------------- */

  // Signing is the last door on private storage, so it cannot be looser than
  // the course it leads into: a guessed path used to be enough.
  const sign = (path: string, token: string) =>
    call2('/uploads/sign', token, { method: 'POST', body: JSON.stringify({ path }) })

  check("a teacher cannot sign another course's video", (await sign(`courses/${courseId}/video/x.mp4`, B.token)).status === 403, String((await sign(`courses/${courseId}/video/x.mp4`, B.token)).status))
  check('  nor a path outside any course at all', (await sign('avatars/1/x.png', B.token)).status === 403)
  check('  but may sign one of their own', [200, 503].includes((await sign(`courses/${bareCourse.id}/video/x.mp4`, B.token)).status), String((await sign(`courses/${bareCourse.id}/video/x.mp4`, B.token)).status))
  check('  and an admin may sign anything', [200, 503].includes((await sign(`courses/${courseId}/video/x.mp4`, C.token)).status))

  /* ---------------- an admin is shut out of none of it ---------------- */

  check(
    "an admin can still read somebody else's draft",
    (await call(`/courses/${courseId}`, C.token)).status === 200,
    String((await call(`/courses/${courseId}`, C.token)).status),
  )
  check('  and its curriculum', (await call(`/courses/${courseId}/curriculum`, C.token)).status === 200)
  check(
    '  and may still edit it',
    (
      await call(`/courses/${courseId}`, C.token, {
        method: 'PATCH',
        body: JSON.stringify({ shortDesc: 'ตรวจแล้ว' }),
      })
    ).status === 200,
  )

  /* ---------------- and neither does anybody else ---------------- */

  check('a signed-out visitor cannot read the draft', (await call(`/courses/${courseId}`)).status === 404)

  /* ---------------- but a published course is still public ---------------- */

  await db.update(courses).set({ status: 'approved' }).where(eq(courses.id, courseId))
  check(
    'once published, a visitor can read it',
    (await call(`/courses/${courseId}`)).status === 200,
    String((await call(`/courses/${courseId}`)).status),
  )
  check(
    '  and so can the other teacher',
    (await call(`/courses/${courseId}`, B.token)).status === 200,
  )
  check(
    '  and its curriculum is public again',
    (await call(`/courses/${courseId}/curriculum`)).status === 200,
  )
  check(
    '  while editing it is still refused',
    (await call(`/courses/${courseId}`, B.token, { method: 'PATCH', body: JSON.stringify({ title: 'hijacked' }) })).status === 403,
  )

  /* ---------------- the rest of the admin ---------------- */

  check('a teacher cannot open the students list', (await call('/students?perPage=5', B.token)).status >= 400)
  check('  nor the orders list', (await call('/orders?perPage=5', B.token)).status >= 400)
} finally {
  const all = [courseId, ...alsoMade].filter((n): n is number => typeof n === 'number')
  if (all.length) {
    await db.delete(courseInstructors).where(inArray(courseInstructors.courseId, all))
    await db.delete(courses).where(inArray(courses.id, all))
  }
  for (const email of [emailA, emailB, emailC]) await db.delete(users).where(eq(users.email, email))
  console.log(`\n  cleaned up the three accounts and ${all.length} courses`)
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
