import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  categories,
  roles as rolesTable,
  teacherApplications,
  userRoles,
  users,
} from '../../db/schema/index'
import { conflict, notFound } from '../../lib/errors'
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
