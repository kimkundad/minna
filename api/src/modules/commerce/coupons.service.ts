import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { couponRedemptions, coupons, courses, orders, users } from '../../db/schema/index'
import { conflict, notFound } from '../../lib/errors'
import { outer } from '../../lib/sql'

/**
 * Coupons, from the admin's side.
 *
 * The pricing half of this already lives in `commerce.service.ts`: it finds a
 * coupon, decides whether it is live, and works out what comes off. This file
 * only writes them, and deliberately knows nothing about carts — a coupon that
 * is wrong is wrong before anyone tries to spend it.
 *
 * Amounts are satang. A percent coupon stores whole points (10 = 10%).
 */

export interface CouponInput {
  code: string
  scope: 'course' | 'order'
  courseId: number | null
  discountType: 'percent' | 'fixed'
  value: number
  maxDiscount: number | null
  minSubtotal: number | null
  startsAt: Date | null
  expiresAt: Date | null
  usageLimit: number | null
  active: boolean
}

/**
 * Codes are stored upper-case because that is how they are matched at
 * checkout — a customer typing `summer26` has to find `SUMMER26`.
 */
function normalise(code: string): string {
  return code.trim().toUpperCase()
}

/**
 * What the admin table calls the coupon's state.
 *
 * `active` is a switch an admin sets; this is the answer to "would it work if
 * someone typed it right now", which is the thing they actually want to see.
 * The order matters: a coupon can be switched off *and* expired, and off is
 * the more useful of the two to show.
 */
function statusSql() {
  return sql<string>`CASE
    WHEN ${coupons.active} = 0 THEN 'off'
    WHEN ${coupons.expiresAt} IS NOT NULL AND ${coupons.expiresAt} < NOW() THEN 'expired'
    WHEN ${coupons.startsAt} IS NOT NULL AND ${coupons.startsAt} > NOW() THEN 'scheduled'
    WHEN ${coupons.usageLimit} IS NOT NULL AND ${coupons.usedCount} >= ${coupons.usageLimit} THEN 'used_up'
    ELSE 'live'
  END`
}

export async function list(opts: {
  page: number
  perPage: number
  scope?: 'course' | 'order' | undefined
  status?: 'live' | 'scheduled' | 'expired' | 'used_up' | 'off' | undefined
  q?: string | undefined
}) {
  const where = [
    opts.scope ? eq(coupons.scope, opts.scope) : undefined,
    opts.q ? sql`${coupons.code} LIKE ${`%${normalise(opts.q)}%`}` : undefined,
    opts.status ? sql`${statusSql()} = ${opts.status}` : undefined,
  ].filter(Boolean)
  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(coupons)
    .where(filter)

  const rows = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      scope: coupons.scope,
      courseId: coupons.courseId,
      courseTitle: courses.title,
      discountType: coupons.discountType,
      value: coupons.value,
      maxDiscount: coupons.maxDiscount,
      minSubtotal: coupons.minSubtotal,
      startsAt: coupons.startsAt,
      expiresAt: coupons.expiresAt,
      usageLimit: coupons.usageLimit,
      usedCount: coupons.usedCount,
      active: coupons.active,
      createdAt: coupons.createdAt,
      status: statusSql(),
      // What it has actually given away: the figure worth watching on a coupon
      // that turned out more popular than planned.
      discountGiven: sql<number>`(
        SELECT COALESCE(SUM(r.discount_amount), 0) FROM coupon_redemptions r
        WHERE r.coupon_id = ${outer(coupons.id)}
      )`,
    })
    .from(coupons)
    .leftJoin(courses, eq(courses.id, coupons.courseId))
    .where(filter)
    .orderBy(desc(coupons.createdAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows.map((r) => ({ ...r, discountGiven: Number(r.discountGiven) })),
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
    },
  }
}

export async function get(id: number) {
  const [row] = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      scope: coupons.scope,
      courseId: coupons.courseId,
      courseTitle: courses.title,
      discountType: coupons.discountType,
      value: coupons.value,
      maxDiscount: coupons.maxDiscount,
      minSubtotal: coupons.minSubtotal,
      startsAt: coupons.startsAt,
      expiresAt: coupons.expiresAt,
      usageLimit: coupons.usageLimit,
      usedCount: coupons.usedCount,
      active: coupons.active,
      createdAt: coupons.createdAt,
      status: statusSql(),
    })
    .from(coupons)
    .leftJoin(courses, eq(courses.id, coupons.courseId))
    .where(eq(coupons.id, id))
    .limit(1)
  if (!row) throw notFound('That coupon does not exist.')
  return row
}

