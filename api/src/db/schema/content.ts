import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { LOCALES, users } from './auth'
import { categories } from './catalog'

export const NOTIFICATION_TYPES = [
  'purchase',
  'expiry',
  'essay_submitted',
  'essay_reviewed',
  'question_answered',
  'welcome',
] as const

export const posts = mysqlTable(
  'posts',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    excerpt: varchar('excerpt', { length: 500 }),
    coverPath: varchar('cover_path', { length: 512 }),
    contentHtml: text('content_html'),
    /** Articles are written in one language each; the reader's locale filters them. */
    contentLocale: mysqlEnum('content_locale', LOCALES).default('th').notNull(),
    status: mysqlEnum('status', ['draft', 'published']).default('draft').notNull(),
    publishedAt: datetime('published_at'),
    authorId: bigint('author_id', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('posts_slug_unique').on(t.slug),
    index('posts_published_idx').on(t.status, t.publishedAt),
    index('posts_locale_idx').on(t.contentLocale),
  ],
)

export const testimonials = mysqlTable(
  'testimonials',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    designation: varchar('designation', { length: 150 }),
    content: text('content').notNull(),
    rating: tinyint('rating', { unsigned: true }).default(5).notNull(),
    avatarPath: varchar('avatar_path', { length: 512 }),
    status: mysqlEnum('status', ['draft', 'published']).default('published').notNull(),
    sortOrder: int('sort_order').default(0).notNull(),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('testimonials_status_idx').on(t.status, t.sortOrder)],
)

export const contactMessages = mysqlTable(
  'contact_messages',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    message: text('message'),
    readAt: datetime('read_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('contact_messages_read_idx').on(t.readAt, t.createdAt)],
)

export const subscribers = mysqlTable(
  'subscribers',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    confirmedAt: datetime('confirmed_at'),
    unsubscribedAt: datetime('unsubscribed_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [uniqueIndex('subscribers_email_unique').on(t.email)],
)

export const teacherApplications = mysqlTable(
  'teacher_applications',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    categoryId: bigint('category_id', { mode: 'number', unsigned: true }).references(
      () => categories.id,
      { onDelete: 'set null' },
    ),
    experience: text('experience'),
    reason: text('reason'),
    /** Object key in Spaces, not a public URL. */
    resumePath: varchar('resume_path', { length: 512 }),
    contactTime: varchar('contact_time', { length: 120 }),
    agreedAt: datetime('agreed_at'),
    status: mysqlEnum('status', ['pending', 'approved', 'rejected']).default('pending').notNull(),
    approvedBy: bigint('approved_by', { mode: 'number', unsigned: true }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    approvedAt: datetime('approved_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('teacher_applications_status_idx').on(t.status, t.createdAt)],
)

export const notifications = mysqlTable(
  'notifications',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', NOTIFICATION_TYPES).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: varchar('body', { length: 500 }),
    ctaUrl: varchar('cta_url', { length: 512 }),
    readAt: datetime('read_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)],
)

/**
 * Loose key/value settings, including `vat_percent` and `vat_inclusive`.
 * `group` keeps the admin screen tidy once there are a few dozen of them.
 */
export const siteSettings = mysqlTable(
  'site_settings',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    key: varchar('key', { length: 100 }).notNull(),
    value: text('value'),
    group: varchar('group', { length: 50 }).default('general').notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [uniqueIndex('site_settings_key_unique').on(t.key)],
)

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}))

export const teacherApplicationsRelations = relations(teacherApplications, ({ one }) => ({
  category: one(categories, {
    fields: [teacherApplications.categoryId],
    references: [categories.id],
  }),
  approver: one(users, { fields: [teacherApplications.approvedBy], references: [users.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}))
