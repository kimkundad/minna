import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  EARNING_STATUSES,
  courseInstructors,
  courses,
  orderItems,
  orders,
  roles,
  teacherEarnings,
  teacherPayoutDetails,
  userRoles,
  users,
} from '../../db/schema/index'
import { getDefaultRevenueSharePct, getVatRules, vatOf } from '../../lib/settings'
import { instant } from '../../lib/sql'
import { monthStart } from '../../lib/time'

/**
 * What a sale owes the teacher who taught it.
 *
 * The rules, as agreed:
 *
 *   • the share is taken from what was actually received for that line, after
 *     every discount — not from the ticket price;
 *   • a basket-wide coupon is shared out across the lines in proportion to
 *     what each is worth, so a discount the school offers is carried by both
 *     sides rather than by one;
 *   • VAT is taken off first. It is collected for the Revenue Department, not
 *     earned, and sharing it would mean paying somebody out of money that has
 *     to be handed over;
 *   • the payment processor's fee is the school's to absorb;
 *   • nothing is payable until the refund window has closed;
 *   • a refund is not an edit. It writes a second, negative row.
 */

/** Matches the seven days the published refund policy gives a buyer. */
const REFUND_WINDOW_DAYS = 7

export interface EarningLine {
  userId: number
  orderItemId: number
  courseId: number
  gross: number
  vat: number
  base: number
  sharePct: number
  amount: number
}

/**
 * Shares one amount out across weights without losing a satang.
 *
 * Proportions rarely divide into whole satang, and rounding each part on its
 * own leaves the parts summing to something other than the whole — a discount
 * of ฿300 split three ways becomes ฿299.99 or ฿300.01, and the difference
 * turns up later as a teacher paid a satang too much, forever.
 *
 * So: floor every part, then hand the leftover out one satang at a time to
 * whoever was rounded down hardest. The parts then always add up exactly.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (total === 0 || sum <= 0) return weights.map(() => 0)

  const exact = weights.map((w) => (total * w) / sum)
  const parts = exact.map((n) => Math.floor(n))
  let left = total - parts.reduce((a, b) => a + b, 0)

  const order = exact
    .map((n, i) => ({ i, remainder: n - Math.floor(n) }))
    .sort((a, b) => b.remainder - a.remainder)

  for (let k = 0; left > 0 && k < order.length; k++, left--) {
    parts[order[k]!.i] = (parts[order[k]!.i] ?? 0) + 1
  }
  return parts
}

/**
 * What one paid order owes, line by line.
 *
 * Exported on its own so the figures can be checked without writing anything —
 * the admin's order screen can show the split, and a test can assert the
 * arithmetic without a database full of side effects.
 */
