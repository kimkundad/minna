import { readFileSync } from 'node:fs'
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

/** Mirrors the TLS handling in src/db/client.ts: managed MySQL refuses plaintext. */
function ssl() {
  if (process.env.DATABASE_SSL !== 'true') return undefined
  const ca = process.env.DATABASE_SSL_CA
  return ca
    ? { ca: readFileSync(ca, 'utf8'), rejectUnauthorized: true }
    : { rejectUnauthorized: false }
}

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ...(ssl() ? { ssl: ssl() } : {}),
  },
  verbose: true,
  strict: true,
})
