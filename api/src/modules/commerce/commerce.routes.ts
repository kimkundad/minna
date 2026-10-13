import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env'
import { audit, record } from '../../lib/audit'
import { minimumCharge } from '../../lib/currencies'
import { conflict } from '../../lib/errors'
import { signedUrl } from '../../lib/storage'
import {
  createCheckoutSession,
  getCheckoutSession,
  isStripeConfigured,
  refundPayment,
  verifyWebhook,
} from '../../lib/stripe'
import * as authService from '../auth/auth.service'
import * as cart from './cart.service'
import * as service from './commerce.service'
import * as invoices from './invoices.service'
import * as earnings from './earnings.service'
import { myOrders } from './myorders.service'

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
    await cart.clearPurchased(
      req.user.sub,
      body.lines.filter((l) => l.kind === 'course').map((l) => l.id),
    )

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

    /**
     * PromptPay is a Thai QR standard and settles in baht only.
     *
     * The checkout hides the button for a basket that is not in baht, so this
     * is the server saying the same thing — reached by a stale page or a
     * hand-made request, where otherwise Stripe would refuse with a message
     * about payment method types that tells the buyer nothing.
     */
    if (body.method === 'promptpay' && q.currency !== 'THB') {
      throw conflict(`PromptPay can only be used for a basket priced in baht, and this one is in ${q.currency}. Please pay by card.`)
    }

    /**
     * Stripe will not take a charge under about ฿10.
     *
     * It says so in a sentence about converting to satang, which reads as
     * something wrong with the account rather than with the price. Answered
     * here, in terms of the thing the buyer is looking at.
     */
    const least = minimumCharge(q.currency)
    if (q.total < least) {
      throw conflict(
        `This comes to less than the smallest payment we can take in ${q.currency}. Please contact us to buy it.`,
      )
    }

    const order = await service.createOrder(req.user.sub, q, body.method)
    if (body.invoice) await invoices.request(order.id, body.invoice)

    try {
      const session = await createCheckoutSession({
        // Worked out by the service, beside the arithmetic it has to agree
        // with. Built here it was only `unitPrice - discount` per line, which
        // leaves out an order-wide coupon and VAT added on top — so the order
        // said one figure and the card was charged another.
        lines: service.payableLines(q),
        method: body.method,
        currency: q.currency,
        // The order number, not the id: it is what support asks for.
        //
        // The language goes in the path because every page on the site lives
        // under one — `/checkout/success` with no locale matches no route, and
        // the buyer came back from Stripe to the home page. The buyer's own
        // language, not the server's: they are returning to read it.
        successUrl: `${env.APP_URL}/${buyer.locale}/checkout/success?order=${order.orderNo}&session={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${env.APP_URL}/${buyer.locale}/checkout?cancelled=${order.orderNo}`,
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
    await cart.clearPurchased(
      req.user.sub,
      body.lines.filter((l) => l.kind === 'course').map((l) => l.id),
    )


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

  /** Somebody's own order history. Admin's `/orders` is a different list. */
  app.get('/me/orders', signedIn, async (req) => {
    return { data: await myOrders(req.user.sub) }
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


  /* ---------------- what a teacher has earned ---------------- */

  /**
   * Their own earnings, and only ever their own.
   *
   * No `userId` parameter on purpose: the only account this can report on is
   * the one asking. An admin's view of everybody is a different route with a
   * different name, so neither can be mistaken for the other.
   */
  app.get('/me/earnings', { preHandler: app.requireRole('teacher') }, async (req) => {
    return {
      data: {
        summary: await earnings.summaryFor(req.user.sub),
        lines: await earnings.listFor(req.user.sub),
      },
    }
  })

  /** Who is owed what. The payout run reads this. */
  app.get('/earnings/payouts', adminOnly, async () => ({
    data: await earnings.payoutDue(),
  }))


  /**
   * Settles one teacher's payable rows.
   *
   * The amount is sent back rather than taken on trust: between opening the
   * screen and pressing the button a refund may have landed, and paying out a
   * figure somebody read a minute ago is how a teacher ends up owed money
   * nobody can account for. A mismatch is a 409 with what the ledger actually
   * says.
   */
  app.post('/earnings/payouts/:userId', adminOnly, async (req) => {
    const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(req.params)
    const body = z
      .object({
        amount: z.coerce.number().int(),
        reference: z.string().trim().min(1).max(64),
      })
      .parse(req.body)

    try {
      const settled = await earnings.markPaid(userId, body.amount, body.reference)
      audit(req, {
        action: 'earnings.paid',
        subjectType: 'user',
        subjectId: userId,
        summary: `${(settled.amount / 100).toFixed(2)} THB · ${body.reference}`,
      })
      return { data: settled }
    } catch (err) {
      const e = err as { statusCode?: number; actual?: number; message?: string }
      if (e.statusCode === 409) {
        throw conflict(`${e.message} The ledger now says ${(Number(e.actual) / 100).toFixed(2)} THB.`)
      }
      throw err
    }
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
  /**
   * Marks an order paid by hand, and grants the access that goes with it.
   *
   * For the money that arrived outside Stripe — a bank transfer, a payment
   * somebody made at the desk, a webhook that never came. It does exactly what
   * a real payment does, because a half-paid order is worse than either state.
   *
   * Superadmin only. An ordinary administrator can see orders and refund them,
   * but saying "this was paid" when no payment is recorded is the one action
   * here that creates revenue out of nothing, and it should take the person who
   * answers for the books.
   *
   * A reason is required and audited. Without one the audit log says an order
   * changed and not why, which is the only question anybody asks of it later.
   */
  app.post('/orders/:id/mark-paid', { preHandler: app.requireRole('superadmin') }, async (req) => {
    const { id } = idParam.parse(req.params)
    const { reason } = z
      .object({ reason: z.string().trim().min(3, 'Say why this is being marked paid.').max(500) })
      .parse(req.body)

    const before = await service.getOrder(id)
    if (before.status === 'paid') throw conflict('That order is already paid.')
    if (before.status === 'refunded') throw conflict('That order was refunded.')

    const changed = await service.markPaid(id, { providerRef: before.providerRef })

    audit(req, {
      action: 'order.marked_paid',
      subjectType: 'order',
      subjectId: id,
      summary: `${before.orderNo} — by hand: ${reason}`,
      changes: { status: [before.status, 'paid'] },
    })

    return { data: await service.getOrderDetail(id), changed }
  })

  /**
   * Closes an order that was never paid.
   *
   * Admin rather than superadmin, unlike marking one paid or refunding it:
   * nothing moves. No money was taken and no access was granted, so this only
   * stops a dead row sitting in the list looking like work.
   */
  app.post('/orders/:id/cancel', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const { reason } = z
      .object({ reason: z.string().trim().min(3, 'Say why this is being cancelled.').max(500) })
      .parse(req.body)

    const before = await service.getOrder(id)
    await service.cancelOrder(id)

    audit(req, {
      action: 'order.cancelled',
      subjectType: 'order',
      subjectId: id,
      summary: `${before.orderNo} — ${reason}`,
      changes: { status: [before.status, 'cancelled'] },
    })
    // The detail shape, which is what the screen that asked is showing.
    return { data: await service.getOrderDetail(id) }
  })

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
