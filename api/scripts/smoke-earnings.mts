/**
 * What a sale owes its teacher.
 *
 *   npx tsx scripts/smoke-earnings.mts
 *
 * The arithmetic is checked against figures worked out by hand rather than
 * read back from the same code, because every one of these rules was a
 * decision somebody made and a wrong one is money.
 *
 * The agreed rules:
 *   • the share comes off what was actually received, not the ticket price
 *   • a basket coupon is carried by every line in proportion to its value
 *   • VAT comes off first — it is collected, not earned
 *   • nothing is payable until the refund window closes
 *   • a refund never edits the row it reverses
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  courseInstructors,
  courses,
  orderItems,
  orders,
  teacherEarnings,
  users,
} from '../src/db/schema/index'
import { allocate, linesFor, matureDue, recordForOrder, reverseForOrder, summaryFor } from '../src/modules/commerce/earnings.service'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}
const baht = (satang: number) => `฿${(satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

const stamp = Date.now()
const emails = [`smoke-earn-a${stamp}@example.com`, `smoke-earn-b${stamp}@example.com`, `smoke-earn-buyer${stamp}@example.com`]
const madeCourses: number[] = []
const madeOrders: number[] = []

async function person(email: string) {
  const [res] = await db.insert(users).values({
    email,
    passwordHash: 'x',
    firstName: 'ท',
    lastName: 'ส',
    locale: 'th',
    status: 'active',
  })
  return Number(res.insertId)
}

try {
  /* ---------------- the allocator on its own ---------------- */

  check('a split that divides evenly is exact', allocate(30000, [1, 1, 1]).join(',') === '10000,10000,10000')
  const thirds = allocate(100, [1, 1, 1])
  check('one that does not still adds up', thirds.reduce((a, b) => a + b, 0) === 100, thirds.join(','))
  check('  and the leftover satang go to the biggest remainders', thirds.join(',') === '34,33,33', thirds.join(','))
  check('nothing to share is nothing to anybody', allocate(0, [5, 5]).join(',') === '0,0')
  check('no weight to share by does not divide by zero', allocate(500, [0, 0]).join(',') === '0,0')

  /* ---------------- two teachers, one basket ---------------- */

  const teacherA = await person(emails[0]!)
  const teacherB = await person(emails[1]!)
  const buyer = await person(emails[2]!)

  async function course(title: string, price: number, teacher: number, sharePct: number) {
    const [res] = await db.insert(courses).values({
      title,
      slug: `${title}-${stamp}`,
      categoryId: 2,
      price,
      level: 'beginner',
      contentLocale: 'th',
      status: 'approved',
      revenueSharePct: sharePct,
    })
    const id = Number(res.insertId)
    madeCourses.push(id)
    await db.insert(courseInstructors).values({ courseId: id, userId: teacher, sortOrder: 1 })
    return id
  }

  // ฿1,490 and ฿1,890 — the two real German courses' prices.
  const courseA = await course('earn-a', 149000, teacherA, 25)
  const courseB = await course('earn-b', 189000, teacherB, 25)

  /**
   * A basket of both, with ฿300 off the whole order.
   *
   * By hand, with VAT at 7% charged inside the price:
   *   line values            149000 and 189000, total 338000
   *   ฿300 shared out        300_00 × 149000/338000 = 13224.85 → 13225
   *                          300_00 × 189000/338000 = 16775.15 → 16775   (= 30000 ✓)
   *   received               135775 and 172225
   *   VAT inside             135775 − 135775/1.07 = 8882.48 → 8882
   *                          172225 − 172225/1.07 = 11267.06 → 11267
   *   base                   126893 and 160958
   *   25%                    31723.25 → 31723 and 40239.5 → 40240
   */
  const [orderRes] = await db.insert(orders).values({
    orderNo: `EARN-${stamp}`,
    userId: buyer,
    subtotal: 338000,
    courseDiscount: 0,
    orderDiscount: 30000,
    vatAmount: 20155,
    total: 308000,
    status: 'pending',
    paymentMethod: 'card',
  })
  const orderId = Number(orderRes.insertId)
  madeOrders.push(orderId)
  await db.insert(orderItems).values([
    { orderId, courseId: courseA, titleSnapshot: 'earn-a', unitPrice: 149000, discount: 0, accessType: 'lifetime' },
    { orderId, courseId: courseB, titleSnapshot: 'earn-b', unitPrice: 189000, discount: 0, accessType: 'lifetime' },
  ])

  const lines = await linesFor(orderId)
  const byTeacher = new Map(lines.map((l) => [l.userId, l]))
  const a = byTeacher.get(teacherA)!
  const b = byTeacher.get(teacherB)!

  check('both lines are owed to somebody', lines.length === 2, String(lines.length))
  check(
    'the basket discount is carried in proportion',
    a.gross === 135775 && b.gross === 172225,
    `${baht(a.gross)} + ${baht(b.gross)}`,
  )
  check(
    '  and the two shares add back up to what was received',
    a.gross + b.gross === 308000,
    baht(a.gross + b.gross),
  )
  check('VAT comes off before the share', a.vat === 8882 && a.base === 126893, `vat ${baht(a.vat)} base ${baht(a.base)}`)
  check(
    'the teacher of the cheaper course is owed 25% of its base',
    a.amount === 31723,
    `${baht(a.amount)} (expected ฿317.23)`,
  )
  check(
    'and the other 25% of theirs',
    b.amount === 40240,
    `${baht(b.amount)} (expected ฿402.40)`,
  )
  check(
    'the school keeps the rest, VAT included',
    308000 - a.amount - b.amount === 236037,

    baht(308000 - a.amount - b.amount),
  )

  /* ---------------- writing it down ---------------- */

  check('nothing is written for an unpaid order', (await recordForOrder(orderId)) === 2, 'written on demand')
  check('and writing it twice writes nothing', (await recordForOrder(orderId)) === 0)

  const written = await db.select().from(teacherEarnings).where(eq(teacherEarnings.orderId, orderId))
  check('both rows are there', written.length === 2, String(written.length))
  check('  waiting, not payable', written.every((r) => r.status === 'pending'))
  check('  with the rate frozen on them', written.every((r) => r.sharePct === 25))

  const before = await summaryFor(teacherA)
  check('a teacher sees it as pending', before.pending === 31723 && before.payable === 0, baht(before.pending))

  /* ---------------- changing the rate does not move it ---------------- */

  await db.update(courses).set({ revenueSharePct: 40 }).where(eq(courses.id, courseA))
  const after = await summaryFor(teacherA)
  check(
    'raising the rate does not rewrite what was already earned',
    after.pending === 31723,
    baht(after.pending),
  )

  /* ---------------- the refund window ---------------- */

  check('nothing matures before its time', (await matureDue()) === 0)
  await db
    .update(teacherEarnings)
    .set({ maturesAt: new Date(Date.now() - 1000) })
    .where(eq(teacherEarnings.orderId, orderId))
  check('and everything past it does', (await matureDue()) === 2)
  const matured = await summaryFor(teacherA)
  check('  which a teacher sees as payable', matured.payable === 31723 && matured.pending === 0, baht(matured.payable))

  /* ---------------- a refund ---------------- */

  // One paid out, one not: the two take different routes back.
  const rows = await db.select().from(teacherEarnings).where(eq(teacherEarnings.orderId, orderId))
  const paidRow = rows.find((r) => r.userId === teacherA)!
  await db.update(teacherEarnings).set({ status: 'paid', paidAt: new Date() }).where(eq(teacherEarnings.id, paidRow.id))

  await reverseForOrder(orderId, 'คืนเงินทั้งคำสั่งซื้อ')
  const afterRefund = await db.select().from(teacherEarnings).where(eq(teacherEarnings.orderId, orderId))

  const original = afterRefund.find((r) => r.id === paidRow.id)!
  check('a refund never edits the row it reverses', original.status === 'paid' && original.amount === 31723)

  const reversal = afterRefund.find((r) => r.kind === 'refund')
  check('  it writes a negative one instead', reversal?.amount === -31723, String(reversal?.amount))
  check('  payable straight away, since the money has gone back', reversal?.status === 'payable')
  check('  and it points at what it reverses', reversal?.reversesId === paidRow.id)

  const unpaid = afterRefund.find((r) => r.userId === teacherB && r.kind === 'royalty')!
  check('one not yet paid is simply cancelled', unpaid.status === 'cancelled', unpaid.status)

  const settled = await summaryFor(teacherA)
  check(
    'so the teacher nets to nothing across the two rows',
    settled.paidAllTime + settled.payable === 0,
    `paid ${baht(settled.paidAllTime)} + payable ${baht(settled.payable)}`,
  )
  check('and the other teacher is owed nothing at all', (await summaryFor(teacherB)).payable === 0)
} finally {
  if (madeOrders.length) {
    await db.delete(teacherEarnings).where(inArray(teacherEarnings.orderId, madeOrders))
    await db.delete(orderItems).where(inArray(orderItems.orderId, madeOrders))
    await db.delete(orders).where(inArray(orders.id, madeOrders))
  }
  if (madeCourses.length) {
    await db.delete(courseInstructors).where(inArray(courseInstructors.courseId, madeCourses))
    await db.delete(courses).where(inArray(courses.id, madeCourses))
  }
  for (const email of emails) await db.delete(users).where(eq(users.email, email))
  console.log('\n  cleaned up')
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
