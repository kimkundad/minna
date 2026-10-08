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
    const teacherId = roles.includes('teacher') ? req.user.sub : null

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
              WHERE u.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
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
            /** Satang taken this month and in all, refunds excluded. */
            revenueThisMonth: sql<number>`(
              SELECT COALESCE(SUM(total), 0) FROM orders
              WHERE status = 'paid' AND paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
            )`,
            revenueAllTime: sql<number>`(
              SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'paid'
            )`,
            refundedAllTime: sql<number>`(
              SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'refunded'
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

    /* ---- the last few things that happened ---- */

    const recentOrders = isStaff
      ? await db
          .select({
            id: orders.id,
            orderNo: orders.orderNo,
            total: orders.total,
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
                          WHERE ci.course_id = ${quizzes.courseId} AND ci.user_id = ${teacherId})`
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
        recentOrders,
        essayQueue,
      },
    }
  })
}
