/**
 * Pricing a course in something other than baht.
 *
 *   npx tsx scripts/add-course-currency.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * Three changes that only make sense together:
 *
 *   `courses.currency`   what the teacher priced it in, and what Stripe
 *                        charges — no conversion happens on the way to a buyer
 *   `orders.total_thb`   the same order in baht, because every figure the
 *                        school reads about itself is a sum of money columns,
 *                        and adding yen to baht gives a number that means
 *                        nothing
 *   `fx_rates`           the rate behind that conversion, kept rather than
 *                        only cached, so a figure on last quarter's report can
 *                        be explained and so a free provider being down does
 *                        not stop the shop
 *
 * Existing rows are already baht and are backfilled as such: `total_thb` is
 * set from `total`, which for a baht order is the same number. Nothing is
 * rewritten afterwards — what the school earned on a day does not change
 * because the rate moved since.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

async function hasColumn(table: string, column: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

async function hasTable(table: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ${table}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

let did = 0

if (await hasColumn('courses', 'currency')) {
  console.log('courses.currency is already there')
} else {
  await db.execute(sql`
    ALTER TABLE courses
      ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'THB' AFTER content_locale
  `)
  console.log('courses.currency added, every existing course priced in THB.')
  did += 1
}

if (await hasColumn('orders', 'total_thb')) {
  console.log('orders.total_thb is already there')
} else {
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN total_thb INT NOT NULL DEFAULT 0 AFTER currency,
      ADD COLUMN fx_rate DECIMAL(18,8) NULL AFTER total_thb,
      ADD COLUMN fx_date VARCHAR(10) NULL AFTER fx_rate
  `)
  // Every order so far is in baht, so its baht total is the total it has.
  // Done here rather than left to a default: a zero would read as a sale that
  // earned nothing, and the dashboard would quietly lose its history.
  await db.execute(sql`UPDATE orders SET total_thb = total WHERE currency = 'THB'`)
  console.log('orders.total_thb, fx_rate and fx_date added, existing orders backfilled from total.')
  did += 1
}

if (await hasTable('fx_rates')) {
  console.log('fx_rates is already there')
} else {
  await db.execute(sql`
    CREATE TABLE fx_rates (
      day VARCHAR(10) NOT NULL,
      code VARCHAR(3) NOT NULL,
      rate DECIMAL(18,8) NOT NULL,
      fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (day, code)
    )
  `)
  console.log('fx_rates created.')
  did += 1
}

console.log(did ? `\n${did} change(s) applied.` : '\nNothing to do.')
process.exit(0)
