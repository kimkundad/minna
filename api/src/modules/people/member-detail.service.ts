import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  courses,
  entitlements,
  essaySubmissions,
  invoices,
  lessonProgress,
  lessons,
  memberBillingProfiles,
  orderItems,
  orders,
  quizAttempts,
  quizQuestions,
  quizzes,
} from '../../db/schema/index'
import { notFound } from '../../lib/errors'
import { validateInvoice, type InvoiceInput } from '../commerce/invoices.service'
import { instant, outer } from '../../lib/sql'

/**
 * Everything the admin's student page shows, behind its tabs.
 *
 * One function per tab rather than one fat payload: the tabs are opened one at
 * a time and most support calls never leave the first, so loading somebody's
 * whole learning history to answer "what is their email" is work nobody asked
 * for.
 */

/* ---------------- what they can open ---------------- */

/**
 * Courses this member has access to, and how far through them they are.
 *
 * Revoked and expired entitlements are returned too, with their state. "I paid
 * for this and it stopped working" is the commonest question support gets, and
 * a list that quietly omits the revoked row cannot answer it.
 */
export async function courseAccess(userId: number) {
  const rows = await db
    .select({
      id: entitlements.id,
      courseId: entitlements.courseId,
      title: courses.title,
      slug: courses.slug,
      source: entitlements.source,
      status: entitlements.status,
      grantedAt: entitlements.grantedAt,
      expiresAt: entitlements.expiresAt,
      orderItemId: entitlements.orderItemId,
      orderNo: orders.orderNo,
      orderId: orders.id,
      lessonsDone: sql<number>`(
        SELECT COUNT(*) FROM lesson_progress lp
        WHERE lp.user_id = ${outer(entitlements.userId)}
          AND lp.course_id = ${outer(entitlements.courseId)}
          AND lp.completed_at IS NOT NULL
      )`,
      lessonsTotal: sql<number>`(
        SELECT COUNT(*) FROM lessons l
        JOIN course_modules cm ON cm.id = l.module_id
        WHERE cm.course_id = ${outer(entitlements.courseId)}
      )`,
      lastWatchedAt: sql<string | null>`(
        SELECT MAX(lp.last_watched_at) FROM lesson_progress lp
        WHERE lp.user_id = ${outer(entitlements.userId)} AND lp.course_id = ${outer(entitlements.courseId)}
      )`,
    })
    .from(entitlements)
    .innerJoin(courses, eq(courses.id, entitlements.courseId))
    .leftJoin(orderItems, eq(orderItems.id, entitlements.orderItemId))
    .leftJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(entitlements.userId, userId))
    .orderBy(desc(entitlements.grantedAt))

  return rows.map((r) => ({
    ...r,
    lessonsDone: Number(r.lessonsDone),
    lessonsTotal: Number(r.lessonsTotal),
    lastWatchedAt: instant(r.lastWatchedAt),
    // Expiry is a date in a column; whether it has passed is what a person
    // reading the screen actually wants to know.
    expired: Boolean(r.expiresAt && new Date(r.expiresAt) < new Date()),
  }))
}

/* ---------------- what they have done ---------------- */

