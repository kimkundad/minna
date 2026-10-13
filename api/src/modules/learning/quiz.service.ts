import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  courseInstructors,
  courses,
  essayReviews,
  essaySubmissions,
  essayVersions,
  quizAttemptAnswers,
  quizAttempts,
  quizChoices,
  quizQuestions,
  quizzes,
  users,
} from '../../db/schema/index'
import { env } from '../../config/env'
import { essayWaitingMail } from '../../lib/email-templates'
import { conflict, notFound, validationFailed } from '../../lib/errors'
import { signedUrl } from '../../lib/storage'
import { notify } from '../people/notify.service'
import { requireAccess } from './study.service'

/**
 * Taking the course's test, and reading the result.
 *
 * Two tracks in one quiz, and they are scored differently on purpose. The
 * choice questions are marked by the server the moment they are submitted; the
 * essay questions are read by a teacher, which takes days. A learner can pass
 * the first and still be waiting on the second, so "completed" is both.
 *
 * The one rule that shapes everything here: **no answer key ever leaves this
 * server**. Not `isCorrect` on a choice, not which option was right on a
 * question the learner got wrong, not before the attempt and not after it. A
 * score is a number and a pass is a verdict; a key is the test itself, and an
 * unlimited-retake quiz whose key can be read is not a test at all.
 */

/** Signed media inside a question — a diagram, a passage, a photograph. */
const IMAGE_TTL = 4 * 3600

export interface TakeableChoice {
  id: number
  text: string
}

export interface TakeableQuestion {
  id: number
  type: 'single' | 'multiple' | 'essay'
  text: string
  imageUrl: string | null
  /** Essay only. */
  maxLength: number
  attachmentAllowed: boolean
  choices: TakeableChoice[]
}

/**
 * The quiz as a learner may see it.
 *
 * Choices come without `isCorrect`, and in their stored order — shuffling them
 * per attempt would make "the second one" mean something different each time a
 * student discusses the test with a classmate, which is a cost paid for very
 * little.
 */
export async function takeable(userId: number, courseId: number) {
  await requireAccess(userId, courseId)

  const [quiz] = await db
    .select({
      id: quizzes.id,
      courseId: quizzes.courseId,
      lessonId: quizzes.lessonId,
      title: quizzes.title,
      imagePath: quizzes.imagePath,
      passPct: quizzes.passPct,
      timerMinutes: quizzes.timerMinutes,
    })
    .from(quizzes)
    .where(eq(quizzes.courseId, courseId))
    .limit(1)
  if (!quiz) throw notFound('This course has no test.')

  const questionRows = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.sortOrder), asc(quizQuestions.id))

  const choiceRows = questionRows.length
    ? await db
        .select({
          id: quizChoices.id,
          questionId: quizChoices.questionId,
          text: quizChoices.text,
        })
        .from(quizChoices)
        .where(
          inArray(
            quizChoices.questionId,
            questionRows.map((q) => q.id),
          ),
        )
        .orderBy(asc(quizChoices.sortOrder), asc(quizChoices.id))
    : []

  const questions: TakeableQuestion[] = questionRows.map((q) => ({
    id: q.id,
    type: q.type,
    text: q.text,
    imageUrl: q.imagePath ? signedUrl(q.imagePath, IMAGE_TTL) : null,
    maxLength: q.maxLength,
    attachmentAllowed: q.attachmentAllowed,
    choices: choiceRows.filter((c) => c.questionId === q.id).map((c) => ({ id: c.id, text: c.text })),
  }))

  return {
    quiz: {
      id: quiz.id,
      courseId: quiz.courseId,
      lessonId: quiz.lessonId,
      title: quiz.title,
      imageUrl: quiz.imagePath ? signedUrl(quiz.imagePath, IMAGE_TTL) : null,
      passPct: quiz.passPct,
      timerMinutes: quiz.timerMinutes,
      choiceCount: questions.filter((q) => q.type !== 'essay').length,
      essayCount: questions.filter((q) => q.type === 'essay').length,
    },
    questions,
  }
}

async function quizOf(courseId: number) {
  const [quiz] = await db
    .select({
      id: quizzes.id,
      passPct: quizzes.passPct,
      timerMinutes: quizzes.timerMinutes,
      lessonId: quizzes.lessonId,
    })
    .from(quizzes)
    .where(eq(quizzes.courseId, courseId))
    .limit(1)
  if (!quiz) throw notFound('This course has no test.')
  return quiz
}

