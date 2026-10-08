import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  coupons,
  couponRedemptions,
  courses,
  entitlements,
  orderItems,
  orders,
  packageCourses,
  packages,
  users,
} from '../../db/schema/index'
import { conflict, notFound } from '../../lib/errors'
import { getVatRules, vatOf } from '../../lib/settings'
// By name rather than as a namespace: invoices.service imports nothing from
// here, so the one-way edge is visible at the import.
import { issueForOrder as issueInvoiceForOrder } from './invoices.service'
import { outer } from '../../lib/sql'

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
  discount: number
  couponId: number | null
  accessType: 'lifetime' | 'limited'
  accessDurationDays: number | null
}

export interface Quote {
  lines: PricedLine[]
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
        const coupon = await findCoupon(line.couponCode)
        // A course coupon has to be for this course, or for anything.
        if (coupon && (coupon.scope !== 'course' || coupon.courseId === course.id)) {
          discount = discountFor(course.price, coupon)
          couponId = coupon.id
        }
      }

      priced.push({
        kind: 'course',
        id: course.id,
        title: course.title,
        unitPrice: course.price,
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
        discount: 0,
        couponId: null,
        accessType: 'limited',
        accessDurationDays: pack.durationDays,
      })
    }
  }

  const subtotal = priced.reduce((sum, l) => sum + l.unitPrice, 0)
  const courseDiscount = priced.reduce((sum, l) => sum + l.discount, 0)

  // An order-wide coupon applies to what is left after the per-line ones, so
  // the two stack rather than one quietly replacing the other.
  let orderDiscount = 0
  let orderCouponId: number | null = null
  if (orderCouponCode) {
    const coupon = await findCoupon(orderCouponCode)
    if (coupon && coupon.scope !== 'course') {
      const after = subtotal - courseDiscount
      if (!coupon.minSubtotal || after >= coupon.minSubtotal) {
        orderDiscount = discountFor(after, coupon)
        // Only when it actually took something off: a coupon that was typed and
        // came to nothing has not been used.
        if (orderDiscount > 0) orderCouponId = coupon.id
      }
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
    subtotal,
    courseDiscount,
    orderDiscount,
    orderCouponId,
    vatAmount,
    vatInclusive: rules.inclusive,
    total,
    currency: 'THB',
  }
}

/** ORD-20261008-4F2A — the date so support can find it, random so it cannot
 *  be guessed and counted. */
function newOrderNo(): string {
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ORD-${date}-${rand}`
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
  return true
}

/**
 * Access, from the items of a paid order.
 *
 * A package grants one entitlement per course inside it, rather than one for
 * the package: access is asked about per course on every lesson page, and a
 * join through the package on every one of those is a cost paid forever to
 * save rows once.
 */
async function grantAccess(userId: number, items: { id: number; courseId: number | null; packageId: number | null; accessType: string; accessDurationDays: number | null }[]) {
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
          source: item.packageId ? 'package' : 'purchase',
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

  return {
    ...order,
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
