/**
 * The catalogue is the same catalogue whoever is reading it.
 *
 *   npx tsx scripts/smoke-catalog-scope.mts
 *
 * `/courses` serves two lists — the shop, and the desk behind it — and it
 * used to choose between them by looking at the reader's token. Staff got
 * drafts; a teacher got only the courses they teach. The public site sends
 * that token with every request, so signing in as a teacher turned the shop
 * into a list of that teacher's own courses: nothing else could be found, and
 * nothing else could be put in a basket. An admin, the other way round, was
 * shown unpublished courses on the public site.
 *
 * Which list you get is now asked for. This proves both halves: the public
 * read answers the same for a visitor, a student, a teacher and an admin, and
 * `scope=manage` still gives staff the list they need and gives a signed-out
 * visitor nothing extra.
 *
 * It makes its own teacher, their own course and a draft, so the expected
 * answer is known rather than read back out of whatever the database holds.
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
const password = 'Str0ng-Pass!2026'
const teacherEmail = `smoke-scope-t${stamp}@example.com`
const studentEmail = `smoke-scope-s${stamp}@example.com`

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
    execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, role], {
      shell: true,
      stdio: 'ignore',
    })
  }
  const again = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ email, password }),
  })
  return { id, token: (await again.json()).accessToken as string }
}

/** The ids a list came back with, in one comparable string. */
const idsOf = (body: { data: { id: number }[] }) =>
  body.data
    .map((c) => c.id)
    .sort((a, b) => a - b)
    .join(',')

function get(path: string, token?: string) {
  return fetch(API + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then((r) => r.json())
}

const T = await account(teacherEmail, 'teacher')
const S = await account(studentEmail)

const adminEmail = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@minna.local'
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? 'ChangeMe!2026'
const adminToken = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
})
  .then((r) => (r.ok ? r.json() : null))
  .then((b) => (b?.accessToken as string) ?? null)

const madeCourses: number[] = []

try {
  async function makeCourse(title: string, status: 'approved' | 'draft') {
    const res = await fetch(`${API}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${T.token}`,
      },
      body: JSON.stringify({
        title,
        slug: `${title}-${stamp}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        categoryId: 2,
        price: 100000,
        level: 'beginner',
        contentLocale: 'th',
        status,
        instructorIds: [T.id],
      }),
    })
    const made = (await res.json()).data
    if (made?.id) madeCourses.push(made.id)
    return made?.id as number
  }

  const live = await makeCourse('scope-live', 'approved')
  const draft = await makeCourse('scope-draft', 'draft')
  check('a live course and a draft were made', Boolean(live && draft))

  /* ---- the public catalogue, read four ways ---- */

  const visitor = await get('/courses?perPage=100')
  check('a visitor is shown a catalogue', visitor.data.length > 1, `${visitor.data.length} courses`)
  check(
    'and the draft is not in it',
    !visitor.data.some((c: { id: number }) => c.id === draft),
  )

  for (const [who, token] of [
    ['a student', S.token],
    ['the teacher who owns one of them', T.token],
    ...(adminToken ? ([['an admin', adminToken]] as const) : []),
  ] as [string, string][]) {
    const theirs = await get('/courses?perPage=100', token)
    check(
      `${who} is shown exactly the same catalogue`,
      idsOf(theirs) === idsOf(visitor),
      `${theirs.data.length} courses against the visitor's ${visitor.data.length}`,
    )
    check(
      `  and no draft reaches ${who} through it`,
      !theirs.data.some((c: { id: number }) => c.id === draft),
    )
  }
  if (!adminToken) console.log('skip  the admin read — could not sign in as the seeded admin')

  /* ---- and the list behind the desk still works ---- */

  const managed = await get('/courses?perPage=100&scope=manage', T.token)
  const managedIds = managed.data.map((c: { id: number }) => c.id)
  check(
    'asking to manage gives the teacher their own courses',
    managedIds.includes(live) && managedIds.includes(draft),
    `${managed.data.length} rows`,
  )
  check(
    "  and none of anybody else's",
    managed.data.length === 2,
    `${managed.data.length} rows`,
  )

  const sneaking = await get('/courses?perPage=100&scope=manage', S.token)
  check(
    'a student asking to manage is answered with the catalogue anyway',
    idsOf(sneaking) === idsOf(visitor),
    `${sneaking.data.length} courses`,
  )
  check(
    '  which is to say: still no drafts',
    !sneaking.data.some((c: { id: number }) => c.id === draft),
  )

  const outsider = await get('/courses?perPage=100&scope=manage')
  check(
    'and so is a signed-out one',
    idsOf(outsider) === idsOf(visitor),
    `${outsider.data.length} courses`,
  )
} finally {
  /* ---- clean up after ourselves ---- */

  if (madeCourses.length) {
    await db.delete(courseInstructors).where(inArray(courseInstructors.courseId, madeCourses))
    await db.delete(courses).where(inArray(courses.id, madeCourses))
  }
  // The same guard every script here uses: only accounts this file made, and
  // only at example.com, can be deleted.
  const GUARD = /^(flow|smoke|pwcheck|test)-[\w.+-]*@example\.(com|invalid)$/i
  for (const email of [teacherEmail, studentEmail]) {
    if (!GUARD.test(email)) continue
    await db.delete(users).where(eq(users.email, email))
  }
}

console.log(failed ? `\n${failed} failed` : '\n  all good')
process.exit(failed ? 1 : 0)
