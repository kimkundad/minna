import { and, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client'
import {
  courses,
  essaySubmissions,
  orders,
  quizQuestions,
  quizzes,
  users,
} from '../../db/schema/index'
import { teacherScope } from '../../lib/scope'
import { outer } from '../../lib/sql'
import { monthStart } from '../../lib/time'

/**
 * The dashboard's figures.
 *
 * Only numbers that come out of the database. The theme ships a dashboard full
 * of invented revenue charts, and the first person to screenshot one into a
 * meeting will not know it is fiction — so none of that is kept.
 *
 * Two halves: what is waiting for somebody (work), and what has happened
 * (counts). The work half comes first, because that is what the page is for.
 */
export default async function dashboardRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: app.authenticate }

  app.get('/dashboard', signedIn, async (req) => {
    const roles = req.user.roles
    const isStaff = roles.includes('admin') || roles.includes('superadmin')
    // Admin is the wider view and wins when somebody holds both roles.
    const teacherId = teacherScope(req.user)

    /* ---- what is waiting ---- */

    // A teacher sees only their own courses' essays; staff see all of them.
    const essayWhere = teacherId
      ? sql`es.quiz_id IN (
            SELECT q.id FROM quizzes q
            JOIN course_instructors ci ON ci.course_id = q.course_id
            WHERE ci.user_id = ${teacherId})`
      : sql`1 = 1`

    const [waiting] = await db
      .select({
        essays: sql<number>`(
          SELECT COUNT(*) FROM essay_submissions es
          WHERE es.status IN ('pending', 'resubmitted') AND ${essayWhere}
        )`,
        /** How long the oldest one has been sitting there, in hours. */
        oldestEssayHours: sql<number | null>`(
          SELECT TIMESTAMPDIFF(HOUR, MIN(es.submitted_at), NOW()) FROM essay_submissions es
          WHERE es.status IN ('pending', 'resubmitted') AND ${essayWhere}
        )`,
        applications: isStaff
          ? sql<number>`(SELECT COUNT(*) FROM teacher_applications WHERE status = 'pending')`
          : sql<number>`0`,
        enquiries: isStaff
          ? sql<number>`(SELECT COUNT(*) FROM contact_messages WHERE read_at IS NULL)`
          : sql<number>`0`,
        /** Paid, asked for a tax invoice, and still without a number. */
        invoicesToIssue: isStaff
          ? sql<number>`(
              SELECT COUNT(*) FROM invoices i
              JOIN orders o ON o.id = i.order_id
              WHERE i.document_no IS NULL AND o.status = 'paid'
            )`
          : sql<number>`0`,
        lessonQuestions: isStaff
          ? sql<number>`(
              SELECT COUNT(*) FROM lesson_questions
              WHERE parent_id IS NULL AND answered_at IS NULL
            )`
          : sql<number>`0`,
      })
      .from(sql`(SELECT 1) AS one`)

    /* ---- what a course or a sale needs before it can go live ---- */

    const [problems] = isStaff
      ? await db
          .select({
            // The admin can create either of these and the public site cannot
            // show them, so they are worth naming rather than leaving to be
            // discovered by a customer.
            coursesWithoutTeacher: sql<number>`(
              SELECT COUNT(*) FROM courses c
              WHERE NOT EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = c.id)
            )`,
            lessonsWithoutModule: sql<number>`(
              SELECT COUNT(*) FROM lessons WHERE module_id IS NULL
            )`,
            coursesWithoutLessons: sql<number>`(
              SELECT COUNT(*) FROM courses c
              WHERE c.status = 'approved'
                AND NOT EXISTS (
                  SELECT 1 FROM course_modules cm
                  JOIN lessons l ON l.module_id = cm.id
                  WHERE cm.course_id = c.id)
            )`,
            teachersWithoutProfile: sql<number>`(
              SELECT COUNT(*) FROM users u
              JOIN user_roles ur ON ur.user_id = u.id
              JOIN roles r ON r.id = ur.role_id AND r.name = 'teacher'
              WHERE NOT EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.user_id = u.id)
            )`,
          })
          .from(sql`(SELECT 1) AS one`)
      : [null]

    /* ---- what has happened ---- */

    const [counts] = isStaff
      ? await db
          .select({
            students: sql<number>`(
              SELECT COUNT(*) FROM users u
              JOIN user_roles ur ON ur.user_id = u.id
              JOIN roles r ON r.id = ur.role_id AND r.name = 'student'
            )`,
            studentsThisMonth: sql<number>`(
              SELECT COUNT(*) FROM users u
              JOIN user_roles ur ON ur.user_id = u.id
              JOIN roles r ON r.id = ur.role_id AND r.name = 'student'
              WHERE u.created_at >= ${monthStart()}
            )`,
            teachers: sql<number>`(
              SELECT COUNT(*) FROM users u
              JOIN user_roles ur ON ur.user_id = u.id
              JOIN roles r ON r.id = ur.role_id AND r.name = 'teacher'
            )`,
            publishedCourses: sql<number>`(
              SELECT COUNT(*) FROM courses WHERE status = 'approved'
            )`,
            draftCourses: sql<number>`(SELECT COUNT(*) FROM courses WHERE status <> 'approved')`,
            /**
             * Satang taken this month and in all, refunds excluded.
             *
             * `total_thb`, not `total`: a course may be priced in euros, and
             * adding euro cents to satang gives a figure that is wrong in a
             * way nobody would spot — it would simply look like a quiet month.
             * Each order carries its own baht value, worked out at the rate on
             * the day it was paid.
             */
            revenueThisMonth: sql<number>`(
              SELECT COALESCE(SUM(total_thb), 0) FROM orders
              WHERE status = 'paid' AND paid_at >= ${monthStart()}
            )`,
            revenueAllTime: sql<number>`(
              SELECT COALESCE(SUM(total_thb), 0) FROM orders WHERE status = 'paid'
            )`,
            refundedAllTime: sql<number>`(
              SELECT COALESCE(SUM(total_thb), 0) FROM orders WHERE status = 'refunded'
            )`,
            ordersAwaitingPayment: sql<number>`(
              SELECT COUNT(*) FROM orders WHERE status = 'pending'
            )`,
            activeEnrolments: sql<number>`(
              SELECT COUNT(*) FROM entitlements
              WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
            )`,
          })
          .from(sql`(SELECT 1) AS one`)
      : [null]

    /**
     * The same question asked about one teacher's own classes.
     *
     * Kept apart from `counts` rather than folded into it, because the words
     * would otherwise mean two different things in one field: an admin's
     * "students" is the school's, a teacher's is the people in their room.
     *
     * Null for an admin, including an admin who also teaches — they get the
     * school's view, and open a course when they want one class's numbers.
     */
    const [teaching] = teacherId
      ? await db
          .select({
            /** People, not grants: somebody on two of your courses is one student. */
            learners: sql<number>`(
              SELECT COUNT(DISTINCT e.user_id) FROM entitlements e
              JOIN course_instructors ci ON ci.course_id = e.course_id
              WHERE ci.user_id = ${teacherId}
                AND e.status = 'active'
                AND (e.expires_at IS NULL OR e.expires_at > NOW())
            )`,
            learnersThisMonth: sql<number>`(
              SELECT COUNT(DISTINCT e.user_id) FROM entitlements e
              JOIN course_instructors ci ON ci.course_id = e.course_id
              WHERE ci.user_id = ${teacherId}
                AND e.granted_at >= ${monthStart()}
            )`,
            /** Every grant, so one person on two courses counts twice. */
            enrolments: sql<number>`(
              SELECT COUNT(*) FROM entitlements e
              JOIN course_instructors ci ON ci.course_id = e.course_id
              WHERE ci.user_id = ${teacherId}
                AND e.status = 'active'
                AND (e.expires_at IS NULL OR e.expires_at > NOW())
            )`,
            publishedCourses: sql<number>`(
              SELECT COUNT(*) FROM courses c
              JOIN course_instructors ci ON ci.course_id = c.id
              WHERE ci.user_id = ${teacherId} AND c.status = 'approved'
            )`,
            draftCourses: sql<number>`(
              SELECT COUNT(*) FROM courses c
              JOIN course_instructors ci ON ci.course_id = c.id
              WHERE ci.user_id = ${teacherId} AND c.status <> 'approved'
            )`,
          })
          .from(sql`(SELECT 1) AS one`)
      : [null]

    /* ---- the last few things that happened ---- */

    const recentOrders = isStaff
      ? await db
          .select({
            id: orders.id,
            orderNo: orders.orderNo,
            total: orders.total,
            // What that total is in. Without it the dashboard writes every
            // order in baht, and a ¥9,800 sale reads as ฿9,800.
            currency: orders.currency,
            status: orders.status,
            createdAt: orders.createdAt,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(orders)
          .innerJoin(users, eq(users.id, orders.userId))
          .orderBy(desc(orders.createdAt))
          .limit(5)
      : []

    /** The essays this person could pick up right now, oldest first. */
    const essayQueue = await db
      .select({
        id: essaySubmissions.id,
        userId: essaySubmissions.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        prompt: quizQuestions.text,
        courseId: quizzes.courseId,
        courseTitle: courses.title,
        status: essaySubmissions.status,
        submittedAt: essaySubmissions.submittedAt,
      })
      .from(essaySubmissions)
      .innerJoin(users, eq(users.id, essaySubmissions.userId))
      .innerJoin(quizQuestions, eq(quizQuestions.id, essaySubmissions.questionId))
      .innerJoin(quizzes, eq(quizzes.id, essaySubmissions.quizId))
      .leftJoin(courses, eq(courses.id, quizzes.courseId))
      .where(
        and(
          sql`${essaySubmissions.status} IN ('pending', 'resubmitted')`,
          teacherId
            ? sql`EXISTS (SELECT 1 FROM course_instructors ci
                          WHERE ci.course_id = ${outer(quizzes.courseId)} AND ci.user_id = ${teacherId})`
            : undefined,
        ),
      )
      .orderBy(essaySubmissions.submittedAt)
      .limit(5)

    const num = (v: unknown) => Number(v ?? 0)

    return {
      data: {
        waiting: {
          essays: num(waiting?.essays),
          oldestEssayHours: waiting?.oldestEssayHours == null ? null : num(waiting.oldestEssayHours),
          applications: num(waiting?.applications),
          enquiries: num(waiting?.enquiries),
          invoicesToIssue: num(waiting?.invoicesToIssue),
          lessonQuestions: num(waiting?.lessonQuestions),
        },
        problems: problems
          ? {
              coursesWithoutTeacher: num(problems.coursesWithoutTeacher),
              lessonsWithoutModule: num(problems.lessonsWithoutModule),
              coursesWithoutLessons: num(problems.coursesWithoutLessons),
              teachersWithoutProfile: num(problems.teachersWithoutProfile),
            }
          : null,
        counts: counts
          ? {
              students: num(counts.students),
              studentsThisMonth: num(counts.studentsThisMonth),
              teachers: num(counts.teachers),
              publishedCourses: num(counts.publishedCourses),
              draftCourses: num(counts.draftCourses),
              revenueThisMonth: num(counts.revenueThisMonth),
              revenueAllTime: num(counts.revenueAllTime),
              refundedAllTime: num(counts.refundedAllTime),
              ordersAwaitingPayment: num(counts.ordersAwaitingPayment),
              activeEnrolments: num(counts.activeEnrolments),
            }
          : null,
        teaching: teaching
          ? {
              learners: num(teaching.learners),
              learnersThisMonth: num(teaching.learnersThisMonth),
              enrolments: num(teaching.enrolments),
              publishedCourses: num(teaching.publishedCourses),
              draftCourses: num(teaching.draftCourses),
            }
          : null,
        recentOrders,
        essayQueue,
      },
    }
  })
}
