/**
 * Moving when access runs out, and closing an order nobody paid.
 *
 *   npx tsx scripts/smoke-access-expiry.mts
 *
 * Both hand out or take back something a learner paid for, so the rules under
 * test are about who may do it and what it does to the rest: an expired record
 * that is extended has to come back to life, a revoked one must not, and a
 * paid order must not be quietly "cancelled" while the learner keeps the
 * course and the teacher keeps the share.
 */
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '../src/db/client'
import { entitlements, orders, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const stamp = Date.now()
const password = 'Str0ng-Pass!2026'
const emails = {
  learner: `smoke-exp-l${stamp}@example.com`,
  admin: `smoke-exp-a${stamp}@example.com`,
  plain: `smoke-exp-p${stamp}@example.com`,
}

async function account(email: string, role?: string) {
  const made = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '1990-01-01',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const body = await made.json()
  if (!role) return { id: body.user.id as number, token: body.accessToken as string }

  const { execFileSync } = await import('node:child_process')
  execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, role], {
    shell: true,
    stdio: 'ignore',
  })
  const again = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ email, password }),
  })
  return { id: body.user.id as number, token: (await again.json()).accessToken as string }
}

const call = (path: string, token: string, init: RequestInit = {}) =>
  fetch(API + path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      Authorization: `Bearer ${token}`,
    },
  })

const LEARNER = await account(emails.learner)
const SUPER = await account(emails.admin, 'superadmin')
const PLAIN = await account(emails.plain, 'admin')

try {
  /* ---------------- something to extend ---------------- */

  const list = await (await fetch(`${API}/courses?perPage=60`)).json()
  const free = list.data.find((c: { price: number }) => c.price === 0)
  const bought = await call('/checkout', LEARNER.token, {
    method: 'POST',
    body: JSON.stringify({ lines: [{ kind: 'course', id: free.id }], method: 'promptpay' }),
  })
  check('a learner has a course', bought.ok, String(bought.status))

  const [ent] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(eq(entitlements.userId, LEARNER.id))
  check('  with an access record', Boolean(ent), String(ent?.id))

  const path = `/members/${LEARNER.id}/entitlements/${ent.id}`
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

  /* ---------------- who may move it ---------------- */

  check(
    'a learner cannot move their own expiry',
    (await call(path, LEARNER.token, {
      method: 'PATCH',
      body: JSON.stringify({ expiresAt: inDays(3650) }),
    })).status === 403,
  )
  check(
    '  nor can an ordinary admin',
    (await call(path, PLAIN.token, {
      method: 'PATCH',
      body: JSON.stringify({ expiresAt: inDays(30) }),
    })).status === 403,
  )

  const moved = await call(path, SUPER.token, {
    method: 'PATCH',
    body: JSON.stringify({ expiresAt: inDays(30) }),
  })
  check('a superadmin can', moved.status === 200, String(moved.status))

  const [after] = await db
    .select({ expiresAt: entitlements.expiresAt, status: entitlements.status })
    .from(entitlements)
    .where(eq(entitlements.id, ent.id))
  check('  and the date is stored', Boolean(after.expiresAt), String(after.expiresAt))
  check('    with the record active', after.status === 'active', after.status)

  /* ---------------- a date in the past, and back again ---------------- */

  await call(path, SUPER.token, {
    method: 'PATCH',
    body: JSON.stringify({ expiresAt: inDays(-1) }),
  })
  const [past] = await db
    .select({ status: entitlements.status })
    .from(entitlements)
    .where(eq(entitlements.id, ent.id))
  check('a date in the past expires it', past.status === 'expired', past.status)

  await call(path, SUPER.token, {
    method: 'PATCH',
    body: JSON.stringify({ expiresAt: inDays(14) }),
  })
  const [revived] = await db
    .select({ status: entitlements.status })
    .from(entitlements)
    .where(eq(entitlements.id, ent.id))
  check('  and extending it brings it back', revived.status === 'active', revived.status)

  /* ---------------- but not past a decision somebody made ---------------- */

  await db.update(entitlements).set({ status: 'revoked' }).where(eq(entitlements.id, ent.id))
  await call(path, SUPER.token, {
    method: 'PATCH',
    body: JSON.stringify({ expiresAt: null }),
  })
  const [stillOff] = await db
    .select({ status: entitlements.status, expiresAt: entitlements.expiresAt })
    .from(entitlements)
    .where(eq(entitlements.id, ent.id))
  check(
    'a revoked record stays revoked, whatever the date says',
    stillOff.status === 'revoked',
    stillOff.status,
  )
  check('  though the date still moves', stillOff.expiresAt === null, String(stillOff.expiresAt))

  /* ---------------- cancelling an order ---------------- */

  const [paidOrder] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.userId, LEARNER.id), eq(orders.status, 'paid')))
    .limit(1)

  check(
    'a paid order cannot be cancelled',
    (await call(`/orders/${paidOrder.id}/cancel`, SUPER.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'ลูกค้าขอยกเลิก' }),
    })).status === 409,
    'refunding is what undoes a payment',
  )

  // One that was never paid: a card charge that failed.
  const paidFor = list.data.find((c: { price: number }) => c.price > 0)
  const placed = await call('/checkout', LEARNER.token, {
    method: 'POST',
    body: JSON.stringify({ lines: [{ kind: 'course', id: paidFor.id }], method: 'promptpay' }),
  })
  // The answer wraps the order, and a Stripe checkout returns a URL beside
  // it — so the row is found by the learner rather than unwrapped here.
  void placed
  const [pending] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.userId, LEARNER.id), eq(orders.status, 'pending')))
    .limit(1)
  check('an unpaid order exists to close', pending?.status === 'pending', String(pending?.status))

  check(
    '  and a reason is required',
    (await call(`/orders/${pending.id}/cancel`, SUPER.token, {
      method: 'POST',
      body: JSON.stringify({ reason: '' }),
    })).status === 422,
  )

  const cancelled = await call(`/orders/${pending.id}/cancel`, SUPER.token, {
    method: 'POST',
    body: JSON.stringify({ reason: 'จ่ายซ้ำในออเดอร์ใหม่' }),
  })
  check('  it can be cancelled', cancelled.status === 200, String(cancelled.status))
  const [closed] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, pending.id))
  check('    and the status says so', closed.status === 'cancelled', closed.status)

  check(
    '    twice is refused',
    (await call(`/orders/${pending.id}/cancel`, SUPER.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'อีกครั้ง' }),
    })).status === 409,
  )
} finally {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `smoke-exp-%${stamp}@example.com`))
  const ids = rows.map((r) => r.id)
  if (ids.length) {
    const theirOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.userId, ids))
    await db.delete(entitlements).where(inArray(entitlements.userId, ids))
    if (theirOrders.length) {
      await db.delete(orders).where(inArray(orders.id, theirOrders.map((o) => o.id)))
    }
    await db.delete(users).where(inArray(users.id, ids))
  }
  console.log('\n  cleaned up the three accounts and their orders')
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
