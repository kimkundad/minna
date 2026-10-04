import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import { env } from '../config/env'
import * as schema from './schema/index'

/**
 * Managed MySQL providers require TLS. With a CA file the certificate chain is
 * verified; without one the connection is still encrypted but the server is not
 * authenticated, which is enough for a staging box and not enough for
 * production — hence the warning.
 */
function sslOptions() {
  if (!env.DATABASE_SSL) return undefined

  if (env.DATABASE_SSL_CA) {
    return { ca: readFileSync(env.DATABASE_SSL_CA, 'utf8'), rejectUnauthorized: true }
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('DATABASE_SSL is on in production but DATABASE_SSL_CA is not set.')
  }
  console.warn('DATABASE_SSL is on without DATABASE_SSL_CA: the server certificate is not verified.')
  return { rejectUnauthorized: false }
}

const ssl = sslOptions()

export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: 10,
  // Keep DATETIME columns as JS Date objects rather than strings.
  timezone: 'Z',
  supportBigNumbers: true,
  ...(ssl ? { ssl } : {}),
})

export const db = drizzle(pool, { schema, mode: 'default' })

export type Db = typeof db
export { schema }
