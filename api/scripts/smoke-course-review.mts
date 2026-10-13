/**
 * A teacher's course goes past an administrator before anyone can buy it.
 *
 *   npx tsx scripts/smoke-course-review.mts
 *
 * The rule already existed — a teacher may set 'draft' or 'pending' and
 * nothing else — but nothing told anybody it had happened, so a course sat
 * waiting until somebody thought to look, and a teacher learned the verdict
 * the same way. This checks the rule and the three notices together, because
 * a gate nobody is told about is a gate nobody passes.
 *
 * Makes its own accounts and course, and removes them again.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, notifications, users } from '../src/db/schema/index'

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
const stamp = Date.now()

async function account(kind: string, role: 'admin' | 'teacher') {
  const email = `smoke-review-${kind}-${stamp}@example.com`
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
  await db.execute(sql`
    INSERT INTO user_roles (user_id, role_id) SELECT ${id}, id FROM roles WHERE name = ${role}
  `)
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return { id, email, token: login.body.accessToken as string }
}

const admin = await account('admin', 'admin')
const teacher = await account('teacher', 'teacher')

const slug = `smoke-review-${stamp}`
let courseId = 0

/** What this course's notices say, for one person. */
async function noticesFor(userId: number) {
  const rows = await db
    .select({ type: notifications.type, title: notifications.title, body: notifications.body })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.subjectId, courseId)))
  return rows
}

try {
  /* ---------------- the course starts as a draft ---------------- */

  const made = await call(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Smoke review course',
        slug,
        price: 100000,
        instructorIds: [teacher.id],
      }),
    },
    admin.token,
  )
  check('a course is created', made.status === 201, String(made.status))
  courseId = made.body?.data?.id ?? 0
  check('  as a draft', made.body?.data?.status === 'draft', made.body?.data?.status)

  /* ---------------- a teacher cannot publish their own ---------------- */

  const selfApprove = await call(
    `/courses/${courseId}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) },
    teacher.token,
  )
  check('a teacher cannot approve their own course', selfApprove.status === 403, String(selfApprove.status))

  const selfEnd = await call(
    `/courses/${courseId}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'ended' }) },
    teacher.token,
  )
  check('  nor end one', selfEnd.status === 403, String(selfEnd.status))

  const selfNote = await call(
    `/courses/${courseId}`,
    { method: 'PATCH', body: JSON.stringify({ reviewNote: 'Looks fine to me' }) },
    teacher.token,
  )
  check('  nor answer their own review', selfNote.status === 403, String(selfNote.status))

  /* ---------------- submitting tells the administrators ---------------- */

  const sent = await call(
    `/courses/${courseId}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) },
    teacher.token,
  )
  check('a teacher can send it for review', sent.status === 200, String(sent.status))
  check('  which leaves it unpublished', sent.body?.data?.status === 'pending', sent.body?.data?.status)

  await new Promise((r) => setTimeout(r, 600))
  const told = await noticesFor(admin.id)
  check('an administrator is told it is waiting', told.some((n) => n.type === 'course_submitted'), told.map((n) => n.type).join(', ') || 'none')
  check('  naming the course', told.some((n) => n.body === 'Smoke review course'), told[0]?.body ?? '')

  /* ---------------- the public cannot see it yet ---------------- */

  const hidden = await call(`/courses/${slug}`)
  check('nobody outside can open it before it is approved', hidden.status === 404, String(hidden.status))

  /* ---------------- sent back, with a reason ---------------- */

  const rejected = await call(
    `/courses/${courseId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', reviewNote: 'The cover is too dark to read.' }),
    },
    admin.token,
  )
  check('an administrator can send it back', rejected.status === 200, String(rejected.status))
  check('  with the reason stored on the course', rejected.body?.data?.reviewNote?.includes('too dark'), rejected.body?.data?.reviewNote)

  await new Promise((r) => setTimeout(r, 600))
  const sentBack = await noticesFor(teacher.id)
  const refusal = sentBack.find((n) => n.type === 'course_rejected')
  check('the teacher is told', Boolean(refusal), sentBack.map((n) => n.type).join(', ') || 'none')
  check('  and the notice carries the reason', String(refusal?.body ?? '').includes('too dark'), refusal?.body ?? '')

  /* ---------------- resubmitting clears the old verdict ---------------- */

  await call(
    `/courses/${courseId}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) },
    teacher.token,
  )
  const [again] = await db
    .select({ note: courses.reviewNote })
    .from(courses)
    .where(eq(courses.id, courseId))
  check('sending it in again clears the old reason', again?.note === null, String(again?.note))

  /* ---------------- approved ---------------- */

  const approved = await call(
    `/courses/${courseId}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) },
    admin.token,
  )
  check('an administrator can approve it', approved.status === 200, String(approved.status))

  const [stamped] = await db
    .select({
      approvedBy: courses.approvedBy,
      approvedAt: courses.approvedAt,
      publishedAt: courses.publishedAt,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
  check('  recording who approved it', stamped?.approvedBy === admin.id, String(stamped?.approvedBy))
  check('  and when', Boolean(stamped?.approvedAt), String(stamped?.approvedAt))
  check('  and publishing it in the same move', Boolean(stamped?.publishedAt), String(stamped?.publishedAt))

  await new Promise((r) => setTimeout(r, 600))
  const good = await noticesFor(teacher.id)
  check('the teacher is told it is live', good.some((n) => n.type === 'course_approved'), good.map((n) => n.type).join(', '))

  const open = await call(`/courses/${slug}`)
  check('and now anybody can open it', open.status === 200, String(open.status))
} finally {
  if (courseId) {
    await db.delete(notifications).where(eq(notifications.subjectId, courseId))
    // Approved courses refuse to be deleted, which is the right rule and the
    // wrong one for a test that made the course itself.
    await db.update(courses).set({ status: 'draft', publishedAt: null }).where(eq(courses.id, courseId))
    await db.delete(courses).where(eq(courses.id, courseId))
  }
  for (const u of [admin, teacher]) await db.delete(users).where(eq(users.id, u.id))
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
