import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { env } from '../../config/env'
import { db } from '../../db/client'
import {
  coupons,
  couponRedemptions,
  courses,
  entitlements,
  invoices,
  orderItems,
  orders,
  packageCourses,
  packages,
  users,
} from '../../db/schema/index'
import { orderPaidMail } from '../../lib/email-templates'
import { conflict, notFound } from '../../lib/errors'
import { toThb } from '../../lib/fx'
import { getVatRules, vatOf } from '../../lib/settings'
// By name rather than as a namespace: invoices.service imports nothing from
// here, so the one-way edge is visible at the import.
import {
  recordForOrder as recordEarnings,
  reverseForOrder as reverseEarnings,
} from './earnings.service'
import { notify } from '../people/notify.service'
import { issueForOrder as issueInvoiceForOrder } from './invoices.service'
import { instant, outer } from '../../lib/sql'
import { schoolDateCompact } from '../../lib/time'

/**
 * Buying things.
 *
 * Every price here comes out of the database. Nothing a client sends about
 * money is believed — not the price, not the discount, not the total — because
 * the only thing stopping someone paying ฿1 for a ฿1,900 course is that the
 * server works the figure out itself.
 *
 * All amounts are satang.
 */

export interface CartLine {
  kind: 'course' | 'package'
  id: number
  /** A coupon that applies to this line only. */
  couponCode?: string | undefined
}

export interface PricedLine {
  kind: 'course' | 'package'
  id: number
  title: string
  unitPrice: number
  /** What `unitPrice` is in. A package has none of its own and is baht. */
  currency: string
  discount: number
  couponId: number | null
  accessType: 'lifetime' | 'limited'
  accessDurationDays: number | null
}

/**
 * Why a code that was typed came to nothing.
 *
 * Reported rather than thrown: a basket with one bad code in it is still a
 * basket, and the buyer needs to see the total they would pay beside the
 * reason the code did not change it.
 */
export type CouponProblem =
  /** No such code, or it has expired, been used up, or been switched off. */
  | 'unknown'
  /** A basket coupon, typed against one course. */
  | 'order_only'
  /** A course coupon, typed against a different course. */
  | 'other_course'
  /** A course coupon, typed into the basket box. */
  | 'course_only'
  /** A basket coupon with a minimum this basket does not reach. */
  | 'below_minimum'
  /** It applied, and took nothing off. */
  | 'nothing_off'

export interface CouponNote {
  /** The course it was typed against, or null for the basket's own box. */
  lineId: number | null
  code: string
  problem: CouponProblem
}

export interface Quote {
  lines: PricedLine[]
  /**
   * The codes that did nothing, and why. A code that worked is not listed —
   * the discount beside it says so.
   */
  couponNotes: CouponNote[]
  subtotal: number
  courseDiscount: number
  orderDiscount: number
  /** Which coupon gave `orderDiscount`, so the order can remember it. */
  orderCouponId: number | null
  vatAmount: number
  /**
   * Whether that VAT is already inside `total` or was added to it.
   *
   * The school sets which, and a summary that does not say reads as a charge
   * added on where the price was tax-inclusive all along.
   */
  vatInclusive: boolean
  total: number
  currency: string
}

/** A coupon that is live right now, or null. The caller decides what to say. */
async function findCoupon(code: string) {
  const [row] = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, code.trim().toUpperCase()))
    .limit(1)
  if (!row || !row.active) return null

  const now = new Date()
  if (row.startsAt && row.startsAt > now) return null
  if (row.expiresAt && row.expiresAt < now) return null
  if (row.usageLimit !== null && row.usedCount >= row.usageLimit) return null
  return row
}

function discountFor(
  amount: number,
  coupon: { discountType: string; value: number; maxDiscount: number | null },
): number {
  const raw =
    coupon.discountType === 'percent'
      ? Math.round(amount * (coupon.value / 100))
      : coupon.value
  const capped = coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw
  // Never more than the thing costs: a coupon is a discount, not a refund.
  return Math.max(0, Math.min(capped, amount))
}

/**
 * What a basket costs, worked out from the database.
 *
 * Also used before anything is bought, so the cart can show a total without
 * creating an order.
 */