/** Quiz attempts and essays, newest first. The record a teacher asks about. */
export async function learning(userId: number) {
  const attempts = await db
    .select({
      id: quizAttempts.id,
      quizId: quizAttempts.quizId,
      quizTitle: quizzes.title,
      courseId: quizzes.courseId,
      courseTitle: courses.title,
      attemptNo: quizAttempts.attemptNo,
      scorePct: quizAttempts.scorePct,
      passed: quizAttempts.passed,
      // Whether they finished it, which is whether it was submitted. The
      // `draft` column holds the autosaved answers of an attempt still in
      // progress and can linger on a submitted one, so it is the wrong test.
      finished: sql<boolean>`${quizAttempts.submittedAt} IS NOT NULL`,
      startedAt: quizAttempts.startedAt,
      submittedAt: quizAttempts.submittedAt,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .leftJoin(courses, eq(courses.id, quizzes.courseId))
    .where(eq(quizAttempts.userId, userId))
    .orderBy(desc(quizAttempts.startedAt))
    .limit(100)

  const essays = await db
    .select({
      id: essaySubmissions.id,
      quizId: essaySubmissions.quizId,
      quizTitle: quizzes.title,
      courseId: quizzes.courseId,
      courseTitle: courses.title,
      questionId: essaySubmissions.questionId,
      prompt: quizQuestions.text,
      status: essaySubmissions.status,
      currentVersion: essaySubmissions.currentVersion,
      submittedAt: essaySubmissions.submittedAt,
      resolvedAt: essaySubmissions.resolvedAt,
    })
    .from(essaySubmissions)
    .innerJoin(quizzes, eq(quizzes.id, essaySubmissions.quizId))
    .innerJoin(quizQuestions, eq(quizQuestions.id, essaySubmissions.questionId))
    .leftJoin(courses, eq(courses.id, quizzes.courseId))
    .where(eq(essaySubmissions.userId, userId))
    .orderBy(desc(essaySubmissions.submittedAt))
    .limit(100)

  // The last lesson touched, across everything: the quickest answer to "are
  // they actually using it".
  const [recent] = await db
    .select({
      courseId: lessonProgress.courseId,
      courseTitle: courses.title,
      lessonTitle: lessons.title,
      lastWatchedAt: lessonProgress.lastWatchedAt,
    })
    .from(lessonProgress)
    .innerJoin(courses, eq(courses.id, lessonProgress.courseId))
    .leftJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .where(eq(lessonProgress.userId, userId))
    .orderBy(desc(lessonProgress.lastWatchedAt))
    .limit(1)

  return { attempts, essays, lastSeen: recent ?? null }
}

/* ---------------- what they paid ---------------- */

/** Their orders, with the tax invoice each one carried if any. */
export async function payments(userId: number) {
  const rows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      subtotal: orders.subtotal,
      courseDiscount: orders.courseDiscount,
      orderDiscount: orders.orderDiscount,
      vatAmount: orders.vatAmount,
      total: orders.total,
      currency: orders.currency,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      invoiceId: invoices.id,
      invoiceDocumentNo: invoices.documentNo,
      itemSummary: sql<string | null>`(
        SELECT GROUP_CONCAT(oi.title_snapshot SEPARATOR ', ')
        FROM order_items oi WHERE oi.order_id = ${orders.id}
      )`,
    })
    .from(orders)
    .leftJoin(invoices, eq(invoices.orderId, orders.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))

  const spent = rows
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + r.total, 0)

  return {
    orders: rows,
    /** Satang actually taken, refunds excluded. The figure support quotes. */
    lifetimeSpend: spent,
  }
}

/* ---------------- where their invoices go ---------------- */

export async function billing(userId: number) {
  const [row] = await db
    .select()
    .from(memberBillingProfiles)
    .where(eq(memberBillingProfiles.userId, userId))
    .limit(1)
  return row ?? null
}

/**
 * Saves the member's billing details, through the same checks a checkout uses.
 *
 * Deliberately the same validator: a tax ID that would be refused at checkout
 * should be refused here too, or the admin becomes a way to store a number the
 * Revenue Department will reject.
 */
export async function saveBilling(userId: number, input: InvoiceInput) {
  const clean = validateInvoice(input)
  const before = await billing(userId)

  if (before) {
    await db
      .update(memberBillingProfiles)
      .set({
        type: clean.type,
        name: clean.name,
        taxId: clean.taxId,
        branchType: clean.branchType,
        branchCode: clean.branchCode,
        address: clean.address,
      })
      .where(eq(memberBillingProfiles.userId, userId))
  } else {
    await db.insert(memberBillingProfiles).values({ userId, ...clean })
  }

  return { before, after: await billing(userId) }
}

export async function clearBilling(userId: number) {
  const before = await billing(userId)
  if (!before) throw notFound('There is nothing saved to remove.')
  await db.delete(memberBillingProfiles).where(eq(memberBillingProfiles.userId, userId))
  return before
}

/* ---------------- the headline numbers ---------------- */

/**
 * The few figures worth showing beside the name, on every tab.
 *
 * Counted rather than listed, so the header costs one query instead of three
 * lists the page may never open.
 */
