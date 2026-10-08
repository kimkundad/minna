import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env'
import { AppError } from './errors'

/**
 * Stripe, over its REST API.
 *
 * No SDK: the two things this needs — create a Checkout Session, verify a
 * webhook signature — are a form post and an HMAC. A dependency that ships a
 * typed client for four hundred endpoints to use two of them is weight without
 * a reason, and the legacy app talked to the same API the same way.
 *
 * Amounts are satang throughout, which is also Stripe's unit for THB, so
 * nothing here multiplies or divides.
 */

const API = 'https://api.stripe.com/v1'

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY)
}

function requireKey(): string {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, 'payments_unconfigured', 'Payments are not set up.')
  }
  return env.STRIPE_SECRET_KEY
}

/**
 * Stripe takes form-encoded bodies with bracketed keys for nesting:
 * `line_items[0][price_data][currency]`. This flattens an object into that.
 */
function toForm(value: unknown, prefix = '', out = new URLSearchParams()): URLSearchParams {
  if (value === null || value === undefined) return out

  if (Array.isArray(value)) {
    value.forEach((item, i) => toForm(item, `${prefix}[${i}]`, out))
    return out
  }
  if (typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      toForm(inner, prefix ? `${prefix}[${key}]` : key, out)
    }
    return out
  }

  out.set(prefix, String(value))
  return out
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toForm(body),
  })

  const data = (await res.json()) as { error?: { message?: string; code?: string } }
  if (!res.ok) {
    // Stripe's own message is the useful one — it says which payment method is
    // not enabled, or which field is wrong.
    throw new AppError(
      502,
      data.error?.code ?? 'stripe_error',
      data.error?.message ?? `Stripe returned ${res.status}.`,
    )
  }
  return data as T
}

export interface CheckoutLine {
  name: string
  description?: string | undefined
  /** Satang. */
  amount: number
}

export interface CheckoutSession {
  id: string
  url: string | null
  payment_status?: string
  status?: string
  [key: string]: unknown
}

/**
 * A hosted payment page.
 *
 * Hosted rather than card fields of our own: card details never touch this
 * server, which keeps the PCI burden to the smallest form there is.
 *
 * `promptpay` is a separate session from `card` because Stripe will not offer
 * both in one — the two are different enough that the page is built
 * differently.
 */
export async function createCheckoutSession(opts: {
  lines: CheckoutLine[]
  method: 'card' | 'promptpay'
  currency: string
  successUrl: string
  cancelUrl: string
  customerEmail: string
  /** Shown to the operator in the Stripe dashboard, and read back on the hook. */
  clientReferenceId: string
  metadata: Record<string, string>
  /** PromptPay is asynchronous: the QR can be paid minutes later. */
  expiresAt?: number | undefined
}): Promise<CheckoutSession> {
  return post<CheckoutSession>('/checkout/sessions', {
    mode: 'payment',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    customer_email: opts.customerEmail,
    client_reference_id: opts.clientReferenceId,
    payment_method_types: [opts.method],
    metadata: opts.metadata,
    ...(opts.expiresAt ? { expires_at: opts.expiresAt } : {}),
    line_items: opts.lines.map((l) => ({
      quantity: 1,
      price_data: {
        currency: opts.currency.toLowerCase(),
        unit_amount: l.amount,
        product_data: {
          name: l.name.slice(0, 120),
          ...(l.description ? { description: l.description.slice(0, 200) } : {}),
        },
      },
    })),
  })
}

export async function getCheckoutSession(id: string): Promise<CheckoutSession> {
  const res = await fetch(`${API}/checkout/sessions/${id}`, {
    headers: { Authorization: `Bearer ${requireKey()}` },
  })
  const data = (await res.json()) as CheckoutSession & { error?: { message?: string } }
  if (!res.ok) throw new AppError(502, 'stripe_error', data.error?.message ?? 'Stripe refused.')
  return data
}

export async function refundPayment(paymentIntentId: string, amount?: number) {
  return post('/refunds', {
    payment_intent: paymentIntentId,
    ...(amount ? { amount } : {}),
  })
}

/**
 * Checks that a webhook really came from Stripe.
 *
 * Anyone can post to the hook URL, and the payload says an order was paid.
 * Without this check the cheapest way to take a course for free would be a
 * single curl command.
 *
 * The timestamp is part of what is signed, and a signature more than five
 * minutes old is refused: otherwise a captured request could be replayed
 * forever.
 */
export function verifyWebhook(rawBody: string, signatureHeader: string | undefined): unknown {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, 'payments_unconfigured', 'The webhook secret is not set.')
  }
  if (!signatureHeader) {
    throw new AppError(400, 'bad_signature', 'Missing Stripe signature.')
  }

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...rest] = p.split('=')
      return [k?.trim() ?? '', rest.join('=')]
    }),
  )

  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) {
    throw new AppError(400, 'bad_signature', 'Malformed Stripe signature.')
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) {
    throw new AppError(400, 'bad_signature', 'That signature is too old.')
  }

  const expected = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  // Compare in constant time: a length check first, because timingSafeEqual
  // throws rather than returning false on a mismatch.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError(400, 'bad_signature', 'That signature does not match.')
  }

  return JSON.parse(rawBody)
}
