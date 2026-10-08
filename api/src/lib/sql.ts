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
