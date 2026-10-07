import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { users } from './auth'
import { courses, lessons } from './catalog'

export const QUESTION_TYPES = ['single', 'multiple', 'essay'] as const

/**
 * Essay review states, in the order a submission moves through them.
 * `revision` and `resubmitted` can repeat as many times as the instructor asks.
 */
export const ESSAY_STATUSES = ['pending', 'revision', 'resubmitted', 'passed'] as const

export const quizzes = mysqlTable(
  'quizzes',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    courseId: bigint('course_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** The lesson of type `quiz` this sits behind, so it counts toward progress. */
    lessonId: bigint('lesson_id', { mode: 'number', unsigned: true }).references(() => lessons.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    /** A picture the whole test is about — a diagram, a scene, a passage.
     *  Stored by path like every other file; a URL would expire. */
    imagePath: varchar('image_path', { length: 512 }),
    passPct: smallint('pass_pct', { unsigned: true }).default(80).notNull(),
    /** Null means untimed. The clock keeps running while the tab is closed. */
    timerMinutes: smallint('timer_minutes', { unsigned: true }),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [uniqueIndex('quizzes_course_unique').on(t.courseId)],
)

export const quizQuestions = mysqlTable(
  'quiz_questions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    quizId: bigint('quiz_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', QUESTION_TYPES).notNull(),
    text: text('text').notNull(),
    /** Shown with the question. Some questions cannot be asked without one. */
    imagePath: varchar('image_path', { length: 512 }),
    /** Essay only. */
    maxLength: int('max_length').default(1000).notNull(),
    attachmentAllowed: boolean('attachment_allowed').default(false).notNull(),
    sortOrder: int('sort_order').default(0).notNull(),
  },
  (t) => [index('quiz_questions_quiz_idx').on(t.quizId, t.sortOrder)],
)

/**
 * `isCorrect` must never leave the server for a learner. The rule the prototype
 * sets is explicit: no answer key, no per-question right/wrong, ever.
 */
export const quizChoices = mysqlTable(
  'quiz_choices',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    questionId: bigint('question_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    text: varchar('text', { length: 500 }).notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
    sortOrder: int('sort_order').default(0).notNull(),
  },
  (t) => [index('quiz_choices_question_idx').on(t.questionId, t.sortOrder)],
)

/** The choice track only. Unlimited retakes; the API returns the latest. */
export const quizAttempts = mysqlTable(
  'quiz_attempts',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    quizId: bigint('quiz_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attemptNo: int('attempt_no').default(1).notNull(),
    scorePct: smallint('score_pct', { unsigned: true }),
    passed: boolean('passed').default(false).notNull(),
    /** Autosaved answers for an attempt still in progress. */
    draft: json('draft').$type<Record<string, number[]>>(),
    startedAt: datetime('started_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    submittedAt: datetime('submitted_at'),
  },
  (t) => [
    uniqueIndex('quiz_attempts_unique').on(t.quizId, t.userId, t.attemptNo),
    index('quiz_attempts_user_idx').on(t.userId),
  ],
)

export const quizAttemptAnswers = mysqlTable(
  'quiz_attempt_answers',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    attemptId: bigint('attempt_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => quizAttempts.id, { onDelete: 'cascade' }),
    questionId: bigint('question_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    selectedChoiceIds: json('selected_choice_ids').$type<number[]>().notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
  },
  (t) => [uniqueIndex('quiz_attempt_answers_unique').on(t.attemptId, t.questionId)],
)

/** One row per learner per essay question, carrying the current review state. */
export const essaySubmissions = mysqlTable(
  'essay_submissions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    quizId: bigint('quiz_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    questionId: bigint('question_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: mysqlEnum('status', ESSAY_STATUSES).default('pending').notNull(),
    currentVersion: int('current_version').default(1).notNull(),
    submittedAt: datetime('submitted_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    resolvedAt: datetime('resolved_at'),
  },
  (t) => [
    uniqueIndex('essay_submissions_unique').on(t.questionId, t.userId),
    index('essay_submissions_status_idx').on(t.status, t.submittedAt),
  ],
)

/** Every draft the learner sent, kept so the review history stays readable. */
export const essayVersions = mysqlTable(
  'essay_versions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    submissionId: bigint('submission_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => essaySubmissions.id, { onDelete: 'cascade' }),
    version: int('version').notNull(),
    body: text('body').notNull(),
    attachmentPath: varchar('attachment_path', { length: 512 }),
    attachmentName: varchar('attachment_name', { length: 255 }),
    sizeBytes: bigint('size_bytes', { mode: 'number', unsigned: true }),
    submittedAt: datetime('submitted_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [uniqueIndex('essay_versions_unique').on(t.submissionId, t.version)],
)

export const essayReviews = mysqlTable(
  'essay_reviews',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    submissionId: bigint('submission_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => essaySubmissions.id, { onDelete: 'cascade' }),
    /** Which version of the answer this verdict is about. */
    version: int('version').notNull(),
    reviewerId: bigint('reviewer_id', { mode: 'number', unsigned: true }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    result: mysqlEnum('result', ['passed', 'revision']).notNull(),
    /** Required, in both outcomes: a verdict with no reason helps nobody. */
    comment: varchar('comment', { length: 2000 }).notNull(),
    attachmentPath: varchar('attachment_path', { length: 512 }),
    reviewedAt: datetime('reviewed_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('essay_reviews_submission_idx').on(t.submissionId, t.version)],
)

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  course: one(courses, { fields: [quizzes.courseId], references: [courses.id] }),
  lesson: one(lessons, { fields: [quizzes.lessonId], references: [lessons.id] }),
  questions: many(quizQuestions),
  attempts: many(quizAttempts),
}))

export const quizQuestionsRelations = relations(quizQuestions, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [quizQuestions.quizId], references: [quizzes.id] }),
  choices: many(quizChoices),
}))

