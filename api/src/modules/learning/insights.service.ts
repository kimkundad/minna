import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  courses,
  entitlements,
  lessonQuestions,
  lessons,
  orderItems,
  orders,
  quizAttempts,
  quizQuestions,
  quizzes,
  users,
} from '../../db/schema/index'
import { notFound } from '../../lib/errors'
import { instant, outer } from '../../lib/sql'

/**
 * What the school can learn from what people did.
 *
 * Three things an admin cannot get anywhere else: how a quiz is going, who can
 * open a given course, and which lesson questions nobody has answered.
 */

/* ---------------- how a quiz is going ---------------- */

/** Every quiz with enough summary to decide which one to open. */
export async function quizResultsOverview(opts: { teacherId?: number | undefined }) {
  const rows = await db
    .select({
      quizId: quizzes.id,
      title: quizzes.title,
      courseId: quizzes.courseId,
      courseTitle: courses.title,
      passPct: quizzes.passPct,
      attempts: sql<number>`(
        SELECT COUNT(*) FROM quiz_attempts qa
        WHERE qa.quiz_id = ${outer(quizzes.id)} AND qa.submitted_at IS NOT NULL
      )`,
      people: sql<number>`(
        SELECT COUNT(DISTINCT qa.user_id) FROM quiz_attempts qa
        WHERE qa.quiz_id = ${outer(quizzes.id)} AND qa.submitted_at IS NOT NULL
      )`,
      passed: sql<number>`(
        SELECT COUNT(DISTINCT qa.user_id) FROM quiz_attempts qa
        WHERE qa.quiz_id = ${outer(quizzes.id)} AND qa.submitted_at IS NOT NULL AND qa.passed = 1
      )`,
      averageScore: sql<number | null>`(
        SELECT ROUND(AVG(qa.score_pct)) FROM quiz_attempts qa
        WHERE qa.quiz_id = ${outer(quizzes.id)} AND qa.submitted_at IS NOT NULL
      )`,
      lastAttemptAt: sql<string | null>`(
        SELECT MAX(qa.submitted_at) FROM quiz_attempts qa WHERE qa.quiz_id = ${outer(quizzes.id)}
      )`,
    })
    .from(quizzes)
    .leftJoin(courses, eq(courses.id, quizzes.courseId))
    .where(
      opts.teacherId
        ? sql`EXISTS (SELECT 1 FROM course_instructors ci
                      WHERE ci.course_id = ${outer(quizzes.courseId)} AND ci.user_id = ${opts.teacherId})`
        : undefined,
    )
    .orderBy(desc(sql`(SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = ${outer(quizzes.id)})`))

  return rows.map((r) => ({
    ...r,
    attempts: Number(r.attempts),
    people: Number(r.people),
    passed: Number(r.passed),
    averageScore: r.averageScore === null ? null : Number(r.averageScore),
    lastAttemptAt: instant(r.lastAttemptAt),
  }))
}

/**
 * One quiz, question by question.
 *
 * The figure that earns the screen is `wrongPct` per question: a question
 * everybody fails is usually a question that is badly worded, not a class that
 * cannot answer it, and nothing else in the system would ever point that out.
 */
