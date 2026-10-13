import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { audit } from '../../lib/audit'
import { forbidden } from '../../lib/errors'
import { env } from '../../config/env'
import { essayReviewedMail } from '../../lib/email-templates'
import { sendMail } from '../../lib/mailer'
import * as schemas from './essay.schemas'
import * as service from './essay.service'

/**
 * Marking written answers.
 *
 * Admins see every submission; a teacher sees only the courses they are on,
 * decided from the token rather than from anything the request carries.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })

function isAdmin(req: FastifyRequest): boolean {
  const roles = req.user?.roles ?? []
  return roles.includes('admin') || roles.includes('superadmin')
}

export default async function essayRoutes(app: FastifyInstance) {
  const staffOnly = { preHandler: app.requireRole('admin', 'teacher') }

  app.get('/essay-reviews', staffOnly, async (req) => {
    const query = schemas.queueQuery.parse(req.query)
    return service.listQueue({
      ...query,
      instructorId: isAdmin(req) ? undefined : req.user.sub,
    })
  })

  /** For the badge on the menu, so nobody has to open the queue to see it. */
  app.get('/essay-reviews/waiting', staffOnly, async (req) => ({
    waiting: await service.countWaiting(isAdmin(req) ? undefined : req.user.sub),
  }))

  app.get('/essay-reviews/:id', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    if (!isAdmin(req) && !(await service.mayReview(id, req.user.sub))) {
      throw forbidden('You do not teach that course.')
    }
    return { data: await service.getSubmission(id) }
  })

  app.post('/essay-reviews/:id', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    if (!isAdmin(req) && !(await service.mayReview(id, req.user.sub))) {
      throw forbidden('You do not teach that course.')
    }

    const body = schemas.reviewBody.parse(req.body)
    const after = await service.review(id, body, req.user.sub)

    // A verdict nobody is told about is a learner waiting for nothing.
    const passed = body.result === 'passed'
    void sendMail(
      {
        ...essayReviewedMail({
          learnerName: after.learnerName,
          courseTitle: after.courseTitle,
          passed,
          comment: body.comment,
          url: `${env.APP_URL}/${after.learnerLocale ?? 'th'}/result/${after.courseSlug ?? after.courseId}`,
        }),
        to: after.learnerEmail,
      },
      req.log,
    )

    audit(req, {
      action: passed ? 'essay.passed' : 'essay.returned',
      subjectType: 'essay_submission',
      subjectId: id,
      summary: `${after.learnerEmail} — ${after.courseTitle} (draft ${after.currentVersion})`,
    })

    return { data: after }
  })
}
