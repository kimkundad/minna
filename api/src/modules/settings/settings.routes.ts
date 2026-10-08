import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, diff } from '../../lib/audit'
import { getVatRules, vatOf } from '../../lib/settings'
import * as service from './settings.service'

/**
 * Site settings.
 *
 * Reading is admin, writing is superadmin: VAT decides what every customer is
 * charged, and that is not a thing to leave to whoever happens to be signed in.
 * Changes are audited with their before and after, because "when did the rate
 * change" is a question an accountant asks.
 */
export default async function settingsRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }
  const superadminOnly = { preHandler: app.requireRole('superadmin') }

  app.get('/settings', adminOnly, async () => {
    return { data: await service.list() }
  })

  app.put('/settings', superadminOnly, async (req) => {
    // Settings are stored as text, but a client sending a numeric setting as a
    // JSON number — which is what a browser's number input does — is being
    // reasonable, not wrong. Accept both and normalise here rather than making
    // every caller remember to quote.
    const body = z
      .record(
        z
          .union([z.string().max(500), z.number(), z.boolean()])
          .transform((v) => String(v)),
      )
      .parse(req.body)
    const { before, after } = await service.update(body)

    audit(req, {
      action: 'settings.updated',
      subjectType: 'settings',
      summary: Object.keys(body).join(', '),
      changes: diff(before, after),
    })
    return { data: await service.list() }
  })

  /**
   * What the current rules do to one amount.
   *
   * The admin shows this under the VAT fields, because inclusive and exclusive
   * are easy to read past and the difference is what the customer pays. Worked
   * out here rather than in the browser so the screen cannot disagree with the
   * checkout about the same sum.
   */
  app.get('/settings/vat-preview', adminOnly, async (req) => {
    const { amount } = z
      .object({ amount: z.coerce.number().int().min(0).default(169000) })
      .parse(req.query)

    const rules = await getVatRules()
    const tax = vatOf(amount, rules)
    return {
      data: {
        percent: rules.percent,
        inclusive: rules.inclusive,
        /** The price as listed on the course. */
        listed: amount,
        tax,
        customerPays: rules.inclusive ? amount : amount + tax,
      },
    }
  })
}
