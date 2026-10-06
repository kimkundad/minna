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
  // boots before anyone has wired up a Spaces bucket or a Stripe account. The
  // check below makes them mandatory in production.
  SPACES_ENDPOINT: z.string().url().optional(),
  SPACES_REGION: z.string().optional(),
  SPACES_BUCKET: z.string().optional(),
  SPACES_KEY: z.string().optional(),
  SPACES_SECRET: z.string().optional(),
  SIGNED_URL_TTL: z.coerce.number().int().positive().default(300),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // SMTP, so the provider is a configuration choice rather than a code one.
  // With no host, mail is written to the log instead of sent.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  APP_URL: z.string().url().default('http://localhost:5173'),
})

const REQUIRED_IN_PRODUCTION = [
  'SPACES_ENDPOINT',
  'SPACES_REGION',
  'SPACES_BUCKET',
  'SPACES_KEY',
  'SPACES_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  // Without this, password resets and receipts silently go nowhere.
  'SMTP_HOST',
  'MAIL_FROM',
] as const

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  console.error(`Invalid environment:\n${lines.join('\n')}\n\nSee api/.env.example.`)
  process.exit(1)
}

if (parsed.data.NODE_ENV === 'production') {
  const missing = REQUIRED_IN_PRODUCTION.filter((k) => !parsed.data[k])
  if (missing.length > 0) {
    console.error(
      `Missing in production:\n${missing.map((k) => `  ${k}`).join('\n')}\n\nSee api/.env.example.`,
    )
    process.exit(1)
  }
}

export const env = parsed.data
export type Env = typeof env
