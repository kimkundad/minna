/**
 * Money, in satang.
 *
 * Every money column in the database is an integer number of satang: ฿1,690.00
 * is stored as 169000. Decimals were ruled out because stacked course and order
 * coupons accumulate rounding error across one checkout.
 *
 * That only works if the conversion happens in exactly two places — the edge of
 * a form and the edge of a display — so these are those two places. Nothing
 * else in the admin should contain `* 100` or `/ 100`.
 */

/** 169000 → "1,690.00". For an input the person will edit. */
export function toBahtInput(satang: number | null | undefined): string {
  if (satang == null) return ''
  return (satang / 100).toFixed(2)
}

/** "1,690.00" or "1690" → 169000. Returns null for an empty box, which is not
 *  the same as zero: null means "no original price", 0 means "free". */
export function toSatang(baht: string | number | null | undefined): number | null {
  if (baht === '' || baht == null) return null
  const n = typeof baht === 'number' ? baht : Number(String(baht).replace(/[, ]/g, ''))
  if (!Number.isFinite(n)) return null
  // Round rather than truncate: 19.99 * 100 is 1998.9999999999998 in binary
  // floating point, and truncating would quietly charge a satang less.
  return Math.round(n * 100)
}

/** 169000 → "฿1,690.00". For reading, never for editing. */
export function formatBaht(satang: number | null | undefined): string {
  if (satang == null) return '—'
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(satang / 100)
}

/** 12600 seconds → "3h 30m". Lesson lengths add up to hours. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
