import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  datetime,
  json,
  smallint,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { LOCALES, users } from './auth'

/**
 * What the public needs to know about someone who teaches.
 *
 * Separate from `users` because it is a different kind of fact. A user row is
 * how someone signs in — their email, their password, the account. This is a
 * page about a person that strangers read before deciding to pay, and most
 * accounts never have one.
 *
 * The photo lives on `users.avatarPath`, not here: a person has one picture,
 * and two would mean picking which is current every time it changes.
 */
export const teacherProfiles = mysqlTable(
  'teacher_profiles',
  {
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** With titles, as it should appear: "อ. ดร. ชลธิชา พรหมรักษ์". The account
     *  holds a plain first and last name, which is not how a teacher is
     *  introduced. */
    displayName: varchar('display_name', { length: 150 }).notNull(),
    /** For a course card, where the full form would wrap to three lines. */
    shortName: varchar('short_name', { length: 100 }).notNull(),

    /** One line under the name: "ภาษาญี่ปุ่นธุรกิจ · อดีตล่าม". */
    headline: varchar('headline', { length: 180 }),
    /** A paragraph, shown when someone opens the instructor list. */
    bio: text('bio'),

    /** Which languages they teach. People choose a language teacher by this
     *  before anything else, so it is a column rather than prose in the bio. */
    languages: json('languages').$type<(typeof LOCALES)[number][]>(),
    /** JLPT N1, HSK 6, a degree, a teaching licence — free text, because the
     *  set differs by language and would be out of date as an enum. */
    credentials: text('credentials'),
    yearsExperience: smallint('years_experience', { unsigned: true }),

    /** The public profile URL. Unique so it can be one. */
    slug: varchar('slug', { length: 150 }).notNull(),

    /** Off while a profile is being written, or for someone who teaches but
     *  should not be listed. A course of theirs still names them. */
    listed: boolean('listed').default(true).notNull(),

    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [uniqueIndex('teacher_profiles_slug_unique').on(t.slug)],
)

export const teacherProfilesRelations = relations(teacherProfiles, ({ one }) => ({
  user: one(users, { fields: [teacherProfiles.userId], references: [users.id] }),
}))
