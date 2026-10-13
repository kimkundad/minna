/**
 * A basket that cannot be paid for must never be built.
 *
 *   npx tsx scripts/smoke-cart-currency.mts
 *
 * One Stripe session charges in one currency, so a basket holding a $100
 * course and a ฿1,590 one cannot be paid for at all. The checkout refused it,
 * which turned out to be the wrong place and too late: the course went into
 * the basket first, and from then on every attempt to price the basket threw —
 * so the cart page stopped loading entirely and the only way out was to guess
 * which row to delete, on a page that would not open.
 *
 * What this proves:
 *
 *   - the second currency is refused before anything is written
 *   - the basket is left exactly as it was
 *   - a free course joins any basket, having no currency to defend
 *   - a basket that already mixes two still opens, and says why
 *
 * Makes its own accounts and courses, and removes them again.
 */
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { cartItems, carts, courses, users } from '../src/db/schema/index'

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
  const email = `smoke-cartccy-${kind}-${stamp}@example.com`
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

const admin = await account('admin', 'admin')
const buyer = await account('buyer')
const made: number[] = []

async function makeCourse(kind: string, price: number, currency: string) {
  const res = await call(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify({
        title: `Smoke cart ${kind}`,
        slug: `smoke-cart-${kind}-${stamp}`,
        price,
        currency,
        instructorIds: [admin.id],
      }),
    },
    admin.token,
  )
  const id = res.body?.data?.id as number
  made.push(id)
  await db.update(courses).set({ status: 'approved' }).where(eq(courses.id, id))
  return id
}

try {
  const thb = await makeCourse('thb', 159000, 'THB')
  const usd = await makeCourse('usd', 10000, 'USD')
  const free = await makeCourse('free', 0, 'THB')

  const first = await call(
    '/cart/items',
    { method: 'POST', body: JSON.stringify({ courseId: thb }) },
    buyer.token,
  )
  check('a baht course goes in', first.status === 201, String(first.status))
  check('  and the basket has a total', Boolean(first.body?.data?.quote), JSON.stringify(first.body?.data?.quote?.currency))

  const second = await call(
    '/cart/items',
    { method: 'POST', body: JSON.stringify({ courseId: usd }) },
    buyer.token,
  )
  check('a dollar course is refused', second.status === 409, String(second.status))
  check(
    '  naming both currencies, so the buyer knows what to do',
    /THB/.test(second.body?.error?.message ?? '') && /USD/.test(second.body?.error?.message ?? ''),
    String(second.body?.error?.message ?? '').slice(0, 90),
  )

  // The refusal is worth nothing if the row went in anyway: the basket would
  // be unpriceable from then on, which is the bug this replaced.
  const after = await call('/cart', {}, buyer.token)
  check('nothing was added', after.body?.data?.items?.length === 1, String(after.body?.data?.items?.length))
  check('  and the basket still has a total', Boolean(after.body?.data?.quote))
  check('  with no problem to report', after.body?.data?.problem === null, String(after.body?.data?.problem))

  const freeAdd = await call(
    '/cart/items',
    { method: 'POST', body: JSON.stringify({ courseId: free }) },
    buyer.token,
  )
  check('a free course joins any basket', freeAdd.status === 201, String(freeAdd.status))

  /* ---------------- a basket already holding two still opens ---------------- */

  // Written straight in, the way one filled before this rule existed would be.
  const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, buyer.id)).limit(1)
  await db.insert(cartItems).values({ cartId: cart!.id, courseId: usd, selected: true })

  const broken = await call('/cart', {}, buyer.token)
  check('a basket that mixes two currencies still opens', broken.status === 200, String(broken.status))
  check('  listing every row, so one can be removed', broken.body?.data?.items?.length === 3, String(broken.body?.data?.items?.length))
  check('  with no total', broken.body?.data?.quote === null)
  check(
    '  and a reason in place of one',
    /currency/i.test(broken.body?.data?.problem ?? ''),
    String(broken.body?.data?.problem ?? '').slice(0, 80),
  )

  const fixed = await call(`/cart/items/${usd}`, { method: 'DELETE' }, buyer.token)
  check('removing the odd one out fixes it', fixed.status === 200 || fixed.status === 204, String(fixed.status))
  const well = await call('/cart', {}, buyer.token)
  check('  and the total comes back', Boolean(well.body?.data?.quote), String(well.body?.data?.problem))
} finally {
  if (made.length) {
    await db.delete(cartItems).where(inArray(cartItems.courseId, made))
    await db.update(courses).set({ status: 'draft', publishedAt: null }).where(inArray(courses.id, made))
    await db.delete(courses).where(inArray(courses.id, made))
  }
  for (const u of [admin, buyer]) await db.delete(users).where(eq(users.id, u.id))
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
