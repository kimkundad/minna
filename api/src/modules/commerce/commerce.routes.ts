import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env'
import { audit, record } from '../../lib/audit'
import { conflict } from '../../lib/errors'
import {
  createCheckoutSession,
  getCheckoutSession,
  isStripeConfigured,
  refundPayment,
  verifyWebhook,
} from '../../lib/stripe'
import * as authService from '../auth/auth.service'
import * as service from './commerce.service'
import * as invoices from './invoices.service'

/**
 * Checkout, and what happens after it.
 *
 * Nothing a client sends about money is believed. The basket names what is
 * wanted; every price, discount and total is worked out here from the
 * database, because the only thing stopping someone paying ฿1 for a ฿1,900
 * course is that the server does the sum itself.
 */

/**
 * Packages are off until their terms are agreed with the customer — what a
 * package costs, how long it lasts and what happens to access when it ends are
 * not settled, and selling one before they are would be a promise nobody has
 * made.
 *
 * The tables, the pricing and the entitlement granting all stay, because the
 * decision is pending rather than abandoned. This is the one line that reopens
 * them.
 */
const SELLABLE_KINDS = ['course'] as const

const cartLine = z.object({
  kind: z.enum(['course', 'package']).refine((k) => SELLABLE_KINDS.includes(k as never), {
    message: 'Packages are not on sale yet.',
  }),
  id: z.coerce.number().int().positive(),
  couponCode: z.string().max(60).optional(),
})

const quoteBody = z.object({
  lines: z.array(cartLine).min(1).max(50),
  couponCode: z.string().max(60).optional(),
})

/**
 * The full tax invoice, when the buyer asks for one.
 *
 * Asked at checkout rather than afterwards because these are the buyer's own
 * registered details, and the only moment they are there to be asked is before
 * they pay. Leaving it out is the ordinary case: everyone gets a receipt by
 * email either way.
 *
 * Shape only — whether the tax ID's check digit adds up, and whether a branch
 * code suits the branch type, is `validateInvoice`'s business.
 */
const invoiceBody = z.object({
  type: z.enum(['corporate', 'individual']),
  name: z.string().trim().min(1).max(255),
  taxId: z.string().trim().min(13).max(20),
  branchType: z.enum(['head', 'branch']).nullish(),
  branchCode: z.string().trim().max(10).nullish(),
  address: z.string().trim().min(1).max(1000),
})

const checkoutBody = quoteBody.extend({
  method: z.enum(['card', 'promptpay']),
  invoice: invoiceBody.nullish(),
})

const idParam = z.object({ id: z.coerce.number().int().positive() })

