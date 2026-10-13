import { sql, type SQL } from 'drizzle-orm'

/**
 * The school's clock.
 *
 * Every timestamp in the database is UTC: MySQL's `NOW()` is UTC here, the
 * driver is configured `timezone: 'Z'`, and `instant()` hands the browser an
 * ISO string with the offset on it. That is the right way round — one instant,
 * stated once, rendered wherever the reader happens to be.
 *
 * But a handful of things are not instants. An order number, an invoice month,
 * "สมาชิกใหม่เดือนนี้" — those are calendar facts, and the calendar they belong
 * to is Bangkok's, because that is where the school keeps its books. Read off a
 * UTC clock they are wrong for the first seven hours of every Thai day: an
 * order placed at 02:00 on the 9th would be numbered the 8th, and a sale made
 * on the morning of the 1st would be counted in last month's revenue.
 *
 * So the rule is: instants stay UTC, calendars come from here. Nothing in this
 * file reads `process.env.TZ` — the server's own timezone is whatever the host
 * was built with, and on a Linux droplet that is UTC.
 */
export const SCHOOL_TZ = 'Asia/Bangkok'

/** Fixed, and has been since 1940 — Thailand keeps no summer time. */
export const SCHOOL_OFFSET = '+07:00'

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** The date in Bangkok, as `YYYY-MM-DD`. */
export function schoolDate(at: Date = new Date()): string {
  const f = Object.fromEntries(parts.formatToParts(at).map((p) => [p.type, p.value]))
  return `${f.year}-${f.month}-${f.day}`
}

/** The month in Bangkok, as `YYYY-MM`. */
export function schoolMonth(at: Date = new Date()): string {
  return schoolDate(at).slice(0, 7)
}

/** `YYYYMMDD` for the inside of a document number. */
export function schoolDateCompact(at: Date = new Date()): string {
  return schoolDate(at).replace(/-/g, '')
}

/** `YYYYMM`, likewise. */
export function schoolMonthCompact(at: Date = new Date()): string {
  return schoolMonth(at).replace('-', '')
}

/**
 * Midnight on the first of the current Bangkok month, as a UTC datetime.
 *
 * For comparing against a stored column: `created_at >= monthStart()`. The
 * conversion is on the constant and not on the column, so the index on the
 * column is still usable — `CONVERT_TZ(created_at, …) >= …` would read every
 * row.
 */
export function monthStart(): SQL<string> {
  return sql<string>`CONVERT_TZ(DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', ${SCHOOL_OFFSET}), '%Y-%m-01'), ${SCHOOL_OFFSET}, '+00:00')`
}

/** Midnight today in Bangkok, as a UTC datetime. Same reasoning. */
export function dayStart(): SQL<string> {
  return sql<string>`CONVERT_TZ(DATE(CONVERT_TZ(NOW(), '+00:00', ${SCHOOL_OFFSET})), ${SCHOOL_OFFSET}, '+00:00')`
}
