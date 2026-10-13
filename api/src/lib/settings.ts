import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { siteSettings } from '../db/schema/index'

/**
 * Site settings, read from the database.
 *
 * Cached for a minute. These are read on every price calculation and changed
 * a few times a year, so a query per checkout would be a round trip spent on
 * a number that has not moved since the last deploy. A minute is short enough
 * that an admin who changes VAT sees it take effect while still on the page.
 */
const CACHE_MS = 60_000
let cache: { at: number; values: Map<string, string> } | null = null

async function all(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.values

  const rows = await db.select().from(siteSettings)
  const values = new Map(rows.map((r) => [r.key, r.value ?? '']))
  cache = { at: Date.now(), values }
  return values
}

/** Call after writing a setting, so the next read is the new value. */
export function clearSettingsCache(): void {
  cache = null
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  return (await all()).get(key) ?? fallback
}

/**
 * What a new course starts its teacher's share at.
 *
 * Only a starting point: the share lives on the course, so a rate agreed with
 * one teacher does not move anybody else's, and `teacher_earnings` copies the
 * figure in per line so that changing either never rewrites what was already
 * earned.
 *
 * Out of range or unreadable falls back to the column's own default rather
 * than to zero — a typo in a settings box should not quietly stop paying
 * teachers.
 */
export async function getDefaultRevenueSharePct(): Promise<number> {
  const raw = Number((await all()).get('revenue_share_pct') ?? '')
  if (!Number.isFinite(raw)) return 25
  const whole = Math.round(raw)
  return whole >= 0 && whole <= 100 ? whole : 25
}

export interface VatRules {
  /** Whole percent, e.g. 7. */
  percent: number
  /** True when the displayed price already contains the tax, which is how
   *  Thai storefronts normally quote. */
  inclusive: boolean
}

export async function getVatRules(): Promise<VatRules> {
  const values = await all()
  const percent = Number(values.get('vat_percent') ?? '0')
  return {
    percent: Number.isFinite(percent) ? percent : 0,
    inclusive: (values.get('vat_inclusive') ?? 'true') !== 'false',
  }
}

/**
 * The tax inside, or on top of, an amount in satang.
 *
 * Inclusive: the price already contains it, so it is extracted —
 * 1,070 at 7% holds 70. Exclusive: it is added — 1,000 at 7% adds 70.
 *
 * Rounded once, at the total, rather than per line. Rounding each line and
 * adding them up drifts from the figure on the receipt by a satang or two,
 * and the receipt is what the customer checks.
 */
export function vatOf(amount: number, rules: VatRules): number {
  if (!rules.percent) return 0
  return rules.inclusive
    ? Math.round(amount - amount / (1 + rules.percent / 100))
    : Math.round(amount * (rules.percent / 100))
}
