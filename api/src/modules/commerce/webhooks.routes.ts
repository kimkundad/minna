import type { FastifyInstance } from 'fastify'
import { record } from '../../lib/audit'
import { verifyWebhook } from '../../lib/stripe'
import * as service from './commerce.service'

/**
 * Stripe's webhook, in a plugin of its own.
 *
 * The signature is an HMAC of the exact bytes Stripe sent, so this route needs
 * the body unparsed — a re-serialised JSON object is a different string and
 * the check would never pass. Fastify's parsers are per plugin scope, which is
 * why this is not registered beside the rest: every other route still gets
 * ordinary parsed JSON.
 *
 * Unauthenticated by necessity, because Stripe holds no token of ours. The
 * signature is what makes it safe; without that check the cheapest way to get
 * a course for free would be one curl command.
 */
export default async function webhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })

  app.post('/webhooks/stripe', async (req, reply) => {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    const event = verifyWebhook(raw, req.headers['stripe-signature'] as string | undefined) as {
      type: string
      data: { object: Record<string, unknown> }
    }

    const object = event.data.object
    const orderId = Number((object.metadata as Record<string, string> | undefined)?.orderId)
    if (!Number.isFinite(orderId)) {
      // Not ours, or an event for something else. 200 anyway: a non-2xx
      // makes Stripe retry forever over a message we will never want.
      return reply.status(200).send({ received: true })
    }

    const system = { id: null, role: 'system' as const, ip: req.ip }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      // Only when it really is paid: a completed session with PromptPay can
      // still be awaiting the transfer.
      if (object.payment_status === 'paid') {
        const changed = await service.markPaid(orderId, {
          providerRef: String(object.id),
          payload: object,
        })
        if (changed) {
          void record(system, {
            action: 'order.paid',
            subjectType: 'order',
            subjectId: orderId,
            summary: `${object.id} via ${event.type}`,
          })
        }
      }
    } else if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const changed = await service.markFailed(orderId, object)
      if (changed) {
        void record(system, {
          action: 'order.failed',
          subjectType: 'order',
          subjectId: orderId,
          summary: event.type,
        })
      }
    }

    return reply.status(200).send({ received: true })
  })
}
