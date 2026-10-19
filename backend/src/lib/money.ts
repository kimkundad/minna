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

/**
 * The symbols a narrowed "$" or "¥" would not tell apart.
 *
 * The same list the public site keeps, for the same reason: six of the seven
 * dollars this school prices in narrow down to a bare "$", so an order paid in
 * Hong Kong dollars and one paid in US dollars read identically on a page
 * somebody is about to refund from.
 */
const UNAMBIGUOUS_SYMBOL: Record<string, string> = {
  USD: 'US$',
  HKD: 'HK$',
  SGD: 'S$',
  TWD: 'NT$',
  AUD: 'A$',
  NZD: 'NZ$',
  CAD: 'C$',
  CNY: 'CN¥',
}

/**
 * 169000 and 'JPY' → "¥1,690". For reading, never for editing.
 *
 * The currency is not optional in practice, only in the type: an order, an
 * invoice and a course each carry their own, and a figure printed in baht
 * because nobody passed one is a wrong number, not a missing one. It defaults
 * to baht for the few places that really are school-wide sums — earnings and
 * payouts are kept in baht whatever the sale was charged in.
 */
export function formatMoney(
  minor: number | null | undefined,
  currency: string = 'THB',
): string {
  if (minor == null) return '—'
  const code = (currency || 'THB').toUpperCase()
  try {
    const parts = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      // Not forced to two. Baht and dollars take two and Intl gives them two;
      // yen and won take none, and "¥2,241.00" is not an amount of yen.
    }).formatToParts(minor / 100)
    const ours = UNAMBIGUOUS_SYMBOL[code]
    return parts.map((p) => (ours && p.type === 'currency' ? ours : p.value)).join('')
  } catch {
    // An unknown code must not blank out the amount somebody is checking.
    return `${(minor / 100).toFixed(2)} ${code}`
  }
}

/**
 * 169000 → "฿1,690.00".
 *
 * Only for sums that really are in baht: what a teacher has earned, what a
 * payout is worth, what the school took. Anything carrying a currency of its
 * own belongs in `formatMoney`.
 */
export function formatBaht(satang: number | null | undefined): string {
  return formatMoney(satang, 'THB')
}

/** 12600 seconds → "3h 30m". Lesson lengths add up to hours. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
