/**
 * Makes a throwaway account and prints the two tokens an email would carry, so
 * the pages they land on can be walked for real.
 *
 *   npx tsx scripts/make-auth-links.mts        — create and print
 *   npx tsx scripts/make-auth-links.mts down   — remove the account
 *
 * The tokens come from the same service the mailer uses, so what is tested is
 * the real thing rather than a shape that looks like it.
 */
import { eq, like } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  emailVerifications,
  passwordResets,
  refreshTokens,
  userRoles,
  users,
} from '../src/db/schema/index'
import { hashPassword } from '../src/lib/password'
import { createEmailVerification, createPasswordReset } from '../src/modules/auth/auth.service'

const EMAIL = 'link.test@example.com'

if (process.argv[2] === 'down') {
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(like(users.email, 'link.test%'))
  for (const r of rows) {
    // Password resets are keyed by address, not by account: the form that
    // asks for one only has an email to go on.
    await db.delete(passwordResets).where(eq(passwordResets.email, r.email))
    await db.delete(emailVerifications).where(eq(emailVerifications.userId, r.id))
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, r.id))
    await db.delete(userRoles).where(eq(userRoles.userId, r.id))
    await db.delete(users).where(eq(users.id, r.id))
  }
  console.log(`removed ${rows.length} account(s)`)
  process.exit(0)
}

const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1)

let userId: number
if (existing) {
  userId = existing.id
  // A fresh run needs an unverified address, or the verification token would
  // be refused before the page ever sees it.
  await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, userId))
} else {
  const [res] = await db.insert(users).values({
    email: EMAIL,
    passwordHash: await hashPassword('LinkTest!2026'),
    firstName: 'Link',
    lastName: 'Test',
    birthdate: '1995-01-01',
    locale: 'th',
    status: 'active',
  })
  userId = Number(res.insertId)
}

const reset = await createPasswordReset(EMAIL)
const verify = await createEmailVerification(userId)

if (!reset || !verify) {
  console.error('could not make both tokens')
  process.exit(1)
}

console.log(reset.token)
console.log(verify.token)
process.exit(0)
