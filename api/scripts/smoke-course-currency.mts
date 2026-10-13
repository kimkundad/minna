/**
 * Selling a course priced in something other than baht.
 *
 *   npx tsx scripts/smoke-course-currency.mts
 *
 * The teacher picks the currency and that is what Stripe charges — nothing is
 * converted on the way to a buyer. A rate is still needed, but only inwards:
 * the school keeps its books in baht, so each order records what it was worth.
 *
 * The things that would be expensive to get wrong:
 *
 *   - yen is counted in whole units by Stripe. ¥5,000 is stored the way every
 *     other price is, as 500000, and sending that on unchanged charges
 *     ¥500,000 — a hundred times the price, to a real card
 *   - a basket cannot mix currencies, because one Stripe session charges in
 *     one. Caught before a payment page is built, not by Stripe afterwards
 *   - every figure the school reads about itself adds money across orders, so
 *     a euro sale has to carry its baht value or the dashboard quietly lies
 *   - a teacher's share comes out of a satang column, so it converts at the
 *     rate the sale was recorded at and not at today's
 *   - PromptPay is baht only
 *
 * Makes its own accounts and courses, and removes them again.
 */
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, orders, teacherEarnings, users } from '../src/db/schema/index'
import { toStripeAmount } from '../src/lib/currencies'
import { refreshRates, toThb } from '../src/lib/fx'
import * as commerce from '../src/modules/commerce/commerce.service'
import * as earnings from '../src/modules/commerce/earnings.service'

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

async function account(kind: string, ...roles: string[]) {
  const email = `smoke-ccy-${kind}-${stamp}@example.com`
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
  for (const role of roles) {
    await db.execute(sql`
      INSERT INTO user_roles (user_id, role_id) SELECT ${id}, id FROM roles WHERE name = ${role}
    `)
  }
  const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  return { id, email, token: login.body.accessToken as string }
}

await refreshRates()

const admin = await account('admin', 'admin')
const teacher = await account('teacher', 'teacher')
const buyer = await account('buyer')

const made: number[] = []
let orderId = 0

async function makeCourse(slug: string, price: number, currency: string) {
  const res = await call(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify({
        title: `Smoke ${currency} course`,
        slug,
        price,
        currency,
        instructorIds: [teacher.id],
      }),
    },
    admin.token,
  )
  const id = res.body?.data?.id as number
  made.push(id)
  await db.update(courses).set({ status: 'approved' }).where(eq(courses.id, id))
  return { id, created: res }
}

