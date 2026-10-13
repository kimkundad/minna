import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  courseInstructors,
  courses,
  essayReviews,
  essaySubmissions,
  essayVersions,
  quizQuestions,
  quizzes,
  users,
} from '../../db/schema/index'
import { conflict, notFound } from '../../lib/errors'

/**
 * The marking queue.
 *
 * A submission is one learner's answer to one essay question, and it carries
 * every draft they sent and every verdict given. The history is kept rather
 * than overwritten: "you already told me to fix this and I did" is the most
 * common thing a learner needs to show, and a single current body cannot show
 * it.
 */

export interface Paged<T> {
  data: T[]
  meta: { page: number; perPage: number; total: number; totalPages: number }
}

function paged<T>(data: T[], total: number, page: number, perPage: number): Paged<T> {
  return {
    data,
    meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  }
}

export interface QueueOptions {
  page: number
  perPage: number
  status: 'todo' | 'pending' | 'resubmitted' | 'revision' | 'passed'
  courseId?: number | undefined
  q?: string | undefined
  /** Set for a teacher: only the courses they are on. Undefined for an admin. */
  instructorId?: number | undefined
}

export async function listQueue(opts: QueueOptions): Promise<Paged<unknown>> {
  const where = [
    // 'todo' is the two states waiting on a person, which is what the screen
    // is for; the others are exact.
    opts.status === 'todo'
      ? inArray(essaySubmissions.status, ['pending', 'resubmitted'])
      : eq(essaySubmissions.status, opts.status),
    opts.courseId ? eq(quizzes.courseId, opts.courseId) : undefined,
    opts.q
      ? or(
          like(users.firstName, `%${opts.q}%`),
          like(users.lastName, `%${opts.q}%`),
          like(users.email, `%${opts.q}%`),
          like(courses.title, `%${opts.q}%`),
        )
      : undefined,
    opts.instructorId
      ? sql`EXISTS (
          SELECT 1 FROM course_instructors ci
          WHERE ci.course_id = ${courses.id} AND ci.user_id = ${opts.instructorId}
        )`
      : undefined,
  ].filter(Boolean)

  const filter = and(...(where as never[]))

  const base = db
    .select({ value: count() })
    .from(essaySubmissions)
    .innerJoin(quizzes, eq(quizzes.id, essaySubmissions.quizId))
    .innerJoin(courses, eq(courses.id, quizzes.courseId))
    .innerJoin(users, eq(users.id, essaySubmissions.userId))
    .where(filter)

  const [{ value: total } = { value: 0 }] = await base

  const rows = await db
    .select({
      id: essaySubmissions.id,
      status: essaySubmissions.status,
      currentVersion: essaySubmissions.currentVersion,
      submittedAt: essaySubmissions.submittedAt,
      resolvedAt: essaySubmissions.resolvedAt,
      questionId: essaySubmissions.questionId,
      questionText: quizQuestions.text,
      courseId: courses.id,
      courseTitle: courses.title,
      learnerId: users.id,
      learnerName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
      learnerEmail: users.email,
      learnerLocale: users.locale,
      courseSlug: courses.slug,
    })
    .from(essaySubmissions)
    .innerJoin(quizzes, eq(quizzes.id, essaySubmissions.quizId))
    .innerJoin(courses, eq(courses.id, quizzes.courseId))
    .innerJoin(users, eq(users.id, essaySubmissions.userId))
    .innerJoin(quizQuestions, eq(quizQuestions.id, essaySubmissions.questionId))
    .where(filter)
    // Oldest first in the queue: somebody has been waiting longest.
    .orderBy(asc(essaySubmissions.submittedAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return paged(rows, total, opts.page, opts.perPage)
}

export async function getSubmission(id: number) {
  const [row] = await db
    .select({
      id: essaySubmissions.id,
      quizId: essaySubmissions.quizId,
      questionId: essaySubmissions.questionId,
      questionText: quizQuestions.text,
      maxLength: quizQuestions.maxLength,
      attachmentAllowed: quizQuestions.attachmentAllowed,
      status: essaySubmissions.status,
      currentVersion: essaySubmissions.currentVersion,
      submittedAt: essaySubmissions.submittedAt,
      resolvedAt: essaySubmissions.resolvedAt,
      courseId: courses.id,
      courseTitle: courses.title,
      learnerId: users.id,
      learnerName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
      learnerEmail: users.email,
      learnerLocale: users.locale,
      courseSlug: courses.slug,
    })
    .from(essaySubmissions)
    .innerJoin(quizzes, eq(quizzes.id, essaySubmissions.quizId))
    .innerJoin(courses, eq(courses.id, quizzes.courseId))
    .innerJoin(users, eq(users.id, essaySubmissions.userId))
    .innerJoin(quizQuestions, eq(quizQuestions.id, essaySubmissions.questionId))
    .where(eq(essaySubmissions.id, id))
    .limit(1)

  if (!row) throw notFound('That submission does not exist.')

  const versions = await db
    .select()
    .from(essayVersions)
    .where(eq(essayVersions.submissionId, id))
    .orderBy(asc(essayVersions.version))

  const reviews = await db
    .select({
      id: essayReviews.id,
      version: essayReviews.version,
      result: essayReviews.result,
      comment: essayReviews.comment,
      attachmentPath: essayReviews.attachmentPath,
      reviewedAt: essayReviews.reviewedAt,
      reviewerId: essayReviews.reviewerId,
      reviewerName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
    })
    .from(essayReviews)
    .leftJoin(users, eq(users.id, essayReviews.reviewerId))
    .where(eq(essayReviews.submissionId, id))
    .orderBy(desc(essayReviews.version), desc(essayReviews.id))

  return { ...row, versions, reviews }
}

/** Whether this teacher is on the course the submission belongs to. */
export async function mayReview(submissionId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ userId: courseInstructors.userId })
    .from(essaySubmissions)
    .innerJoin(quizzes, eq(quizzes.id, essaySubmissions.quizId))
    .innerJoin(courseInstructors, eq(courseInstructors.courseId, quizzes.courseId))
    .where(
      and(eq(essaySubmissions.id, submissionId), eq(courseInstructors.userId, userId)),
    )
    .limit(1)
  return Boolean(row)
}

