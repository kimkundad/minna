/**
 * The member's own order history: what "ประวัติการสั่งซื้อ" is built from.
 *
 *   npx tsx scripts/smoke-my-orders.mts
 *
 * Four orders are written for one throwaway account — paid, free, failed and
 * cancelled — because the page's whole job is to keep the unsuccessful ones
 * visible and labelled, and one row cannot show that.
 *
 * The thing checked hardest is that the money is the money that was charged.
 * One bought course is renamed and repriced afterwards; the order must still
 * read as it did on the day.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, invoices, orderItems, orders, users } from '../src/db/schema/index'

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

interface Item {
  kind: string
  courseId: number | null
  slug: string | null
  title: string
  titleNow: string | null
  categoryName: string | null
  unitPrice: number
  discount: number
  net: number
  couponCode: string | null
}
interface Order {
  id: number
  orderNo: string
  status: string
  method: string | null
  createdAt: string
  paidAt: string | null
  subtotal: number
  courseDiscount: number
  orderDiscount: number
  total: number
  items: Item[]
  invoice: { type: string; documentNo: string | null; status: string } | null
}

const email = `smoke-orders-${Date.now()}@example.com`
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
const token = made.body.accessToken as string
const userId = made.body.user.id as number
console.log(`  member: ${email}\n`)

const stamp = Date.now().toString().slice(-8)
/** Restored in the clean-up, so a demo course is not left renamed. */
let renamed: { id: number; title: string; price: number } | null = null

try {
  /* ---------------- nothing bought yet ---------------- */

  const empty = await call('/me/orders', {}, token)
  check('a new member has no orders', empty.status === 200 && empty.body.data.length === 0)
  check('and a stranger is refused outright', (await call('/me/orders')).status === 401)

  /* ---------------- four orders, four endings ---------------- */

  const picked = await db
    .select({ id: courses.id, title: courses.title, price: courses.price })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(2)
  if (picked.length < 2) throw new Error('need two approved courses')
  const [one, two] = picked as [(typeof picked)[0], (typeof picked)[0]]

  const SPEC = [
    { no: `T${stamp}A`, status: 'paid' as const, method: 'card' as const, total: 1500 },
    { no: `T${stamp}B`, status: 'paid' as const, method: 'free' as const, total: 0 },
    { no: `T${stamp}C`, status: 'failed' as const, method: 'card' as const, total: 990 },
    { no: `T${stamp}D`, status: 'cancelled' as const, method: 'promptpay' as const, total: 990 },
  ]

  const madeIds: number[] = []
  for (const s of SPEC) {
    const [res] = await db.insert(orders).values({
      orderNo: s.no,
      userId,
      subtotal: s.total === 0 ? 0 : s.total + 200,
      courseDiscount: s.total === 0 ? 0 : 200,
      orderDiscount: 0,
      vatAmount: 0,
      total: s.total,
      status: s.status,
      paymentMethod: s.method,
      provider: 'stripe',
    })
    const orderId = Number(res.insertId)
    madeIds.push(orderId)
    await db.insert(orderItems).values({
      orderId,
      courseId: s.no.endsWith('A') ? one.id : two.id,
      titleSnapshot: s.no.endsWith('A') ? one.title : two.title,
      unitPrice: s.total === 0 ? 0 : s.total + 200,
      discount: s.total === 0 ? 0 : 200,
      accessType: 'lifetime',
    })
  }

  // A tax invoice on the paid one, with no number yet: asked for, not issued.
  await db.insert(invoices).values({
    orderId: madeIds[0]!,
    type: 'individual',
    name: 'ทด สอบ',
    taxId: '1234567890123',
    address: 'กรุงเทพมหานคร',
  })

  const list = (await call('/me/orders', {}, token)).body.data as Order[]
  check('all four appear, successful or not', list.length === 4, String(list.length))
  check(
    'newest first',
    list.map((o) => o.orderNo).join(',') === [...SPEC].reverse().map((s) => s.no).join(','),
    list.map((o) => o.orderNo).join(','),
  )

  const byNo = new Map(list.map((o) => [o.orderNo, o]))
  const paid = byNo.get(`T${stamp}A`)!
  const free = byNo.get(`T${stamp}B`)!
  const lost = byNo.get(`T${stamp}C`)!
  const gone = byNo.get(`T${stamp}D`)!

  check('the paid one says so', paid.status === 'paid' && paid.method === 'card')
  check('  with its course on it', paid.items.length === 1 && paid.items[0]!.courseId === one.id)
  check('  and the line nets out', paid.items[0]!.net === paid.items[0]!.unitPrice - paid.items[0]!.discount)
  check('the free one carries no money', free.total === 0 && free.method === 'free')
  check('the failed one is kept, not hidden', lost.status === 'failed')
  check('the cancelled one too', gone.status === 'cancelled')

  check('a tax invoice still waiting on its number reads as processing',
    paid.invoice?.status === 'processing' && paid.invoice.documentNo === null,
    JSON.stringify(paid.invoice))

  /* ---------------- the money is the money that was charged ---------------- */

  renamed = { id: one.id, title: one.title, price: one.price }
  await db
    .update(courses)
    .set({ title: `${one.title} (ฉบับปรับปรุง)`, price: 99 })
    .where(eq(courses.id, one.id))

  const after = ((await call('/me/orders', {}, token)).body.data as Order[]).find(
    (o) => o.orderNo === `T${stamp}A`,
  )!
  check(
    'renaming the course does not rewrite the order',
    after.items[0]!.title === one.title,
    after.items[0]!.title,
  )
  check('  but the current name is offered alongside', after.items[0]!.titleNow !== null, String(after.items[0]!.titleNow))
  check('repricing it does not rewrite the order either', after.total === 1500, String(after.total))
  check('  and the line still costs what it cost', after.items[0]!.unitPrice === 1700, String(after.items[0]!.unitPrice))
  check('the course is still linkable', after.items[0]!.slug !== null, String(after.items[0]!.slug))

  /* ---------------- nobody else's orders ---------------- */

  const other = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `smoke-orders-x${stamp}@example.com`,
      password,
      firstName: 'คน',
      lastName: 'อื่น',
      birthdate: '2000-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const mine = (await call('/me/orders', {}, other.body.accessToken as string)).body.data as Order[]
  check('somebody else sees none of them', mine.length === 0, String(mine.length))

  await db.delete(users).where(eq(users.email, `smoke-orders-x${stamp}@example.com`))
} finally {
  if (renamed) {
    await db
      .update(courses)
      .set({ title: renamed.title, price: renamed.price })
      .where(eq(courses.id, renamed.id))
    console.log(`\n  put "${renamed.title}" back`)
  }
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (row) {
    const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, row.id))
    if (mine.length) {
      const ids = mine.map((o) => o.id)
      await db.delete(invoices).where(inArray(invoices.orderId, ids))
      await db.delete(orderItems).where(inArray(orderItems.orderId, ids))
      await db.delete(orders).where(inArray(orders.id, ids))
    }
    await db.delete(users).where(eq(users.id, row.id))
    console.log(`  cleaned up ${email}`)
  }
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