export async function quote(
  lines: CartLine[],
  orderCouponCode?: string | undefined,
): Promise<Quote> {
  if (!lines.length) throw conflict('There is nothing to pay for.')

  const courseIds = lines.filter((l) => l.kind === 'course').map((l) => l.id)
  const packageIds = lines.filter((l) => l.kind === 'package').map((l) => l.id)

  const courseRows = courseIds.length
    ? await db.select().from(courses).where(inArray(courses.id, courseIds))
    : []
  const packageRows = packageIds.length
    ? await db.select().from(packages).where(inArray(packages.id, packageIds))
    : []

  const priced: PricedLine[] = []
  const couponNotes: CouponNote[] = []

  for (const line of lines) {
    if (line.kind === 'course') {
      const course = courseRows.find((c) => c.id === line.id)
      if (!course) throw notFound('One of those courses does not exist.')
      // Only what is approved and still for sale can be bought. A draft in a
      // basket is a price nobody agreed to publish.
      if (course.status !== 'approved' || !course.sellable) {
        throw conflict(`“${course.title}” is not on sale.`)
      }

      let discount = 0
      let couponId: number | null = null
      if (line.couponCode) {
        const code = line.couponCode.trim().toUpperCase()
        const coupon = await findCoupon(code)
        const note = (problem: CouponProblem) =>
          couponNotes.push({ lineId: course.id, code, problem })

        /**
         * A course coupon, and this course's.
         *
         * The test used to be `scope !== 'course' || courseId === course.id`,
         * written as "a course coupon has to be for this course, or for
         * anything" — but there is no scope for "anything". There are two,
         * `course` and `order`, so the first half of that let every basket
         * coupon through here as well. The basket then applied it again, and
         * ฿100 came out as ฿81: ten percent off the line, then ten percent
         * off what was left.
         *
         * A basket coupon belongs to the basket, and is refused here rather
         * than quietly moved there. It was moved for a while, so a code typed
         * in the wrong box appeared to work — and then could not be removed,
         * because the line it sat on showed no discount and so offered
         * nothing to remove, nor typed into the box it belonged in, because
         * the discount was already given and the total did not move again.
         */
        if (!coupon) {
          note('unknown')
        } else if (coupon.scope === 'order') {
          note('order_only')
        } else if (coupon.courseId !== course.id) {
          note('other_course')
        } else {
          discount = discountFor(course.price, coupon)
          couponId = coupon.id
          if (discount === 0) note('nothing_off')
        }
      }

      priced.push({
        kind: 'course',
        id: course.id,
        title: course.title,
        unitPrice: course.price,
        currency: course.currency,
        discount,
        couponId,
        accessType: course.accessType,
        accessDurationDays: course.accessDurationDays,
      })
    } else {
      const pack = packageRows.find((p) => p.id === line.id)
      if (!pack) throw notFound('One of those packages does not exist.')

      priced.push({
        kind: 'package',
        id: pack.id,
        title: pack.name,
        unitPrice: pack.price,
        // A package bundles courses that may each be priced differently; the
        // bundle itself carries one price, in baht, and is sold as such.
        currency: 'THB',
        discount: 0,
        couponId: null,
        accessType: 'limited',
        accessDurationDays: pack.durationDays,
      })
    }
  }

  /**
   * One basket, one currency.
   *
   * A Stripe Checkout Session charges in a single currency, so a basket
   * holding a €49 course and a ฿1,590 one cannot be paid for at all. Caught
   * here rather than at the payment, where the buyer has already given their
   * card details to a page that is about to fail.
   *
   * A package has no currency of its own and is always baht, which is why it
   * appears in this list as 'THB' rather than being skipped: a baht package
   * beside a euro course is exactly the basket that cannot be charged.
   */
  const currencies = [...new Set(priced.map((l) => l.currency))]
  if (currencies.length > 1) {
    throw conflict(
      `A basket can only be paid for in one currency, and this one mixes ${currencies.join(' and ')}. ` +
        'Please buy them separately.',
    )
  }
  const orderCurrency = currencies[0] ?? 'THB'

  const subtotal = priced.reduce((sum, l) => sum + l.unitPrice, 0)
  const courseDiscount = priced.reduce((sum, l) => sum + l.discount, 0)

  // An order-wide coupon applies to what is left after the per-line ones, so
  // the two stack rather than one quietly replacing the other.
  let orderDiscount = 0
  let orderCouponId: number | null = null
  if (orderCouponCode) {
    const code = orderCouponCode.trim().toUpperCase()
    const coupon = await findCoupon(code)
    const note = (problem: CouponProblem) => couponNotes.push({ lineId: null, code, problem })
    const after = subtotal - courseDiscount

    if (!coupon) {
      note('unknown')
    } else if (coupon.scope === 'course') {
      note('course_only')
    } else if (coupon.minSubtotal && after < coupon.minSubtotal) {
      note('below_minimum')
    } else {
      orderDiscount = discountFor(after, coupon)
      // Only when it actually took something off: a coupon that was typed and
      // came to nothing has not been used.
      if (orderDiscount > 0) orderCouponId = coupon.id
      else note('nothing_off')
    }
  }

  const payable = Math.max(0, subtotal - courseDiscount - orderDiscount)
  // One read, not two: the rate must not change between working out the tax
  // and working out the total.
  const rules = await getVatRules()
  const vatAmount = vatOf(payable, rules)
  // Inclusive VAT is already inside `payable`; exclusive is added to it.
  const total = rules.inclusive ? payable : payable + vatAmount

  return {
    lines: priced,
    couponNotes,
    subtotal,
    courseDiscount,
    orderDiscount,
    orderCouponId,
    vatAmount,
    vatInclusive: rules.inclusive,
    total,
    currency: orderCurrency,
  }
}

