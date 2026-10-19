/**
 * A coupon applies where it belongs, or says why it did not.
 *
 *   npx tsx scripts/smoke-coupon-scope.mts
 *
 * The checkout has two coupon boxes — one on each course, one on the basket —
 * and nothing on either says which codes belong where, because only the
 * coupon knows. A basket code typed into a course's box used to be quietly
 * moved to the basket, which looked like it worked and then trapped the
 * buyer: the line showed no discount, so there was no chip to remove, and
 * typing the code into the box it belonged in did nothing either, because the
 * discount had already been given and the total would not move again. The
 * page called that "that coupon does not apply".
 *
 * So the quote now refuses a code in the wrong box and says which box it
 * belongs in. This checks each refusal has the right reason, and that a code
 * that does apply still applies — exactly once.
 *
 * It makes its own course coupon, so "a coupon for a different course" is a
 * case with a known answer rather than whatever the catalogue happens to
 * hold.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/client'
import { coupons, courses, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const stamp = Date.now()
const password = 'Str0ng-Pass!2026'
const email = `smoke-coupon-${stamp}@example.com`

const registered = await fetch(`${API}/auth/register`, {
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
const token = (await registered.json()).accessToken as string

/** Two courses of the same currency: the server refuses a mixed basket. */
const sellable = await db
  .select({ id: courses.id, title: courses.title, price: courses.price, currency: courses.currency })
  .from(courses)
  .where(eq(courses.status, 'approved'))
const byCurrency = new Map<string, typeof sellable>()
for (const c of sellable) {
  if (!c.price) continue
  const list = byCurrency.get(c.currency) ?? []
  list.push(c)
  byCurrency.set(c.currency, list)
}
const pair = [...byCurrency.values()].find((list) => list.length >= 2)
if (!pair) {
  console.error('no two paid courses share a currency, so no basket can be priced')
  process.exit(1)
}
const [first, second] = pair as [(typeof sellable)[number], (typeof sellable)[number]]

/** Our own codes, so the expected answer is known. */
const MINE = `SMOKE-C-${stamp}`
const OTHER = `SMOKE-O-${stamp}`
await db.insert(coupons).values([
  { code: MINE, scope: 'course', courseId: first.id, discountType: 'percent', value: 10, active: true },
  { code: OTHER, scope: 'course', courseId: second.id, discountType: 'percent', value: 10, active: true },
])

type Note = { lineId: number | null; code: string; problem: string }

async function quote(
  lines: { id: number; couponCode?: string }[],
  couponCode?: string,
): Promise<{ total: number; orderDiscount: number; courseDiscount: number; couponNotes: Note[] }> {
  const res = await fetch(`${API}/checkout/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      lines: lines.map((l) => ({ kind: 'course', id: l.id, ...(l.couponCode ? { couponCode: l.couponCode } : {}) })),
      ...(couponCode ? { couponCode } : {}),
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`quote said ${res.status}: ${JSON.stringify(body)}`)
  return body.data
}

const problemOn = (q: { couponNotes: Note[] }, lineId: number | null) =>
  q.couponNotes.find((n) => n.lineId === lineId)?.problem ?? ''

try {
  const plain = await quote([{ id: first.id }, { id: second.id }])
  check('a basket with no coupon prices', plain.total > 0, `${plain.total} satang`)
  check('  and reports no coupon trouble', plain.couponNotes.length === 0)

  /* ---- a basket coupon, typed in a course's box ---- */

  const stray = await quote([{ id: first.id, couponCode: 'TEST10' }, { id: second.id }])
  check(
    'a basket coupon in a course box is refused',
    stray.total === plain.total,
    `${stray.total} against ${plain.total}`,
  )
  check(
    '  and says it belongs to the basket',
    problemOn(stray, first.id) === 'order_only',
    problemOn(stray, first.id) || '(nothing said)',
  )

  /* ---- and in the box it belongs in ---- */

  const basket = await quote([{ id: first.id }, { id: second.id }], 'TEST10')
  check('the same code in the basket box applies', basket.total < plain.total, `${basket.total}`)
  check('  and reports nothing wrong', basket.couponNotes.length === 0)

  /* ---- in both at once: once, and the stray one is still named ---- */

  const both = await quote([{ id: first.id, couponCode: 'TEST10' }, { id: second.id }], 'TEST10')
  check('typed in both places it is still taken once', both.total === basket.total, `${both.total} against ${basket.total}`)
  check(
    '  with the stray copy named as the basket’s',
    problemOn(both, first.id) === 'order_only',
    problemOn(both, first.id) || '(nothing said)',
  )

  /* ---- a course coupon, in its own course's box ---- */

  const own = await quote([{ id: first.id, couponCode: MINE }, { id: second.id }])
  check('a course coupon applies to its own course', own.courseDiscount > 0, `${own.courseDiscount} off`)
  check('  and reports nothing wrong', own.couponNotes.length === 0)

  /* ---- the same code against the wrong course ---- */

  const wrong = await quote([{ id: first.id, couponCode: OTHER }, { id: second.id }])
  check(
    "a course coupon in another course's box is refused",
    wrong.total === plain.total,
    `${wrong.total} against ${plain.total}`,
  )
  check(
    '  and says it is for a different course',
    problemOn(wrong, first.id) === 'other_course',
    problemOn(wrong, first.id) || '(nothing said)',
  )

  /* ---- a course coupon in the basket box ---- */

  const inBasket = await quote([{ id: first.id }, { id: second.id }], MINE)
  check('a course coupon in the basket box is refused', inBasket.total === plain.total, `${inBasket.total}`)
  check(
    '  and says it belongs to one course',
    problemOn(inBasket, null) === 'course_only',
    problemOn(inBasket, null) || '(nothing said)',
  )

  /* ---- a code that does not exist ---- */

  const nonsense = await quote([{ id: first.id }, { id: second.id }], `NOPE-${stamp}`)
  check('a code nobody issued is refused', nonsense.total === plain.total)
  check(
    '  and says so rather than guessing',
    problemOn(nonsense, null) === 'unknown',
    problemOn(nonsense, null) || '(nothing said)',
  )

  /* ---- a basket minimum this basket does not reach ---- */

  const cheapest = pair.reduce((low, c) => (c.price < low.price ? c : low))
  const small = await quote([{ id: cheapest.id }], 'WELCOME300')
  const reason = problemOn(small, null)
  if (reason === 'below_minimum') {
    check('a basket under a coupon’s minimum is told so', true, reason)
  } else {
    // ฿1,000 is the minimum on the seeded code; a basket that clears it has
    // nothing to prove here and should simply have worked.
    check(
      'a basket that clears the minimum takes the discount',
      small.orderDiscount > 0,
      `${small.orderDiscount} off, note "${reason}"`,
    )
  }
} finally {
  await db.delete(coupons).where(inArray(coupons.code, [MINE, OTHER]))
  const GUARD = /^(flow|smoke|pwcheck|test)-[\w.+-]*@example\.(com|invalid)$/i
  if (GUARD.test(email)) await db.delete(users).where(eq(users.email, email))
}

console.log(failed ? `\n${failed} failed` : '\n  all good')
process.exit(failed ? 1 : 0)
