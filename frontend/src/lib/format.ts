/**
 * Numbers, dates and durations, written the way the reader's language writes
 * them.
 *
 * Every formatter here used to be built once, at module load, against `th-TH`,
 * with the Thai words for "นาที" and "เมื่อวาน" spelled into the code. That was
 * invisible while the site was Thai with three translations bolted on, and
 * stopped being invisible the moment there were eight: an Indonesian reader on
 * an Indonesian course page was told it was "Diperbarui 8 ตุลาคม 2569" and that
 * a lesson ran "0 นาที".
 *
 * So the locale is read at call time rather than baked in, from the same i18n
 * instance the router sets — which means a page that changes language
 * re-renders into the new one without any caller passing anything. The
 * formatters themselves are still cached, one per locale, because building an
 * `Intl.DateTimeFormat` is not cheap and a list of thirty orders asks for the
 * same one thirty times.
 */
import { store } from '@/vendor'
import { i18n } from '@/locales'

/**
 * Our locale keys are not BCP-47 tags, and `Intl` needs tags.
 *
 * `jp` and `vn` are shorthand for `ja` and `vi`. The two Chinese entries differ
 * by script rather than country, so they carry the region that writes each:
 * mainland for 简体, Taiwan for 繁體.
 *
 * `th-TH` keeps the Buddhist era, which is what a Thai reader expects to see —
 * 2569, not 2026. The other seven get their own calendars for the same reason.
 */
const INTL_TAG: Record<string, string> = {
  th: 'th-TH',
  en: 'en-GB',
  jp: 'ja-JP',
  vn: 'vi-VN',
  id: 'id-ID',
  zh: 'zh-CN',
  ko: 'ko-KR',
  tw: 'zh-TW',
}

/** The language being read right now, as the router set it. */
function active(): string {
  return String(i18n.global.locale.value ?? 'th')
}

/**
 * A BCP-47 tag for a locale key, falling back to the key when it already is
 * one and to Thai when it is nothing we know.
 *
 * Exported as `intlTag` for the few places that need their own `Intl` instance
 * — the chat, which formats on the school's clock rather than the reader's —
 * so the mapping lives in one file.
 */
function tag(locale?: string): string {
  const key = locale ?? active()
  return INTL_TAG[key] ?? (key.includes('-') ? key : 'th-TH')
}

export const intlTag = tag

/** `t` from the active i18n instance, for the words `Intl` has no opinion on. */
function translate(key: string, named?: Record<string, unknown>): string {
  return i18n.global.t(key, named ?? {})
}

/**
 * One formatter per locale per shape, built on first use.
 *
 * A plain object keyed by tag: there are eight languages and four shapes, so
 * the whole cache is smaller than one order row.
 */
function cached<T>(store: Record<string, T>, key: string, build: () => T): T {
  return (store[key] ??= build())
}

const dateCache: Record<string, Intl.DateTimeFormat> = {}
const dateLongCache: Record<string, Intl.DateTimeFormat> = {}
const timeCache: Record<string, Intl.DateTimeFormat> = {}
const relativeCache: Record<string, Intl.RelativeTimeFormat> = {}

const fmtDate = (locale?: string) =>
  cached(
    dateCache,
    tag(locale),
    () =>
      new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'short', year: 'numeric' }),
  )

const fmtDateLong = (locale?: string) =>
  cached(
    dateLongCache,
    tag(locale),
    () => new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'long', year: 'numeric' }),
  )

const fmtTime = (locale?: string) =>
  cached(
    timeCache,
    tag(locale),
    () =>
      new Intl.DateTimeFormat(tag(locale), { hour: '2-digit', minute: '2-digit', hour12: false }),
  )

const fmtRelative = (locale?: string) =>
  cached(
    relativeCache,
    tag(locale),
    () => new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' }),
  )

/** A string that states its own offset: `…Z`, `…+07:00`, `…-0500`. */
const ZONED = /(?:Z|[+-]\d{2}:?\d{2})$/

/**
 * A date from either world.
 *
 * The API sends real instants — `2026-10-08T17:12:46.000Z` — while the fixture
 * data is full of naive local strings like `2026-10-08` and `2026-10-08T14:30`.
 * The store's parser handles the second kind, but it reads the first kind with
 * its zone stripped, which in Bangkok makes anything recent seven hours older:
 * a lesson watched ten minutes ago was being shown as "เมื่อวาน".
 *
 * So: anything carrying its own offset is parsed as the instant it says it is,
 * and only the naive shapes go to the store.
 */
function parse(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string' && ZONED.test(value.trim())) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const dateApi = (store as unknown as { date: { parse: (v: unknown) => Date | null } }).date
  return dateApi?.parse ? dateApi.parse(value) : null
}

