import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import { env } from '../config/env'
import * as schema from './schema/index'

export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: 10,
  // Keep DATETIME columns as JS Date objects rather than strings.
  timezone: 'Z',
  supportBigNumbers: true,
})

export const db = drizzle(pool, { schema, mode: 'default' })

export type Db = typeof db
export { schema }