export const quizChoicesRelations = relations(quizChoices, ({ one }) => ({
  question: one(quizQuestions, {
    fields: [quizChoices.questionId],
    references: [quizQuestions.id],
  }),
}))

export const quizAttemptsRelations = relations(quizAttempts, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [quizAttempts.quizId], references: [quizzes.id] }),
  user: one(users, { fields: [quizAttempts.userId], references: [users.id] }),
  answers: many(quizAttemptAnswers),
}))

export const quizAttemptAnswersRelations = relations(quizAttemptAnswers, ({ one }) => ({
  attempt: one(quizAttempts, {
    fields: [quizAttemptAnswers.attemptId],
    references: [quizAttempts.id],
  }),
  question: one(quizQuestions, {
    fields: [quizAttemptAnswers.questionId],
    references: [quizQuestions.id],
  }),
}))

export const essaySubmissionsRelations = relations(essaySubmissions, ({ one, many }) => ({
  quiz: one(quizzes, { fields: [essaySubmissions.quizId], references: [quizzes.id] }),
  question: one(quizQuestions, {
    fields: [essaySubmissions.questionId],
    references: [quizQuestions.id],
  }),
  user: one(users, { fields: [essaySubmissions.userId], references: [users.id] }),
  versions: many(essayVersions),
  reviews: many(essayReviews),
}))

export const essayVersionsRelations = relations(essayVersions, ({ one }) => ({
  submission: one(essaySubmissions, {
    fields: [essayVersions.submissionId],
    references: [essaySubmissions.id],
  }),
}))

export const essayReviewsRelations = relations(essayReviews, ({ one }) => ({
  submission: one(essaySubmissions, {
    fields: [essayReviews.submissionId],
    references: [essaySubmissions.id],
  }),
  reviewer: one(users, { fields: [essayReviews.reviewerId], references: [users.id] }),
}))
