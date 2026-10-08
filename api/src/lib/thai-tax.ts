/**
 * Thai thirteen-digit identifiers.
 *
 * A company's tax ID and a person's national ID are the same thing to the
 * Revenue Department: thirteen digits whose last one is a check digit. Checking
 * it here matters because the number is not ours to fix later — a full tax
 * invoice carrying a typo is rejected by the buyer's accountant weeks after the
 * sale, and by then the only way to correct it is to cancel the document and
 * issue another.
 *
 * It is a checksum, not a lookup: it catches a mistyped or transposed digit,
 * not a number that simply belongs to nobody.
 */

/** Digits only, so a number pasted as 0-1055-12345-67-8 still checks out. */
export function normaliseTaxId(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * The last digit is `(11 - sum(digit[i] * (13 - i)) % 11) % 10`.
 */
export function isValidTaxId(value: string): boolean {
  const digits = normaliseTaxId(value)
  if (digits.length !== 13) return false

  let sum = 0
  for (let i = 0; i < 12; i += 1) {
    sum += Number(digits[i]) * (13 - i)
  }
  return (11 - (sum % 11)) % 10 === Number(digits[12])
}

/**
 * A branch code is five digits, and a head office is `00000` by law. An actual
 * branch is 00001 upwards, so a branch calling itself 00000 is a contradiction
 * rather than a quirk.
 */
export function isValidBranchCode(value: string, type: 'head' | 'branch'): boolean {
  if (!/^\d{5}$/.test(value)) return false
  return type === 'head' ? value === '00000' : value !== '00000'
}

export const HEAD_OFFICE_CODE = '00000'