export async function quizResults(quizId: number) {
  const [quiz] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      courseId: quizzes.courseId,
      courseTitle: courses.title,
      passPct: quizzes.passPct,
    })
    .from(quizzes)
    .leftJoin(courses, eq(courses.id, quizzes.courseId))
    .where(eq(quizzes.id, quizId))
    .limit(1)
  if (!quiz) throw notFound('That quiz does not exist.')

  const [summary] = await db
    .select({
      attempts: sql<number>`COUNT(*)`,
      people: sql<number>`COUNT(DISTINCT ${quizAttempts.userId})`,
      averageScore: sql<number | null>`ROUND(AVG(${quizAttempts.scorePct}))`,
      passed: sql<number>`SUM(CASE WHEN ${quizAttempts.passed} = 1 THEN 1 ELSE 0 END)`,
    })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quizId), isNotNull(quizAttempts.submittedAt)))

  // Counted over answered attempts only: a question nobody reached should not
  // read as a question everybody got right.
  const questions = await db
    .select({
      id: quizQuestions.id,
      type: quizQuestions.type,
      text: quizQuestions.text,
      sortOrder: quizQuestions.sortOrder,
      answered: sql<number>`(
        SELECT COUNT(*) FROM quiz_attempt_answers qaa
        JOIN quiz_attempts qa ON qa.id = qaa.attempt_id AND qa.submitted_at IS NOT NULL
        WHERE qaa.question_id = ${outer(quizQuestions.id)}
      )`,
      wrong: sql<number>`(
        SELECT COUNT(*) FROM quiz_attempt_answers qaa
        JOIN quiz_attempts qa ON qa.id = qaa.attempt_id AND qa.submitted_at IS NOT NULL
        WHERE qaa.question_id = ${outer(quizQuestions.id)} AND qaa.is_correct = 0
      )`,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.sortOrder)

  const attempts = await db
    .select({
      id: quizAttempts.id,
      userId: quizAttempts.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      attemptNo: quizAttempts.attemptNo,
      scorePct: quizAttempts.scorePct,
      passed: quizAttempts.passed,
      submittedAt: quizAttempts.submittedAt,
    })
    .from(quizAttempts)
    .innerJoin(users, eq(users.id, quizAttempts.userId))
    .where(and(eq(quizAttempts.quizId, quizId), isNotNull(quizAttempts.submittedAt)))
    .orderBy(desc(quizAttempts.submittedAt))
    .limit(200)

  return {
    quiz,
    summary: {
      attempts: Number(summary?.attempts ?? 0),
      people: Number(summary?.people ?? 0),
      averageScore: summary?.averageScore == null ? null : Number(summary.averageScore),
      passed: Number(summary?.passed ?? 0),
    },
    questions: questions.map((q) => {
      const answered = Number(q.answered)
      const wrong = Number(q.wrong)
      return {
        ...q,
        answered,
        wrong,
        wrongPct: answered ? Math.round((wrong / answered) * 100) : null,
      }
    }),
    attempts,
  }
}

/* ---------------- who can open what ---------------- */

/**
 * Access, listed by course rather than by person.
 *
 * The student page answers "what can this person open". This is the other
 * direction — "who can open this course" — which is the question asked when a
 * course is about to change, or when somebody wants to know how many people a
 * refund would affect.
 */
export async function accessList(opts: {
  page: number
  perPage: number
  courseId?: number | undefined
  status?: 'active' | 'revoked' | 'expired' | undefined
  q?: string | undefined
}) {
  const term = `%${opts.q ?? ''}%`
  const where = [
    opts.courseId ? eq(entitlements.courseId, opts.courseId) : undefined,
    opts.status === 'expired'
      ? sql`${entitlements.status} = 'active' AND ${entitlements.expiresAt} IS NOT NULL
            AND ${entitlements.expiresAt} <= NOW()`
      : undefined,
    opts.status === 'active'
      ? sql`${entitlements.status} = 'active'
            AND (${entitlements.expiresAt} IS NULL OR ${entitlements.expiresAt} > NOW())`
      : undefined,
    opts.status === 'revoked' ? eq(entitlements.status, 'revoked') : undefined,
    opts.q
      ? sql`(${users.email} LIKE ${term}
             OR CONCAT(${users.firstName}, ' ', ${users.lastName}) LIKE ${term})`
      : undefined,
  ].filter(Boolean)
  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(entitlements)
    .innerJoin(users, eq(users.id, entitlements.userId))
    .where(filter)

  const rows = await db
    .select({
      id: entitlements.id,
      userId: entitlements.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      courseId: entitlements.courseId,
      courseTitle: courses.title,
      source: entitlements.source,
      status: entitlements.status,
      grantedAt: entitlements.grantedAt,
      expiresAt: entitlements.expiresAt,
      orderNo: orders.orderNo,
    })
    .from(entitlements)
    .innerJoin(users, eq(users.id, entitlements.userId))
    .innerJoin(courses, eq(courses.id, entitlements.courseId))
    .leftJoin(orderItems, eq(orderItems.id, entitlements.orderItemId))
    .leftJoin(orders, eq(orders.id, orderItems.orderId))
    .where(filter)
    .orderBy(desc(entitlements.grantedAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows.map((r) => ({
      ...r,
      expired: Boolean(r.expiresAt && new Date(r.expiresAt) < new Date()),
    })),
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
    },
  }
}

