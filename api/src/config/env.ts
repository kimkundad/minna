import 'dotenv/config'
import { z } from 'zod'

/**
 * Every environment variable the API reads passes through here, so a missing or
 * malformed one stops the process at boot with a readable list instead of
 * surfacing as `undefined` somewhere deep in a request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  DATABASE_URL: z.string().min(1),
  /** Managed MySQL (DigitalOcean, PlanetScale, RDS) refuses plaintext connections. */
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Path to the provider's CA certificate. Without it the chain cannot be
   *  verified, and DATABASE_SSL alone falls back to an unverified connection. */
  DATABASE_SSL_CA: z.string().optional(),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // Third-party credentials are optional while developing so the server still
  // boots before anyone has wired up storage or a Stripe account. The check
  // below makes them mandatory in production.

  // space-kim: self-hosted file storage with expiring signed URLs.
  SPACE_BASE_URL: z.string().url().optional(),
  /** Format: <keyId>.<secret>. The secret signs URLs; the id names the key. */
  SPACE_API_KEY: z.string().optional(),
  /** The folder the key is scoped to. Every path has to sit inside it, and the
   *  service will not say what the scope is, so it has to be stated here. */
  SPACE_FOLDER: z
    .string()
    .default('minna')
    .transform((v) => v.replace(/^\/+|\/+$/g, '')),
  /** How long a signed URL lasts. Six hours by default, so a lesson video
   *  outlives watching it — and a pause over lunch. The service caps it at 7 days. */
  SIGNED_URL_TTL: z.coerce.number().int().positive().max(604800).default(21600),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // SMTP, so the provider is a configuration choice rather than a code one.
  // With no host, mail is written to the log instead of sent.
  /**
   * Resend, over HTTPS. Preferred over SMTP wherever both are set.
   *
   * DigitalOcean blocks outbound SMTP on its droplets, so on the server
   * every SMTP connection times out and nothing is ever sent. Port 443 is
   * not blocked anywhere.
   */
  RESEND_API_KEY: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  /**
   * Where a reply goes, when that is not where the mail came from.
   *
   * Mail has to be sent from a domain this school owns, or it fails the
   * checks every inbox now makes — so it cannot come from a Gmail address.
   * This lets it still be *answered* at one, which is what somebody who
   * reads their mail there actually needs.
   */
  MAIL_REPLY_TO: z.string().optional(),

  /**
   * The public site. Every link mailed to a learner is built from it, and
   * Stripe is told to send buyers back to it.
   *
   * The default used to be 5173, which is the admin's port — so a deployment
   * that forgot to set this sent buyers and password resets to the wrong app.
   */
  APP_URL: z.string().url().default('http://localhost:5174'),

  /**
   * The admin, where teachers do their work.
   *
   * Separate from `APP_URL` because they are two apps on two addresses, and
   * the one thing a newly approved teacher needs is a link to the right one.
   */
  ADMIN_URL: z.string().url().default('http://localhost:5173'),

  /**
   * reCAPTCHA v3. The secret is this server's; the site key is the browser's
   * and lives in the frontend's own env, because it is meant to be public.
   *
   * Without the secret every check passes and a line is written at boot — fine
   * on a laptop, which is why it is in REQUIRED_IN_PRODUCTION below.
   */
  RECAPTCHA_SECRET: z.string().optional(),
})

const REQUIRED_IN_PRODUCTION = [
  'SPACE_BASE_URL',
  'SPACE_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'MAIL_FROM',
  // Without this, anything a member can write into the site is unguarded.
  'RECAPTCHA_SECRET',
] as const

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  console.error(`Invalid environment:\n${lines.join('\n')}\n\nSee api/.env.example.`)
  process.exit(1)
}

if (parsed.data.NODE_ENV === 'production') {
  const missing: string[] = REQUIRED_IN_PRODUCTION.filter((k) => !parsed.data[k])

  /**
   * A way out for mail, without insisting on which.
   *
   * `SMTP_HOST` used to be required on its own. It was set, it satisfied the
   * check, and not one message was ever sent: DigitalOcean blocks outbound
   * SMTP, so every connection timed out. A check that a setting is present is
   * not a check that it works — but requiring *some* way out still catches the
   * deployment that has none, which is the failure this list exists for.
   */
  if (!parsed.data.RESEND_API_KEY && !parsed.data.SMTP_HOST) {
    missing.push('RESEND_API_KEY (or SMTP_HOST)')
  }

  if (missing.length > 0) {
    console.error(
      `Missing in production:\n${missing.map((k) => `  ${k}`).join('\n')}\n\nSee api/.env.example.`,
    )
    process.exit(1)
  }
}

export const env = parsed.data
export type Env = typeof env
