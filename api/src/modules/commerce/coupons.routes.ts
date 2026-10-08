import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, diff } from '../../lib/audit'
import * as service from './coupons.service'

/**
 * Coupon administration.
 *
 * Admin only, and audited: a coupon is money, and "who made the one that gave
 * away ฿40,000" is a question that gets asked afterwards rather than before.
 */

/** An empty date box means "no limit", which is a null, not an invalid date. */
const nullableDate = z
  .union([z.string().datetime({ offset: true }), z.string().length(0), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null))

const nullableInt = z
  .union([z.coerce.number().int().min(0), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === 0 ? null : v))

const couponBody = z.object({
  // No spaces: a code is typed into a one-line box and pasted out of an email,
  // and a trailing space nobody can see is a support ticket.
  code: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dot, dash or underscore only.'),
  scope: z.enum(['course', 'order']),
  courseId: z
    .union([z.coerce.number().int().positive(), z.null()])
    .optional()
    .transform((v) => v ?? null),
  discountType: z.enum(['percent', 'fixed']),
  /** Whole percent, or satang for a fixed amount. */
  value: z.coerce.number().int().positive(),
  maxDiscount: nullableInt,
  minSubtotal: nullableInt,
  startsAt: nullableDate,
  expiresAt: nullableDate,
  usageLimit: nullableInt,
  active: z.boolean().default(true),
})

const idParam = z.object({ id: z.coerce.number().int().positive() })
const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
})

export default async function couponRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }

  app.get('/coupons', adminOnly, async (req) => {
    const query = paging
      .extend({
        scope: z.enum(['course', 'order']).optional(),
        status: z.enum(['live', 'scheduled', 'expired', 'used_up', 'off']).optional(),
        q: z.string().max(60).optional(),
      })
      .parse(req.query)
    return service.list(query)
  })

  app.get('/coupons/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.get(id) }
  })

  app.get('/coupons/:id/redemptions', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const query = paging.parse(req.query)
    return service.redemptions(id, query)
  })

  app.post('/coupons', adminOnly, async (req, reply) => {
    const body = couponBody.parse(req.body)
    const coupon = await service.create(body)

    audit(req, {
      action: 'coupon.created',
      subjectType: 'coupon',
      subjectId: coupon.id,
      summary: `${coupon.code} — ${
        coupon.discountType === 'percent' ? `${coupon.value}%` : `${coupon.value} satang`
      } off ${coupon.scope === 'course' ? (coupon.courseTitle ?? 'a course') : 'the basket'}`,
    })
    return reply.status(201).send({ data: coupon })
  })

  app.patch('/coupons/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = couponBody.parse(req.body)
    const { before, after } = await service.update(id, body)

    audit(req, {
      action: 'coupon.updated',
      subjectType: 'coupon',
      subjectId: id,
      summary: after.code,
      changes: diff(before, after),
    })
    return { data: after }
  })

  app.delete('/coupons/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const coupon = await service.remove(id)

    audit(req, {
      action: 'coupon.deleted',
      subjectType: 'coupon',
      subjectId: id,
      summary: coupon.code,
    })
    return reply.status(204).send()
  })
}