/** How many people can open each course right now, for the filter and the
 *  headline. */
export async function accessByCourse() {
  const rows = await db
    .select({
      courseId: courses.id,
      title: courses.title,
      active: sql<number>`(
        SELECT COUNT(*) FROM entitlements e
        WHERE e.course_id = ${outer(courses.id)} AND e.status = 'active'
          AND (e.expires_at IS NULL OR e.expires_at > NOW())
      )`,
      expired: sql<number>`(
        SELECT COUNT(*) FROM entitlements e
        WHERE e.course_id = ${outer(courses.id)} AND e.status = 'active'
          AND e.expires_at IS NOT NULL AND e.expires_at <= NOW()
      )`,
      revoked: sql<number>`(
        SELECT COUNT(*) FROM entitlements e
        WHERE e.course_id = ${outer(courses.id)} AND e.status = 'revoked'
      )`,
    })
    .from(courses)
    .orderBy(courses.title)

  return rows.map((r) => ({
    ...r,
    active: Number(r.active),
    expired: Number(r.expired),
    revoked: Number(r.revoked),
  }))
}

/* ---------------- questions on a lesson ---------------- */

/**
 * Questions students asked on a lesson, and their answers.
 *
 * Threaded one deep: a question with replies under it. `answeredAt` on the
 * question row is what drives the unanswered queue, so it is set by the first
 * reply rather than counted every time the list is drawn.
 */