/**
 * The quote, as lines a payment provider can charge.
 *
 * The one rule is that these sum to `q.total` — the figure the buyer was
 * shown and the figure stored on the order. Nothing else may be assumed about
 * how a basket arrived at it.
 *
 * It lived in the checkout route as `unitPrice - discount` per line, which is
 * only part of a quote: a coupon entered at the checkout is an order-wide one
 * and is not on any line, so it never reached Stripe. The order said ฿900,
 * the card was charged ฿1,000, and the only place the two could be compared
 * was a customer's statement.
 *
 * So it is worked out once, here, next to the arithmetic it has to agree
 * with — and it refuses rather than returning a figure that does not match.
 */
export interface PayableLine {
  name: string
  /** Satang. */
  amount: number
}

export function payableLines(q: Quote): PayableLine[] {
  // What each line costs after its own coupon. The order-wide discount is
  // spread across these in proportion, because a provider's line has no place
  // to put a discount of its own and a negative line is not a thing.
  const net = q.lines.map((l) => ({
    name: l.title,
    amount: Math.max(0, l.unitPrice - l.discount),
  }))
  const netTotal = net.reduce((sum, l) => sum + l.amount, 0)

  if (q.orderDiscount > 0 && netTotal > 0) {
    const share = net.map((l) => Math.floor((q.orderDiscount * l.amount) / netTotal))
    // Flooring loses up to one satang per line. The remainder goes on the
    // dearest lines, one at a time, so the sum is exact rather than nearly.
    let left = q.orderDiscount - share.reduce((sum, s) => sum + s, 0)
    const order = net.map((l, i) => i).sort((a, b) => net[b]!.amount - net[a]!.amount)
    for (const i of order) {
      if (left <= 0) break
      if (share[i]! < net[i]!.amount) {
        share[i] = share[i]! + 1
        left -= 1
      }
    }
    for (let i = 0; i < net.length; i += 1) net[i]!.amount -= share[i]!
  }

  // VAT added on top is a charge of its own and has to be charged. Inclusive
  // VAT is already inside the prices above and must not be added again.
  if (!q.vatInclusive && q.vatAmount > 0) {
    net.push({ name: 'VAT', amount: q.vatAmount })
  }

  const charged = net.reduce((sum, l) => sum + l.amount, 0)
  if (charged !== q.total) {
    // Refusing beats charging the wrong amount. Whatever a basket turns out
    // to contain, the two numbers are the same number or nobody pays.
    throw new Error(
      `payableLines came to ${charged} but the order total is ${q.total}. Refusing to charge.`,
    )
  }

  return net
}

