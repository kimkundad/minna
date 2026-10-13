/**
 * What the buyer is actually charged.
 *
 *   npx tsx scripts/smoke-checkout-amount.mts
 *
 * One rule, checked against Stripe itself: **the amount on the payment page
 * is the total on the order**. Everything else about a basket — which coupon,
 * how the discount is spread, whether VAT is inside the price or added to it
 * — is arithmetic, and arithmetic can be checked here. Whether the right
 * number reached the payment provider cannot be checked anywhere else.
 *
 * It was not reaching it. A coupon entered at the checkout is an order-wide
 * one, and the lines sent to Stripe were built per line, so the discount was
 * recorded on our order and never applied to the payment. The buyer was shown
 * the lower price and charged the higher one.
 *
 * Needs Stripe in test mode. With no key the paying half is skipped and the
 * arithmetic half still runs.
 *
 * Makes its own course, coupons and buyer, and removes them again.
 */
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { getCheckoutSession, isStripeConfigured } from '../src/lib/stripe'
import * as service from '../src/modules/commerce/commerce.service'
import type { Quote } from '../src/modules/commerce/commerce.service'
import { coupons, courses, orders, users } from '../src/db/schema/index'

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

/** ฿1,000, so a ten percent coupon is ฿100 and the sums are readable. */
const PRICE = 100000

const adminEmail = `smoke-amount-admin-${stamp}@example.com`
const buyerEmail = `smoke-amount-buyer-${stamp}@example.com`

async function account(email: string, role: 'admin' | null) {
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
  }
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return { id, email, token: login.body.accessToken as string }
}

const admin = await account(adminEmail, 'admin')
const buyer = await account(buyerEmail, null)

const courseSlug = `smoke-amount-${stamp}`
const orderCode = `SMOKEORD${stamp}`.slice(0, 20)
const courseCode = `SMOKECRS${stamp}`.slice(0, 20)

let courseId = 0
const madeOrders: number[] = []