export async function lessonQuestionList(opts: {
  page: number
  perPage: number
  unansweredOnly?: boolean | undefined
  courseId?: number | undefined
  teacherId?: number | undefined
  q?: string | undefined
}) {
  /**
   * Who and what this reader may see at all — the course, the search, and
   * whose courses they are.
   *
   * Kept apart from the answered/unanswered flag because the badge above the
   * list counts within this scope while the list itself may be narrowed
   * further. Counting outside it told a teacher that two questions were
   * waiting for an answer while showing them an empty queue, because the two
   * belonged to somebody else's course.
   */
  const scope = [
    // Only the questions; the replies come back attached to them.
    sql`${lessonQuestions.parentId} IS NULL`,
    opts.courseId ? eq(lessonQuestions.courseId, opts.courseId) : undefined,
    opts.q ? sql`${lessonQuestions.body} LIKE ${`%${opts.q}%`}` : undefined,
    opts.teacherId
      ? sql`EXISTS (SELECT 1 FROM course_instructors ci
                    WHERE ci.course_id = ${outer(lessonQuestions.courseId)} AND ci.user_id = ${opts.teacherId})`
      : undefined,
  ].filter(Boolean) as never[]

  const where = [
    ...scope,
    opts.unansweredOnly ? sql`${lessonQuestions.answeredAt} IS NULL` : undefined,
  ].filter(Boolean)
  const filter = and(...(where as never[]))

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(lessonQuestions)
    .where(filter)

  const [{ value: unanswered } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(lessonQuestions)
    .where(and(...scope, sql`${lessonQuestions.answeredAt} IS NULL`))

  const rows = await db
    .select({
      id: lessonQuestions.id,
      body: lessonQuestions.body,
      createdAt: lessonQuestions.createdAt,
      answeredAt: lessonQuestions.answeredAt,
      userId: lessonQuestions.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      courseId: lessonQuestions.courseId,
      courseTitle: courses.title,
      lessonId: lessonQuestions.lessonId,
      lessonTitle: lessons.title,
    })
    .from(lessonQuestions)
    .innerJoin(users, eq(users.id, lessonQuestions.userId))
    .leftJoin(courses, eq(courses.id, lessonQuestions.courseId))
    .leftJoin(lessons, eq(lessons.id, lessonQuestions.lessonId))
    .where(filter)
    // Unanswered first, then oldest: the queue reads top to bottom.
    .orderBy(sql`${lessonQuestions.answeredAt} IS NOT NULL`, lessonQuestions.createdAt)
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  const ids = rows.map((r) => r.id)
  const replies = ids.length
    ? await db
        .select({
          id: lessonQuestions.id,
          parentId: lessonQuestions.parentId,
          body: lessonQuestions.body,
          createdAt: lessonQuestions.createdAt,
          isInstructor: lessonQuestions.isInstructor,
          userId: lessonQuestions.userId,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(lessonQuestions)
        .innerJoin(users, eq(users.id, lessonQuestions.userId))
        .where(inArray(lessonQuestions.parentId, ids))
        .orderBy(lessonQuestions.createdAt)
    : []

  return {
    data: rows.map((r) => ({
      ...r,
      replies: replies.filter((a) => a.parentId === r.id),
    })),
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
      unanswered: Number(unanswered),
    },
  }
}

/** Answers a question, and marks the thread answered. */
export async function answerLessonQuestion(
  questionId: number,
  userId: number,
  body: string,
  asInstructor: boolean,
) {
  const [question] = await db
    .select({
      id: lessonQuestions.id,
      lessonId: lessonQuestions.lessonId,
      courseId: lessonQuestions.courseId,
      parentId: lessonQuestions.parentId,
    })
    .from(lessonQuestions)
    .where(eq(lessonQuestions.id, questionId))
    .limit(1)
  if (!question) throw notFound('That question does not exist.')
  if (question.parentId) throw notFound('That is a reply, not a question.')

  const [res] = await db.insert(lessonQuestions).values({
    lessonId: question.lessonId,
    courseId: question.courseId,
    userId,
    parentId: questionId,
    body,
    isInstructor: asInstructor,
  })

  // Stamped on the question, so the unanswered queue is an index lookup rather
  // than a count of children on every row.
  //
  // Only an instructor's reply closes it. Students answer each other in the
  // room, and often well, but the queue is a list of what the school still owes
  // an answer to — a classmate's guess does not settle that.
  if (asInstructor) {
    await db
      .update(lessonQuestions)
      .set({ answeredAt: new Date() })
      .where(eq(lessonQuestions.id, questionId))
  }

  return { replyId: Number(res.insertId), courseId: question.courseId }
}

/** Removes a reply or a whole thread. */
export async function deleteLessonQuestion(id: number) {
  const [row] = await db
    .select({ id: lessonQuestions.id, parentId: lessonQuestions.parentId, body: lessonQuestions.body })
    .from(lessonQuestions)
    .where(eq(lessonQuestions.id, id))
    .limit(1)
  if (!row) throw notFound('That does not exist.')

  // Replies cascade on the foreign key, so deleting a question takes its
  // answers with it — which is what deleting a question means.
  await db.delete(lessonQuestions).where(eq(lessonQuestions.id, id))

  if (row.parentId) {
    // That may have been the only answer. Leave the thread marked answered only
    // if something is still under it.
    const [left] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(lessonQuestions)
      .where(eq(lessonQuestions.parentId, row.parentId))
    if (!Number(left?.n ?? 0)) {
      await db
        .update(lessonQuestions)
        .set({ answeredAt: null })
        .where(eq(lessonQuestions.id, row.parentId))
    }
  }

  return row
}
