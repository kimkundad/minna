import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit } from '../../lib/audit'
import * as service from './insights.service'
import { queryBool } from '../../lib/query'

/**
 * Quiz results, who can open what, and lesson questions.
 *
 * Teachers see their own courses throughout; staff see everything. The split is
 * made here rather than in the service so the rule is visible at the route.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })
const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
})

export default async function insightsRoutes(app: FastifyInstance) {
  const staffOnly = { preHandler: app.requireRole('admin', 'teacher') }
  const adminOnly = { preHandler: app.requireRole('admin') }

  /** A teacher sees their own courses; an admin sees all of them. */
  const teacherScope = (req: { user: { roles: string[]; sub: number } }) =>
    req.user.roles.includes('admin') || req.user.roles.includes('superadmin')
      ? undefined
      : req.user.sub

  /* ---------------- quiz results ---------------- */

  app.get('/quiz-results', staffOnly, async (req) => {
    return { data: await service.quizResultsOverview({ teacherId: teacherScope(req) }) }
  })

  app.get('/quiz-results/:id', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.quizResults(id) }
  })

  /* ---------------- who can open what ---------------- */

  app.get('/entitlements', adminOnly, async (req) => {
    const query = paging
      .extend({
        courseId: z.coerce.number().int().positive().optional(),
        status: z.enum(['active', 'revoked', 'expired']).optional(),
        q: z.string().max(100).optional(),
      })
      .parse(req.query)
    return service.accessList(query)
  })

  app.get('/entitlements/by-course', adminOnly, async () => {
    return { data: await service.accessByCourse() }
  })

  /* ---------------- lesson questions ---------------- */

  app.get('/lesson-questions', staffOnly, async (req) => {
    const query = paging
      .extend({
        unansweredOnly: queryBool,
        courseId: z.coerce.number().int().positive().optional(),
        q: z.string().max(100).optional(),
      })
      .parse(req.query)
    return service.lessonQuestionList({ ...query, teacherId: teacherScope(req) })
  })

  app.post('/lesson-questions/:id/answer', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const { body } = z
      .object({ body: z.string().trim().min(1, 'Write an answer.').max(5000) })
      .parse(req.body)

    // Marked as from an instructor when it is: the public page styles those
    // differently, and a staff answer carries weight a student's does not.
    const result = await service.answerLessonQuestion(id, req.user.sub, body, true)

    audit(req, {
      action: 'lesson_question.answered',
      subjectType: 'lesson_question',
      subjectId: id,
      summary: body.slice(0, 120),
    })
    return reply.status(201).send({ data: result })
  })

  app.delete('/lesson-questions/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const row = await service.deleteLessonQuestion(id)

    audit(req, {
      action: 'lesson_question.deleted',
      subjectType: 'lesson_question',
      subjectId: id,
      summary: row.body.slice(0, 120),
    })
    return reply.status(204).send()
  })
}