/** ORD-20261008-4F2A — the date so support can find it, random so it cannot
 *  be guessed and counted. The date is the school's, not the server's: an
 *  order placed at 02:00 in Bangkok belongs to that day on the phone call. */
function newOrderNo(): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ORD-${schoolDateCompact()}-${rand}`
}

/** Courses the person can already open, so they are not sold them again. */
export async function alreadyOwned(userId: number, courseIds: number[]): Promise<number[]> {
  if (!courseIds.length) return []
  const rows = await db
    .select({ courseId: entitlements.courseId })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.status, 'active'),
        inArray(entitlements.courseId, courseIds),
        or(isNull(entitlements.expiresAt), sql`${entitlements.expiresAt} > NOW()`),
      ),
    )
  return rows.map((r) => r.courseId)
}

export async function createOrder(
  userId: number,
  q: Quote,
  method: 'card' | 'promptpay' | 'free',
) {
  const orderNo = newOrderNo()

  /**
   * What this sale is worth to the school, in baht, at today's rate.
   *
   * Worked out now and written down, because every figure the school reads
   * about itself adds money columns across orders — revenue, a member's
   * lifetime spend, what a coupon has given away — and those sums cannot add
   * yen to baht. Recording it with the order also means last quarter's numbers
   * do not move when the rate does.
   *
   * `toThb` refuses rather than guesses when the rates are missing or stale,
   * and that refusal belongs here: a sale recorded against a fortnight-old
   * rate is a wrong number in the accounts that nobody will ever question.
   */
  const converted = await toThb(q.total, q.currency)

  await db.insert(orders).values({
    orderNo,
    userId,
    subtotal: q.subtotal,
    courseDiscount: q.courseDiscount,
    orderDiscount: q.orderDiscount,
    orderCouponId: q.orderCouponId,
    vatAmount: q.vatAmount,
    total: q.total,
    currency: q.currency,
    totalThb: converted.thb,
    fxRate: String(converted.rate),
    fxDate: converted.day,
    status: 'pending',
    paymentMethod: method,
    provider: method === 'free' ? 'none' : 'stripe',
  })

  const [order] = await db.select().from(orders).where(eq(orders.orderNo, orderNo)).limit(1)
  if (!order) throw new Error('order row vanished right after insert')

  await db.insert(orderItems).values(
    q.lines.map((l) => ({
      orderId: order.id,
      courseId: l.kind === 'course' ? l.id : null,
      packageId: l.kind === 'package' ? l.id : null,
      titleSnapshot: l.title,
      unitPrice: l.unitPrice,
      discount: l.discount,
      couponId: l.couponId,
      accessType: l.accessType,
      accessDurationDays: l.accessDurationDays,
    })),
  )

  return order
}

export async function getOrder(id: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  if (!order) throw notFound('That order does not exist.')
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id))
  return { ...order, items }
}

export async function getOrderByNo(orderNo: string) {
  const [order] = await db.select().from(orders).where(eq(orders.orderNo, orderNo)).limit(1)
  return order ?? null
}

/**
 * Turns a paid order into access.
 *
 * Idempotent on purpose. Stripe sends a webhook at least once and sometimes
 * more, the success page also asks, and a retry after a timeout is normal —
 * so this has to be safe to run twice. It returns false when the order was
 * already paid, and does nothing else.
 */
export async function markPaid(
  orderId: number,
  payment: { providerRef?: string | null; payload?: unknown },
): Promise<boolean> {
  const order = await getOrder(orderId)
  if (order.status === 'paid') return false
  if (order.status === 'refunded') {
    throw conflict('That order was refunded and cannot be paid again.')
  }

  await db
    .update(orders)
    .set({
      status: 'paid',
      paidAt: new Date(),
      providerRef:
        payment.providerRef && payment.providerRef !== 'null'
          ? payment.providerRef
          : order.providerRef,
      providerPayload: (payment.payload ?? order.providerPayload) as never,
    })
    .where(eq(orders.id, orderId))

  await grantAccess(order.userId, order.items)
  await countCouponUse(order.userId, order.id, order.items, {
    couponId: order.orderCouponId,
    discount: order.orderDiscount,
  })
  // Now, and not before: a document number is only spent on a sale that
  // happened. Does nothing when no tax invoice was asked for, and nothing on a
  // second webhook for an order that already has its number.
  await issueInvoiceForOrder(orderId)
  // What the sale owes its teachers, frozen at today's rates. Nothing becomes
  // payable until the refund window closes, and a second webhook writes
  // nothing.
  await recordEarnings(orderId)
  // And finally, telling the buyer. Last because it is the only step whose
  // failure costs nobody their access, and because it names the invoice number
  // the step above may just have allocated.
  await announcePaidOrder(orderId)
  return true
}

/**
 * Tells the buyer their money arrived and their courses are open.
 *
 * A shop that takes payment and says nothing fails an expectation basic enough
 * that the silence reads as a failed charge — people buy again, or write in
 * asking whether it went through.
 *
 * Never throws: a sale that completed must not come apart because a mail
 * server did.
 */
async function announcePaidOrder(orderId: number): Promise<void> {
  const order = await getOrder(orderId)
  const [buyer] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, locale: users.locale })
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1)
  if (!buyer) return

  const titles = order.items.map((i) => i.titleSnapshot)
  const receipt = `/${buyer.locale}/account/orders/${order.orderNo}/receipt`
  const money = `฿${(order.total / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

  await notify({
    userId: order.userId,
    type: 'order.paid',
    surface: 'site',
    title: 'ชำระเงินเรียบร้อย เริ่มเรียนได้เลย',
    body:
      titles.length === 1
        ? `${titles[0]} · ${money}`
        : `${titles.length} คอร์ส · ${money}`,
    link: receipt,
    // One per order, so a webhook delivered twice tells them once.
    subject: { type: 'order', id: order.id },
    mail: orderPaidMail({
      // Their language, which the site recorded when they chose it. A receipt
      // in English for somebody who browsed, bought and will study in Thai is
      // the one message in the whole purchase that does not speak to them.
      locale: buyer.locale,
      name: `${buyer.firstName} ${buyer.lastName}`.trim(),
      orderNo: order.orderNo,
      total: money,
      courses: titles,
      receiptUrl: `${env.APP_URL}${receipt}`,
    }),
  })
}

/**
 * Access, from the items of a paid order.
 *
 * A package grants one entitlement per course inside it, rather than one for
 * the package: access is asked about per course on every lesson page, and a
 * join through the package on every one of those is a cost paid forever to
 * save rows once.
 */
async function grantAccess(
  userId: number,
  items: {
    id: number
    courseId: number | null
    packageId: number | null
    accessType: string
    accessDurationDays: number | null
    /** What the line actually cost, so a course taken for nothing is recorded
     *  as free rather than as a purchase. */
    unitPrice?: number
    discount?: number
  }[],
) {
  for (const item of items) {
    const expiresAt =
      item.accessType === 'limited' && item.accessDurationDays
        ? new Date(Date.now() + item.accessDurationDays * 86_400_000)
        : null

    const courseIds: number[] = []
    if (item.courseId) courseIds.push(item.courseId)
    if (item.packageId) {
      const inPackage = await db
        .select({ courseId: packageCourses.courseId })
        .from(packageCourses)
        .where(eq(packageCourses.packageId, item.packageId))
      courseIds.push(...inPackage.map((p) => p.courseId))
    }

    for (const courseId of courseIds) {
      const [existing] = await db
        .select()
        .from(entitlements)
        .where(and(eq(entitlements.userId, userId), eq(entitlements.courseId, courseId)))
        .limit(1)

      if (existing) {
        // Buying again extends rather than replaces: whoever has the longer
        // access keeps it, and a lifetime one is never shortened.
        const longer =
          existing.expiresAt === null || expiresAt === null
            ? null
            : new Date(Math.max(existing.expiresAt.getTime(), expiresAt.getTime()))
        await db
          .update(entitlements)
          .set({ status: 'active', expiresAt: longer })
          .where(eq(entitlements.id, existing.id))
      } else {
        await db.insert(entitlements).values({
          userId,
          courseId,
          // The member's own screen says where each course came from, and
          // "bought individually" over a course that cost nothing is the one
          // wrong word there. A coupon that happens to come to zero is still a
          // purchase, so this reads the line's own price, not the total paid.
          source: item.packageId
            ? 'package'
            : (item.unitPrice ?? 1) === 0
              ? 'free'
              : 'purchase',
          orderItemId: item.id,
          expiresAt,
          status: 'active',
        })
      }
    }
  }
}

/**
 * A coupon counts as used when it is paid for, not when it is typed.
 *
 * Both kinds are counted: the per-line coupons carried on the items, and the
 * basket coupon the order carries itself. Counting only the first meant a
 * basket coupon's usage limit never came down, so a "first 100 customers" code
 * would have gone on working for the hundred-and-first.
 */
async function countCouponUse(
  userId: number,
  orderId: number,
  items: { couponId: number | null; discount: number }[],
  orderWide: { couponId: number | null; discount: number },
) {
  const spent = [...items, orderWide]

  for (const use of spent) {
    if (!use.couponId || !use.discount) continue
    await db.insert(couponRedemptions).values({
      couponId: use.couponId,
      userId,
      orderId,
      discountAmount: use.discount,
    })
    await db
      .update(coupons)
      .set({ usedCount: sql`${coupons.usedCount} + 1` })
      .where(eq(coupons.id, use.couponId))
  }
}

/**
 * Takes the money back, and the access with it.
 *
 * The entitlements are revoked rather than deleted: what someone watched and
 * was marked on hangs off them, and a refund should not erase a term of
 * somebody's learning history.
 */
export async function refundOrder(orderId: number) {
  const order = await getOrder(orderId)
  if (order.status !== 'paid') throw conflict('Only a paid order can be refunded.')

  await db.update(orders).set({ status: 'refunded' }).where(eq(orders.id, orderId))

  const itemIds = order.items.map((i) => i.id)
  if (itemIds.length) {
    await db
      .update(entitlements)
      .set({ status: 'revoked' })
      .where(inArray(entitlements.orderItemId, itemIds))
  }

  // The teacher's share goes back too. One not yet paid out is cancelled; one
  // already paid becomes a negative line against the next payout, which is
  // gentler than asking somebody to send money back.
  await reverseEarnings(orderId)

  return getOrder(orderId)
}

export async function markFailed(orderId: number, payload?: unknown) {
  const order = await getOrder(orderId)
  // A paid order that later gets a failure event is Stripe retrying an old
  // message, not a reversal; leave it alone.
  if (order.status !== 'pending') return false
  await db
    .update(orders)
    .set({ status: 'failed', providerPayload: (payload ?? order.providerPayload) as never })
    .where(eq(orders.id, orderId))
  return true
}

/**
 * Closing an order that was never paid.
 *
 * For the ones that sit there: a bank transfer nobody ever made, a PromptPay
 * code that went stale, a customer who rang up to say they had changed their
 * mind. It is a tidying action, not a financial one — nothing was taken, so
 * nothing is given back, and nobody was granted anything to take away.
 *
 * Deliberately not available on a paid order. Flipping one of those to
 * "cancelled" would read like money returned while the learner kept the
 * course and the teacher kept the share; a refund is the operation that
 * actually undoes a payment, and it is the one that does all three.
 */
export async function cancelOrder(orderId: number) {
  const order = await getOrder(orderId)
  if (order.status === 'paid' || order.status === 'refunded') {
    throw conflict('This order was paid. Refund it instead — that returns the money and the access.')
  }
  if (order.status === 'cancelled') throw conflict('That order is already cancelled.')

  await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, orderId))

  // Why is not a column on the order: it applies to one status out of five,
  // and the audit log already records who decided and what they said.
  return getOrder(orderId)
}

