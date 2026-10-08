/**
 * The basket, end to end.
 *
 *   npx tsx scripts/smoke-cart.mts
 *
 * Registers a buyer, fills a basket, tests what each endpoint does to it, buys
 * the ticked part, and checks the bought rows left while the unticked ones
 * stayed. Everything it made is deleted at the end, pass or fail.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, orders, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const email = `smoke-cart-${Date.now()}@example.com`
const password = 'Str0ng-Pass!2026'

async function call(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      // Only where there is a body. Fastify rejects a request that declares
      // JSON and then sends none, which is what a DELETE has.
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  const body = res.status === 204 ? null : await res.json()
  return { status: res.status, body }
}

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
if (made.status >= 300) {
  console.error('could not register:', made.status, JSON.stringify(made.body))
  process.exit(1)
}
const token = made.body.accessToken as string
console.log(`  buyer: ${email}\n`)

try {
  const onSale = await db
    .select({ id: courses.id, title: courses.title, price: courses.price })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(5)
  const [a, b] = onSale.filter((c) => c.price > 0)
  if (!a || !b) throw new Error('need two paid courses on sale')

  /* ---------------- empty to start ---------------- */

  let cart = (await call('/cart', {}, token)).body.data
  check('a new account has an empty basket', cart.items.length === 0 && cart.quote === null)

  /* ---------------- adding ---------------- */

  cart = (await call('/cart/items', { method: 'POST', body: JSON.stringify({ courseId: a.id }) }, token)).body.data
  check('adding a course puts it in', cart.items.length === 1, a.title)
  check('and it is ticked to start with', cart.items[0].selected === true)
  check('and the basket knows what it costs', cart.quote?.total > 0, `${cart.quote?.total} satang`)

  cart = (await call('/cart/items', { method: 'POST', body: JSON.stringify({ courseId: a.id }) }, token)).body.data
  check('adding the same one twice does not duplicate it', cart.items.length === 1)

  cart = (await call('/cart/items', { method: 'POST', body: JSON.stringify({ courseId: b.id }) }, token)).body.data
  check('a second course joins it', cart.items.length === 2)

  const both = cart.quote.total

  /* ---------------- unticking ---------------- */

  cart = (
    await call(
      `/cart/items/${b.id}`,
      { method: 'PATCH', body: JSON.stringify({ selected: false }) },
      token,
    )
  ).body.data
  check('unticking leaves it in the basket', cart.items.length === 2)
  check(
    'but out of the total',
    cart.quote.total < both,
    `${both} → ${cart.quote.total} satang`,
  )
  check('and out of the priced lines', cart.quote.lines.length === 1)

  cart = (await call('/cart', { method: 'PATCH', body: JSON.stringify({ selected: true }) }, token))
    .body.data
  check('ticking everything brings it back', cart.quote.total === both, `${cart.quote.total}`)

  /* ---------------- what cannot go in ---------------- */

  const bad = await call('/cart/items', { method: 'POST', body: JSON.stringify({ courseId: 999999 }) }, token)
  check('a course that does not exist is refused', bad.status === 404, String(bad.status))

  const guest = await call('/cart')
  check('a signed-out visitor has no basket to read', guest.status === 401, String(guest.status))

  /* ---------------- buying the ticked part ---------------- */

  await call(`/cart/items/${b.id}`, { method: 'PATCH', body: JSON.stringify({ selected: false }) }, token)

  const placed = await call(
    '/checkout',
    { method: 'POST', body: JSON.stringify({ lines: [{ kind: 'course', id: a.id }], method: 'card' }) },
    token,
  )
  check('the ticked course can be bought', placed.status === 201, String(placed.status))

  cart = (await call('/cart', {}, token)).body.data
  check(
    'buying takes it out of the basket',
    !cart.items.some((i: { courseId: number }) => i.courseId === a.id),
    cart.items.map((i: { courseId: number }) => i.courseId).join(', ') || '(empty)',
  )
  check(
    'and leaves the unticked one alone',
    cart.items.some((i: { courseId: number }) => i.courseId === b.id),
  )

  /* ---------------- removing ---------------- */

  const removed = await call(`/cart/items/${b.id}`, { method: 'DELETE' }, token)
  check(
    'removing empties it',
    removed.body?.data?.items?.length === 0,
    `${removed.status} ${JSON.stringify(removed.body).slice(0, 140)}`,
  )
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
