import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { courseInstructors, lessonQuestions, lessons, teacherProfiles, users } from '../../db/schema/index'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { requireAccess } from './study.service'

/**
 * The questions on a course.
 *
 * Course-wide, not per lesson. A question is asked from the lesson somebody is
 * on and keeps that as its label, but the panel shows the whole course: a
 * reader who answers "where do I ask about て-form" by scrolling four lessons
 * looking for the right thread will not ask at all, and the same question then
 * gets asked four times under four lessons.
 *
 * One thread per question, replies underneath, everybody on the course reading
 * the same page. That is the decision this file rests on: a question asked out
 * loud is usually a question several people had, and answering it privately
 * means answering it again next month. The alternative — each student seeing
 * only their own — is a support inbox, not a class.
 *
 * What follows from it: a name is attached to every post, because people write
 * differently when their classmates can see it; a teacher's reply is marked as
 * one, because it carries weight a classmate's does not; and the author can
 * take back what they wrote only while nobody has replied to it, because a
 * question deleted out from under three answers leaves three answers to
 * nothing.
 *
 * The teacher's side of this already exists in `insights.service.ts` — the
 * queue of unanswered questions and the answer form in the admin. This is the
 * half the student uses.
 */

/**
 * How long between posts, per member.
 *
 * Twenty seconds — a guard against a double-click and a runaway loop, not a
 * spam rule. reCAPTCHA is the spam rule now: minutes of waiting cost every
 * honest student who is stuck on two lessons at once, and cost an automated
 * poster nothing it cannot sit out.
 *
 * It stays at some non-zero value on purpose. A captcha can be unconfigured, or
 * down, or wrong, and the three seconds this costs a real person is the floor
 * under all of that.
 */
const COOLDOWN = { question: 20, reply: 20 } as const

export interface QaAuthor {
  id: number
  name: string
  avatarPath: string | null
  isInstructor: boolean
}

export interface QaPost {
  id: number
  body: string
  createdAt: string
  author: QaAuthor
  /** True for the signed-in reader's own posts, which is what lets the page
   *  offer to delete them. */
  mine: boolean
  canDelete: boolean
}

export interface QaThread extends QaPost {
  answeredAt: string | null
  /** Which lesson it was asked from, for the line above the question. */
  lesson: { id: number; title: string } | null
  /** Answers that would go with it. The page warns with this number. */
  replyCount: number
  replies: QaPost[]
}

/** Everyone who posted, in one query rather than one per post. */
async function authorsOf(userIds: number[]) {
  const map = new Map<number, { name: string; avatarPath: string | null }>()
  if (!userIds.length) return map

  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarPath: users.avatarPath,
      displayName: teacherProfiles.displayName,
    })
    .from(users)
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .where(inArray(users.id, userIds))

  for (const r of rows) {
    const account = `${r.firstName} ${r.lastName}`.trim()
    map.set(r.id, { name: r.displayName ?? account, avatarPath: r.avatarPath })
  }
  return map
}

async function lessonOf(lessonId: number) {
  const [lesson] = await db
    .select({ id: lessons.id, courseId: lessons.courseId })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1)
  if (!lesson) throw notFound('No such lesson.')
  return lesson
}

/** A teacher on this course may answer in the room rather than only in the
 *  admin, and their reply is badged accordingly. */
async function teachesCourse(userId: number, courseId: number): Promise<boolean> {
  const [row] = await db
    .select({ userId: courseInstructors.userId })
    .from(courseInstructors)
    .where(and(eq(courseInstructors.courseId, courseId), eq(courseInstructors.userId, userId)))
    .limit(1)
  return Boolean(row)
}

export async function listForCourse(userId: number, courseId: number): Promise<QaThread[]> {
  await requireAccess(userId, courseId)

  const rows = await db
    .select({
      id: lessonQuestions.id,
      lessonId: lessonQuestions.lessonId,
      userId: lessonQuestions.userId,
      parentId: lessonQuestions.parentId,
      body: lessonQuestions.body,
      isInstructor: lessonQuestions.isInstructor,
      answeredAt: lessonQuestions.answeredAt,
      createdAt: lessonQuestions.createdAt,
      lessonTitle: lessons.title,
    })
    .from(lessonQuestions)
    .leftJoin(lessons, eq(lessons.id, lessonQuestions.lessonId))
    .where(eq(lessonQuestions.courseId, courseId))
    .orderBy(asc(lessonQuestions.createdAt), asc(lessonQuestions.id))

  const authors = await authorsOf([...new Set(rows.map((r) => r.userId))])
  const replyCount = new Map<number, number>()
  for (const r of rows) {
    if (r.parentId) replyCount.set(r.parentId, (replyCount.get(r.parentId) ?? 0) + 1)
  }

  const shape = (r: (typeof rows)[number]): QaPost => {
    const who = authors.get(r.userId)
    const mine = r.userId === userId
    return {
      id: r.id,
      body: r.body,
      createdAt: String(r.createdAt),
      author: {
        id: r.userId,
        name: who?.name ?? '',
        avatarPath: who?.avatarPath ?? null,
        isInstructor: r.isInstructor,
      },
      mine,
      canDelete: mine,
    }
  }

  // Newest question first: a course that has been running a while has its
  // oldest threads settled, and the live conversation is at the end.
  return rows
    .filter((r) => r.parentId === null)
    .reverse()
    .map((q) => ({
      ...shape(q),
      answeredAt: q.answeredAt ? String(q.answeredAt) : null,
      lesson: q.lessonTitle ? { id: q.lessonId, title: q.lessonTitle } : null,
      /** How many answers go with it if it is withdrawn. */
      replyCount: replyCount.get(q.id) ?? 0,
      // Replies stay oldest first; a conversation reads downwards.
      replies: rows.filter((r) => r.parentId === q.id).map(shape),
    }))
}

