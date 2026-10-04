/**
 * Formatters matching the prototype's, so numbers and dates read the same
 * everywhere the design shows them.
 */

/** Thai digit grouping: 1290 → "1,290". */
export function num(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString('th-TH')
}

/** A price as the design writes it, with free as a word rather than "0 บาท". */
export function baht(n: number, allowFree = true): string {
  return n === 0 && allowFree ? 'ฟรี' : `${num(n)} บาท`
}

/** Seconds to the rounded "N นาที" / "N ชม. M นาที" the course pages use. */
export function minutes(seconds: number): string {
  const m = Math.round((seconds || 0) / 60)
  if (m < 60) return `${m} นาที`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} ชม. ${rest} นาที` : `${h} ชม.`
}

/** Clamp and round a percentage the way the progress bar expects. */
export function pct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value || 0)))
}