/** Who spent it, and on what. The question asked when a code leaks. */
export async function redemptions(couponId: number, opts: { page: number; perPage: number }) {
  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, couponId))

  const rows = await db
    .select({
      id: couponRedemptions.id,
      orderId: couponRedemptions.orderId,
      orderNo: orders.orderNo,
      orderStatus: orders.status,
      userId: couponRedemptions.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      discountAmount: couponRedemptions.discountAmount,
      redeemedAt: couponRedemptions.redeemedAt,
    })
    .from(couponRedemptions)
    .innerJoin(users, eq(users.id, couponRedemptions.userId))
    .innerJoin(orders, eq(orders.id, couponRedemptions.orderId))
    .where(eq(couponRedemptions.couponId, couponId))
    .orderBy(desc(couponRedemptions.redeemedAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows,
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
    },
  }
}

/**
 * The checks that are not a matter of shape, so Zod cannot make them.
 *
 * A course coupon with no course would silently discount nothing; an order
 * coupon carrying a course id would read as limited to that course when it is
 * not. Both are the kind of mistake only noticed when a customer complains, so
 * they are refused here.
 */
async function validate(input: CouponInput) {
  if (input.scope === 'course') {
    if (!input.courseId) {
      throw conflict('A course coupon has to name the course it discounts.')
    }
    const [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, input.courseId))
      .limit(1)
    if (!course) throw conflict('That course does not exist.')
    if (input.minSubtotal) {
      throw conflict('A minimum basket only applies to an order coupon.')
    }
  }

  if (input.scope === 'order' && input.courseId) {
    throw conflict('An order coupon applies to the whole basket, not one course.')
  }

  if (input.discountType === 'percent') {
    if (input.value < 1 || input.value > 100) {
      throw conflict('A percent discount has to be between 1 and 100.')
    }
  } else if (input.maxDiscount) {
    // A ceiling on a fixed amount is either the amount itself or a smaller
    // number that quietly overrides it. Neither is what anyone meant.
    throw conflict('A ceiling only applies to a percent discount.')
  }

  if (input.startsAt && input.expiresAt && input.startsAt >= input.expiresAt) {
    throw conflict('The coupon would expire before it started.')
  }
}

export async function create(input: CouponInput) {
  await validate(input)
  const code = normalise(input.code)

  const [clash] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.code, code))
    .limit(1)
  if (clash) throw conflict('That code is already in use.')

  const [res] = await db.insert(coupons).values({
    code,
    scope: input.scope,
    courseId: input.courseId,
    discountType: input.discountType,
    value: input.value,
    maxDiscount: input.maxDiscount,
    minSubtotal: input.minSubtotal,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    usageLimit: input.usageLimit,
    active: input.active,
  })
  return get(Number(res.insertId))
}

export async function update(id: number, input: CouponInput) {
  const before = await get(id)
  await validate(input)
  const code = normalise(input.code)

  if (code !== before.code) {
    const [clash] = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(eq(coupons.code, code))
      .limit(1)
    if (clash) throw conflict('That code is already in use.')
  }

  // A limit below what has already been spent would make the coupon read as
  // over its limit while the redemptions it is counting are real.
  if (input.usageLimit !== null && input.usageLimit < before.usedCount) {
    throw conflict(`This coupon has already been used ${before.usedCount} times.`)
  }

  await db
    .update(coupons)
    .set({
      code,
      scope: input.scope,
      courseId: input.courseId,
      discountType: input.discountType,
      value: input.value,
      maxDiscount: input.maxDiscount,
      minSubtotal: input.minSubtotal,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      usageLimit: input.usageLimit,
      active: input.active,
    })
    .where(eq(coupons.id, id))

  return { before, after: await get(id) }
}

/**
 * Deleting is only allowed while nobody has spent it.
 *
 * Once a coupon has been redeemed it is part of what an order charged, and the
 * cascade on `coupon_redemptions` would take those records with it. Switching
 * it off stops it working and keeps the history, which is what is wanted
 * anyway.
 */
export async function remove(id: number) {
  const coupon = await get(id)
  if (coupon.usedCount > 0) {
    throw conflict(
      'This coupon has been used, so it cannot be deleted. Switch it off instead — it stops working and the orders that used it keep their record.',
    )
  }
  await db.delete(coupons).where(eq(coupons.id, id))
  return coupon
}
