import { randomBytes } from 'node:crypto'
import { and, asc, count, desc, eq, inArray, like, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  categories,
  roles as rolesTable,
  teacherApplications,
  teacherProfiles,
  userRoles,
  users,
} from '../../db/schema/index'
import { conflict, notFound } from '../../lib/errors'
import { hashPassword } from '../../lib/password'
import { revokeAllSessions } from '../auth/auth.service'
import type { RoleName } from '../../plugins/auth'

export interface Paged<T> {
  data: T[]
  meta: { page: number; perPage: number; total: number; totalPages: number }
}

function paged<T>(data: T[], total: number, page: number, perPage: number): Paged<T> {
  return {
    data,
    meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  }
}

/* ---------------- members ---------------- */

export interface MemberListOptions {
  page: number
  perPage: number
  q?: string | undefined
  role?: RoleName | undefined
  status?: 'active' | 'suspended' | undefined
  group?: 'students' | 'teachers' | 'admins' | undefined
  sort: 'newest' | 'name' | 'email'
}

export async function listMembers(opts: MemberListOptions): Promise<Paged<unknown>> {
  const where = [
    opts.status ? eq(users.status, opts.status) : undefined,
    opts.q
      ? or(
          like(users.email, `%${opts.q}%`),
          like(users.firstName, `%${opts.q}%`),
          like(users.lastName, `%${opts.q}%`),
        )
      : undefined,
    opts.role
      ? sql`EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ${users.id} AND r.name = ${opts.role}
        )`
      : undefined,
    // Three screens, three questions. A student is anyone who cannot open the
    // admin, which includes an account with no role at all — it still has to
    // appear somewhere or nobody can find it.
    //
    // The groups overlap on purpose: someone who teaches and administers is
    // listed under both, because both screens have something to do with them.
    opts.group === 'teachers'
      ? sql`EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ${users.id} AND r.name = 'teacher'
        )`
      : opts.group === 'admins'
        ? sql`EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = ${users.id} AND r.name IN ('superadmin','admin')
          )`
        : opts.group === 'students'
          ? sql`NOT EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = ${users.id} AND r.name IN ('superadmin','admin','teacher')
            )`
          : undefined,
  ].filter(Boolean)

  const filter = where.length ? and(...(where as never[])) : undefined

  const order =
    opts.sort === 'name'
      ? asc(users.firstName)
      : opts.sort === 'email'
        ? asc(users.email)
        : desc(users.createdAt)

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(users)
    .where(filter)

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      status: users.status,
      locale: users.locale,
      avatarPath: users.avatarPath,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(filter)
    .orderBy(order)
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  // One extra query for the roles of this page, rather than a join that would
  // multiply every member row by the number of roles they hold.
  const ids = rows.map((r) => r.id)
  const held = ids.length
    ? await db
        .select({ userId: userRoles.userId, name: rolesTable.name })
        .from(userRoles)
        .innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
        .where(inArray(userRoles.userId, ids))
    : []

  return paged(
    rows.map((r) => ({
      ...r,
      roles: held.filter((h) => h.userId === r.id).map((h) => h.name),
    })),
    total,
    opts.page,
    opts.perPage,
  )
}

export async function getMember(id: number) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!row) throw notFound('That member does not exist.')

  const held = await db
    .select({ name: rolesTable.name })
    .from(userRoles)
    .innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
    .where(eq(userRoles.userId, id))

  const { passwordHash: _ignored, ...safe } = row
  return { ...safe, roles: held.map((h) => h.name) }
}

/** Replaces the whole set. Returns what changed, for the audit log. */
export async function setRoles(userId: number, next: RoleName[]) {
  const before = await getMember(userId)

  const wanted = await db
    .select()
    .from(rolesTable)
    .where(next.length ? inArray(rolesTable.name, next) : eq(rolesTable.id, 0))

  await db.delete(userRoles).where(eq(userRoles.userId, userId))
  if (wanted.length) {
    await db.insert(userRoles).values(wanted.map((r) => ({ userId, roleId: r.id })))
  }

  return { before: before.roles as RoleName[], after: wanted.map((r) => r.name) }
}

