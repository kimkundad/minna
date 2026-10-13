/**
 * The currencies this school deals in.
 *
 * Every one was put to Stripe on this account's test key and accepted, which
 * is the only test that counts — a currency Stripe will not present is a price
 * nobody can pay, and a payout currency nobody can be paid in.
 */

export interface CurrencyDef {
  code: string
  /** As a price is written, before the amount: ฿1,590, $49. */
  symbol: string
  /**
   * Decimal places Stripe counts the amount in.
   *
   * Not a detail: `unit_amount` for yen is whole yen, so ¥5,000 stored the way
   * baht are stored and sent on unchanged would charge ¥500,000. Taken from
   * what Stripe actually returned rather than from a list — it is also where
   * IDR surprises people, being written Rp1,000.00 and so carrying two places
   * like the rest.
   */
  exponent: 0 | 2
  /**
   * What a converted price is rounded up to, in whole units, so that a figure
   * worked out from an exchange rate reads like a price rather than like
   * arithmetic. Rounding down would give away the margin the rounding exists
   * to protect.
   */
  step: number
  name: { en: string; th: string }
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'THB', symbol: '฿', exponent: 2, step: 1, name: { en: 'Thai baht', th: 'บาท' } },
  { code: 'USD', symbol: '$', exponent: 2, step: 1, name: { en: 'US dollar', th: 'ดอลลาร์สหรัฐ' } },
  { code: 'EUR', symbol: '€', exponent: 2, step: 1, name: { en: 'Euro', th: 'ยูโร' } },
  { code: 'GBP', symbol: '£', exponent: 2, step: 1, name: { en: 'Pound sterling', th: 'ปอนด์' } },
  { code: 'JPY', symbol: '¥', exponent: 0, step: 100, name: { en: 'Japanese yen', th: 'เยน' } },
  { code: 'KRW', symbol: '₩', exponent: 0, step: 100, name: { en: 'Korean won', th: 'วอน' } },
  { code: 'CNY', symbol: '¥', exponent: 2, step: 10, name: { en: 'Chinese yuan', th: 'หยวน' } },
  {
    code: 'HKD',
    symbol: 'HK$',
    exponent: 2,
    step: 1,
    name: { en: 'Hong Kong dollar', th: 'ดอลลาร์ฮ่องกง' },
  },
  {
    code: 'TWD',
    symbol: 'NT$',
    exponent: 2,
    step: 10,
    name: { en: 'Taiwan dollar', th: 'ดอลลาร์ไต้หวัน' },
  },
  {
    code: 'SGD',
    symbol: 'S$',
    exponent: 2,
    step: 1,
    name: { en: 'Singapore dollar', th: 'ดอลลาร์สิงคโปร์' },
  },
  { code: 'MYR', symbol: 'RM', exponent: 2, step: 10, name: { en: 'Malaysian ringgit', th: 'ริงกิต' } },
  {
    code: 'IDR',
    symbol: 'Rp',
    exponent: 2,
    step: 1000,
    name: { en: 'Indonesian rupiah', th: 'รูเปียห์' },
  },
  { code: 'PHP', symbol: '₱', exponent: 2, step: 10, name: { en: 'Philippine peso', th: 'เปโซ' } },
  { code: 'VND', symbol: '₫', exponent: 0, step: 1000, name: { en: 'Vietnamese dong', th: 'ด่ง' } },
  { code: 'INR', symbol: '₹', exponent: 2, step: 10, name: { en: 'Indian rupee', th: 'รูปี' } },
  {
    code: 'AUD',
    symbol: 'A$',
    exponent: 2,
    step: 1,
    name: { en: 'Australian dollar', th: 'ดอลลาร์ออสเตรเลีย' },
  },
  {
    code: 'NZD',
    symbol: 'NZ$',
    exponent: 2,
    step: 1,
    name: { en: 'New Zealand dollar', th: 'ดอลลาร์นิวซีแลนด์' },
  },
  {
    code: 'CAD',
    symbol: 'C$',
    exponent: 2,
    step: 1,
    name: { en: 'Canadian dollar', th: 'ดอลลาร์แคนาดา' },
  },
]

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [string, ...string[]]

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

export function isCurrencyCode(code: string): boolean {
  return BY_CODE.has(code.toUpperCase())
}

/** Unknown falls back to baht rather than throwing: a price must still show. */
export function currency(code: string | null | undefined): CurrencyDef {
  return BY_CODE.get((code ?? '').toUpperCase()) ?? BY_CODE.get('THB')!
}

/**
 * An amount in the database's unit, as Stripe counts it.
 *
 * Every money column here is hundredths — baht as satang, and yen the same
 * way, so ¥5,000 is 500000. One rule across the database means a sum, a
 * discount and a comparison behave identically whatever the currency, and this
 * is the single place it is undone.
 */
export function toStripeAmount(minor: number, code: string): number {
  return currency(code).exponent === 0 ? Math.round(minor / 100) : minor
}

/**
 * Stripe's smallest charge, per currency, in the database's unit.
 *
 * Stripe refuses a session under roughly ฿10 and says so in a message about
 * conversion that reads as a configuration fault. Checked here so the buyer is
 * told the course is too cheap to sell in this currency, in a sentence that
 * makes sense, before a payment page is built for them.
 *
 * Deliberately approximate, and deliberately low: this is a guard against a
 * confusing error, not a second source of truth about Stripe's limits, and
 * Stripe still has the last word.
 */
const MINIMUMS: Record<string, number> = {
  THB: 1000,
  USD: 50,
  EUR: 50,
  GBP: 30,
  JPY: 5000,
  KRW: 50000,
  CNY: 400,
  HKD: 400,
  TWD: 1000,
  SGD: 50,
  MYR: 200,
  IDR: 50000,
  PHP: 2000,
  VND: 100000,
  INR: 5000,
  AUD: 50,
  NZD: 50,
  CAD: 50,
}

export function minimumCharge(code: string): number {
  return MINIMUMS[currency(code).code] ?? 1000
}