export async function linesFor(orderId: number): Promise<EarningLine[]> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) return []

  const items = await db
    .select({
      id: orderItems.id,
      courseId: orderItems.courseId,
      unitPrice: orderItems.unitPrice,
      discount: orderItems.discount,
    })
    .from(orderItems)
    .leftJoin(courses, eq(courses.id, orderItems.courseId))
    .where(eq(orderItems.orderId, orderId))

  // A line whose course has been deleted has nobody to pay. A package line is
  // not a course sale and is out of scope until packages are.
  const payable = items.filter((i) => i.courseId !== null)
  if (!payable.length) return []

  /**
   * What each line is worth before the basket-wide coupon: the price charged
   * for it, less any coupon that named that course specifically.
   */
  const lineNets = payable.map((i) => Math.max(0, i.unitPrice - i.discount))

  // The basket coupon belongs to no single line, so it is carried by all of
  // them in proportion to what they are worth.
  const orderDiscounts = allocate(order.orderDiscount, lineNets)

  const rules = await getVatRules()

  /**
   * The ledger is kept in baht, and this order may not be.
   *
   * `order_items` carries what was charged, in the currency the order was
   * charged in, so a €49 course arrives here as 4900 — which, written into a
   * satang column, would read as ฿49 and pay the teacher a quarter of that.
   *
   * Converted at the rate stored on the order rather than today's. That rate
   * is what the sale was recorded at, so the teacher's share and the school's
   * revenue are two slices of the same number; recomputing at today's rate
   * would make last quarter's payouts move every time somebody re-ran this.
   */
  const rate = order.currency === 'THB' ? 1 : Number(order.fxRate ?? 0)
  if (!rate) {
    throw new Error(
      `Order ${order.orderNo} is in ${order.currency} but has no exchange rate recorded, so what it earned cannot be worked out.`,
    )
  }
  const inBaht = (amount: number) => (rate === 1 ? amount : Math.round(amount / rate))

  const instructors = await db
    .select({ courseId: courseInstructors.courseId, userId: courseInstructors.userId })
    .from(courseInstructors)
    .where(inArray(courseInstructors.courseId, payable.map((i) => i.courseId!)))
  const teacherOf = new Map(instructors.map((r) => [r.courseId, r.userId]))

  /**
   * The share belongs to the teacher, not to the course.
   *
   * It used to be read off each course row, which made a person's rate into a
   * list of rates that had to be kept in step by hand. Agreed once with the
   * person, it is read once here, and a teacher with nothing agreed is on the
   * school-wide figure from the settings page.
   */
  const teacherIds = [...new Set([...teacherOf.values()])]
  const agreed = teacherIds.length
    ? await db
        .select({
          userId: teacherPayoutDetails.userId,
          pct: teacherPayoutDetails.revenueSharePct,
        })
        .from(teacherPayoutDetails)
        .where(inArray(teacherPayoutDetails.userId, teacherIds))
    : []
  const shareOf = new Map(agreed.filter((r) => r.pct !== null).map((r) => [r.userId, r.pct!]))
  const houseShare = await getDefaultRevenueSharePct()

  const out: EarningLine[] = []
  payable.forEach((item, idx) => {
    const userId = teacherOf.get(item.courseId!)
    // A course with no instructor owes nobody. The admin's dashboard already
    // counts these as something to fix.
    if (!userId) return

    // In baht from here down: the figures above are in whatever the order was
    // charged in, and every column this writes to is satang.
    const gross = inBaht(Math.max(0, (lineNets[idx] ?? 0) - (orderDiscounts[idx] ?? 0)))
    // Worked out per line rather than shared out from the order's VAT total,
    // so each row stands up on its own when somebody checks one.
    const vat = vatOf(gross, rules)
    const base = rules.inclusive ? gross - vat : gross
    // Theirs if one was agreed, the school's otherwise. Copied onto the row
    // below, which is what stops last quarter moving when a rate is changed.
    const sharePct = shareOf.get(userId) ?? houseShare

    out.push({
      userId,
      orderItemId: item.id,
      courseId: item.courseId!,
      gross,
      vat,
      base,
      sharePct,
      amount: Math.round((base * sharePct) / 100),
    })
  })
  return out
}

/**
 * Writes what a newly paid order owes.
 *
 * Idempotent, and it has to be: Stripe sends a webhook at least once and
 * sometimes more, and the success page asks as well. The unique key on the
 * line does the refusing; this only has to not fall over when it fires.
 */
export async function recordForOrder(orderId: number): Promise<number> {
  const lines = await linesFor(orderId)
  if (!lines.length) return 0

  const [existing] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(teacherEarnings)
    .where(and(eq(teacherEarnings.orderId, orderId), eq(teacherEarnings.kind, 'royalty')))
  if (Number(existing?.n ?? 0) > 0) return 0

  await db.insert(teacherEarnings).values(
    lines.map((l) => ({
      ...l,
      orderId,
      kind: 'royalty' as const,
      status: 'pending' as const,
      maturesAt: sql`DATE_ADD(NOW(), INTERVAL ${REFUND_WINDOW_DAYS} DAY)` as never,
    })),
  )
  return lines.length
}

/**
 * Reverses what an order owed, because the money went back.
 *
 * A royalty already paid out is not clawed back from the teacher directly —
 * the negative row simply lands in the next payout, which is what was agreed.
 * One that has not been paid yet is cancelled outright, so it never reaches a
 * payout at all.
 */
