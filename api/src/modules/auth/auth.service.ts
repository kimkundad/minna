import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../db/client'
import type { Locale } from '../../db/schema/auth'
import {
  passwordResets,
  refreshTokens,
  roles as rolesTable,
  userRoles,
  users,
} from '../../db/schema/index'
import { env } from '../../config/env'
import { conflict, invalidCredentials, notFound, unauthorized } from '../../lib/errors'
import { hashPassword, needsRehash, verifyPassword } from '../../lib/password'
import { expiresAt, generateToken, hashToken } from '../../lib/tokens'
import type { RoleName } from '../../plugins/auth'

export interface PublicUser {
  id: number
  email: string
  firstName: string
  lastName: string
  locale: Locale
  roles: RoleName[]
  avatarPath: string | null
  privacyAcceptedAt: Date | null
  emailVerifiedAt: Date | null
}

export async function rolesOf(userId: number): Promise<RoleName[]> {
  const rows = await db
    .select({ name: rolesTable.name })
    .from(userRoles)
    .innerJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
    .where(eq(userRoles.userId, userId))
  return rows.map((r) => r.name)
}

export async function findUser(userId: number): Promise<PublicUser> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!row) throw notFound('Account not found.')
  return toPublicUser(row, await rolesOf(row.id))
}

function toPublicUser(row: typeof users.$inferSelect, roles: RoleName[]): PublicUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    locale: row.locale,
    roles,
    avatarPath: row.avatarPath,
    privacyAcceptedAt: row.privacyAcceptedAt,
    emailVerifiedAt: row.emailVerifiedAt,
  }
}

export interface DeviceInfo {
  deviceLabel?: string | undefined
  ip?: string | undefined
  userAgent?: string | undefined
}

/** Issues a fresh refresh token row and returns the plaintext, which is the
 *  only moment it exists outside the client. */
export async function issueRefreshToken(userId: number, device: DeviceInfo): Promise<string> {
  const token = generateToken()
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(token),
    deviceLabel: device.deviceLabel ?? null,
    ip: device.ip ?? null,
    userAgent: device.userAgent?.slice(0, 512) ?? null,
    expiresAt: expiresAt(env.JWT_REFRESH_TTL),
  })
  return token
}

export async function register(input: {
  email: string
  password: string
  firstName: string
  lastName: string
  birthdate: string
  phoneCountryCode?: string | undefined
  phoneNational?: string | undefined
  locale: Locale
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase()

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (taken) {
    throw conflict('That email is already registered.', { email: 'Already registered.' })
  }

  await db.insert(users).values({
    email,
    passwordHash: await hashPassword(input.password),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    birthdate: input.birthdate,
    phoneCountryCode: input.phoneCountryCode ?? null,
    phoneNational: input.phoneNational ?? null,
    locale: input.locale,
  })

  const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!created) throw new Error('user row vanished right after insert')

  const [studentRole] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.name, 'student'))
    .limit(1)
  if (studentRole) {
    await db.insert(userRoles).values({ userId: created.id, roleId: studentRole.id })
  }

  return toPublicUser(created, studentRole ? ['student'] : [])
}

export async function login(email: string, password: string): Promise<PublicUser> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1)

  // Still hash something when the account is missing, so a wrong email and a
  // wrong password take the same time to answer.
  if (!row) {
    await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaa', password)
    throw invalidCredentials()
  }

  if (!(await verifyPassword(row.passwordHash, password))) throw invalidCredentials()
  if (row.status === 'suspended') throw unauthorized('This account has been suspended.')

  // Quietly upgrade a hash made with older parameters.
  if (needsRehash(row.passwordHash)) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, row.id))
  }

  return toPublicUser(row, await rolesOf(row.id))
}

/**
 * Trades a refresh token for the next one and reports who it belonged to.
 *
 * Reuse of an already-rotated token means the client was copied, so every
 * session for that user is revoked rather than just the one token.
 */
export async function rotateRefreshToken(
  token: string,
  device: DeviceInfo,
): Promise<{ user: PublicUser; refreshToken: string }> {
  const tokenHash = hashToken(token)
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1)

  if (!row) throw unauthorized('Please sign in again.')

  if (row.revokedAt || row.replacedBy) {
    await revokeAllSessions(row.userId)
    throw unauthorized('This session was replaced. Please sign in again.')
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Your session has expired. Please sign in again.')
  }

  const next = generateToken()
  await db.insert(refreshTokens).values({
    userId: row.userId,
    tokenHash: hashToken(next),
    deviceLabel: device.deviceLabel ?? row.deviceLabel,
    ip: device.ip ?? row.ip,
    userAgent: device.userAgent?.slice(0, 512) ?? row.userAgent,
    expiresAt: expiresAt(env.JWT_REFRESH_TTL),
  })

  const [created] = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(next)))
    .limit(1)

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedBy: created?.id ?? null })
    .where(eq(refreshTokens.id, row.id))

  return { user: await findUser(row.userId), refreshToken: next }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, hashToken(token)), isNull(refreshTokens.revokedAt)))
}

export async function revokeAllSessions(userId: number): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
}

export async function listSessions(userId: number, currentToken?: string) {
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )

  const currentHash = currentToken ? hashToken(currentToken) : null
  return rows.map((r) => ({
    id: r.id,
    deviceLabel: r.deviceLabel,
    ip: r.ip,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    current: currentHash !== null && r.tokenHash === currentHash,
  }))
}

export async function revokeSession(userId: number, sessionId: number): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, sessionId), eq(refreshTokens.userId, userId)))
}

/**
 * Always resolves, whether or not the address belongs to anyone: answering
 * differently would turn this endpoint into a way to discover who has an
 * account. Returns the token when there is one so the caller can mail it.
 */
export async function createPasswordReset(email: string): Promise<string | null> {
  const normalised = email.trim().toLowerCase()
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalised)).limit(1)
  if (!row) return null

  const token = generateToken(32)
  await db.insert(passwordResets).values({
    email: normalised,
    tokenHash: hashToken(token),
    expiresAt: expiresAt('1h'),
  })
  return token
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const [row] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, hashToken(token)))
    .limit(1)

  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('This reset link is no longer valid. Request a new one.')
  }

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, row.email)).limit(1)
  if (!user) throw notFound('Account not found.')

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, user.id))
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id))

  // A password change ends every session: if the reset was prompted by a
  // break-in, leaving the intruder signed in defeats the point.
  await revokeAllSessions(user.id)
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!row) throw notFound('Account not found.')
  if (!(await verifyPassword(row.passwordHash, currentPassword))) {
    throw invalidCredentials('Your current password is incorrect.')
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, userId))
  await revokeAllSessions(userId)
}

export async function acceptPrivacy(userId: number): Promise<void> {
  await db.update(users).set({ privacyAcceptedAt: new Date() }).where(eq(users.id, userId))
}
