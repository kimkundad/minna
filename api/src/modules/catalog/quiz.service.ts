import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { lessons, quizChoices, quizQuestions, quizzes } from '../../db/schema/index'
import { conflict, notFound } from '../../lib/errors'

/**
 * Quiz authoring.
 *
 * Everything here is staff-facing, which is why `isCorrect` appears in what it
 * returns. Nothing in this file may be reused for a learner: the rule the
 * design sets is that no answer key and no per-question right-or-wrong ever
 * reaches them, and a shared read is how that leaks.
 */

export interface QuizDetail {
  id: number
  courseId: number
  lessonId: number | null
  title: string
  passPct: number
  timerMinutes: number | null
  questions: {
    id: number
    type: 'single' | 'multiple' | 'essay'
    text: string
    maxLength: number
    attachmentAllowed: boolean
    sortOrder: number
    choices: { id: number; text: string; isCorrect: boolean; sortOrder: number }[]
  }[]
}

export async function getQuiz(courseId: number): Promise<QuizDetail | null> {
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.courseId, courseId)).limit(1)
  if (!quiz) return null

  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.sortOrder), asc(quizQuestions.id))

  // Scoped to this quiz's questions. Without the `where` this reads every
  // choice in the database and hands the answer key to the wrong quiz.
  const choices = questions.length
    ? await db
        .select()
        .from(quizChoices)
        .where(inArray(quizChoices.questionId, questions.map((q) => q.id)))
        .orderBy(asc(quizChoices.sortOrder), asc(quizChoices.id))
    : []

  return {
    id: quiz.id,
    courseId: quiz.courseId,
    lessonId: quiz.lessonId,
    title: quiz.title,
    passPct: quiz.passPct,
    timerMinutes: quiz.timerMinutes,
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      maxLength: q.maxLength,
      attachmentAllowed: q.attachmentAllowed,
      sortOrder: q.sortOrder,
      choices: choices
        .filter((c) => c.questionId === q.id)
        .map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect, sortOrder: c.sortOrder })),
    })),
  }
}

async function assertLessonBelongs(courseId: number, lessonId: number | null | undefined) {
  if (!lessonId) return
  const [lesson] = await db
    .select({ id: lessons.id, type: lessons.type })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
    .limit(1)
  if (!lesson) throw notFound('That lesson is not on this course.')
  // Attaching a quiz to a video would make a lesson nobody can complete.
  if (lesson.type !== 'quiz') {
    throw conflict('A quiz can only sit behind a lesson of type "quiz".', {
      lessonId: 'Pick a quiz lesson.',
    })
  }
}

/** Creates the course's quiz, or updates the one it already has. */
export async function saveQuiz(
  courseId: number,
  input: {
    title: string
    passPct: number
    timerMinutes?: number | null | undefined
    lessonId?: number | null | undefined
  },
) {
  await assertLessonBelongs(courseId, input.lessonId)

  const existing = await db.select().from(quizzes).where(eq(quizzes.courseId, courseId)).limit(1)

  if (existing.length) {
    await db
      .update(quizzes)
      .set({
        title: input.title,
        passPct: input.passPct,
        timerMinutes: input.timerMinutes ?? null,
        lessonId: input.lessonId ?? null,
      })
      .where(eq(quizzes.courseId, courseId))
  } else {
    await db.insert(quizzes).values({
      courseId,
      title: input.title,
      passPct: input.passPct,
      timerMinutes: input.timerMinutes ?? null,
      lessonId: input.lessonId ?? null,
    })
  }

  return (await getQuiz(courseId))!
}

export async function deleteQuiz(courseId: number) {
  const quiz = await getQuiz(courseId)
  if (!quiz) throw notFound('This course has no quiz.')
  // Questions, choices, attempts and essay submissions all cascade from here.
  // That is why the admin asks twice before calling it.
  await db.delete(quizzes).where(eq(quizzes.id, quiz.id))
  return quiz
}

async function requireQuiz(courseId: number) {
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.courseId, courseId)).limit(1)
  if (!quiz) throw notFound('This course has no quiz yet.')
  return quiz
}

type QuestionInput = {
  type: 'single' | 'multiple' | 'essay'
  text: string
  maxLength: number
  attachmentAllowed: boolean
  sortOrder: number
  choices: { text: string; isCorrect: boolean }[]
}

/** The choices are rewritten wholesale: position in the array is their order. */
async function setChoices(questionId: number, choices: QuestionInput['choices']) {
  await db.delete(quizChoices).where(eq(quizChoices.questionId, questionId))
  if (!choices.length) return
  await db.insert(quizChoices).values(
    choices.map((c, i) => ({
      questionId,
      text: c.text,
      isCorrect: c.isCorrect,
      sortOrder: i,
    })),
  )
}

export async function createQuestion(courseId: number, input: QuestionInput) {
  const quiz = await requireQuiz(courseId)

  await db.insert(quizQuestions).values({
    quizId: quiz.id,
    type: input.type,
    text: input.text,
    maxLength: input.maxLength,
    attachmentAllowed: input.attachmentAllowed,
    sortOrder: input.sortOrder,
  })

  const [created] = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(desc(quizQuestions.id))
    .limit(1)
  if (!created) throw new Error('question row vanished right after insert')

  await setChoices(created.id, input.choices)
  return created
}

export async function updateQuestion(courseId: number, questionId: number, input: QuestionInput) {
  const quiz = await requireQuiz(courseId)

  const [before] = await db
    .select()
    .from(quizQuestions)
    .where(and(eq(quizQuestions.id, questionId), eq(quizQuestions.quizId, quiz.id)))
    .limit(1)
  if (!before) throw notFound('That question is not in this quiz.')

  await db
    .update(quizQuestions)
    .set({
      type: input.type,
      text: input.text,
      maxLength: input.maxLength,
      attachmentAllowed: input.attachmentAllowed,
      sortOrder: input.sortOrder,
    })
    .where(eq(quizQuestions.id, questionId))

  await setChoices(questionId, input.choices)

  const [after] = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.id, questionId))
    .limit(1)
  return { before, after: after! }
}

export async function deleteQuestion(courseId: number, questionId: number) {
  const quiz = await requireQuiz(courseId)
  const [row] = await db
    .select()
    .from(quizQuestions)
    .where(and(eq(quizQuestions.id, questionId), eq(quizQuestions.quizId, quiz.id)))
    .limit(1)
  if (!row) throw notFound('That question is not in this quiz.')

  await db.delete(quizQuestions).where(eq(quizQuestions.id, questionId))
  return row
}

export async function reorderQuestions(courseId: number, ids: number[]) {
  const quiz = await requireQuiz(courseId)
  for (const [index, id] of ids.entries()) {
    await db
      .update(quizQuestions)
      .set({ sortOrder: index })
      .where(and(eq(quizQuestions.id, id), eq(quizQuestions.quizId, quiz.id)))
  }
}
