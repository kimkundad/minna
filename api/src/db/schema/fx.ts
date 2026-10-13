import { sql } from 'drizzle-orm'
import { datetime, decimal, mysqlTable, primaryKey, varchar } from 'drizzle-orm/mysql-core'

/**
 * One day's exchange rates, kept.
 *
 * The school prices in several currencies but keeps its books in baht, so
 * every sale that is not in baht needs a rate to be worth anything to a
 * report. That rate is fetched once a day from a free service, and a free
 * service has no promise to keep.
 *
 * So it is written down rather than only cached. Three things follow from
 * that, and each is the reason for a column rather than a nicety:
 *
 *   - when the provider is down, yesterday's rates are still here, and a
 *     price that is a day old beats a shop that cannot take money
 *   - a figure on last quarter's report can be explained, not merely trusted,
 *     because the rate behind it is still readable
 *   - a cache that empties on restart cannot quietly become the source of
 *     truth for what the school earned
 *
 * Rates are per one baht: `JPY 4.717448` means a baht buys that many yen. One
 * base throughout, because a cross rate worked out through a common base is
 * one rounding, and through two is two.
 */
export const fxRates = mysqlTable(
  'fx_rates',
  {
    /** `YYYY-MM-DD`, in the provider's day, not ours — it publishes once. */
    day: varchar('day', { length: 10 }).notNull(),
    code: varchar('code', { length: 3 }).notNull(),
    /** How many of `code` one baht buys. */
    rate: decimal('rate', { precision: 18, scale: 8 }).notNull(),
    fetchedAt: datetime('fetched_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.code] })],
)
