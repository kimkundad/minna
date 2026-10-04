/**
 * Formatters matching the prototype's, so numbers, dates and durations read the
 * same everywhere the design shows them.
 */
import { store } from '@/vendor'

const fmtDate = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const fmtDateLong = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const fmtTime = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** The store parses the mixed date shapes in the fixture data. */
function parse(value: unknown): Date | null {
  const dateApi = (store as unknown as { date: { parse: (v: unknown) => Date | null } }).date
  return dateApi?.parse ? dateApi.parse(value) : null
}

/** Thai digit grouping: 1290 → "1,290". */
export function num(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString('th-TH')
}

/** A price as the design writes it, with free as a word rather than "0 บาท". */
export function baht(n: number, allowFree = true): string {
  return n === 0 && allowFree ? 'ฟรี' : `${num(n)} บาท`
}

/** An em dash stands in for a missing date, so a row never collapses. */
export function date(value: unknown): string {
  const d = parse(value)
  return d ? fmtDate.format(d) : '—'
}

export function dateLong(value: unknown): string {
  const d = parse(value)
  return d ? fmtDateLong.format(d) : '—'
}

export function dateTime(value: unknown): string {
  const d = parse(value)
  return d ? `${fmtDate.format(d)} · ${fmtTime.format(d)} น.` : '—'
}

/**
 * Relative time, which stays relative only while that is still useful: past a
 * week an exact date tells you more than "47 วันที่แล้ว".
 */
export function relative(value: unknown): string {
  const d = parse(value)
  if (!d) return '—'

  const seconds = (Date.now() - d.getTime()) / 1000
  if (seconds < 60) return 'เมื่อสักครู่'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} นาทีที่แล้ว`

  // Calendar days, not elapsed ones: something watched at 23:50 is "เมื่อวาน"
  // at 00:10, not "วันนี้".
  const dateApi = (store as unknown as { date: { daysBetween: (a: Date, b: Date) => number } }).date
  const days = dateApi?.daysBetween ? dateApi.daysBetween(d, new Date()) : Math.floor(seconds / 86400)
  if (days === 0) return `วันนี้ ${fmtTime.format(d)} น.`
  if (days === 1) return `เมื่อวาน ${fmtTime.format(d)} น.`
  if (days < 7) return `${days} วันที่แล้ว`
  return fmtDate.format(d)
}

/** Seconds to the rounded "N นาที" / "N ชม. M นาที" the course pages use. */
export function minutes(seconds: number): string {
  const m = Math.round((seconds || 0) / 60)
  if (m < 60) return `${m} นาที`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} ชม. ${rest} นาที` : `${h} ชม.`
}

/** Player time: mm:ss, or h:mm:ss once an hour is involved. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function levelShort(level: string): string {
  return { beginner: 'เริ่มต้น', intermediate: 'กลาง', advanced: 'สูง' }[level] ?? level
}

/** Clamp and round a percentage the way the progress bar expects. */
export function pct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value || 0)))
}