export async function setStatus(userId: number, status: 'active' | 'suspended') {
  const before = await getMember(userId)
  await db.update(users).set({ status }).where(eq(users.id, userId))
  return { before: before.status, after: status, member: before }
}

/** How many superadmins there are, so the last one cannot be removed. */
export async function countSuperadmins(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userRoles)
    .innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
    .where(eq(rolesTable.name, 'superadmin'))
  return row?.value ?? 0
}

/* ---------------- teacher applications ---------------- */

export async function listApplications(opts: {
  page: number
  perPage: number
  status?: 'pending' | 'approved' | 'rejected' | undefined
  q?: string | undefined
}): Promise<Paged<unknown>> {
  const where = [
    opts.status ? eq(teacherApplications.status, opts.status) : undefined,
    opts.q
      ? or(
          like(teacherApplications.name, `%${opts.q}%`),
          like(teacherApplications.email, `%${opts.q}%`),
          like(teacherApplications.subject, `%${opts.q}%`),
        )
      : undefined,
  ].filter(Boolean)

  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(teacherApplications)
    .where(filter)

  const rows = await db
    .select({
      id: teacherApplications.id,
      name: teacherApplications.name,
      email: teacherApplications.email,
      phone: teacherApplications.phone,
      subject: teacherApplications.subject,
      categoryId: teacherApplications.categoryId,
      categoryName: categories.name,
      status: teacherApplications.status,
      contactTime: teacherApplications.contactTime,
      createdAt: teacherApplications.createdAt,
      approvedAt: teacherApplications.approvedAt,
    })
    .from(teacherApplications)
    .leftJoin(categories, eq(categories.id, teacherApplications.categoryId))
    .where(filter)
    // Pending first: this is a queue, not an archive.
    .orderBy(
      sql`FIELD(${teacherApplications.status}, 'pending', 'approved', 'rejected')`,
      desc(teacherApplications.createdAt),
    )
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return paged(rows, total, opts.page, opts.perPage)
}

export async function getApplication(id: number) {
  const [row] = await db
    .select()
    .from(teacherApplications)
    .where(eq(teacherApplications.id, id))
    .limit(1)
  if (!row) throw notFound('That application does not exist.')

  // The account they registered with, matched by the address they applied on.
  const [account] = await db
    .select({ id: users.id, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.email, row.email))
    .limit(1)

  return { ...row, account: account ?? null }
}

/**
 * Approving grants the teacher role to the account that applied.
 *
 * The role is what the whole application is for, so it is granted here rather
 * than left as a second thing to remember on the members screen — an approved
 * application that does not let someone teach is worse than no approval.
 */
export async function decideApplication(
  id: number,
  decision: 'approved' | 'rejected',
  decidedBy: number,
  categoryId?: number | null,
) {
  const app = await getApplication(id)
  if (app.status !== 'pending') {
    throw conflict(`That application was already ${app.status}.`)
  }

  await db
    .update(teacherApplications)
    .set({
      status: decision,
      approvedBy: decidedBy,
      approvedAt: new Date(),
      ...(categoryId === undefined ? {} : { categoryId }),
    })
    .where(eq(teacherApplications.id, id))

  let granted = false
  if (decision === 'approved' && app.account) {
    const [teacherRole] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, 'teacher'))
      .limit(1)
    if (teacherRole) {
      const existing = await db
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, app.account.id), eq(userRoles.roleId, teacherRole.id)))
        .limit(1)
      if (!existing.length) {
        await db.insert(userRoles).values({ userId: app.account.id, roleId: teacherRole.id })
        granted = true
      }
    }
  }

  return { application: await getApplication(id), granted }
}

/**
 * Creates a staff account with no usable password.
 *
 * The hash stored is of a value nobody holds, so the account cannot be signed
 * into until someone follows a set-password link. That is deliberate: an
 * account that exists with a password an administrator chose is an account two
 * people can open.
 */
