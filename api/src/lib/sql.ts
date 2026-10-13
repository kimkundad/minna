import type { Column } from 'drizzle-orm'
import { getTableName, sql, type SQL } from 'drizzle-orm'

/**
 * A fully-qualified reference to a column of the query's own table.
 *
 * Needed inside a correlated subquery. Drizzle renders an interpolated column
 * as a bare name — `` `id` `` rather than `` `orders`.`id` `` — and inside a
 * subquery that bare name binds to the subquery's table instead of the outer
 * one. So
 *
 *   sql`(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = ${orders.id})`
 *
 * becomes `oi.order_id = id`, which MySQL happily reads as `oi.order_id =
 * oi.id`. It does not fail; it silently counts the wrong thing, which is worse.
 * Where the subquery's table has no such column it fails outright, which is how
 * this was noticed at all.
 *
 * `outer()` writes the table name in, so the reference can only mean the outer
 * query:
 *
 *   sql`(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = ${outer(orders.id)})`
 *
 * Both names come from the schema, never from a request, so this cannot carry
 * anything injectable.
 */
export function outer(column: Column): SQL {
  return sql.raw(`\`${getTableName(column.table)}\`.\`${column.name}\``)
}

/**
 * A datetime out of the database, as an instant the browser cannot misread.
 *
 * Drizzle's typed datetime columns come back as `Date`, but a datetime pulled
 * through a raw subquery — `MAX(lp.last_watched_at)` — arrives as the driver's
 * own string, `2026-10-08 17:13:55`: no `T`, no zone. Sent as-is, that is a
 * naive string in a payload where every other timestamp states its offset, and
 * a client parsing it has to guess. Ours guessed midnight, and a lesson
 * watched ten minutes ago read as "เมื่อวาน".
 *
 * The driver already treats the stored values as UTC — the same column read
 * through a typed select comes back with the same digits and a `Z` — so a bare
 * string is read the same way here.
 */
export function instant(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()

  const text = String(value).trim()
  if (!text) return null
  // Already an instant, or something only `Date` can judge.
  const d = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(text)
    ? new Date(`${text.replace(' ', 'T')}Z`)
    : new Date(text)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