export default async function commerceRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: app.authenticate }
  const adminOnly = { preHandler: app.requireRole('admin') }

  /** What a basket costs, without buying it. */
  app.post('/checkout/quote', signedIn, async (req) => {
    const body = quoteBody.parse(req.body)
    const q = await service.quote(body.lines, body.couponCode)

    // Worth saying before they reach a payment page: paying twice for the
    // same course is a refund conversation nobody wanted.
    const owned = await service.alreadyOwned(
      req.user.sub,
      body.lines.filter((l) => l.kind === 'course').map((l) => l.id),
    )
    return { data: { ...q, alreadyOwned: owned } }
  })

  /**
   * Starts a payment.
   *
   * The hosted Stripe page takes the card details, so none of them ever reach
   * this server. Two methods, two sessions: Stripe will not offer card and
   * PromptPay on one page.
   */
  app.post('/checkout', signedIn, async (req, reply) => {
    const body = checkoutBody.parse(req.body)

    const owned = await service.alreadyOwned(
      req.user.sub,
      body.lines.filter((l) => l.kind === 'course').map((l) => l.id),
    )
    if (owned.length) throw conflict('You already have access to one of those courses.')

    // Before anything is created: invoice details that do not add up should
    // send the buyer back to the form, not leave a stranded order behind them.
    if (body.invoice) invoices.validateInvoice(body.invoice)

    const q = await service.quote(body.lines, body.couponCode)
    // The token carries an id and roles; Stripe wants an address to send the
    // receipt to.
    const buyer = await authService.findUser(req.user.sub)

    // A basket that comes to nothing needs no payment page: grant it and be
    // done, rather than sending someone to Stripe to pay zero.
    if (q.total === 0) {
      const order = await service.createOrder(req.user.sub, q, 'free')
      // Attached before the order is paid, because paying is what allocates the
      // document number and it needs something to allocate one for.
      if (body.invoice) await invoices.request(order.id, body.invoice)
      await service.markPaid(order.id, { providerRef: null })
      audit(req, {
        action: 'order.paid',
        subjectType: 'order',
        subjectId: order.id,
        summary: `${order.orderNo} — free`,
      })
      return reply.status(201).send({ data: { order: await service.getOrder(order.id), url: null } })
    }

    if (!isStripeConfigured()) {
      throw conflict('Card payments are not set up yet.')
    }

    const order = await service.createOrder(req.user.sub, q, body.method)
    if (body.invoice) await invoices.request(order.id, body.invoice)

    try {
      const session = await createCheckoutSession({
        lines: q.lines.map((l) => ({
          name: l.title,
          amount: Math.max(0, l.unitPrice - l.discount),
        })),
        method: body.method,
        currency: q.currency,
        // The order number, not the id: it is what support asks for.
        successUrl: `${env.APP_URL}/checkout/success?order=${order.orderNo}&session={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${env.APP_URL}/checkout?cancelled=${order.orderNo}`,
        customerEmail: buyer.email,
        clientReferenceId: order.orderNo,
        metadata: { orderId: String(order.id), orderNo: order.orderNo, userId: String(req.user.sub) },
        // PromptPay is asynchronous — the QR can be paid minutes later, so the
        // session has to outlive the tab.
        ...(body.method === 'promptpay'
          ? { expiresAt: Math.floor(Date.now() / 1000) + 30 * 60 }
          : {}),
      })

      await service.setProviderRef(order.id, session.id, session)

      audit(req, {
        action: 'order.created',
        subjectType: 'order',
        subjectId: order.id,
        summary: `${order.orderNo} — ${q.total} satang by ${body.method}`,
      })

      // The stored row, not the one from before the session existed: it now
      // carries the Stripe reference, and a caller that echoes it back would
      // otherwise send null.
      return reply
        .status(201)
        .send({ data: { order: await service.getOrder(order.id), url: session.url } })
    } catch (err) {
      // The order stays, marked failed: a payment that never started is still
      // something support will be asked about.
      await service.markFailed(order.id, { error: String(err) })
      throw err
    }
  })

  /** The success page asks this, because a webhook may not have arrived yet. */
  app.get('/orders/by-no/:orderNo', signedIn, async (req) => {
    const { orderNo } = z.object({ orderNo: z.string().max(32) }).parse(req.params)
    const order = await service.getOrderByNo(orderNo)
    if (!order || order.userId !== req.user.sub) {
      throw conflict('That order is not yours.')
    }

    // Still pending: ask Stripe directly rather than making someone refresh
    // until the webhook lands.
    if (order.status === 'pending' && order.providerRef) {
      const session = await getCheckoutSession(order.providerRef)
      if (session.payment_status === 'paid') {
        await service.markPaid(order.id, { providerRef: order.providerRef, payload: session })
      }
    }

    return { data: await service.getOrder(order.id) }
  })

  /* ---------------- admin ---------------- */

  app.get('/orders', adminOnly, async (req) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(20),
        status: z.enum(['pending', 'paid', 'failed', 'cancelled', 'refunded']).optional(),
        method: z.enum(['card', 'promptpay', 'free']).optional(),
        q: z.string().max(100).optional(),
      })
      .parse(req.query)
    return service.listOrders(query)
  })

  app.get('/orders/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.getOrderDetail(id) }
  })

  /**
   * Refunds, money and access together.
   *
   * Stripe is told first. If it refuses there is nothing to record, and
   * revoking access for a refund that never happened would be the worst of
   * both.
   */
  app.post('/orders/:id/refund', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const { reason } = z.object({ reason: z.string().max(255).optional() }).parse(req.body ?? {})

    const order = await service.getOrder(id)
    if (order.status !== 'paid') throw conflict('Only a paid order can be refunded.')

    if (order.provider === 'stripe' && order.providerRef) {
      const session = await getCheckoutSession(order.providerRef)
      const intent = session.payment_intent
      if (typeof intent === 'string') await refundPayment(intent)
    }

    await service.refundOrder(id)
    // The detail shape, not the bare row: this answers the screen that asked,
    // and it is still showing the buyer and the items beside the status.
    const after = await service.getOrderDetail(id)

    audit(req, {
      action: 'order.refunded',
      subjectType: 'order',
      subjectId: id,
      summary: reason ? `${order.orderNo} — ${reason}` : order.orderNo,
      changes: { status: ['paid', 'refunded'] },
    })
    return { data: after }
  })
}