/**
 * Records a verdict against the version it is about.
 *
 * The version matters: a learner who sends a third draft while the second is
 * being marked must not see that comment attached to the wrong text. It is read
 * from the submission rather than taken from the request for the same reason —
 * the marker cannot be asked to tell us which draft they just read.
 */
export async function review(
  submissionId: number,
  input: { result: 'passed' | 'revision'; comment: string; attachmentPath?: string | null },
  reviewerId: number,
) {
  const submission = await getSubmission(submissionId)

  if (submission.status === 'passed') {
    throw conflict('That answer has already passed.')
  }
  if (submission.status === 'revision') {
    throw conflict('That answer is already back with the learner, waiting for a new draft.')
  }

  await db.insert(essayReviews).values({
    submissionId,
    version: submission.currentVersion,
    reviewerId,
    result: input.result,
    comment: input.comment,
    attachmentPath: input.attachmentPath ?? null,
  })

  await db
    .update(essaySubmissions)
    .set({
      status: input.result === 'passed' ? 'passed' : 'revision',
      // Only a pass is an ending. Asking for changes leaves it open, because
      // another draft is expected.
      resolvedAt: input.result === 'passed' ? new Date() : null,
    })
    .where(eq(essaySubmissions.id, submissionId))

  return getSubmission(submissionId)
}

/** How many are waiting, for the badge on the menu. */
export async function countWaiting(instructorId?: number): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(essaySubmissions)
    .innerJoin(quizzes, eq(quizzes.id, essaySubmissions.quizId))
    .where(
      and(
        inArray(essaySubmissions.status, ['pending', 'resubmitted']),
        instructorId
          ? sql`EXISTS (
              SELECT 1 FROM course_instructors ci
              WHERE ci.course_id = ${quizzes.courseId} AND ci.user_id = ${instructorId}
            )`
          : undefined,
      ),
    )
  return rows[0]?.value ?? 0
}
