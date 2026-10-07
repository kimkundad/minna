import { z } from 'zod'
import { QUESTION_TYPES } from '../../db/schema/quiz'

/**
 * Quiz authoring.
 *
 * A course has at most one quiz, which the unique index enforces, so there is
 * no quiz id in any path: it is always "this course's quiz".
 */

export const quizBody = z.object({
  title: z.string().min(1, 'A title is required.').max(255),
  /** The share of the choice questions that must be right. */
  passPct: z.coerce.number().int().min(1).max(100).default(80),
  /** Null is untimed. The clock keeps running while the tab is closed, which
   *  is why this is a blunt instrument and optional. */
  timerMinutes: z.coerce.number().int().min(1).max(600).nullable().optional(),
  /** The lesson of type `quiz` this sits behind, so it counts toward progress. */
  lessonId: z.coerce.number().int().positive().nullable().optional(),
})

const choice = z.object({
  text: z.string().min(1, 'A choice cannot be empty.').max(500),
  isCorrect: z.boolean().default(false),
})

/**
 * A question and its choices together.
 *
 * They are saved as one thing because neither means anything alone: a question
 * with no choices cannot be answered, and a choice with no question cannot be
 * shown. The choices replace whatever was there, the same way a course's
 * instructors do.
 */
export const questionBody = z
  .object({
    type: z.enum(QUESTION_TYPES),
    text: z.string().min(1, 'Ask something.').max(5000),
    /** Essay only: how long an answer may be. */
    maxLength: z.coerce.number().int().min(50).max(20000).default(1000),
    /** Essay only: whether a file may be attached to the answer. */
    attachmentAllowed: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).default(0),
    choices: z.array(choice).max(10).default([]),
  })
  // Each type has a shape that makes it answerable, and a question saved
  // without it is one a learner meets and cannot complete.
  .superRefine((v, ctx) => {
    if (v.type === 'essay') {
      if (v.choices.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['choices'],
          message: 'An essay question has no choices.',
        })
      }
      return
    }

    if (v.choices.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['choices'],
        message: 'Give at least two choices.',
      })
      return
    }

    const correct = v.choices.filter((c) => c.isCorrect).length
    if (v.type === 'single' && correct !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['choices'],
        message: 'Mark exactly one choice as correct.',
      })
    }
    if (v.type === 'multiple' && correct < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['choices'],
        message: 'Mark at least one choice as correct.',
      })
    }
  })

export const reorderQuestionsBody = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(300),
})
