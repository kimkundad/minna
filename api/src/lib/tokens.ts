import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Refresh tokens are opaque random strings, not JWTs. A JWT cannot be taken
 * back once issued; a row in `refresh_tokens` can, which is what "log out this
 * device" and "log out everywhere" need. Only the hash is stored, so a dump of
 * the table hands out no sessions.
 */
export function generateToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time compare for two hex digests of equal length. */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/**
 * Parses the duration strings used for token lifetimes ("15m", "30d", "12h").
 * Returns milliseconds.
 */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(value.trim())
  if (!match) throw new Error(`Cannot read duration: ${value}`)

  const amount = Number(match[1])
  const unit = match[2] as 'ms' | 's' | 'm' | 'h' | 'd'
  const factor = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]
  return amount * factor
}

export function expiresAt(duration: string, from = new Date()): Date {
  return new Date(from.getTime() + parseDuration(duration))
}
