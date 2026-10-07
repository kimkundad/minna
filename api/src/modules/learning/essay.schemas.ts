import { z } from 'zod'

/**
 * Marking written answers.
 *
 * A verdict always carries a comment, in both outcomes. "Passed" with no words
 * teaches nothing, and "needs work" with no words is worse — the learner has to
 * guess what to change, and will guess wrong.
 */

export const queueQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  /** 'todo' is pending and resubmitted together: the two states that need
   *  someone. It is what a marker opens the screen for. */
  status: z.enum(['todo', 'pending', 'resubmitted', 'revision', 'passed']).default('todo'),
  courseId: z.coerce.number().int().positive().optional(),
  q: z.string().max(200).optional(),
})

export const reviewBody = z.object({
  result: z.enum(['passed', 'revision']),
  comment: z
    .string()
    .min(1, 'Say why. A verdict with no reason helps nobody.')
    .max(2000, 'Keep it under 2,000 characters.'),
  /** A marked-up file, stored by path like everything else. */
  attachmentPath: z.string().max(512).nullable().optional(),
})
