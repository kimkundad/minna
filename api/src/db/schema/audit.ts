import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  datetime,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  varchar,
} from 'drizzle-orm/mysql-core'
import { users } from './auth'

/**
 * Who did what, to what, and when.
 *
 * `created_at` and `updated_at` already say when a row last changed. They do
 * not say who changed it, what it was before, or that it happened at all once
 * something overwrites them again. This table answers "who dropped the price
 * on course 5" and "why does this person have access they never paid for",
 * which are the questions that get asked after the fact and cannot be
 * reconstructed from the data itself.
 *
 * It records binding actions, by anyone — student, teacher or admin. It does
 * not record reading: a student opening a lesson belongs in `lesson_progress`,
 * and putting page views here would bury the twenty rows a year that matter
 * under a million that do not.
 */
export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),

    /** Null for anything the system did on its own — a scheduled expiry, a
     *  webhook — and for a failed sign-in where nobody is identified yet. */
    actorId: bigint('actor_id', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'set null',
    }),
    /** The role held at the time. Roles change; the record of what someone was
     *  allowed to do when they did it must not change with them. */
    actorRole: mysqlEnum('actor_role', ['superadmin', 'admin', 'teacher', 'student', 'system']).notNull(),
    /** Kept as text so the row still reads after the account is deleted. */
    actorEmail: varchar('actor_email', { length: 255 }),

    /** Dotted and past tense: `order.refunded`, `course.price_changed`. */
    action: varchar('action', { length: 64 }).notNull(),

    /** What it happened to: 'course', 'order', 'user', 'entitlement'… */
    subjectType: varchar('subject_type', { length: 40 }),
    subjectId: bigint('subject_id', { mode: 'number', unsigned: true }),

    /** One line a person can read without decoding the fields below. */
    summary: varchar('summary', { length: 255 }),

    /** `{ price: [169000, 99000] }` — before and after, for the fields that
     *  changed and only those. Money stays in satang here too. */
    changes: json('changes').$type<Record<string, [unknown, unknown]>>(),

    /** Where it came from. A refund issued from an unfamiliar address is worth
     *  being able to see. */
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),

    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    // "What happened to this course?" — the common question.
    index('audit_subject_idx').on(t.subjectType, t.subjectId, t.createdAt),
    // "What has this person been doing?"
    index('audit_actor_idx').on(t.actorId, t.createdAt),
    // "Show me every refund this month."
    index('audit_action_idx').on(t.action, t.createdAt),
  ],
)

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}))
