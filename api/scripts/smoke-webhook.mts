/**
 * The payment webhook: what turns a pending order into access.
 *
 *   npx tsx scripts/smoke-webhook.mts
 *
 * Stripe cannot reach a laptop, so this signs an event the way Stripe does and
 * posts it. That exercises everything after the signature — marking the order
 * paid, granting the entitlement, counting the coupon, issuing the invoice —
 * which is the part a card payment and a PromptPay transfer both depend on.
 *
 * It also checks the things that must *not* work: an unsigned event, a forged
 * one, and a replayed one.
 */
import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, entitlements, orders, users } from '../src/db/schema/index'
import { env } from '../src/config/env'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
  console.error('refusing to run: this is not a Stripe test key')
  process.exit(1)
}
if (!env.STRIPE_WEBHOOK_SECRET) {
  console.error('STRIPE_WEBHOOK_SECRET is not set')
  process.exit(1)
}

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

/** Signed the way Stripe signs, so the route's own check is what is tested. */
function post(body: unknown, opts: { secret?: string; timestamp?: number } = {}) {
  const raw = JSON.stringify(body)
  const t = opts.timestamp ?? Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', opts.secret ?? env.STRIPE_WEBHOOK_SECRET!)
    .update(`${t}.${raw}`)
    .digest('hex')
  return fetch(`${API}/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': `t=${t},v1=${sig}`,
    },
    body: raw,
  })
}

const email = `smoke-hook-${Date.now()}@example.com`
const password = 'Str0ng-Pass!2026'

const made = await (
  await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
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
).json()
const token = made.accessToken as string
const userId = made.user.id as number
console.log(`  buyer: ${email}\n`)

try {
  const [course] = await db
    .select({ id: courses.id, title: courses.title, price: courses.price })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(20)
    .then((rows) => rows.filter((r) => r.price > 0))
  if (!course) throw new Error('no paid course to try')

  const placed = await (
    await fetch(`${API}/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lines: [{ kind: 'course', id: course.id }], method: 'promptpay' }),
    })
  ).json()
  const order = placed.data.order
  check('an unpaid order starts pending', order.status === 'pending', order.status)

  const before = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
  check('and grants nothing yet', before.length === 0, `${before.length} entitlements`)

  const event = (type: string, paymentStatus = 'paid') => ({
    id: `evt_test_${Date.now()}`,
    type,
    data: {
      object: {
        id: order.providerRef ?? 'cs_test_x',
        payment_status: paymentStatus,
        metadata: { orderId: String(order.id), orderNo: order.orderNo, userId: String(userId) },
      },
    },
  })

  /* ---------------- what must not work ---------------- */

  const unsigned = await fetch(`${API}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event('checkout.session.completed')),
  })
  check('an unsigned event is refused', unsigned.status === 400, String(unsigned.status))

  const forged = await post(event('checkout.session.completed'), { secret: 'whsec_not_the_secret' })
  check('an event signed with the wrong secret is refused', forged.status === 400, String(forged.status))

  const stale = await post(event('checkout.session.completed'), {
    timestamp: Math.floor(Date.now() / 1000) - 600,
  })
  check('a replayed event from ten minutes ago is refused', stale.status === 400, String(stale.status))

  const unpaid = await post(event('checkout.session.completed', 'unpaid'))
  check('a completed-but-unpaid session changes nothing', unpaid.status === 200, String(unpaid.status))
  const [stillPending] = await db.select().from(orders).where(eq(orders.id, order.id))
  check('  the order is still pending', stillPending?.status === 'pending', stillPending?.status)

  /* ---------------- what must work ---------------- */

  const ok = await post(event('checkout.session.async_payment_succeeded'))
  check('a properly signed payment is accepted', ok.status === 200, String(ok.status))

  const [nowPaid] = await db.select().from(orders).where(eq(orders.id, order.id))
  check('the order is marked paid', nowPaid?.status === 'paid', nowPaid?.status)
  check('with the time it was paid', Boolean(nowPaid?.paidAt), String(nowPaid?.paidAt))

  const granted = await db
    .select({ courseId: entitlements.courseId, status: entitlements.status })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
  check(
    'and access to the course is granted',
    granted.length === 1 && granted[0]?.courseId === course.id,
    granted.map((g) => `${g.courseId}:${g.status}`).join(', ') || '(none)',
  )

  // Stripe retries, so the same event arriving twice must do nothing twice.
  const again = await post(event('checkout.session.completed'))
  check('a repeated event is accepted quietly', again.status === 200, String(again.status))
  const twice = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
  check('and does not grant access a second time', twice.length === 1, `${twice.length} entitlements`)
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
