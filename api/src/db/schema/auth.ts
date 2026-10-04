import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  date,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

export const LOCALES = ['th', 'en', 'jp', 'vn'] as const
export type Locale = (typeof LOCALES)[number]

export const users = mysqlTable(
  'users',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    /** Always stored as a Gregorian year. The Buddhist year is a display concern. */
    birthdate: date('birthdate', { mode: 'string' }),
    phoneCountryCode: varchar('phone_country_code', { length: 8 }),
    phoneNational: varchar('phone_national', { length: 32 }),
    avatarPath: varchar('avatar_path', { length: 512 }),
    locale: mysqlEnum('locale', LOCALES).default('th').notNull(),
    status: mysqlEnum('status', ['active', 'suspended']).default('active').notNull(),
    privacyAcceptedAt: datetime('privacy_accepted_at'),
    emailVerifiedAt: datetime('email_verified_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email), index('users_status_idx').on(t.status)],
)

export const roles = mysqlTable(
  'roles',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: mysqlEnum('name', ['admin', 'teacher', 'student']).notNull(),
  },
  (t) => [uniqueIndex('roles_name_unique').on(t.name)],
)

export const userRoles = mysqlTable(
  'user_roles',
  {
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: bigint('role_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('user_roles_unique').on(t.userId, t.roleId),
    index('user_roles_role_idx').on(t.roleId),
  ],
)

/**
 * One row per issued refresh token, stored as a SHA-256 hash so a database leak
 * does not hand out sessions. `replacedBy` chains rotations: reusing a token
 * that has already been replaced means it was stolen, and the whole chain can
 * be revoked at once.
 */
export const refreshTokens = mysqlTable(
  'refresh_tokens',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    deviceLabel: varchar('device_label', { length: 120 }),
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),
    expiresAt: datetime('expires_at').notNull(),
    revokedAt: datetime('revoked_at'),
    replacedBy: bigint('replaced_by', { mode: 'number', unsigned: true }),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_unique').on(t.tokenHash),
    index('refresh_tokens_user_idx').on(t.userId),
    index('refresh_tokens_expires_idx').on(t.expiresAt),
  ],
)

export const passwordResets = mysqlTable(
  'password_resets',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at').notNull(),
    usedAt: datetime('used_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    uniqueIndex('password_resets_hash_unique').on(t.tokenHash),
    index('password_resets_email_idx').on(t.email),
  ],
)

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles),
  refreshTokens: many(refreshTokens),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(userRoles),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}))