/**
 * The attempt in progress, or a new one.
 *
 * Unlimited retakes, so "start" means "carry on with the unsubmitted one if
 * there is one". Coming back to a half-finished paper and finding it blank
 * because the tab was closed is the thing the draft exists to prevent.
 */
export async function startAttempt(userId: number, courseId: number) {
  await requireAccess(userId, courseId)
  const quiz = await quizOf(courseId)

  const [open] = await db
    .select()
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.quizId, quiz.id),
        eq(quizAttempts.userId, userId),
        sql`${quizAttempts.submittedAt} IS NULL`,
      ),
    )
    .orderBy(desc(quizAttempts.attemptNo))
    .limit(1)

  if (open) {
    return {
      attemptId: open.id,
      attemptNo: open.attemptNo,
      startedAt: String(open.startedAt),
      draft: open.draft ?? {},
      resumed: true,
    }
  }

  const [{ last } = { last: 0 }] = await db
    .select({ last: sql<number>`COALESCE(MAX(${quizAttempts.attemptNo}), 0)` })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.userId, userId)))

  const attemptNo = Number(last) + 1

  try {
    const [res] = await db.insert(quizAttempts).values({
      quizId: quiz.id,
      userId,
      attemptNo,
      draft: {},
    })
    return {
      attemptId: Number(res.insertId),
      attemptNo,
      startedAt: new Date().toISOString(),
      draft: {} as Record<string, number[]>,
      resumed: false,
    }
  } catch {
    /**
     * Two requests asked at once and both read the same last number — the page
     * does ask twice, once when the paper arrives and once when the reader
     * presses start. The unique index is what stops the second becoming a
     * duplicate attempt; this is what turns that into the right answer rather
     * than a five hundred.
     */
    const [raced] = await db
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quiz.id),
          eq(quizAttempts.userId, userId),
          sql`${quizAttempts.submittedAt} IS NULL`,
        ),
      )
      .orderBy(desc(quizAttempts.attemptNo))
      .limit(1)
    if (!raced) throw conflict('Could not start an attempt. Try again.')

    return {
      attemptId: raced.id,
      attemptNo: raced.attemptNo,
      startedAt: String(raced.startedAt),
      draft: raced.draft ?? {},
      resumed: true,
    }
  }
}