try {
  const course = await call(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Smoke amount course',
        slug: courseSlug,
        price: PRICE,
        instructorIds: [admin.id],
        status: 'approved',
      }),
    },
    admin.token,
  )
  check('a course to buy', course.status === 201, String(course.status))
  courseId = course.body?.data?.id ?? 0

  // Written straight in: the coupon screen is not what is under test, and a
  // coupon is a row.
  await db.execute(sql`
    INSERT INTO coupons (code, scope, course_id, discount_type, value, active)
    VALUES (${orderCode}, 'order', NULL, 'percent', 10, 1),
           (${courseCode}, 'course', ${courseId}, 'percent', 25, 1)
  `)

  /* ---------------- the quote is the thing the buyer is shown ---------------- */

  const plain = await call(
    '/checkout/quote',
    { method: 'POST', body: JSON.stringify({ lines: [{ kind: 'course', id: courseId }] }) },
    buyer.token,
  )
  check('a basket with no coupon costs the price', plain.body?.data?.total === PRICE, String(plain.body?.data?.total))

  const withCoupon = await call(
    '/checkout/quote',
    {
      method: 'POST',
      body: JSON.stringify({ lines: [{ kind: 'course', id: courseId }], couponCode: orderCode }),
    },
    buyer.token,
  )
  const quoted = withCoupon.body?.data
  check('an order-wide coupon takes ten percent off', quoted?.total === PRICE * 0.9, String(quoted?.total))
  check('  and the quote says so as a discount', quoted?.orderDiscount === PRICE * 0.1, String(quoted?.orderDiscount))

  /* ---------------- one coupon, counted once ---------------- */

  /**
   * The basket sends a coupon in two places: on a line, and on the order. A
   * basket-wide coupon arriving in the line slot used to be accepted there as
   * well, so the same code came off twice — ฿100 became ฿90 on the line and
   * then ฿81 on the order, and the buyer saw both discounts listed.
   */
  const twice = await call(
    '/checkout/quote',
    {
      method: 'POST',
      body: JSON.stringify({
        lines: [{ kind: 'course', id: courseId, couponCode: orderCode }],
        couponCode: orderCode,
      }),
    },
    buyer.token,
  )
  check(
    'the same coupon sent twice still comes off once',
    twice.body?.data?.total === PRICE * 0.9,
    `total ${twice.body?.data?.total}, expected ${PRICE * 0.9}`,
  )
  check(
    '  taken at the order, not the line',
    twice.body?.data?.courseDiscount === 0,
    `courseDiscount ${twice.body?.data?.courseDiscount}`,
  )

  /**
   * The checkout has a coupon box on the course and another on the summary,
   * and nothing on either says which codes belong where. Typing a basket
   * coupon into the course box used to work — by applying it twice — and then,
   * once that was fixed, did nothing at all and said nothing about why.
   *
   * So a code typed in either box is applied once, wherever it belongs.
   */
  const orderOnLine = await call(
    '/checkout/quote',
    {
      method: 'POST',
      body: JSON.stringify({ lines: [{ kind: 'course', id: courseId, couponCode: orderCode }] }),
    },
    buyer.token,
  )
  check(
    'a basket coupon typed on the course still works',
    orderOnLine.body?.data?.total === PRICE * 0.9,
    `total ${orderOnLine.body?.data?.total}, expected ${PRICE * 0.9}`,
  )
  check(
    '  applied once, as a basket coupon',
    orderOnLine.body?.data?.orderDiscount === PRICE * 0.1 &&
      orderOnLine.body?.data?.courseDiscount === 0,
    `order ${orderOnLine.body?.data?.orderDiscount}, course ${orderOnLine.body?.data?.courseDiscount}`,
  )

  const courseAtOrder = await call(
    '/checkout/quote',
    {
      method: 'POST',
      body: JSON.stringify({ lines: [{ kind: 'course', id: courseId }], couponCode: courseCode }),
    },
    buyer.token,
  )
  check(
    'and a course coupon in the order slot does nothing either',
    courseAtOrder.body?.data?.total === PRICE,
    `total ${courseAtOrder.body?.data?.total}`,
  )

  /* ---------------- and the thing they are charged ---------------- */

  if (!isStripeConfigured()) {
    console.log('\nskip  Stripe is not configured here, so the payment page is not checked\n')
  } else {
    for (const [what, code, expected] of [
      ['no coupon', null, PRICE],
      ['an order-wide coupon', orderCode, PRICE * 0.9],
      ['a course coupon', courseCode, PRICE * 0.75],
    ] as const) {
      const out = await call(
        '/checkout',
        {
          method: 'POST',
          body: JSON.stringify({
            lines: [{ kind: 'course', id: courseId, ...(code && code === courseCode ? { couponCode: code } : {}) }],
            ...(code && code === orderCode ? { couponCode: code } : {}),
            method: 'card',
          }),
        },
        buyer.token,
      )
      if (out.status !== 201) {
        check(`${what}: checkout succeeds`, false, `${out.status} ${JSON.stringify(out.body).slice(0, 120)}`)
        continue
      }
      const order = out.body.data.order
      madeOrders.push(order.id)

      check(`${what}: our order says ${expected}`, order.total === expected, String(order.total))

      const session = await getCheckoutSession(order.providerRef as string)
      const charged = Number((session as { amount_total?: number }).amount_total ?? -1)
      check(
        `  and Stripe would charge the same`,
        charged === order.total,
        `order ${order.total}, Stripe ${charged}`,
      )
    }
  }
  /* ---------------- the arithmetic, without paying for it ---------------- */

  console.log('\n--- how a quote becomes lines ---')

  /** A quote of whatever shape, for `payableLines` to take apart. */
  const quote = (over: Partial<Quote> & { lines: { unitPrice: number; discount: number }[] }): Quote => {
    const lines = over.lines.map((l, i) => ({
      kind: 'course' as const,
      id: i + 1,
      title: `Line ${i + 1}`,
      unitPrice: l.unitPrice,
      discount: l.discount,
      couponId: null,
    }))
    const subtotal = lines.reduce((s, l) => s + l.unitPrice, 0)
    const courseDiscount = lines.reduce((s, l) => s + l.discount, 0)
    const orderDiscount = over.orderDiscount ?? 0
    const payable = Math.max(0, subtotal - courseDiscount - orderDiscount)
    const vatAmount = over.vatAmount ?? 0
    const vatInclusive = over.vatInclusive ?? true
    return {
      lines,
      subtotal,
      courseDiscount,
      orderDiscount,
      orderCouponId: null,
      vatAmount,
      vatInclusive,
      total: vatInclusive ? payable : payable + vatAmount,
      currency: 'THB',
    } as Quote
  }

  const sums = (q: Quote) => service.payableLines(q).reduce((s, l) => s + l.amount, 0)

  check(
    'one line, no discount',
    sums(quote({ lines: [{ unitPrice: 100000, discount: 0 }] })) === 100000,
  )
  check(
    'an order discount comes off the lines',
    sums(quote({ lines: [{ unitPrice: 100000, discount: 0 }], orderDiscount: 10000 })) === 90000,
  )
  check(
    'VAT added on top is charged as its own line',
    sums(quote({ lines: [{ unitPrice: 100000, discount: 0 }], vatAmount: 7000, vatInclusive: false })) === 107000,
  )
  check(
    '  and VAT already inside the price is not added twice',
    sums(quote({ lines: [{ unitPrice: 100000, discount: 0 }], vatAmount: 6542, vatInclusive: true })) === 100000,
  )
  check(
    'a discount and VAT on top together',
    sums(quote({ lines: [{ unitPrice: 100000, discount: 0 }], orderDiscount: 10000, vatAmount: 6300, vatInclusive: false })) === 96300,
  )

  /**
   * Thirds of a satang have to go somewhere. Spreading by proportion and
   * flooring loses one per line, and a basket that charges a satang less than
   * the order says is the same class of bug as one that charges a thousand
   * more.
   */
  const awkward = quote({
    lines: [
      { unitPrice: 33333, discount: 0 },
      { unitPrice: 33333, discount: 0 },
      { unitPrice: 33334, discount: 0 },
    ],
    orderDiscount: 10000,
  })
  check('three lines and a discount that does not divide', sums(awkward) === awkward.total, `${sums(awkward)} vs ${awkward.total}`)
  check('  with nothing negative', service.payableLines(awkward).every((l) => l.amount >= 0))

  const everything = quote({
    lines: [
      { unitPrice: 189000, discount: 47250 },
      { unitPrice: 59000, discount: 0 },
      { unitPrice: 1, discount: 0 },
    ],
    orderDiscount: 20074,
    vatAmount: 12345,
    vatInclusive: false,
  })
  check('a basket with one of everything', sums(everything) === everything.total, `${sums(everything)} vs ${everything.total}`)

  /** The refusal is the point: a mismatch must stop, not round. */
  let refused = false
  try {
    service.payableLines({ ...quote({ lines: [{ unitPrice: 100000, discount: 0 }] }), total: 99999 } as Quote)
  } catch {
    refused = true
  }
  check('a total that does not add up is refused, not charged', refused)
} finally {
  if (madeOrders.length) {
    await db.execute(sql`DELETE FROM order_items WHERE order_id IN (${sql.join(madeOrders.map((i) => sql`${i}`), sql`, `)})`)
    await db.delete(orders).where(inArray(orders.id, madeOrders))
  }
  await db.delete(coupons).where(inArray(coupons.code, [orderCode, courseCode]))
  if (courseId) {
    await db.update(courses).set({ status: 'draft', publishedAt: null }).where(eq(courses.id, courseId))
    await db.delete(courses).where(eq(courses.id, courseId))
  }
  for (const u of [admin, buyer]) await db.delete(users).where(eq(users.id, u.id))
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