/** The provider's own id for the payment. Guarded, because a caller that
 *  stringifies a missing value writes "null" and the next lookup fails with
 *  a message nobody can trace back here. */
export async function setProviderRef(orderId: number, ref: string, payload: unknown) {
  if (!ref || ref === 'null' || ref === 'undefined') {
    throw new Error(`refusing to store "${ref}" as a payment reference`)
  }
  await db
    .update(orders)
    .set({ providerRef: ref, providerPayload: payload as never })
    .where(eq(orders.id, orderId))
}

/* ---------------- admin ---------------- */

/**
 * One order, with everything the admin needs to answer a question about it.
 *
 * Separate from `getOrder` because that one is on the payment path, where a
 * join per webhook buys nothing — and because the coupon codes are stored by id
 * on the item, which is no use to somebody reading a screen.
 */
export async function getOrderDetail(id: number) {
  const order = await getOrder(id)

  const [buyer] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phoneCountryCode: users.phoneCountryCode,
      phoneNational: users.phoneNational,
    })
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1)

  const couponIds = [...order.items.map((i) => i.couponId), order.orderCouponId].filter(
    (v): v is number => v !== null,
  )
  const couponRows = couponIds.length
    ? await db
        .select({ id: coupons.id, code: coupons.code })
        .from(coupons)
        .where(inArray(coupons.id, couponIds))
    : []
  const codeOf = new Map(couponRows.map((c) => [c.id, c.code]))

  // The tax invoice asked for with this order, if one was. The receipt sheet
  // is headed differently when a number has been allocated — a document that
  // calls itself a tax invoice without one is not a tax invoice.
  const [invoice] = await db
    .select({
      type: invoices.type,
      name: invoices.name,
      taxId: invoices.taxId,
      branchType: invoices.branchType,
      branchCode: invoices.branchCode,
      address: invoices.address,
      documentNo: invoices.documentNo,
      issuedAt: invoices.issuedAt,
    })
    .from(invoices)
    .where(eq(invoices.orderId, id))
    .limit(1)

  return {
    ...order,
    invoice: invoice
      ? {
          ...invoice,
          issuedAt: instant(invoice.issuedAt),
          // A number is allocated when the order is paid, so one without is
          // still waiting on the payment rather than on a clerk.
          status: invoice.documentNo ? ('issued' as const) : ('processing' as const),
        }
      : null,
    // The raw Stripe payload is kept on the row for support, but it is pages of
    // JSON and no help on a list — the detail screen asks for it by itself.
    providerPayload: undefined,
    orderCouponCode: order.orderCouponId ? (codeOf.get(order.orderCouponId) ?? null) : null,
    buyer: buyer ?? null,
    items: order.items.map((i) => ({
      ...i,
      couponCode: i.couponId ? (codeOf.get(i.couponId) ?? null) : null,
    })),
  }
}