/** Digit grouping as the language writes it: 1290 → "1,290", or "1.290" to an
 *  Indonesian reader. */
export function num(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString(tag())
}

/**
 * Whole units of a currency, written the way that currency is written.
 *
 * Courses are priced in eighteen currencies and the price is never converted —
 * a course at €49 costs €49 here, in Tokyo and in Bangkok. So the number
 * carries its currency wherever it is shown, and the one thing this must never
 * do is print a figure in one currency with another's name on it.
 *
 * `Intl` knows the conventions this would otherwise get wrong: yen has no
 * decimals, the symbol goes before the number in some languages and after it
 * in others, and the digit grouping differs. Passing `currency` to it rather
 * than concatenating a symbol is what makes "¥7,700" and "7 700 €" both come
 * out right.
 *
 * The amount is in whole units, not the minor unit the API sends — callers
 * divide once, where they already do.
 */
export function money(amount: number, currency: string, locale?: string): string {
  const code = (currency || 'THB').toUpperCase()
  try {
    return new Intl.NumberFormat(tag(locale), {
      style: 'currency',
      currency: code,
      /**
       * The symbol alone: ฿2,990, not "THB 2,990".
       *
       * Intl's default disambiguates whenever the reader's language is not the
       * currency's home — so the Japanese page wrote "THB 2,990" over most of
       * this school's catalogue, and the Thai page wrote "US$100". Correct, and
       * not how a shop writes a price. Only one currency is ever on screen at a
       * time here, because a course is charged in the one it is priced in, so
       * there is nothing for the longer form to disambiguate from.
       */
      currencyDisplay: 'narrowSymbol',
      // Trailing zeros on a price read as a form field rather than a price;
      // Intl still gives yen none and euros two when they are needed.
      minimumFractionDigits: Number.isInteger(amount) ? 0 : undefined,
    }).format(amount)
  } catch {
    // An unknown code must not take the page down. Better a bare number with
    // its code than a blank where the price should be.
    return `${num(amount)} ${code}`
  }
}

/** An em dash stands in for a missing date, so a row never collapses. */
export function date(value: unknown): string {
  const d = parse(value)
  return d ? fmtDate().format(d) : '—'
}

export function dateLong(value: unknown): string {
  const d = parse(value)
  return d ? fmtDateLong().format(d) : '—'
}

export function dateTime(value: unknown): string {
  const d = parse(value)
  if (!d) return '—'
  // "น." is the Thai marker for a clock time and belongs only to Thai; the
  // other seven read it as a stray word after the time.
  const suffix = active() === 'th' ? ' น.' : ''
  return `${fmtDate().format(d)} · ${fmtTime().format(d)}${suffix}`
}

/**
 * Relative time, which stays relative only while that is still useful: past a
 * week an exact date tells you more than "47 วันที่แล้ว".
 *
 * `Intl.RelativeTimeFormat` writes the phrases, rather than a translation key
 * per unit: with `numeric: 'auto'` it gives "yesterday", "เมื่อวาน", "어제" and
 * "昨天" from the same call, including the plural rules and the word order each
 * language wants. Eight languages' worth of copy we would otherwise maintain
 * by hand, and get subtly wrong.
 */
export function relative(value: unknown): string {
  const d = parse(value)
  if (!d) return '—'

  const seconds = (Date.now() - d.getTime()) / 1000
  const rel = fmtRelative()
  if (seconds < 60) return rel.format(0, 'second')
  if (seconds < 3600) return rel.format(-Math.floor(seconds / 60), 'minute')

  // Calendar days, not elapsed ones: something watched at 23:50 is "เมื่อวาน"
  // at 00:10, not "วันนี้".
  const dateApi = (store as unknown as { date: { daysBetween: (a: Date, b: Date) => number } }).date
  const days = dateApi?.daysBetween ? dateApi.daysBetween(d, new Date()) : Math.floor(seconds / 86400)
  const suffix = active() === 'th' ? ' น.' : ''
  if (days === 0) return `${rel.format(0, 'day')} ${fmtTime().format(d)}${suffix}`
  if (days === 1) return `${rel.format(-1, 'day')} ${fmtTime().format(d)}${suffix}`
  if (days < 7) return rel.format(-days, 'day')
  return fmtDate().format(d)
}

/** Seconds to the rounded "N min" / "N hr M min" the course pages use. */
export function minutes(seconds: number): string {
  const m = Math.round((seconds || 0) / 60)
  if (m < 60) return translate('minutes', { n: m })
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? translate('hoursMinutes', { h, m: rest }) : translate('hours', { n: h })
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

/** Clamp and round a percentage the way the progress bar expects. */
export function pct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value || 0)))
}
