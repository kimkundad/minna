import { and, eq, gt, inArray, ne } from 'drizzle-orm'
import { db } from '../../db/client'
import { cartItems, carts, courses } from '../../db/schema/index'
import { AppError, conflict, notFound } from '../../lib/errors'
import { alreadyOwned, quote, type Quote } from './commerce.service'

/**
 * The basket, kept on the server.
 *
 * Signed-in only. A guest basket would need a cookie, a merge on sign-in, and
 * a rule for what happens when the two disagree — and it buys nothing here,
 * because a guest who presses "buy" is sent to checkout and asked to sign in
 * there, with what they chose carried in the address.
 *
 * Prices are not stored on it. A basket is a list of what somebody wants; what
 * it costs is asked of `quote` every time it is shown, so a price change or an
 * expiring coupon is reflected the moment it happens rather than when the row
 * was written.
 */

/** Finds this account's basket, making one the first time. */
async function cartFor(userId: number): Promise<number> {
  const [found] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1)
  if (found) return found.id

  await db.insert(carts).values({ userId })
  const [made] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1)
  if (!made) throw new Error('cart row vanished right after insert')
  return made.id
}

export interface CartRow {
  courseId: number
  selected: boolean
  addedAt: Date
}

/**
 * What is in the basket, and what the ticked part of it costs.
 *
 * The quote covers only the selected rows, because that is what the buyer is
 * about to pay for — an unticked course stays in the basket and out of the
 * total.
 */
export async function getCart(userId: number): Promise<{
  items: CartRow[]
  quote: Quote | null
  problem: string | null
  alreadyOwned: number[]
}> {
  const cartId = await cartFor(userId)

  const rows = await db
    .select({
      courseId: cartItems.courseId,
      selected: cartItems.selected,
      addedAt: cartItems.addedAt,
    })
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId))
    .orderBy(cartItems.addedAt)

  const items = rows.flatMap((r) =>
    r.courseId === null ? [] : [{ courseId: r.courseId, selected: r.selected, addedAt: r.addedAt }],
  )

  const chosen = items.filter((i) => i.selected).map((i) => i.courseId)

  /**
   * A basket that cannot be priced still has to open.
   *
   * Adding a course now refuses a currency the basket does not already use,
   * but baskets filled before that rule existed may still mix two — and a
   * throw here took the whole cart page down, leaving somebody with no way to
   * reach the row they needed to remove. So the failure is reported as part of
   * the basket rather than instead of it.
   */
  let priced: Quote | null = null
  let problem: string | null = null
  if (chosen.length) {
    try {
      priced = await quote(chosen.map((id) => ({ kind: 'course' as const, id })))
    } catch (err) {
      problem = err instanceof AppError ? err.message : 'This basket cannot be priced.'
    }
  }

  return {
    items,
    quote: priced,
    /** Why there is no total, when there is none. Null when all is well. */
    problem,
    alreadyOwned: await alreadyOwned(userId, items.map((i) => i.courseId)),
  }
}

/**
 * Adds a course, or says it is already there.
 *
 * A course that is not for sale is refused here rather than at checkout: a
 * basket that accepts something and then refuses to sell it has wasted
 * somebody's time twice.
 */
export async function addToCart(userId: number, courseId: number): Promise<void> {
  const [course] = await db
    .select({
      id: courses.id,
      title: courses.title,
      status: courses.status,
      sellable: courses.sellable,
      price: courses.price,
      currency: courses.currency,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1)

  if (!course || course.status !== 'approved') throw notFound('That course does not exist.')
  if (!course.sellable && course.price > 0) throw conflict('That course is not on sale.')

  const cartId = await cartFor(userId)
  const [exists] = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.courseId, courseId)))
    .limit(1)
  if (exists) return

  /**
   * One basket, one currency — decided here, before anything is added.
   *
   * A Stripe session charges in a single currency, so a basket holding a $100
   * course and a ฿1,590 one cannot be paid for. The checkout refuses it, which
   * on its own was the wrong place: the course went into the basket, and then
   * every attempt to price the basket failed, so the whole cart page stopped
   * loading and the only way out was to guess what to remove.
   *
   * A free course has no currency worth defending, so it joins any basket.
   */
  if (course.price > 0) {
    const [other] = await db
      .select({ title: courses.title, currency: courses.currency })
      .from(cartItems)
      .innerJoin(courses, eq(courses.id, cartItems.courseId))
      .where(
        and(
          eq(cartItems.cartId, cartId),
          ne(courses.currency, course.currency),
          gt(courses.price, 0),
        ),
      )
      .limit(1)

    if (other) {
      throw conflict(
        `Your basket is priced in ${other.currency} and “${course.title}” is priced in ${course.currency}. ` +
          'A basket can only be paid for in one currency, so please buy them separately.',
      )
    }
  }

  await db.insert(cartItems).values({ cartId, courseId, selected: true })
}

export async function removeFromCart(userId: number, courseId: number): Promise<void> {
  const cartId = await cartFor(userId)
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.courseId, courseId)))
}

/** Ticks or unticks one row, or every row at once. */
export async function selectInCart(
  userId: number,
  selected: boolean,
  courseId?: number,
): Promise<void> {
  const cartId = await cartFor(userId)
  await db
    .update(cartItems)
    .set({ selected })
    .where(
      courseId
        ? and(eq(cartItems.cartId, cartId), eq(cartItems.courseId, courseId))
        : eq(cartItems.cartId, cartId),
    )
}

/**
 * Empties the basket of the courses just bought.
 *
 * Called after an order is placed rather than when it is paid: the buyer has
 * moved on from choosing, and a basket still holding what they are paying for
 * reads as though nothing happened. Anything they left unticked stays.
 */
export async function clearPurchased(userId: number, courseIds: number[]): Promise<void> {
  if (!courseIds.length) return
  const cartId = await cartFor(userId)
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.cartId, cartId), inArray(cartItems.courseId, courseIds)))
}