/**
 * Refuses a post that comes too soon after the last one.
 *
 * Counted from the member's own last post anywhere, not per lesson: somebody
 * posting the same thing under twenty lessons is exactly the behaviour this is
 * for. The message says how long is left, because "try again later" with no
 * number is the most annoying refusal there is.
 *
 * Teachers are exempt. A teacher working through the queue answers several
 * questions in a row, and that is the job.
 */
async function checkCooldown(userId: number, kind: keyof typeof COOLDOWN, courseId: number) {
  if (await teachesCourse(userId, courseId)) return

  const seconds = COOLDOWN[kind]
  const [recent] = await db
    .select({
      // Measured by the database against its own clock. Reading the timestamp
      // back into JavaScript and subtracting means comparing two clocks in two
      // timezones, which is how "wait 10 minutes" came out as eleven.
      elapsed: sql<number>`TIMESTAMPDIFF(SECOND, ${lessonQuestions.createdAt}, NOW())`,
    })
    .from(lessonQuestions)
    .where(
      and(
        eq(lessonQuestions.userId, userId),
        sql`${lessonQuestions.createdAt} > DATE_SUB(NOW(), INTERVAL ${seconds} SECOND)`,
      ),
    )
    .orderBy(sql`${lessonQuestions.createdAt} DESC`)
    .limit(1)

  if (!recent) return

  const left = Math.max(1, seconds - Number(recent.elapsed))

  /**
   * Its own code, so the page can say this in the reader's language with the
   * number in the right place. Every other message in this API is English for
   * developers; this one is read by a student mid-sentence, and an English
   * sentence under a Thai form is the API talking past them.
   *
   * The English text stays as the fallback for anything that does not know the
   * code. The number is seconds.
   */
  throw new AppError(422, 'qa_cooldown', `Give that ${left} more seconds.`, {
    body: `${left}`,
  })
}

export async function ask(userId: number, lessonId: number, body: string) {
  const lesson = await lessonOf(lessonId)
  await requireAccess(userId, lesson.courseId)
  await checkCooldown(userId, 'question', lesson.courseId)

  const [res] = await db.insert(lessonQuestions).values({
    lessonId,
    courseId: lesson.courseId,
    userId,
    parentId: null,
    body,
    isInstructor: await teachesCourse(userId, lesson.courseId),
  })
  return { id: Number(res.insertId), courseId: lesson.courseId }
}

export async function reply(userId: number, questionId: number, body: string) {
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

  await requireAccess(userId, question.courseId)
  await checkCooldown(userId, 'reply', question.courseId)

  const asInstructor = await teachesCourse(userId, question.courseId)

  const [res] = await db.insert(lessonQuestions).values({
    lessonId: question.lessonId,
    courseId: question.courseId,
    userId,
    parentId: questionId,
    body,
    isInstructor: asInstructor,
  })

  // Only a teacher's reply closes it. A classmate's answer is welcome and often
  // right, but the queue in the admin is a list of what the school still owes
  // an answer to — and a student saying "I think it's this" does not settle it.
  if (asInstructor) {
    await db
      .update(lessonQuestions)
      .set({ answeredAt: new Date() })
      .where(eq(lessonQuestions.id, questionId))
  }

  return { id: Number(res.insertId), answered: asInstructor }
}

/**
 * Rewords one's own post.
 *
 * Allowed even once somebody has answered. The earlier rule froze a question
 * the moment a reply landed, which meant a typo in the first line of a thread
 * was permanent — and the author is the one person who can fix it.
 */
export async function edit(userId: number, postId: number, body: string) {
  const [post] = await db
    .select({
      id: lessonQuestions.id,
      userId: lessonQuestions.userId,
      parentId: lessonQuestions.parentId,
      courseId: lessonQuestions.courseId,
    })
    .from(lessonQuestions)
    .where(eq(lessonQuestions.id, postId))
    .limit(1)
  if (!post) throw notFound('That post does not exist.')
  if (post.userId !== userId) throw forbidden('That is not yours to edit.')

  await requireAccess(userId, post.courseId)
  await db.update(lessonQuestions).set({ body }).where(eq(lessonQuestions.id, postId))
  return { id: postId, body }
}

/**
 * Takes back one's own post.
 *
 * Only the author. A question's answers go with it — the foreign key cascades —
 * which is why the page says how many before asking. Freezing the question
 * instead, as this used to, left people unable to withdraw something they
 * regretted writing.
 *
 * An administrator can remove anything; that is moderation, and it lives on the
 * admin's own route where it is audited.
 */
export async function remove(userId: number, postId: number) {
  const [post] = await db
    .select({
      id: lessonQuestions.id,
      userId: lessonQuestions.userId,
      parentId: lessonQuestions.parentId,
      courseId: lessonQuestions.courseId,
    })
    .from(lessonQuestions)
    .where(eq(lessonQuestions.id, postId))
    .limit(1)
  if (!post) throw notFound('That post does not exist.')
  if (post.userId !== userId) throw forbidden('That is not yours to delete.')

  await db.delete(lessonQuestions).where(eq(lessonQuestions.id, postId))

  // A thread whose only instructor reply has just gone is owed an answer again.
  if (post.parentId) {
    const [stillAnswered] = await db
      .select({ id: lessonQuestions.id })
      .from(lessonQuestions)
      .where(
        and(eq(lessonQuestions.parentId, post.parentId), eq(lessonQuestions.isInstructor, true)),
      )
      .limit(1)
    if (!stillAnswered) {
      await db
        .update(lessonQuestions)
        .set({ answeredAt: null })
        .where(eq(lessonQuestions.id, post.parentId))
    }
  }

  return post
}
