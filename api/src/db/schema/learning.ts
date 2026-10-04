import { relations, sql } from 'drizzle-orm'
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core'
import {
  bigint,
  boolean,
  datetime,
  index,
  int,
  mysqlTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/mysql-core'
import { users } from './auth'
import { courses, lessons } from './catalog'

export const lessonProgress = mysqlTable(
  'lesson_progress',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: bigint('course_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    lessonId: bigint('lesson_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    /** Where the player resumes. */
    lastPositionSeconds: int('last_position_seconds').default(0).notNull(),
    /** Furthest point ever reached. Completion is measured against this one, so
     *  scrubbing back does not undo progress already earned. */
    maxPositionSeconds: int('max_position_seconds').default(0).notNull(),
    completedAt: datetime('completed_at'),
    lastWatchedAt: datetime('last_watched_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    uniqueIndex('lesson_progress_unique').on(t.userId, t.lessonId),
    index('lesson_progress_course_idx').on(t.userId, t.courseId),
  ],
)

export const lessonNotes = mysqlTable(
  'lesson_notes',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: bigint('lesson_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [uniqueIndex('lesson_notes_unique').on(t.userId, t.lessonId)],
)

/**
 * Questions and answers share this table: an answer is a row with `parentId`
 * set. The prototype only ever built the asking half, so the instructor queue
 * and the answering screen are ours to design.
 */
export const lessonQuestions = mysqlTable(
  'lesson_questions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    lessonId: bigint('lesson_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    courseId: bigint('course_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: bigint('parent_id', { mode: 'number', unsigned: true }).references(
      (): AnyMySqlColumn => lessonQuestions.id,
      { onDelete: 'cascade' },
    ),
    body: text('body').notNull(),
    isInstructor: boolean('is_instructor').default(false).notNull(),
    /** Set on the question row once any answer lands, to drive the pending queue. */
    answeredAt: datetime('answered_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    index('lesson_questions_lesson_idx').on(t.lessonId, t.createdAt),
    index('lesson_questions_course_idx').on(t.courseId),
    index('lesson_questions_parent_idx').on(t.parentId),
    index('lesson_questions_pending_idx').on(t.answeredAt),
  ],
)

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  user: one(users, { fields: [lessonProgress.userId], references: [users.id] }),
  course: one(courses, { fields: [lessonProgress.courseId], references: [courses.id] }),
  lesson: one(lessons, { fields: [lessonProgress.lessonId], references: [lessons.id] }),
}))

export const lessonNotesRelations = relations(lessonNotes, ({ one }) => ({
  user: one(users, { fields: [lessonNotes.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [lessonNotes.lessonId], references: [lessons.id] }),
}))

export const lessonQuestionsRelations = relations(lessonQuestions, ({ one, many }) => ({
  lesson: one(lessons, { fields: [lessonQuestions.lessonId], references: [lessons.id] }),
  course: one(courses, { fields: [lessonQuestions.courseId], references: [courses.id] }),
  user: one(users, { fields: [lessonQuestions.userId], references: [users.id] }),
  parent: one(lessonQuestions, {
    fields: [lessonQuestions.parentId],
    references: [lessonQuestions.id],
    relationName: 'thread',
  }),
  answers: many(lessonQuestions, { relationName: 'thread' }),
}))