export async function reverseForOrder(orderId: number, note = 'refunded'): Promise<number> {
  const rows = await db
    .select()
    .from(teacherEarnings)
    .where(and(eq(teacherEarnings.orderId, orderId), eq(teacherEarnings.kind, 'royalty')))
  if (!rows.length) return 0

  const unpaid = rows.filter((r) => r.status !== 'paid')
  if (unpaid.length) {
    await db
      .update(teacherEarnings)
      .set({ status: 'cancelled', note })
      .where(inArray(teacherEarnings.id, unpaid.map((r) => r.id)))
  }

  const paid = rows.filter((r) => r.status === 'paid')
  if (paid.length) {
    await db.insert(teacherEarnings).values(
      paid.map((r) => ({
        userId: r.userId,
        orderId: r.orderId,
        orderItemId: r.orderItemId,
        courseId: r.courseId,
        kind: 'refund' as const,
        gross: -r.gross,
        vat: -r.vat,
        base: -r.base,
        sharePct: r.sharePct,
        amount: -r.amount,
        status: 'payable' as const,
        // Nothing to wait for: the money has already gone back to the buyer.
        maturesAt: sql`NOW()` as never,
        reversesId: r.id,
        note,
      })),
    )
  }
  return rows.length
}

/**
 * Moves everything past its refund window from pending to payable.
 *
 * Returns how many moved, so whatever runs it can say so rather than claiming
 * to have done something.
 */
export async function matureDue(): Promise<number> {
  const due = await db
    .select({ id: teacherEarnings.id })
    .from(teacherEarnings)
    .where(
      and(
        eq(teacherEarnings.status, 'pending'),
        sql`${teacherEarnings.maturesAt} <= NOW()`,
      ),
    )
  if (!due.length) return 0
  await db
    .update(teacherEarnings)
    .set({ status: 'payable' })
    .where(inArray(teacherEarnings.id, due.map((r) => r.id)))
  return due.length
}

/* ---------------- reading it back ---------------- */

/**
 * One figure, said twice.
 *
 * The ledger is kept in baht — a share has to be one number however many
 * currencies the school sells in — but a teacher whose course is priced in
 * yen recognises the yen, not the baht it became at a rate from three weeks
 * ago. So both are carried: the currencies the money was actually taken in,
 * and the baht the ledger adds up.
 *
 * `parts` leaves out anything that comes to nothing. A teacher who has never
 * sold a yen course should not read "¥0" on their own earnings.
 */
export interface MoneyTotal {
  /** Satang. What the ledger holds and what a payout is made in. */
  baht: number
  /** The same money, in what it was charged in. Largest first. */
  parts: { currency: string; amount: number }[]
}

export interface EarningsSummary {
  /** Earned this calendar month, whatever its status. */
  thisMonth: MoneyTotal
  /** Settled and waiting for a transfer. */
  payable: MoneyTotal
  /** Transfers that have gone out, over all time. */
  paidAllTime: MoneyTotal
  /** Everything ever earned bar what was cancelled: pending, payable and paid
   *  together, which is the number a teacher means by "how much have I made". */
  lifetime: MoneyTotal
  sharePctRange: { min: number; max: number } | null
}

/**
 * What a baht figure was before it was converted.
 *
 * The inverse of the `inBaht` the ledger was written with, read back off the
 * rate the sale was recorded at. That round trip can land a unit either side
 * of what the card was actually charged — ฿100 at 4.72585100 is ¥472.585,
 * and nothing can get the lost fraction back — so this is a figure to show a
 * teacher, never one to pay them. Every payout is made from `baht`.
 */
function inOriginal(baht: number, currency: string, fxRate: string | null): number {
  const rate = currency === 'THB' ? 1 : Number(fxRate ?? 0)
  if (!rate) return baht
  return Math.round(baht * rate)
}

