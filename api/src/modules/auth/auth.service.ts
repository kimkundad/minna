import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../db/client'
import type { Locale } from '../../db/schema/auth'
import {
  emailVerifications,
  passwordResets,
  refreshTokens,
  roles as rolesTable,
  teacherApplications,
  userRoles,
  users,
} from '../../db/schema/index'
import { env } from '../../config/env'
import { conflict, invalidCredentials, notFound, unauthorized } from '../../lib/errors'
import { hashPassword, needsRehash, verifyPassword } from '../../lib/password'
import { expiresAt, generateToken, hashToken } from '../../lib/tokens'
import { notifyAdmins } from '../people/notify.service'
import type { RoleName } from '../../plugins/auth'

export interface PublicUser {
  id: number
  email: string
  firstName: string
  lastName: string
  locale: Locale
  roles: RoleName[]
  avatarPath: string | null
  /**
   * Carried on the session so a form can fill it in. Checkout asks for a phone
   * number on every order, and somebody who has given one already should not
   * be made to type it again — nor should the one they type be forgotten.
   */
  phoneCountryCode: string | null
  phoneNational: string | null
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
    phoneCountryCode: row.phoneCountryCode,
    phoneNational: row.phoneNational,
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
export async function issueRefreshToken(
  userId: number,
  device: DeviceInfo,
  remember = true,
): Promise<string> {
  const token = generateToken()
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(token),
    deviceLabel: device.deviceLabel ?? null,
    ip: device.ip ?? null,
    userAgent: device.userAgent?.slice(0, 512) ?? null,
    expiresAt: expiresAt(env.JWT_REFRESH_TTL),
    remember,
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
  acceptedTerms: true
  memberType: 'student' | 'teacher'
  teacher?:
    | {
        subject: string
        experience: string
        reason?: string | undefined
        contactTime?: string | undefined
      }
    | undefined
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
    // Consent is recorded at the moment it is given; the schema has already
    // refused anything but true.
    privacyAcceptedAt: new Date(),
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

  // Applying to teach does not grant the role: it files a request an admin
  // reviews. The account that exists in the meantime is an ordinary one.
  if (input.memberType === 'teacher' && input.teacher) {
    await db.insert(teacherApplications).values({
      name: `${input.firstName.trim()} ${input.lastName.trim()}`,
      email,
      phone: input.phoneNational
        ? `${input.phoneCountryCode ?? ''}${input.phoneNational}`
        : null,
      subject: input.teacher.subject,
      experience: input.teacher.experience,
      reason: input.teacher.reason ?? null,
      contactTime: input.teacher.contactTime ?? null,
      agreedAt: new Date(),
    })

    // An application nobody is told about waits as long as it takes somebody
    // to go looking, and the applicant is meanwhile waiting on us.
    const [filed] = await db
      .select({ id: teacherApplications.id })
      .from(teacherApplications)
      .where(eq(teacherApplications.email, email))
      .orderBy(desc(teacherApplications.id))
      .limit(1)
    if (filed) {
      await notifyAdmins({
        type: 'teacher.applied',
        title: 'มีใบสมัครเป็นผู้สอนใหม่',
        body: `${input.firstName.trim()} ${input.lastName.trim()} · ${input.teacher.subject}`,
        link: '/teacher-applications',
        subject: { type: 'teacher_application', id: filed.id },
      })
    }
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
/** How recently a rotation has to have happened for a second attempt with the
 *  same token to be read as one browser renewing twice at once rather than as
 *  a stolen token being replayed. */
const CONCURRENT_RENEWAL_GRACE_MS = 10_000

export async function rotateRefreshToken(
  token: string,
  device: DeviceInfo,
): Promise<{ user: PublicUser; refreshToken: string; remember: boolean }> {
  const tokenHash = hashToken(token)
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1)

  if (!row) throw unauthorized('Please sign in again.')

  /**
   * A token that has already been rotated, used again.
   *
   * Usually that means a stolen one is being replayed, and the answer is to
   * end every session the account has — the legitimate holder signs in again,
   * the thief gets nothing.
   *
   * But one honest case looks identical. A browser that fires several requests
   * at once gets several 401s at once, and each one tries to renew with the
   * same cookie; the ones that lose arrive a moment after the winner has
   * rotated the row. Treating that as theft would sign somebody out of
   * everything for opening a page. So a rotation seconds old is read as the
   * race it is: that one request is refused and nothing else is touched.
   *
   * The window is small enough that a replay would have to land inside the
   * same breath as the real renewal to benefit from it, and the attacker would
   * still only hold a token the account's own next renewal invalidates.
   */
  if (row.revokedAt || row.replacedBy) {
    const age = row.revokedAt ? Date.now() - row.revokedAt.getTime() : Infinity
    if (age > CONCURRENT_RENEWAL_GRACE_MS) {
      await revokeAllSessions(row.userId)
    }
    throw unauthorized('This session was replaced. Please sign in again.')
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Your session has expired. Please sign in again.')
  }

  /**
   * Claim the old row before minting the new one.
   *
   * The check above is a read, and two requests carrying the same cookie can
   * both pass it before either writes — which is not hypothetical: a page that
   * fires several requests at once gets several 401s at once, and each one
   * tries to renew. Inserting first meant both inserted, so one browser came
   * away holding two live sessions, listed twice on the settings screen, and
   * the replay check this rotation exists for had quietly been lost.
   *
   * `revoked_at IS NULL` in the WHERE makes the claim the race: exactly one
   * UPDATE can match, and whoever loses is told to sign in again rather than
   * being handed a second session.
   */
  const claimed = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
  if (!affected(claimed)) {
    throw unauthorized('This session was replaced. Please sign in again.')
  }

  const next = generateToken()
  await db.insert(refreshTokens).values({
    userId: row.userId,
    tokenHash: hashToken(next),
    deviceLabel: device.deviceLabel ?? row.deviceLabel,
    ip: device.ip ?? row.ip,
    userAgent: device.userAgent?.slice(0, 512) ?? row.userAgent,
    expiresAt: expiresAt(env.JWT_REFRESH_TTL),
    remember: row.remember,
  })

  const [created] = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(next)))
    .limit(1)

