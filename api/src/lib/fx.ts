import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client'
import { fxRates } from '../db/schema/index'
import { CURRENCIES, currency } from './currencies'

/**
 * What a sale in another currency is worth in baht.
 *
 * The school prices courses in eighteen currencies and keeps its books in one.
 * Nothing here is ever shown to a buyer — a course priced at €49 takes €49,
 * and this only answers what that was worth to the school, so that revenue,
 * a member's lifetime spend and a teacher's share stay addable.
 *
 * Rates come from exchangerate-api's free endpoint, which publishes once a
 * day and promises nothing. That shapes the whole design: every fetch is
 * written to `fx_rates`, and a lookup falls back through today, to the most
 * recent day stored, and only then fails. A day-old rate on an internal figure
 * is a rounding difference; no rate at all is a shop that cannot take money.
 */

const SOURCE = 'https://open.er-api.com/v6/latest/THB'

/** How stale the newest stored rates may be before a sale is refused. */
const MAX_AGE_DAYS = 7

/** In-process, because a busy checkout would otherwise query per line. */
let memo: { at: number; day: string; rates: Map<string, number> } | null = null
const MEMO_MS = 60_000

function today(): string {
  // The provider's day is UTC, and so is this. Asking in Bangkok's day would
  // ask for tomorrow's rates for seven hours every evening.
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
}

/**
 * Fetch and store today's rates. Returns how many were written, or null if the
 * provider could not be reached — which is not an error here, because the
 * caller has yesterday's.
 */
export async function refreshRates(): Promise<number | null> {
  let payload: { result?: string; rates?: Record<string, number> }
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    payload = (await res.json()) as typeof payload
  } catch {
    return null
  }

  if (payload.result !== 'success' || !payload.rates) return null

  const day = today()
  const wanted = CURRENCIES.map((c) => c.code)
  const rows = wanted
    .map((code) => ({ code, rate: payload.rates![code] }))
    .filter((r) => typeof r.rate === 'number' && r.rate > 0)

  // Every currency or none. A partial day would be stored as fact and a
  // missing one would silently fall back to an older rate for that currency
  // alone, which is the kind of mixed-date arithmetic nobody can later explain.
  if (rows.length !== wanted.length) return null

  for (const row of rows) {
    await db
      .insert(fxRates)
      .values({ day, code: row.code, rate: String(row.rate) })
      .onDuplicateKeyUpdate({ set: { rate: String(row.rate), fetchedAt: new Date() } })
  }

  clearRateCache()
  return rows.length
}

/** The newest day stored, and its rates. Null when the table is empty. */
async function newestStored(): Promise<{ day: string; rates: Map<string, number> } | null> {
  const [latest] = await db
    .select({ day: fxRates.day })
    .from(fxRates)
    .orderBy(desc(fxRates.day))
    .limit(1)
  if (!latest) return null

  const rows = await db
    .select({ code: fxRates.code, rate: fxRates.rate })
    .from(fxRates)
    .where(eq(fxRates.day, latest.day))

  return { day: latest.day, rates: new Map(rows.map((r) => [r.code, Number(r.rate)])) }
}

/**
 * The rates to use right now: today's if they are stored, otherwise the newest
 * day there is — fetching once if the table has nothing for today yet.
 */
export async function currentRates(): Promise<{ day: string; rates: Map<string, number> } | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) {
    return { day: memo.day, rates: memo.rates }
  }

  let stored = await newestStored()
  if (!stored || stored.day !== today()) {
    await refreshRates()
    stored = await newestStored()
  }

  memo = stored ? { at: Date.now(), day: stored.day, rates: stored.rates } : null
  return stored
}

/** After writing rates by hand, or in a test that moves the clock. */
export function clearRateCache(): void {
  memo = null
}

export interface Conversion {
  /** The amount in satang. */
  thb: number
  /** How many of the source currency one baht bought. */
  rate: number
  day: string
}

/**
 * An amount in some currency's smallest unit, as satang.
 *
 * Refuses rather than guesses. A sale recorded against a rate a fortnight old
 * is a wrong number in the accounts that nobody will ever question, which is
 * worse than a checkout that says it cannot take this currency today.
 */
export async function toThb(minor: number, code: string): Promise<Conversion> {
  const upper = currency(code).code
  if (upper === 'THB') return { thb: minor, rate: 1, day: today() }

  const current = await currentRates()
  if (!current) {
    throw new Error('No exchange rates are available, so a sale in another currency cannot be recorded.')
  }
  if (daysBetween(current.day, today()) > MAX_AGE_DAYS) {
    throw new Error(
      `The newest exchange rates are from ${current.day}, which is too old to price a sale against.`,
    )
  }

  const rate = current.rates.get(upper)
  if (!rate || rate <= 0) {
    throw new Error(`No exchange rate is stored for ${upper}.`)
  }

  // Rates are per baht — a baht buys 4.717448 yen — so the way back is a
  // division. Rounded once, at the end, because the figure is money.
  return { thb: Math.round(minor / rate), rate, day: current.day }
}

/** For the admin screen that explains where a figure came from. */
export async function storedRates(codes?: string[]) {
  const current = await currentRates()
  if (!current) return { day: null, rates: {} as Record<string, number> }
  const out: Record<string, number> = {}
  for (const [code, rate] of current.rates) {
    if (!codes || codes.includes(code)) out[code] = rate
  }
  return { day: current.day, rates: out }
}

/** Used by the smoke tests to prove the fallback without waiting a day. */
export async function ratesForDay(day: string) {
  const rows = await db
    .select({ code: fxRates.code, rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.day, day), inArray(fxRates.code, CURRENCIES.map((c) => c.code))))
  return new Map(rows.map((r) => [r.code, Number(r.rate)]))
}
