import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, diff } from '../../lib/audit'
import * as service from './invoices.service'

/**
 * Full tax invoices, from the admin's side.
 *
 * Deliberately short of what a CRUD screen would offer. A tax document is not
 * an editable record: once it carries a number it has gone into somebody's
 * books, so it can be read and it can be issued, and the details can only be
 * corrected while the number is still unspent.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })

const invoiceBody = z.object({
  type: z.enum(['corporate', 'individual']),
  name: z.string().trim().min(1).max(255),
  taxId: z.string().trim().min(13).max(20),
  branchType: z.enum(['head', 'branch']).nullish(),
  branchCode: z.string().trim().max(10).nullish(),
  address: z.string().trim().min(1).max(1000),
})

export default async function invoiceRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }

  app.get('/invoices', adminOnly, async (req) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(20),
        status: z.enum(['requested', 'issued']).optional(),
        type: z.enum(['corporate', 'individual']).optional(),
        q: z.string().max(100).optional(),
      })
      .parse(req.query)
    return service.list(query)
  })

  app.get('/invoices/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.get(id) }
  })

  /**
   * Issues a number by hand.
   *
   * Payment normally does this. This is for the order that was paid while
   * something was wrong — a run of collisions, or a tax invoice asked for after
   * the fact and added here.
   */
  app.post('/invoices/:id/issue', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const invoice = await service.issueManually(id)

    audit(req, {
      action: 'invoice.issued',
      subjectType: 'invoice',
      subjectId: id,
      summary: `${invoice.documentNo} — ${invoice.name} (${invoice.orderNo})`,
    })
    return { data: invoice }
  })

  /** Correcting a typo, while the document has not gone out. */
  app.patch('/invoices/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = invoiceBody.parse(req.body)
    const { before, after } = await service.amend(id, body)

    audit(req, {
      action: 'invoice.amended',
      subjectType: 'invoice',
      subjectId: id,
      summary: `${after.name} (${after.orderNo})`,
      changes: diff(before, after),
    })
    return { data: after }
  })
}
