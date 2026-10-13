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
import { TAUGHT_LANGUAGES, users } from './auth'

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
    languages: json('languages').$type<(typeof TAUGHT_LANGUAGES)[number][]>(),
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

/**
 * What the school needs in order to pay somebody, and nothing else.
 *
 * A table of its own rather than more columns on `teacher_profiles`, which is
 * the row the public teacher page is built from. That row gets spread whole in
 * several places — `{ ...row }` into a response is the house style — and a
 * bank account number cannot be one careless spread away from a page anybody
 * can open. It happened here already with a course's revenue share, which was
 * being published to every visitor because the course row went out entire.
 *
 * Separate also because the two have different lifetimes: a profile is written
 * to be read, this is written once and then only when a bank changes. And a
 * teacher with no public profile still has to be paid, so this does not wait
 * for one to exist.
 *
 * Nothing here is ever returned by a public route. The owner sees their own;
 * an administrator sees it to make a payout, and that reading is audited.
 */
export const teacherPayoutDetails = mysqlTable('teacher_payout_details', {
  userId: bigint('user_id', { mode: 'number', unsigned: true })
    .notNull()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),

  /**
   * Where the identity document sits in private storage.
   *
   * A path, not a URL: it is outside `content/`, the one folder served without
   * a signature, so the only way to read it is a short-lived signed link the
   * API issues to the owner or to an administrator. A national ID card at a
   * guessable public address is the worst thing this system could leak.
   */
  idDocumentPath: varchar('id_document_path', { length: 512 }),
  idDocumentUploadedAt: datetime('id_document_uploaded_at'),

  /**
   * Their CV as it stands now.
   *
   * Separate from the one on their application, which is not replaced and must
   * not be: that document is what somebody was looking at when they decided
   * this person could teach here, and rewriting it would rewrite the evidence
   * for a decision already made.
   *
   * Empty until somebody uploads one, and the application's CV is shown in its
   * place — so a teacher who has never updated theirs still has one on file.
   */
  resumePath: varchar('resume_path', { length: 512 }),
  resumeUploadedAt: datetime('resume_uploaded_at'),
  /**
   * Who put it there.
   *
   * An administrator may upload on a teacher's behalf — somebody has to, for a
   * teacher who cannot work the form, or who sent a photo by message. But the
   * document is what proves the bank details belong to the person named on
   * them, and an administrator who can supply both could supply a matching
   * pair nobody outside the building has seen.
   *
   * It cannot be made impossible without making the school unable to help
   * anybody, so it is made visible instead: the screen says whose upload this
   * was, and a document that arrived from the same desk that typed the account
   * number is a thing a second person can notice.
   */
  idDocumentBy: bigint('id_document_by', { mode: 'number', unsigned: true }).references(
    () => users.id,
    { onDelete: 'set null' },
  ),

  /** ISO 3166-1 alpha-2. Which country the account is held in, which decides
   *  what the rest of these fields even mean. */
  bankCountry: varchar('bank_country', { length: 2 }),
  bankName: varchar('bank_name', { length: 120 }),
  /** Must match the name on the identity document, which is the whole reason
   *  the two are asked for on one screen. */
  accountName: varchar('account_name', { length: 150 }),
  accountNumber: varchar('account_number', { length: 64 }),
  branch: varchar('branch', { length: 120 }),
  /** Only an international transfer needs one, so most rows will not have it. */
  swift: varchar('swift', { length: 16 }),

  /**
   * What this teacher keeps of what the school receives.
   *
   * Agreed with the person, not with the course. It used to sit on every
   * course row, which meant a teacher's rate was really a list of rates that
   * had to be kept in step by hand — change the deal and somebody has to
   * remember every course they ever wrote.
   *
   * Only an administrator may set it: a teacher editing their own bank details
   * is editing the same record, so the write route refuses this field from
   * anybody else. Null means the school-wide figure on the settings page.
   *
   * Changing it never moves money already earned. `teacher_earnings` copies
   * the figure onto each line as it is recorded, which is what makes last
   * quarter's payouts stay what they were.
   */
  revenueSharePct: smallint('revenue_share_pct', { unsigned: true }),

  /**
   * What they would rather be paid in.
   *
   * A stated preference, not an instruction to the ledger: `teacher_earnings`
   * is in satang throughout and stays that way. Whoever makes the payout reads
   * this and converts outside the system, the way the transfer happens anyway.
   */
  payoutCurrency: varchar('payout_currency', { length: 3 }),

  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at')
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    .notNull(),
})

export const teacherPayoutDetailsRelations = relations(teacherPayoutDetails, ({ one }) => ({
  user: one(users, { fields: [teacherPayoutDetails.userId], references: [users.id] }),
}))