export async function summaryFor(userId: number): Promise<EarningsSummary> {
  /**
   * One row per currency, so the same money can be said both ways.
   *
   * Grouped by what the order was charged in rather than summed flat: a
   * teacher with a yen course and a baht one is owed two amounts, and adding
   * them into one number would be adding yen to baht.
   */
  const byCurrency = await db
    .select({
      currency: orders.currency,
      fxRate: orders.fxRate,
      payable: sql<number>`COALESCE(SUM(CASE WHEN ${teacherEarnings.status} = 'payable' THEN ${teacherEarnings.amount} ELSE 0 END), 0)`,
      paidAllTime: sql<number>`COALESCE(SUM(CASE WHEN ${teacherEarnings.status} = 'paid' THEN ${teacherEarnings.amount} ELSE 0 END), 0)`,
      thisMonth: sql<number>`COALESCE(SUM(CASE WHEN ${teacherEarnings.createdAt} >= ${monthStart()} AND ${teacherEarnings.status} <> 'cancelled' THEN ${teacherEarnings.amount} ELSE 0 END), 0)`,
      lifetime: sql<number>`COALESCE(SUM(CASE WHEN ${teacherEarnings.status} <> 'cancelled' THEN ${teacherEarnings.amount} ELSE 0 END), 0)`,
    })
    .from(teacherEarnings)
    .innerJoin(orders, eq(orders.id, teacherEarnings.orderId))
    .where(eq(teacherEarnings.userId, userId))
    .groupBy(orders.currency, orders.fxRate)

  /**
   * One card's worth.
   *
   * A currency is left out when it comes to nothing, because "¥0" beside a
   * real number reads as a currency this teacher deals in and happens to be
   * owed nothing in, which is a different thing from never having sold one.
   * Several rows can share a currency — a rate is stored per order — so they
   * are added together before anything is shown.
   */
  const total = (pick: (r: (typeof byCurrency)[number]) => number): MoneyTotal => {
    const parts = new Map<string, number>()
    let baht = 0
    for (const row of byCurrency) {
      const value = Number(pick(row))
      if (!value) continue
      baht += value
      const inTheirs = inOriginal(value, row.currency, row.fxRate)
      parts.set(row.currency, (parts.get(row.currency) ?? 0) + inTheirs)
    }
    return {
      baht,
      parts: [...parts]
        .filter(([, amount]) => amount !== 0)
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    }
  }

  const rates = await db
    .select({
      min: sql<number>`MIN(${courses.revenueSharePct})`,
      max: sql<number>`MAX(${courses.revenueSharePct})`,
    })
    .from(courseInstructors)
    .innerJoin(courses, eq(courses.id, courseInstructors.courseId))
    .where(eq(courseInstructors.userId, userId))

  const min = rates[0]?.min == null ? null : Number(rates[0].min)
  const max = rates[0]?.max == null ? null : Number(rates[0].max)

  return {
    thisMonth: total((r) => r.thisMonth),
    payable: total((r) => r.payable),
    paidAllTime: total((r) => r.paidAllTime),
    lifetime: total((r) => r.lifetime),
    sharePctRange: min === null || max === null ? null : { min, max },
  }
}

export interface EarningRow {
  id: number
  kind: string
  status: string
  courseId: number | null
  courseTitle: string | null
  orderNo: string
  /** Satang. The ledger's figures, and what a payout is made from. */
  gross: number
  vat: number
  base: number
  sharePct: number
  amount: number
  /**
   * What the buyer was actually charged in, and the same three figures in it.
   *
   * A teacher whose course is priced in yen recognises the yen; the baht
   * beside it is a conversion at a rate from the day of the sale. Worked back
   * from that stored rate, so it can land a unit either side of the charge —
   * it is a figure to read, never one to pay from.
   *
   * `currency` is 'THB' and the two agree on most rows, which is why they are
   * separate fields rather than one: the screen shows both lines either way.
   */
  currency: string
  grossOriginal: number
  baseOriginal: number
  amountOriginal: number
  maturesAt: string | null
  paidAt: string | null
  createdAt: string
  note: string | null
}

export interface EarningsRange {
  /** Inclusive, as a date. Anything earned on this day counts. */
  from?: Date | undefined
  /** Inclusive too — the caller passes the day, and the whole of it is in. */
  to?: Date | undefined
  limit?: number | undefined
}

