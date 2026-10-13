/**
 * Marking an order paid by hand — and who may.
 *
 *   npx tsx scripts/smoke-mark-paid.mts
 *
 * The action creates revenue out of nothing and opens a course, so the
 * interesting half of this is what it refuses: an administrator, a missing
 * reason, an order that is already paid.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, entitlements, orders, users } from '../src/db/schema/index'

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

const email = `smoke-paid-${Date.now()}@example.com`
const password = 'Str0ng-Pass!2026'
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
const buyerToken = made.body.accessToken as string
const buyerId = made.body.user.id as number
console.log(`  buyer: ${email}\n`)

try {
  const [course] = await db
    .select({ id: courses.id, price: courses.price })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(20)
    .then((rows) => rows.filter((r) => r.price > 0))
  if (!course) throw new Error('no paid course')

  const placed = await call(
    '/checkout',
    { method: 'POST', body: JSON.stringify({ lines: [{ kind: 'course', id: course.id }], method: 'promptpay' }) },
    buyerToken,
  )
  const order = placed.body.data.order
  check('an unpaid order starts pending', order.status === 'pending', order.status)

  /* ---------------- who may not ---------------- */

  const asBuyer = await call(
    `/orders/${order.id}/mark-paid`,
    { method: 'POST', body: JSON.stringify({ reason: 'I would like this for free' }) },
    buyerToken,
  )
  check('a student cannot mark their own order paid', asBuyer.status === 403, String(asBuyer.status))

  const noToken = await call(`/orders/${order.id}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'bank transfer received' }),
  })
  check('nor can a stranger', noToken.status === 401, String(noToken.status))

  // An administrator who is not a superadmin.
  const adminEmail = `smoke-paid-admin-${Date.now()}@example.com`
  const adminMade = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password,
      firstName: 'แอด',
      lastName: 'มิน',
      birthdate: '1990-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const adminId = adminMade.body.user.id as number
  // Straight in, because promoting somebody is an admin screen's job and this
  // only needs the role to exist for the length of the test.
  await db.execute(sql`
    INSERT INTO user_roles (user_id, role_id)
    SELECT ${adminId}, id FROM roles WHERE name = 'admin'
  `)
  const adminLogin = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password }),
  })
  const adminToken = adminLogin.body.accessToken as string

  const asAdmin = await call(
    `/orders/${order.id}/mark-paid`,
    { method: 'POST', body: JSON.stringify({ reason: 'bank transfer received' }) },
    adminToken,
  )
  check('an administrator cannot either', asAdmin.status === 403, String(asAdmin.status))
  check(
    '  but can still read the order',
    (await call(`/orders/${order.id}`, {}, adminToken)).status === 200,
  )

  /* ---------------- who may ---------------- */

  // A throwaway superadmin, so the allowed half is proven without anybody's
  // real password being needed to run this.
  const superEmail = `smoke-paid-super-${Date.now()}@example.com`
  const superMade = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: superEmail,
      password,
      firstName: 'ซูเปอร์',
      lastName: 'แอดมิน',
      birthdate: '1985-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const superId = superMade.body.user.id as number
  await db.execute(sql`
    INSERT INTO user_roles (user_id, role_id)
    SELECT ${superId}, id FROM roles WHERE name = 'superadmin'
  `)
  const superLogin = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: superEmail, password }),
  })
  {
    const superToken = superLogin.body.accessToken as string

    const noReason = await call(
      `/orders/${order.id}/mark-paid`,
      { method: 'POST', body: JSON.stringify({ reason: '' }) },
      superToken,
    )
    check('a reason is required', noReason.status === 422, String(noReason.status))

    const ok = await call(
      `/orders/${order.id}/mark-paid`,
      { method: 'POST', body: JSON.stringify({ reason: 'โอนผ่านธนาคาร ตรวจสอบสลิปแล้ว' }) },
      superToken,
    )
    check('a superadmin can', ok.status === 200, String(ok.status))

    const [now] = await db.select().from(orders).where(eq(orders.id, order.id))
    check('the order is paid', now?.status === 'paid', now?.status)
    check('with the time it was paid', Boolean(now?.paidAt))

    const granted = await db
      .select({ courseId: entitlements.courseId })
      .from(entitlements)
      .where(eq(entitlements.userId, buyerId))
    check(
      'and the student can study it',
      granted.length === 1 && granted[0]?.courseId === course.id,
      granted.map((g) => g.courseId).join(', ') || '(none)',
    )

    const again = await call(
      `/orders/${order.id}/mark-paid`,
      { method: 'POST', body: JSON.stringify({ reason: 'again' }) },
      superToken,
    )
    check('doing it twice is refused', again.status === 409, String(again.status))
  }

  await db.delete(users).where(eq(users.id, adminId))
  await db.delete(users).where(eq(users.id, superId))
} finally {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (row) {
    await db.delete(orders).where(eq(orders.userId, row.id))
    await db.delete(users).where(eq(users.id, row.id))
    console.log(`\n  cleaned up ${email}`)
  }
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