export async function createMember(input: {
  email: string
  firstName: string
  lastName: string
  roles: RoleName[]
  locale: 'th' | 'en' | 'jp' | 'vn'
}) {
  const email = input.email.trim().toLowerCase()

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (taken) throw conflict('That email already has an account.', { email: 'Already registered.' })

  await db.insert(users).values({
    email,
    // Argon2 over 64 random bytes: valid, and matching nothing anyone can type.
    passwordHash: await hashPassword(randomBytes(64).toString('base64url')),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    locale: input.locale,
    // Staff are created by a person who already knows who they are, so the
    // address does not need proving a second time.
    emailVerifiedAt: new Date(),
    privacyAcceptedAt: new Date(),
  })

  const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!created) throw new Error('user row vanished right after insert')

  await setRoles(created.id, input.roles)
  return getMember(created.id)
}

/**
 * Sets someone else's password.
 *
 * Every session of theirs ends with it. Two reasons: if the account was being
 * misused, leaving the intruder signed in defeats the point; and the person
 * whose password just changed finds out immediately rather than discovering it
 * days later.
 */
export async function setPassword(userId: number, password: string) {
  const member = await getMember(userId)
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId))
  await revokeAllSessions(userId)
  return member
}

/* ---------------- teacher profiles ---------------- */

export async function getTeacherProfile(userId: number) {
  const [row] = await db
    .select()
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, userId))
    .limit(1)
  return row ?? null
}

export async function saveTeacherProfile(
  userId: number,
  input: {
    displayName: string
    shortName: string
    slug: string
    headline?: string | null | undefined
    bio?: string | null | undefined
    languages?: string[] | undefined
    credentials?: string | null | undefined
    yearsExperience?: number | null | undefined
    listed: boolean
    avatarPath?: string | null | undefined
  },
) {
  // The member has to exist, and the profile belongs to an account rather
  // than standing alone.
  await getMember(userId)

  const clash = await db
    .select({ userId: teacherProfiles.userId })
    .from(teacherProfiles)
    .where(and(eq(teacherProfiles.slug, input.slug), ne(teacherProfiles.userId, userId)))
    .limit(1)
  if (clash.length) {
    throw conflict('Another teacher already uses that slug.', { slug: 'Already in use.' })
  }

  const values = {
    displayName: input.displayName,
    shortName: input.shortName,
    slug: input.slug,
    headline: input.headline ?? null,
    bio: input.bio ?? null,
    languages: (input.languages ?? []) as never,
    credentials: input.credentials ?? null,
    yearsExperience: input.yearsExperience ?? null,
    listed: input.listed,
  }

  // The picture belongs to the account; everything else to the profile.
  if (input.avatarPath !== undefined) {
    await db.update(users).set({ avatarPath: input.avatarPath }).where(eq(users.id, userId))
  }

  const existing = await getTeacherProfile(userId)
  if (existing) {
    await db.update(teacherProfiles).set(values).where(eq(teacherProfiles.userId, userId))
  } else {
    await db.insert(teacherProfiles).values({ userId, ...values })
  }

  return { before: existing, after: (await getTeacherProfile(userId))! }
}

/**
 * Everyone who can be put on a course.
 *
 * Returns the display name where there is a profile and the account name where
 * there is not, so a teacher appointed this morning can still be assigned
 * before anyone has written their page.
 */
export async function listTeachersForPicker() {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarPath: users.avatarPath,
      displayName: teacherProfiles.displayName,
      shortName: teacherProfiles.shortName,
      headline: teacherProfiles.headline,
      languages: teacherProfiles.languages,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .where(and(eq(rolesTable.name, 'teacher'), eq(users.status, 'active')))
    // By the name that is shown, not the one on the account. A school with
    // twenty teachers whose accounts all say the same first name sorts into an
    // arbitrary order otherwise, and a picker you cannot scan is no better than
    // no picker.
    .orderBy(
      asc(sql`COALESCE(${teacherProfiles.displayName}, CONCAT(${users.firstName}, ' ', ${users.lastName}))`),
    )

  return rows.map((r) => ({
    ...r,
    name: r.displayName ?? `${r.firstName} ${r.lastName}`.trim(),
    short: r.shortName ?? `${r.firstName} ${r.lastName}`.trim(),
    hasProfile: Boolean(r.displayName),
  }))
}