  await db
    .update(refreshTokens)
    .set({ replacedBy: created?.id ?? null })
    .where(eq(refreshTokens.id, row.id))

  return { user: await findUser(row.userId), refreshToken: next, remember: row.remember }
}

/** How many rows a mysql2 UPDATE actually changed. */
function affected(result: unknown): boolean {
  const header = Array.isArray(result) ? result[0] : result
  return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0) > 0
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
export async function createPasswordReset(
  email: string,
): Promise<{ token: string; name: string } | null> {
  const normalised = email.trim().toLowerCase()
  const [row] = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.email, normalised))
    .limit(1)
  if (!row) return null

  const token = generateToken(32)
  await db.insert(passwordResets).values({
    email: normalised,
    tokenHash: hashToken(token),
    expiresAt: expiresAt('1h'),
  })
  return { token, name: `${row.firstName} ${row.lastName}`.trim() }
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

/**
 * Issues a verification link for the address on the account.
 *
 * Any link already outstanding is retired first, so a "resend" cannot leave two
 * working links in two different inboxes — including the old address, if the
 * account's email was changed in between.
 */
export async function createEmailVerification(
  userId: number,
): Promise<{ token: string; email: string; name: string } | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!row) throw notFound('Account not found.')
  if (row.emailVerifiedAt) return null

  await db
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.usedAt)))

  const token = generateToken(32)
  await db.insert(emailVerifications).values({
    userId,
    email: row.email,
    tokenHash: hashToken(token),
    expiresAt: expiresAt('24h'),
  })

  return { token, email: row.email, name: `${row.firstName} ${row.lastName}`.trim() }
}

/**
 * Consumes a verification link.
 *
 * The link proves one specific address, so it is refused when the account has
 * since moved to another: otherwise changing your email to someone else's and
 * then opening an older link would mark the new one verified.
 */
export async function verifyEmail(token: string): Promise<PublicUser> {
  const [row] = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.tokenHash, hashToken(token)))
    .limit(1)

  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('This link is no longer valid. Request a new one.')
  }

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1)
  if (!user) throw notFound('Account not found.')
  if (user.email !== row.email) {
    throw unauthorized('This link was sent to a different address. Request a new one.')
  }

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id))
  await db
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(eq(emailVerifications.id, row.id))

  return toPublicUser({ ...user, emailVerifiedAt: new Date() }, await rolesOf(user.id))
}

export async function acceptPrivacy(userId: number): Promise<void> {
  await db.update(users).set({ privacyAcceptedAt: new Date() }).where(eq(users.id, userId))
}
