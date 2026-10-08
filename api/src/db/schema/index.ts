/**
 * Every table and relation in one place, which is what drizzle-kit reads and
 * what `db.query.*` needs to resolve nested reads.
 *
 * Money is stored as an integer number of satang everywhere it appears, never
 * as a decimal: stacked course and order coupons would otherwise accumulate
 * rounding error across a single checkout.
 */
export * from './auth'
export * from './catalog'
export * from './quiz'
export * from './commerce'
export * from './learning'
export * from './content'
export * from './audit'
export * from './teaching'
