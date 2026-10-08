/**
 * Removes what smoke-invoices.mjs made.
 *
 * Straight at the database, because nothing over HTTP deletes a paid order and
 * nothing should. Only touches accounts whose email starts `smoke.invoice`, so
 * it is safe to run against a database with real orders in it.
 */
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  auditLogs,
  coupons,
  couponRedemptions,
  entitlements,
  invoices,
  orderItems,
  orders,
  refreshTokens,
  userRoles,
  users,
} from '../src/db/schema/index'

const victims = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .where(like(users.email, 'smoke.invoice%'))

const ids = victims.map((v) => v.id)

// An empty list would make inArray match nothing, which is what is wanted —
// but MySQL refuses an empty IN (), so the query is skipped instead.
const theirOrders = ids.length
  ? await db.select({ id: orders.id }).from(orders).where(inArray(orders.userId, ids))
  : []
const orderIds = theirOrders.map((o) => o.id)

if (orderIds.length) {
  await db.delete(invoices).where(inArray(invoices.orderId, orderIds))
  await db.delete(couponRedemptions).where(inArray(couponRedemptions.orderId, orderIds))
  await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds))
  await db.delete(orders).where(inArray(orders.id, orderIds))
}

for (const id of ids) {
  await db.delete(entitlements).where(eq(entitlements.userId, id))
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, id))
  await db.delete(auditLogs).where(eq(auditLogs.actorId, id))
  await db.delete(userRoles).where(eq(userRoles.userId, id))
}
if (ids.length) await db.delete(users).where(inArray(users.id, ids))

// The coupon too. By now it has been spent, so the API refuses to delete it —
// correctly, because over there that would take a real redemption record with
// it. Here there is no record left to protect.
await db.delete(coupons).where(eq(coupons.code, 'SMOKE-INV-100'))

console.log(`  cleared ${victims.length} account(s), ${orderIds.length} order(s) and the coupon`)
process.exit(0)