async function ownAttempt(userId: number, attemptId: number) {
  const [attempt] = await db
    .select({
      id: quizAttempts.id,
      quizId: quizAttempts.quizId,
      userId: quizAttempts.userId,
      attemptNo: quizAttempts.attemptNo,
      submittedAt: quizAttempts.submittedAt,
      startedAt: quizAttempts.startedAt,
      draft: quizAttempts.draft,
      courseId: quizzes.courseId,
      passPct: quizzes.passPct,
      timerMinutes: quizzes.timerMinutes,
      lessonId: quizzes.lessonId,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(eq(quizAttempts.id, attemptId))
    .limit(1)

  if (!attempt || attempt.userId !== userId) throw notFound('No such attempt.')
  await requireAccess(userId, attempt.courseId)
  return attempt
}

/** Autosaved as the learner works. Cheap, idempotent, and never scored. */
export async function saveDraft(
  userId: number,
  attemptId: number,
  draft: Record<string, number[]>,
) {
  const attempt = await ownAttempt(userId, attemptId)
  if (attempt.submittedAt) throw conflict('That attempt has already been submitted.')

  await db.update(quizAttempts).set({ draft }).where(eq(quizAttempts.id, attemptId))
  return { attemptId, saved: Object.keys(draft).length }
}

/**
 * Marks the choice questions and closes the attempt.
 *
 * Marked here, against the stored choices, because the browser does not know
 * which answers are right and must never be told. The result it gets back is a
 * score and a verdict — not which questions were wrong, which would be the key
 * handed over one attempt at a time.
 */
export async function submitAttempt(
  userId: number,
  attemptId: number,
  answers: Record<string, number[]>,
) {
  const attempt = await ownAttempt(userId, attemptId)
  if (attempt.submittedAt) throw conflict('That attempt has already been submitted.')

  const questionRows = await db
    .select({ id: quizQuestions.id, type: quizQuestions.type })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, attempt.quizId))
  const choiceQuestions = questionRows.filter((q) => q.type !== 'essay')

  if (!choiceQuestions.length) {
    throw conflict('This test has no questions to mark.')
  }

  const unanswered = choiceQuestions.filter((q) => !(answers[String(q.id)] ?? []).length)
  if (unanswered.length) {
    throw validationFailed({
      answers: `Answer every question first — ${unanswered.length} still blank.`,
    })
  }

  const correctRows = await db
    .select({ id: quizChoices.id, questionId: quizChoices.questionId, isCorrect: quizChoices.isCorrect })
    .from(quizChoices)
    .where(
      inArray(
        quizChoices.questionId,
        choiceQuestions.map((q) => q.id),
      ),
    )

  let right = 0
  const rows: { questionId: number; selected: number[]; isCorrect: boolean }[] = []

  for (const question of choiceQuestions) {
    const picked = [...new Set(answers[String(question.id)] ?? [])].sort((a, b) => a - b)
    const forThis = correctRows.filter((c) => c.questionId === question.id)
    const wanted = forThis
      .filter((c) => c.isCorrect)
      .map((c) => c.id)
      .sort((a, b) => a - b)

    // Anything not on this question is not an answer to it: a client sending
    // another question's choice ids must not be able to score with them.
    const valid = picked.filter((id) => forThis.some((c) => c.id === id))
    // All of the right ones and none of the wrong ones, for both kinds. A
    // multiple-choice question half answered is not half right.
    const isCorrect =
      wanted.length > 0 && valid.length === wanted.length && valid.every((id, i) => id === wanted[i])

    if (isCorrect) right += 1
    rows.push({ questionId: question.id, selected: valid, isCorrect })
  }

  const scorePct = Math.round((right / choiceQuestions.length) * 100)
  const passed = scorePct >= attempt.passPct

  await db
    .update(quizAttempts)
    .set({ scorePct, passed, submittedAt: new Date(), draft: {} })
    .where(eq(quizAttempts.id, attemptId))

  // Replaced rather than appended: an attempt has one set of answers, and
  // re-submitting the same attempt is refused above anyway.
  await db.delete(quizAttemptAnswers).where(eq(quizAttemptAnswers.attemptId, attemptId))
  await db.insert(quizAttemptAnswers).values(
    rows.map((r) => ({
      attemptId,
      questionId: r.questionId,
      selectedChoiceIds: r.selected,
      isCorrect: r.isCorrect,
    })),
  )

  return {
    attemptId,
    attemptNo: attempt.attemptNo,
    scorePct,
    passed,
    passPct: attempt.passPct,
    answered: choiceQuestions.length,
    correct: right,
  }
}

/* ---------------- the written answers ---------------- */

/**
 * Sends an essay answer, or a revised one.
 *
 * One submission per question per learner, with every draft kept as a version:
 * the teacher's comments refer to a particular draft, and a history that
 * overwrote itself would leave those comments pointing at text that no longer
 * exists.
 */
export async function submitEssay(
  userId: number,
  questionId: number,
  input: { body: string; attachmentPath?: string | null; attachmentName?: string | null; sizeBytes?: number | null },
) {
  const [question] = await db
    .select({
      id: quizQuestions.id,
      quizId: quizQuestions.quizId,
      type: quizQuestions.type,
      maxLength: quizQuestions.maxLength,
      courseId: quizzes.courseId,
    })
    .from(quizQuestions)
    .innerJoin(quizzes, eq(quizzes.id, quizQuestions.quizId))
    .where(eq(quizQuestions.id, questionId))
    .limit(1)
  if (!question) throw notFound('No such question.')
  if (question.type !== 'essay') throw conflict('That question is not a written one.')

  await requireAccess(userId, question.courseId)

  const body = input.body.trim()
  if (!body) throw validationFailed({ body: 'Write an answer first.' })
  if (body.length > question.maxLength) {
    throw validationFailed({
      body: `That is longer than the ${question.maxLength} characters allowed.`,
    })
  }

  const [existing] = await db
    .select()
    .from(essaySubmissions)
    .where(and(eq(essaySubmissions.questionId, questionId), eq(essaySubmissions.userId, userId)))
    .limit(1)

  if (!existing) {
    const [res] = await db.insert(essaySubmissions).values({
      quizId: question.quizId,
      questionId,
      userId,
      status: 'pending',
      currentVersion: 1,
    })
    const submissionId = Number(res.insertId)
    await db.insert(essayVersions).values({
      submissionId,
      version: 1,
      body,
      attachmentPath: input.attachmentPath ?? null,
      attachmentName: input.attachmentName ?? null,
      sizeBytes: input.sizeBytes ?? null,
    })
    await announceEssay({ submissionId, version: 1, courseId: question.courseId, learnerId: userId })
    return { submissionId, version: 1, status: 'pending' as const }
  }

  if (existing.status === 'passed') {
    throw conflict('That answer has already been passed.')
  }
  if (existing.status === 'pending' || existing.status === 'resubmitted') {
    throw conflict('That answer is with the teacher. Wait for the reply before sending another.')
  }

  // Only after a teacher has asked for a revision.
  const version = existing.currentVersion + 1
  await db.insert(essayVersions).values({
    submissionId: existing.id,
    version,
    body,
    attachmentPath: input.attachmentPath ?? null,
    attachmentName: input.attachmentName ?? null,
    sizeBytes: input.sizeBytes ?? null,
  })
  await db
    .update(essaySubmissions)
    .set({ status: 'resubmitted', currentVersion: version, submittedAt: new Date() })
    .where(eq(essaySubmissions.id, existing.id))

  await announceEssay({ submissionId: existing.id, version, courseId: question.courseId, learnerId: userId })
  return { submissionId: existing.id, version, status: 'resubmitted' as const }
}

