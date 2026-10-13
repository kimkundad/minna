import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  categories,
  coupons,
  courses,
  invoices,
  orderItems,
  orders,
  packages,
} from '../../db/schema/index'

/**
 * One member's own order history.
 *
 * Everything about what was bought and what it cost comes off the order and its
 * items, never off the course as it stands today. A course may since have been
 * renamed, repriced, unpublished or deleted outright; none of that may change
 * what somebody's receipt says they paid. The course is joined only for the
 * things that are safe to be current — its link, its picture, its category —
 * and every one of those is optional.
 *
 * Failed and cancelled orders are included. The question people arrive with is
 * "was I charged?", and an order that quietly vanished answers it the wrong
 * way round.
 */

export interface MyOrderItem {
  id: number
  kind: 'course' | 'package'
  /** Null when the course or package has since been deleted. */
  courseId: number | null
  packageId: number | null
  slug: string | null
  /** The title as it was at purchase, which is what was bought. */
  title: string
  /** The title now, when it has changed since. Null otherwise. */
  titleNow: string | null
  thumbnailPath: string | null
  categoryId: number | null
  categoryName: string | null
  categoryIcon: string | null
  /** Before any discount. */
  unitPrice: number
  discount: number
  /** What this line actually cost. */
  net: number
  couponCode: string | null
  accessType: string
  accessDurationDays: number | null
}

export interface MyOrder {
  id: number
  orderNo: string
  status: string
  /** 'card' | 'promptpay' | 'free'; null on an order abandoned before paying. */
  method: string | null
  createdAt: string
  paidAt: string | null
  subtotal: number
  courseDiscount: number
  orderDiscount: number
  vatAmount: number
  total: number
  currency: string
  orderCouponCode: string | null
  items: MyOrderItem[]
  /** The tax invoice asked for with this order, if one was. */
  invoice: {
    type: string
    name: string
    documentNo: string | null
    issuedAt: string | null
    status: 'issued' | 'processing'
  } | null
}

export async function myOrders(userId: number, limit = 100): Promise<MyOrder[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit)
  if (!rows.length) return []

  const ids = rows.map((o) => o.id)

  // Four queries for the whole page rather than four per order.
  const items = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      courseId: orderItems.courseId,
      packageId: orderItems.packageId,
      title: orderItems.titleSnapshot,
      unitPrice: orderItems.unitPrice,
      discount: orderItems.discount,
      accessType: orderItems.accessType,
      accessDurationDays: orderItems.accessDurationDays,
      couponCode: coupons.code,

      slug: courses.slug,
      titleNow: courses.title,
      thumbnailPath: courses.thumbnailPath,
      categoryId: courses.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,

      packageSlug: packages.slug,
      packageTitleNow: packages.name,
    })
    .from(orderItems)
    .leftJoin(coupons, eq(coupons.id, orderItems.couponId))
    .leftJoin(courses, eq(courses.id, orderItems.courseId))
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .leftJoin(packages, eq(packages.id, orderItems.packageId))
    .where(inArray(orderItems.orderId, ids))
    .orderBy(orderItems.id)

  const orderCoupons = new Map<number, string>()
  const couponIds = rows.map((o) => o.orderCouponId).filter((v): v is number => v !== null)
  if (couponIds.length) {
    const found = await db
      .select({ id: coupons.id, code: coupons.code })
      .from(coupons)
      .where(inArray(coupons.id, couponIds))
    for (const c of found) orderCoupons.set(c.id, c.code)
  }

  const invoiceRows = await db.select().from(invoices).where(inArray(invoices.orderId, ids))
  const invoiceOf = new Map(invoiceRows.map((i) => [i.orderId, i]))

  const itemsOf = new Map<number, MyOrderItem[]>()
  for (const it of items) {
    const kind: 'course' | 'package' = it.packageId ? 'package' : 'course'
    const titleNow = kind === 'package' ? it.packageTitleNow : it.titleNow
    const list = itemsOf.get(it.orderId) ?? []
    list.push({
      id: it.id,
      kind,
      courseId: it.courseId,
      packageId: it.packageId,
      slug: kind === 'package' ? it.packageSlug : it.slug,
      title: it.title,
      titleNow: titleNow && titleNow !== it.title ? titleNow : null,
      thumbnailPath: it.thumbnailPath,
      categoryId: it.categoryId,
      categoryName: it.categoryName,
      categoryIcon: it.categoryIcon,
      unitPrice: it.unitPrice,
      discount: it.discount,
      net: Math.max(0, it.unitPrice - it.discount),
      couponCode: it.couponCode,
      accessType: it.accessType,
      accessDurationDays: it.accessDurationDays,
    })
    itemsOf.set(it.orderId, list)
  }

  return rows.map((o) => {
    const invoice = invoiceOf.get(o.id)
    return {
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      method: o.paymentMethod,
      createdAt: String(o.createdAt),
      paidAt: o.paidAt ? String(o.paidAt) : null,
      subtotal: o.subtotal,
      courseDiscount: o.courseDiscount,
      orderDiscount: o.orderDiscount,
      vatAmount: o.vatAmount,
      total: o.total,
      currency: o.currency,
      orderCouponCode: o.orderCouponId ? (orderCoupons.get(o.orderCouponId) ?? null) : null,
      items: itemsOf.get(o.id) ?? [],
      invoice: invoice
        ? {
            type: invoice.type,
            name: invoice.name,
            documentNo: invoice.documentNo,
            issuedAt: invoice.issuedAt ? String(invoice.issuedAt) : null,
            // A number is allocated when the order is paid, so one that has
            // none is still waiting on the payment, not on a clerk.
            status: invoice.documentNo ? 'issued' : 'processing',
          }
        : null,
    }
  })
}
