import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, diff } from '../../lib/audit'
import * as service from './member-detail.service'

/**
 * The tabs on a member's page.
 *
 * One endpoint per tab, because they are opened one at a time and most support
 * calls never leave the first — loading somebody's whole learning history to
 * answer "what is their email" is work nobody asked for.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })

const billingBody = z.object({
  type: z.enum(['corporate', 'individual']),
  name: z.string().trim().min(1).max(255),
  taxId: z.string().trim().min(13).max(20),
  branchType: z.enum(['head', 'branch']).nullish(),
  branchCode: z.string().trim().max(10).nullish(),
  address: z.string().trim().min(1).max(1000),
})

export default async function memberDetailRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }
  const superOnly = { preHandler: app.requireRole('superadmin') }

  app.get('/members/:id/summary', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.summary(id) }
  })

  app.get('/members/:id/courses', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.courseAccess(id) }
  })

  app.get('/members/:id/learning', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.learning(id) }
  })

  app.get('/members/:id/payments', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.payments(id) }
  })

  app.get('/members/:id/billing', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.billing(id) }
  })

  app.put('/members/:id/billing', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = billingBody.parse(req.body)
    const { before, after } = await service.saveBilling(id, body)

    audit(req, {
      action: before ? 'member.billing_updated' : 'member.billing_added',
      subjectType: 'user',
      subjectId: id,
      summary: after?.name,
      changes: before && after ? diff(before, after) : null,
    })
    return { data: after }
  })

  app.delete('/members/:id/billing', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const before = await service.clearBilling(id)

    audit(req, {
      action: 'member.billing_removed',
      subjectType: 'user',
      subjectId: id,
      summary: before.name,
    })
    return reply.status(204).send()
  })

  /**
   * Ends or restores access to one course by hand.
   *
   * Superadmin, because it takes away something somebody paid for without
   * giving their money back — which is a decision, not an edit.
   */
  app.post('/members/:id/entitlements/:entitlementId/toggle', superOnly, async (req) => {
    const { id, entitlementId } = z
      .object({
        id: z.coerce.number().int().positive(),
        entitlementId: z.coerce.number().int().positive(),
      })
      .parse(req.params)

    const result = await service.revokeAccess(id, entitlementId)

    audit(req, {
      action: result.now === 'revoked' ? 'entitlement.revoked' : 'entitlement.restored',
      subjectType: 'user',
      subjectId: id,
      summary: result.courseTitle,
      changes: { status: [result.was, result.now] },
    })
    return { data: result }
  })
}
