/**
 * Checks that both payment methods actually work against Stripe.
 *
 *   npx tsx scripts/smoke-payment-methods.mts
 *
 * Creating a session is not the same as the method being usable: PromptPay has
 * to be switched on for the account and the account has to be able to take
 * THB, and Stripe only says so when asked for a session. This asks for one of
 * each and reads back what the session says it will offer.
 *
 * Test mode only — it refuses to run against a live key.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, orders, users } from '../src/db/schema/index'
import { env } from '../src/config/env'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
  console.error('refusing to run: this is not a Stripe test key')
  process.exit(1)
}

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const email = `smoke-pay-${Date.now()}@example.com`
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
console.log(`  buyer: ${email}\n`)

try {
  const [paid] = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(20)
    .then((rows) => rows.filter((_, i) => i >= 0))
  const [course] = await db
    .select({ id: courses.id, title: courses.title, price: courses.price })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(20)
    .then((rows) => rows.filter((r) => r.price > 0))
  if (!course) throw new Error('no paid course to try')
  void paid

  for (const method of ['card', 'promptpay'] as const) {
    const res = await fetch(`${API}/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lines: [{ kind: 'course', id: course.id }], method }),
    })
    const body = await res.json()

    if (res.status !== 201) {
      check(`${method} is accepted by Stripe`, false, `${res.status} ${JSON.stringify(body).slice(0, 200)}`)
      continue
    }
    check(`${method}: a payment page is created`, Boolean(body.data.url), body.data.order.orderNo)

    // What the session itself says it will offer, read back from Stripe.
    const sessionId = body.data.order.providerRef as string
    const session = await (
      await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      })
    ).json()

    check(
      `${method}: Stripe will offer exactly that method`,
      Array.isArray(session.payment_method_types) &&
        session.payment_method_types.length === 1 &&
        session.payment_method_types[0] === method,
      JSON.stringify(session.payment_method_types),
    )
    check(
      `${method}: in baht`,
      session.currency === 'thb',
      `${session.currency} ${session.amount_total}`,
    )
    check(
      `${method}: for the amount the order says`,
      session.amount_total === body.data.order.total,
      `Stripe ${session.amount_total}, order ${body.data.order.total}`,
    )
    // PromptPay is paid minutes later from a banking app, so the session has
    // to outlive the tab it was opened in.
    if (method === 'promptpay') {
      check(
        'promptpay: the QR stays good for a while',
        session.expires_at > Math.floor(Date.now() / 1000) + 20 * 60,
        `${Math.round((session.expires_at - Date.now() / 1000) / 60)} minutes`,
      )
    }
  }
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