/**
 * The ledger itself, newest first.
 *
 * Cancelled rows are kept: a line that was refunded before it ever matured is
 * still something that happened.
 *
 * A date range narrows it by when the money came in, not by when it was paid
 * out — that is the question somebody closing off a month is asking, and a
 * row earned in March and settled in April belongs to March either way.
 */
export async function listFor(
  userId: number,
  opts: EarningsRange = {},
): Promise<EarningRow[]> {
  const limit = opts.limit ?? 100
  /**
   * The end of the chosen day, not the start of it.
   *
   * `to` arrives as a date with no time, so comparing against it directly
   * would drop everything earned on the last day of the range — the one
   * mistake a "from … to" box makes that nobody notices until a month's
   * figures are short.
   */
  const until = opts.to ? new Date(opts.to.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined

  const where = and(
    eq(teacherEarnings.userId, userId),
    opts.from ? gte(teacherEarnings.createdAt, opts.from) : undefined,
    until ? lte(teacherEarnings.createdAt, until) : undefined,
  )

  const rows = await db
    .select({
      id: teacherEarnings.id,
      kind: teacherEarnings.kind,
      status: teacherEarnings.status,
      courseId: teacherEarnings.courseId,
      courseTitle: courses.title,
      orderNo: orders.orderNo,
      currency: orders.currency,
      fxRate: orders.fxRate,
      gross: teacherEarnings.gross,
      vat: teacherEarnings.vat,
      base: teacherEarnings.base,
      sharePct: teacherEarnings.sharePct,
      amount: teacherEarnings.amount,
      maturesAt: teacherEarnings.maturesAt,
      paidAt: teacherEarnings.paidAt,
      createdAt: teacherEarnings.createdAt,
      note: teacherEarnings.note,
    })
    .from(teacherEarnings)
    .leftJoin(courses, eq(courses.id, teacherEarnings.courseId))
    .innerJoin(orders, eq(orders.id, teacherEarnings.orderId))
    .where(where)
    .orderBy(desc(teacherEarnings.id))
    .limit(limit)

  return rows.map(({ fxRate, ...r }) => ({
    ...r,
    grossOriginal: inOriginal(r.gross, r.currency, fxRate),
    baseOriginal: inOriginal(r.base, r.currency, fxRate),
    amountOriginal: inOriginal(r.amount, r.currency, fxRate),
    maturesAt: instant(r.maturesAt),
    paidAt: instant(r.paidAt),
    createdAt: instant(r.createdAt) ?? '',
  }))
}

/* ---------------- the admin's side ---------------- */

export interface PayoutRow {
  userId: number
  name: string
  email: string
  payable: number
  pending: number
  lines: number
}

/** Who is owed what right now, for the payout run. */
export async function payoutDue(): Promise<PayoutRow[]> {
  const rows = await db
    .select({
      userId: teacherEarnings.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      payable: sql<number>`COALESCE(SUM(CASE WHEN ${teacherEarnings.status} = 'payable' THEN ${teacherEarnings.amount} ELSE 0 END), 0)`,
      pending: sql<number>`COALESCE(SUM(CASE WHEN ${teacherEarnings.status} = 'pending' THEN ${teacherEarnings.amount} ELSE 0 END), 0)`,
      lines: sql<number>`SUM(CASE WHEN ${teacherEarnings.status} = 'payable' THEN 1 ELSE 0 END)`,
    })
    .from(teacherEarnings)
    .innerJoin(users, eq(users.id, teacherEarnings.userId))
    .where(inArray(teacherEarnings.status, ['pending', 'payable']))
    .groupBy(teacherEarnings.userId, users.firstName, users.lastName, users.email)

  const owed = new Map(rows.map((r) => [r.userId, r]))

  /**
   * Every teacher, not only the ones with money waiting.
   *
   * This list used to be built from the earnings table alone, so a teacher
   * appeared on it the day their first course sold and not before. That made
   * it the wrong place to keep the bank details: somebody who joined, filled
   * the form in and had not sold anything yet was invisible here, and an
   * administrator wanting to check their document before the first payout had
   * nowhere to look.
   *
   * Sorted by what is due, so the people this screen exists for stay at the
   * top and the rest sit quietly underneath.
   */
  const everyTeacher = await db
    .select({
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.name, 'teacher'))

  return everyTeacher
    .map((t) => {
      const r = owed.get(t.userId)
      return {
        userId: t.userId,
        name: `${t.firstName} ${t.lastName}`.trim(),
        email: t.email,
        payable: Number(r?.payable ?? 0),
        pending: Number(r?.pending ?? 0),
        lines: Number(r?.lines ?? 0),
      }
    })
    .sort((a, b) => b.payable - a.payable || b.pending - a.pending || a.name.localeCompare(b.name))
}

/**
 * Marks one teacher's payable rows as paid.
 *
 * Takes the total the caller believes it is settling and refuses if the
 * ledger disagrees — between opening the payout screen and pressing the
 * button, a refund may have landed, and paying out a figure somebody read a
 * minute ago is how a teacher ends up owed money nobody can account for.
 */
export async function markPaid(
  userId: number,
  expectedAmount: number,
  payoutRef: string,
): Promise<{ lines: number; amount: number }> {
  const rows = await db
    .select({ id: teacherEarnings.id, amount: teacherEarnings.amount })
    .from(teacherEarnings)
    .where(
      and(
        eq(teacherEarnings.userId, userId),
        eq(teacherEarnings.status, 'payable'),
        isNull(teacherEarnings.paidAt),
      ),
    )
  const amount = rows.reduce((sum, r) => sum + r.amount, 0)
  if (amount !== expectedAmount) {
    throw Object.assign(new Error('The amount owed has changed since you opened this.'), {
      statusCode: 409,
      actual: amount,
    })
  }
  if (!rows.length) return { lines: 0, amount: 0 }

  await db
    .update(teacherEarnings)
    .set({ status: 'paid', paidAt: new Date(), payoutRef })
    .where(inArray(teacherEarnings.id, rows.map((r) => r.id)))

  return { lines: rows.length, amount }
}

/**
 * Sets the status on rows an administrator picked out by hand.
 *
 * The payout run above settles everything a teacher is owed in one movement,
 * which is the usual way round. This is the other one: the rows somebody
 * ticked, because a transfer went out for some of them and not the rest, or
 * because a line has to be put back.
 *
 * `paidAt` follows the status rather than being set separately. A row that is
 * paid has a date and a row that is not has none; letting those two disagree
 * would leave the ledger saying a line was settled on a day it was not.
 *
 * It reports what it found as well as what it changed: ids that are not
 * there, or already say this, are not an error — two administrators ticking
 * the same rows is an ordinary thing — but a caller that asked about twelve
 * rows and changed nine should be able to say so.
 */
export async function setStatus(
  ids: number[],
  status: (typeof EARNING_STATUSES)[number],
  payoutRef?: string,
): Promise<{ asked: number; found: number; changed: number; amount: number }> {
  if (!ids.length) return { asked: 0, found: 0, changed: 0, amount: 0 }

  const rows = await db
    .select({
      id: teacherEarnings.id,
      amount: teacherEarnings.amount,
      status: teacherEarnings.status,
    })
    .from(teacherEarnings)
    .where(inArray(teacherEarnings.id, ids))

  const moving = rows.filter((r) => r.status !== status)
  if (!moving.length) {
    return { asked: ids.length, found: rows.length, changed: 0, amount: 0 }
  }

  await db
    .update(teacherEarnings)
    .set({
      status,
      paidAt: status === 'paid' ? new Date() : null,
      // Only a real payout carries a reference. Moving a row back to payable
      // must not leave it pointing at the run that no longer settled it.
      payoutRef: status === 'paid' ? (payoutRef ?? null) : null,
    })
    .where(inArray(teacherEarnings.id, moving.map((r) => r.id)))

  return {
    asked: ids.length,
    found: rows.length,
    changed: moving.length,
    amount: moving.reduce((sum, r) => sum + r.amount, 0),
  }
}
