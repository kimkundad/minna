import { relations, sql } from 'drizzle-orm'
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core'
import {
  bigint,
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { LOCALES, users } from './auth'

export const COURSE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export const LESSON_TYPES = ['video', 'document', 'quiz'] as const

/**
 * One taxonomy, two levels deep: the top level is the language taught, the
 * level below it is the topic. Replaces the old `subjects` + `course_categories`
 * pair, where only one of the two was ever filterable.
 */
export const categories = mysqlTable(
  'categories',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    parentId: bigint('parent_id', { mode: 'number', unsigned: true }).references(
      (): AnyMySqlColumn => categories.id,
      { onDelete: 'set null' },
    ),
    name: varchar('name', { length: 150 }).notNull(),
    slug: varchar('slug', { length: 150 }).notNull(),
    icon: varchar('icon', { length: 64 }),
    sortOrder: int('sort_order').default(0).notNull(),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('categories_slug_unique').on(t.slug),
    index('categories_parent_idx').on(t.parentId),
  ],
)

export const courses = mysqlTable(
  'courses',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    categoryId: bigint('category_id', { mode: 'number', unsigned: true }).references(
      () => categories.id,
      { onDelete: 'set null' },
    ),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    shortDesc: varchar('short_desc', { length: 500 }),
    description: text('description'),
    /** Bullet lists shown on the sales page, as plain string arrays. */
    outcomes: json('outcomes').$type<string[]>(),
    audience: json('audience').$type<string[]>(),
    thumbnailPath: varchar('thumbnail_path', { length: 512 }),
    sampleVideoPath: varchar('sample_video_path', { length: 512 }),
    level: mysqlEnum('level', COURSE_LEVELS),
    /** Which language the admin wrote this course's copy in. */
    contentLocale: mysqlEnum('content_locale', LOCALES).default('th').notNull(),
    /** Sum of its lessons, cached so the catalog can filter by length. */
    durationSeconds: int('duration_seconds').default(0).notNull(),
    /** Satang, not baht. 1,690.00 THB is stored as 169000. */
    price: int('price').default(0).notNull(),
    normalPrice: int('normal_price'),
    accessType: mysqlEnum('access_type', ['lifetime', 'limited']).default('lifetime').notNull(),
    accessDurationDays: smallint('access_duration_days', { unsigned: true }),
    status: mysqlEnum('status', ['draft', 'pending', 'approved', 'rejected', 'ended'])
      .default('draft')
      .notNull(),
    /** Still offered for sale. A course can stay visible after it stops selling. */
    sellable: boolean('sellable').default(true).notNull(),
    /** Someone whose access expired may buy it again and keep their progress. */
    repurchase: boolean('repurchase').default(true).notNull(),
    badge: mysqlEnum('badge', ['bestseller', 'recommended', 'new', 'free']),
    popularity: int('popularity').default(0).notNull(),
    featured: boolean('featured').default(false).notNull(),
    publishedAt: datetime('published_at'),
    createdBy: bigint('created_by', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedBy: bigint('approved_by', { mode: 'number', unsigned: true }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    approvedAt: datetime('approved_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('courses_slug_unique').on(t.slug),
    index('courses_category_idx').on(t.categoryId),
    index('courses_status_idx').on(t.status),
    index('courses_published_idx').on(t.publishedAt),
    index('courses_price_idx').on(t.price),
  ],
)

export const courseInstructors = mysqlTable(
  'course_instructors',
  {
    courseId: bigint('course_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Shown under the name, e.g. "Lead instructor". */
    role: varchar('role', { length: 120 }),
    sortOrder: int('sort_order').default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.courseId, t.userId] }),
    index('course_instructors_user_idx').on(t.userId),
  ],
)

export const courseModules = mysqlTable(
  'course_modules',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    courseId: bigint('course_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    sortOrder: int('sort_order').default(0).notNull(),
  },
  (t) => [index('course_modules_course_idx').on(t.courseId, t.sortOrder)],
)

export const lessons = mysqlTable(
  'lessons',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    courseId: bigint('course_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    moduleId: bigint('module_id', { mode: 'number', unsigned: true }).references(
      () => courseModules.id,
      { onDelete: 'set null' },
    ),
    type: mysqlEnum('type', LESSON_TYPES).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    subtitle: varchar('subtitle', { length: 255 }),
    description: text('description'),
    /** Seconds, so lengths can be summed and filtered. */
    durationSeconds: int('duration_seconds').default(0).notNull(),
    videoPath: varchar('video_path', { length: 512 }),
    documentPath: varchar('document_path', { length: 512 }),
    /** Playable before buying. */
    isPreview: boolean('is_preview').default(false).notNull(),
    sortOrder: int('sort_order').default(0).notNull(),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    index('lessons_course_idx').on(t.courseId, t.sortOrder),
    index('lessons_module_idx').on(t.moduleId, t.sortOrder),
  ],
)

export const courseDocuments = mysqlTable(
  'course_documents',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    courseId: bigint('course_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    /** Object key in Spaces. Never a public URL: these are served signed. */
    filePath: varchar('file_path', { length: 512 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number', unsigned: true }),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('course_documents_course_idx').on(t.courseId)],
)

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  courses: many(courses),
}))

export const coursesRelations = relations(courses, ({ one, many }) => ({
  category: one(categories, { fields: [courses.categoryId], references: [categories.id] }),
  instructors: many(courseInstructors),
  modules: many(courseModules),
  lessons: many(lessons),
  documents: many(courseDocuments),
}))

export const courseInstructorsRelations = relations(courseInstructors, ({ one }) => ({
  course: one(courses, { fields: [courseInstructors.courseId], references: [courses.id] }),
  user: one(users, { fields: [courseInstructors.userId], references: [users.id] }),
}))

export const courseModulesRelations = relations(courseModules, ({ one, many }) => ({
  course: one(courses, { fields: [courseModules.courseId], references: [courses.id] }),
  lessons: many(lessons),
}))

export const lessonsRelations = relations(lessons, ({ one }) => ({
  course: one(courses, { fields: [lessons.courseId], references: [courses.id] }),
  module: one(courseModules, { fields: [lessons.moduleId], references: [courseModules.id] }),
}))

export const courseDocumentsRelations = relations(courseDocuments, ({ one }) => ({
  course: one(courses, { fields: [courseDocuments.courseId], references: [courses.id] }),
}))
