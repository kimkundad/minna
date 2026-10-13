/**
 * The course's own handouts: add, rename, remove.
 *
 *   npx tsx scripts/smoke-course-documents.mts
 *
 * These are the files the learning room lists under every lesson. Until this
 * existed they could only be written by a seed script, so a course could end up
 * showing a document nobody could rename or take down.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courseDocuments, courses, entitlements, users } from '../src/db/schema/index'

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
async function member(tag: string, role?: 'admin') {
  const email = `smoke-doc-${tag}-${Date.now()}@example.com`
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
  const id = made.body.user.id as number
  if (role) {
    await db.execute(sql`
      INSERT INTO user_roles (user_id, role_id) SELECT ${id}, id FROM roles WHERE name = ${role}
    `)
    const login = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    return { email, id, token: login.body.accessToken as string }
  }
  return { email, id, token: made.body.accessToken as string }
}

const admin = await member('admin', 'admin')
const student = await member('student')
console.log(`  admin: ${admin.email}\n`)

let madeId: number | null = null

try {
  const [course] = await db
    .select({ id: courses.id, slug: courses.slug })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(1)
  if (!course) throw new Error('no approved course')

  const PATH = 'minna/courses/shared/demo/demo-handbook_smoke.pdf'

  /* ---------------- who may ---------------- */

  check(
    'a stranger cannot list them',
    (await call(`/courses/${course.id}/documents`)).status === 401,
  )
  const asStudent = await call(`/courses/${course.id}/documents`, {}, student.token)
  check('nor can a student', asStudent.status === 403, String(asStudent.status))

  const listed = await call(`/courses/${course.id}/documents`, {}, admin.token)
  check('an administrator can', listed.status === 200, String(listed.status))
  const before = listed.body.data.length as number

  /* ---------------- adding ---------------- */

  const noName = await call(
    `/courses/${course.id}/documents`,
    { method: 'POST', body: JSON.stringify({ fileName: '', filePath: PATH }) },
    admin.token,
  )
  check('a document needs a name', noName.status === 422, String(noName.status))

  const added = await call(
    `/courses/${course.id}/documents`,
    {
      method: 'POST',
      body: JSON.stringify({ fileName: 'สรุปคันจิ 300 ตัว.pdf', filePath: PATH, sizeBytes: 9_500_000 }),
    },
    admin.token,
  )
  check('and then it is added', added.status === 201, String(added.status))
  madeId = added.body.data.id as number
  check(
    '  with the name the school chose',
    added.body.data.fileName === 'สรุปคันจิ 300 ตัว.pdf',
    added.body.data.fileName,
  )

  const after = await call(`/courses/${course.id}/documents`, {}, admin.token)
  check('the list grows by one', after.body.data.length === before + 1)

  /* ---------------- renaming ---------------- */

  const renamed = await call(
    `/courses/${course.id}/documents/${madeId}`,
    { method: 'PATCH', body: JSON.stringify({ fileName: 'สรุปคันจิ ฉบับย่อ.pdf' }) },
    admin.token,
  )
  check('it can be renamed', renamed.status === 200, String(renamed.status))
  check(
    '  without the file underneath changing',
    renamed.body.data.filePath === PATH,
    renamed.body.data.filePath,
  )

  const elsewhere = await call(
    `/courses/${course.id + 99999}/documents/${madeId}`,
    { method: 'PATCH', body: JSON.stringify({ fileName: 'hijacked' }) },
    admin.token,
  )
  check(
    'and not through another course',
    elsewhere.status === 404 || elsewhere.status === 403,
    String(elsewhere.status),
  )

  /* ---------------- the student sees it ---------------- */

  await db.insert(entitlements).values({
    userId: student.id,
    courseId: course.id,
    source: 'purchase',
    status: 'active',
  })
  const room = await call(`/me/courses/${course.slug}/curriculum`, {}, student.token)
  check(
    'a student on the course sees it in the room',
    room.body.data.documents.some(
      (d: { fileName: string }) => d.fileName === 'สรุปคันจิ ฉบับย่อ.pdf',
    ),
    room.body.data.documents.map((d: { fileName: string }) => d.fileName).join(', '),
  )
  check(
    '  and is not told where the file is kept',
    !JSON.stringify(room.body.data.documents).includes('minna/'),
  )

  /* ---------------- removing ---------------- */

  const removed = await call(
    `/courses/${course.id}/documents/${madeId}`,
    { method: 'DELETE' },
    admin.token,
  )
  check('it can be removed', removed.status === 204, String(removed.status))
  madeId = null
  check(
    '  and it leaves the room',
    !(await call(`/me/courses/${course.slug}/curriculum`, {}, student.token)).body.data.documents.some(
      (d: { fileName: string }) => d.fileName === 'สรุปคันจิ ฉบับย่อ.pdf',
    ),
  )
} finally {
  if (madeId) await db.delete(courseDocuments).where(eq(courseDocuments.id, madeId))
  for (const who of [admin, student]) {
    await db.delete(entitlements).where(eq(entitlements.userId, who.id))
    await db.delete(users).where(eq(users.id, who.id))
  }
  console.log('\n  cleaned up')
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