/**
 * The orders list the admin works from.
 *
 * Joined to the buyer rather than returning a bare user id: every question
 * asked about an order starts with who placed it, and a screen that shows `#41`
 * sends someone to another table to find out.
 *
 * `q` matches the order number, the email and the name together, because the
 * person asking has whichever of the three the customer gave them.
 */
export async function listOrders(opts: {
  page: number
  perPage: number
  status?: (typeof orders.status.enumValues)[number] | undefined
  method?: 'card' | 'promptpay' | 'free' | undefined
  q?: string | undefined
}) {
  const term = `%${opts.q ?? ''}%`
  const where = [
    opts.status ? eq(orders.status, opts.status) : undefined,
    opts.method ? eq(orders.paymentMethod, opts.method) : undefined,
    opts.q
      ? or(
          sql`${orders.orderNo} LIKE ${term}`,
          sql`${users.email} LIKE ${term}`,
          sql`CONCAT(${users.firstName}, ' ', ${users.lastName}) LIKE ${term}`,
        )
      : undefined,
  ].filter(Boolean)
  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(filter)

  const rows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      userId: orders.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      subtotal: orders.subtotal,
      courseDiscount: orders.courseDiscount,
      orderDiscount: orders.orderDiscount,
      vatAmount: orders.vatAmount,
      total: orders.total,
      currency: orders.currency,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      provider: orders.provider,
      providerRef: orders.providerRef,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      itemCount: sql<number>`(
        SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = ${outer(orders.id)}
      )`,
      // The titles as they were sold, so the row reads without opening it.
      itemSummary: sql<string | null>`(
        SELECT GROUP_CONCAT(oi.title_snapshot SEPARATOR ', ')
        FROM order_items oi WHERE oi.order_id = ${outer(orders.id)}
      )`,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(filter)
    .orderBy(desc(orders.createdAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows.map((r) => ({ ...r, itemCount: Number(r.itemCount) })),
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
    },
  }
}
