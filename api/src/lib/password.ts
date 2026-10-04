import argon2 from 'argon2'

/**
 * Argon2id with OWASP's current baseline. Raising these later is safe: `verify`
 * reads the parameters out of the stored hash, so old hashes keep working and
 * `needsRehash` tells you which ones to upgrade on next login.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS)
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    // A malformed hash in the database must read as "wrong password", never as
    // a 500 that tells an attacker this account is special.
    return false
  }
}

export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, OPTIONS)
  } catch {
    return true
  }
}