try {
  /* ---------------- a course priced in yen ---------------- */

  // ¥5,000, stored the way every price is stored: hundredths.
  const yen = await makeCourse(`smoke-jpy-${stamp}`, 500000, 'JPY')
  check('a course can be priced in yen', yen.created.status === 201, String(yen.created.status))
  check('  and keeps that currency', yen.created.body?.data?.currency === 'JPY', yen.created.body?.data?.currency)

  const madeUp = await call(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify({ title: 'Nope', slug: `smoke-bad-${stamp}`, price: 100, currency: 'XBT' }),
    },
    admin.token,
  )
  check('a currency we cannot charge in is refused', madeUp.status === 422, String(madeUp.status))

  /* ---------------- the quote speaks yen ---------------- */

  const q = await commerce.quote([{ kind: 'course', id: yen.id }])
  check('the quote is in yen', q.currency === 'JPY', q.currency)
  check('  at the price as stored', q.total === 500000, String(q.total))

  /* ---------------- what Stripe would be sent ---------------- */

  const lines = commerce.payableLines(q)
  const stripeTotal = lines.reduce((sum, l) => sum + toStripeAmount(l.amount, q.currency), 0)
  check(
    'Stripe is sent 5000, not 500000',
    stripeTotal === 5000,
    `${stripeTotal} ${q.currency.toLowerCase()}`,
  )

  // The same amount in baht is sent unchanged, because baht is already
  // hundredths to Stripe. Getting this backwards is the other way to charge
  // a hundred times too much.
  check('a baht amount is sent unchanged', toStripeAmount(159000, 'THB') === 159000)

  /* ---------------- a basket cannot mix ---------------- */

  const baht = await makeCourse(`smoke-thb-${stamp}`, 159000, 'THB')
  let mixed = ''
  try {
    await commerce.quote([
      { kind: 'course', id: yen.id },
      { kind: 'course', id: baht.id },
    ])
  } catch (e) {
    mixed = (e as Error).message
  }
  check('a basket mixing two currencies is refused', mixed.includes('one currency'), mixed.slice(0, 70))

  /* ---------------- the order records what it was worth ---------------- */

  const order = await commerce.createOrder(buyer.id, q, 'card')
  orderId = order.id
  const expected = await toThb(500000, 'JPY')

  check('the order keeps its own currency', order.currency === 'JPY', order.currency)
  check(
    '  and what it was worth in baht',
    order.totalThb === expected.thb,
    `${order.totalThb} satang (฿${(order.totalThb / 100).toFixed(2)})`,
  )
  check('  with the rate it used', Number(order.fxRate) === expected.rate, String(order.fxRate))
  check('  and the day that rate is from', order.fxDate === expected.day, String(order.fxDate))

  // The figure the dashboard adds up. A yen order contributing its yen total
  // would read as a month thirty times better than it was.
  check(
    'the baht value is not the yen total',
    order.totalThb !== order.total,
    `${order.totalThb} vs ${order.total}`,
  )

  /* ---------------- the teacher is paid in baht ---------------- */


  const owed = await earnings.linesFor(orderId)
  check('the order owes the teacher something', owed.length === 1, String(owed.length))

  const line = owed[0]!
  // 25% of the baht value, not 25% of the yen number.
  const quarterOfBaht = Math.round((expected.thb * line.sharePct) / 100)
  check(
    "the teacher's share is worked out in baht",
    Math.abs(line.amount - quarterOfBaht) <= 1,
    `${line.amount} vs ${quarterOfBaht} satang`,
  )
  check(
    '  which is far less than the same sum done in yen',
    line.amount < Math.round((500000 * line.sharePct) / 100),
    `${line.amount} satang`,
  )

  /* ---------------- PromptPay is baht only ---------------- */

  const pp = await call(
    '/checkout',
    {
      method: 'POST',
      body: JSON.stringify({ lines: [{ kind: 'course', id: yen.id }], method: 'promptpay' }),
    },
    buyer.token,
  )
  check('PromptPay is refused for a yen basket', pp.status === 409, String(pp.status))
  check(
    '  with a reason a buyer can act on',
    String(pp.body?.error?.message ?? '').includes('PromptPay'),
    String(pp.body?.error?.message ?? '').slice(0, 70),
  )

  /* ---------------- too cheap to charge ---------------- */

  const dust = await makeCourse(`smoke-dust-${stamp}`, 100, 'JPY')
  const tiny = await call(
    '/checkout',
    {
      method: 'POST',
      body: JSON.stringify({ lines: [{ kind: 'course', id: dust.id }], method: 'card' }),
    },
    buyer.token,
  )
  check('a price below what Stripe will take is refused here', tiny.status === 409, String(tiny.status))
  check(
    '  before a payment page is built for it',
    String(tiny.body?.error?.message ?? '').includes('smallest payment'),
    String(tiny.body?.error?.message ?? '').slice(0, 70),
  )
} finally {
  if (orderId) {
    await db.delete(teacherEarnings).where(eq(teacherEarnings.orderId, orderId))
    await db.execute(sql`DELETE FROM order_items WHERE order_id = ${orderId}`)
    await db.delete(orders).where(eq(orders.id, orderId))
  }
  if (made.length) {
    await db.update(courses).set({ status: 'draft', publishedAt: null }).where(inArray(courses.id, made))
    await db.delete(courses).where(inArray(courses.id, made))
  }
  for (const u of [admin, teacher, buyer]) await db.delete(users).where(eq(users.id, u.id))
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