/**
 * Tells the teachers of a course that a written answer is waiting.
 *
 * Every submission, not only the first: a redraft is work arriving again, and
 * a teacher who was told once a week ago has no way of knowing it came back.
 * The notification is keyed on the version, so a retry tells nobody twice.
 *
 * Never throws. A learner's answer is saved whether or not anybody could be
 * told about it.
 */
async function announceEssay(opts: {
  submissionId: number
  version: number
  courseId: number
  learnerId: number
}): Promise<void> {
  const [learner] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, opts.learnerId))
    .limit(1)
  const [course] = await db
    .select({ title: courses.title })
    .from(courses)
    .where(eq(courses.id, opts.courseId))
    .limit(1)

  const teachers = await db
    .select({
      userId: courseInstructors.userId,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(courseInstructors)
    .innerJoin(users, eq(users.id, courseInstructors.userId))
    .where(eq(courseInstructors.courseId, opts.courseId))

  const learnerName = `${learner?.firstName ?? ''} ${learner?.lastName ?? ''}`.trim() || 'ผู้เรียน'
  const courseTitle = course?.title ?? 'คอร์ส'

  for (const teacher of teachers) {
    // How many are on their desk right now, so the mail can say whether this
    // is one thing or a queue.
    const [waiting] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(essaySubmissions)
      .innerJoin(quizzes, eq(quizzes.id, essaySubmissions.quizId))
      .innerJoin(courseInstructors, eq(courseInstructors.courseId, quizzes.courseId))
      .where(
        and(
          eq(courseInstructors.userId, teacher.userId),
          inArray(essaySubmissions.status, ['pending', 'resubmitted']),
        ),
      )

    await notify({
      userId: teacher.userId,
      type: 'essay.submitted',
      surface: 'admin',
      title: 'มีข้อเขียนรอตรวจ',
      body: `${learnerName} · ${courseTitle}`,
      link: '/essay-review',
      // Per version, so a redraft is announced again but a retry is not.
      subject: { type: 'essay_version', id: opts.submissionId * 1000 + opts.version },
      mail: essayWaitingMail({
        teacherName: `${teacher.firstName} ${teacher.lastName}`.trim(),
        learnerName,
        courseTitle,
        url: `${env.ADMIN_URL}/essay-review`,
        waiting: Number(waiting?.n ?? 1),
      }),
    })
  }
}


/* ---------------- the result ---------------- */

export interface QuizResult {
  quiz: { id: number; title: string; passPct: number; choiceCount: number; essayCount: number }
  /** The most recent submitted attempt, or null before the first. */
  latest: {
    attemptId: number
    attemptNo: number
    scorePct: number
    passed: boolean
    submittedAt: string
  } | null
  /** The best score reached, which is what a certificate would be cut from. */
  bestPct: number | null
  attempts: { attemptNo: number; scorePct: number; passed: boolean; submittedAt: string }[]
  essays: {
    questionId: number
    questionText: string
    status: string
    version: number
    submittedAt: string
    body: string
    attachment: { name: string | null; url: string | null } | null
    reviews: {
      version: number
      result: 'passed' | 'revision'
      comment: string
      reviewer: string | null
      reviewedAt: string
      attachmentUrl: string | null
    }[]
  }[]
  /** Both tracks done: the choices passed, and nothing written still waiting. */
  completed: boolean
}

export async function result(userId: number, courseId: number): Promise<QuizResult> {
  await requireAccess(userId, courseId)

  const [quiz] = await db
    .select({ id: quizzes.id, title: quizzes.title, passPct: quizzes.passPct })
    .from(quizzes)
    .where(eq(quizzes.courseId, courseId))
    .limit(1)
  if (!quiz) throw notFound('This course has no test.')

  const questionRows = await db
    .select({ id: quizQuestions.id, type: quizQuestions.type, text: quizQuestions.text })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.sortOrder), asc(quizQuestions.id))

  const submitted = await db
    .select({
      id: quizAttempts.id,
      attemptNo: quizAttempts.attemptNo,
      scorePct: quizAttempts.scorePct,
      passed: quizAttempts.passed,
      submittedAt: quizAttempts.submittedAt,
    })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.quizId, quiz.id),
        eq(quizAttempts.userId, userId),
        sql`${quizAttempts.submittedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(quizAttempts.attemptNo))

  const attempts = submitted.map((a) => ({
    attemptNo: a.attemptNo,
    scorePct: Number(a.scorePct ?? 0),
    passed: a.passed,
    submittedAt: String(a.submittedAt),
  }))

  const latest = submitted[0]
    ? {
        attemptId: submitted[0].id,
        attemptNo: submitted[0].attemptNo,
        scorePct: Number(submitted[0].scorePct ?? 0),
        passed: submitted[0].passed,
        submittedAt: String(submitted[0].submittedAt),
      }
    : null

  /* ---- the written answers, with what the teacher said ---- */

  const subs = await db
    .select({
      id: essaySubmissions.id,
      questionId: essaySubmissions.questionId,
      status: essaySubmissions.status,
      currentVersion: essaySubmissions.currentVersion,
      submittedAt: essaySubmissions.submittedAt,
    })
    .from(essaySubmissions)
    .where(and(eq(essaySubmissions.quizId, quiz.id), eq(essaySubmissions.userId, userId)))

  const versions = subs.length
    ? await db
        .select()
        .from(essayVersions)
        .where(
          inArray(
            essayVersions.submissionId,
            subs.map((s) => s.id),
          ),
        )
    : []

  const reviewRows = subs.length
    ? await db
        .select({
          submissionId: essayReviews.submissionId,
          version: essayReviews.version,
          result: essayReviews.result,
          comment: essayReviews.comment,
          reviewedAt: essayReviews.reviewedAt,
          attachmentPath: essayReviews.attachmentPath,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(essayReviews)
        .leftJoin(users, eq(users.id, essayReviews.reviewerId))
        .where(
          inArray(
            essayReviews.submissionId,
            subs.map((s) => s.id),
          ),
        )
        .orderBy(asc(essayReviews.version))
    : []

  const essays = subs.map((s) => {
    const current = versions.find((v) => v.submissionId === s.id && v.version === s.currentVersion)
    const question = questionRows.find((q) => q.id === s.questionId)
    return {
      questionId: s.questionId,
      questionText: question?.text ?? '',
      status: s.status,
      version: s.currentVersion,
      submittedAt: String(s.submittedAt),
      body: current?.body ?? '',
      attachment: current?.attachmentPath
        ? {
            name: current.attachmentName,
            url: signedUrl(current.attachmentPath, IMAGE_TTL),
          }
        : null,
      reviews: reviewRows
        .filter((r) => r.submissionId === s.id)
        .map((r) => ({
          version: r.version,
          result: r.result,
          comment: r.comment,
          reviewer: r.firstName ? `${r.firstName} ${r.lastName}`.trim() : null,
          reviewedAt: String(r.reviewedAt),
          attachmentUrl: r.attachmentPath ? signedUrl(r.attachmentPath, IMAGE_TTL) : null,
        })),
    }
  })

  const essayQuestions = questionRows.filter((q) => q.type === 'essay')
  const essaysSettled =
    essayQuestions.length === 0 ||
    essayQuestions.every((q) => essays.find((e) => e.questionId === q.id)?.status === 'passed')

  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      passPct: quiz.passPct,
      choiceCount: questionRows.filter((q) => q.type !== 'essay').length,
      essayCount: essayQuestions.length,
    },
    latest,
    bestPct: attempts.length ? Math.max(...attempts.map((a) => a.scorePct)) : null,
    attempts,
    essays,
    completed: Boolean(latest?.passed) && essaysSettled,
  }
}
