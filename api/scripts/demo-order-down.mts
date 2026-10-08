/**
 * Removes what scripts/demo-order.mjs made: the throwaway student, the order it
 * placed, the entitlement it granted and the 100% coupon it used.
 *
 *   npx tsx scripts/demo-order-down.mts
 *
 * Straight at the database, because there is no API route that deletes a paid
 * order and there should not be — an order is a record. This is a tool for
 * clearing up after a demo, not a feature.
 *
 * It only ever touches rows matching the two fixed identifiers below, so
 * running it on a database with real orders in it is safe.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  auditLogs,
  couponRedemptions,
  coupons,
  entitlements,
  orderItems,
  orders,
  refreshTokens,
  userRoles,
  users,
} from '../src/db/schema/index'

const CODE = 'DEMO-ORDER-100'
const STUDENT_EMAIL = 'demo.order@example.com'

const [student] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, STUDENT_EMAIL))
  .limit(1)

if (student) {
  const theirOrders = await db
    .select({ id: orders.id, orderNo: orders.orderNo })
    .from(orders)
    .where(eq(orders.userId, student.id))
  const orderIds = theirOrders.map((o) => o.id)

  if (orderIds.length) {
    // Redemptions and items first: both have a foreign key into orders, and
    // MySQL will refuse the parent delete rather than guess.
    await db.delete(couponRedemptions).where(inArray(couponRedemptions.orderId, orderIds))
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds))
    await db.delete(orders).where(inArray(orders.id, orderIds))
    console.log(`deleted ${orderIds.length} order(s): ${theirOrders.map((o) => o.orderNo).join(', ')}`)
  }

  await db.delete(entitlements).where(eq(entitlements.userId, student.id))
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, student.id))
  await db.delete(auditLogs).where(eq(auditLogs.actorId, student.id))
  await db.delete(userRoles).where(eq(userRoles.userId, student.id))
  await db.delete(users).where(eq(users.id, student.id))
  console.log(`deleted ${STUDENT_EMAIL}`)
} else {
  console.log(`${STUDENT_EMAIL} not found — nothing to remove`)
}

const [coupon] = await db
  .select({ id: coupons.id })
  .from(coupons)
  .where(eq(coupons.code, CODE))
  .limit(1)

if (coupon) {
  await db.delete(couponRedemptions).where(eq(couponRedemptions.couponId, coupon.id))
  await db.delete(coupons).where(eq(coupons.id, coupon.id))
  console.log(`deleted coupon ${CODE}`)
}

process.exit(0)