export async function summary(userId: number) {
  const [row] = await db
    .select({
      activeCourses: sql<number>`(
        SELECT COUNT(*) FROM entitlements e
        WHERE e.user_id = ${userId} AND e.status = 'active'
          AND (e.expires_at IS NULL OR e.expires_at > NOW())
      )`,
      paidOrders: sql<number>`(
        SELECT COUNT(*) FROM orders o WHERE o.user_id = ${userId} AND o.status = 'paid'
      )`,
      lifetimeSpend: sql<number>`(
        SELECT COALESCE(SUM(o.total_thb), 0) FROM orders o
        WHERE o.user_id = ${userId} AND o.status = 'paid'
      )`,
      essaysWaiting: sql<number>`(
        SELECT COUNT(*) FROM essay_submissions es
        WHERE es.user_id = ${userId} AND es.status IN ('pending', 'resubmitted')
      )`,
    })
    .from(sql`(SELECT 1) AS one`)

  return {
    activeCourses: Number(row?.activeCourses ?? 0),
    paidOrders: Number(row?.paidOrders ?? 0),
    lifetimeSpend: Number(row?.lifetimeSpend ?? 0),
    essaysWaiting: Number(row?.essaysWaiting ?? 0),
  }
}

/**
 * Ends someone's access to a course by hand.
 *
 * Revoked, not deleted — the same rule a refund follows, for the same reason:
 * what they watched and were marked on hangs off the entitlement.
 */
export async function revokeAccess(userId: number, entitlementId: number) {
  const [row] = await db
    .select({ id: entitlements.id, courseId: entitlements.courseId, status: entitlements.status })
    .from(entitlements)
    .where(and(eq(entitlements.id, entitlementId), eq(entitlements.userId, userId)))
    .limit(1)
  if (!row) throw notFound('That access record is not theirs.')

  await db
    .update(entitlements)
    .set({ status: row.status === 'revoked' ? 'active' : 'revoked' })
    .where(eq(entitlements.id, entitlementId))

  const [course] = await db
    .select({ title: courses.title })
    .from(courses)
    .where(eq(courses.id, row.courseId))
    .limit(1)

  return {
    courseTitle: course?.title ?? 'a course',
    was: row.status,
    now: row.status === 'revoked' ? 'active' : 'revoked',
  }
}

/**
 * Moving when somebody's access runs out.
 *
 * The ordinary reason is a few more days: somebody was ill, or a course went
 * up late, and the fair thing is to hand back the time rather than to argue
 * about it. The unusual reasons — making it lifetime, or pulling it in — are
 * the same operation and are allowed for the same reason, with the audit log
 * recording who decided and what it was before.
 *
 * A date rather than a number of days, even though the screen offers buttons
 * that add days: the stored fact is when access ends, and working that out in
 * the browser means the person approving it can see the date before they
 * agree to it.
 *
 * An expired record comes back to life. That is the point — a date in the
 * future and a status of `expired` would be a contradiction, and the nightly
 * sweep that expires them would only disagree with the admin who just decided
 * otherwise. A revoked one stays revoked: ending somebody's access is a
 * separate decision, and silently undoing it here would hide it.
 */
export async function setAccessExpiry(
  userId: number,
  entitlementId: number,
  expiresAt: Date | null,
) {
  const [row] = await db
    .select({
      id: entitlements.id,
      courseId: entitlements.courseId,
      status: entitlements.status,
      expiresAt: entitlements.expiresAt,
    })
    .from(entitlements)
    .where(and(eq(entitlements.id, entitlementId), eq(entitlements.userId, userId)))
    .limit(1)
  if (!row) throw notFound('That access record is not theirs.')

  const ongoing = expiresAt === null || expiresAt.getTime() > Date.now()
  const status = row.status === 'revoked' ? 'revoked' : ongoing ? 'active' : 'expired'

  await db
    .update(entitlements)
    .set({ expiresAt, status })
    .where(eq(entitlements.id, entitlementId))

  const [course] = await db
    .select({ title: courses.title })
    .from(courses)
    .where(eq(courses.id, row.courseId))
    .limit(1)

  return {
    courseTitle: course?.title ?? 'a course',
    was: instant(row.expiresAt),
    now: expiresAt ? expiresAt.toISOString() : null,
    status,
  }
}
