/**
 * A teacher's share, agreed with the person rather than with each course.
 *
 *   npx tsx scripts/add-teacher-revenue-share.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * The figure used to live on every course row. That made a teacher's rate into
 * a list of rates: agreeing a new one meant finding every course they had ever
 * written and changing each, and any one missed went on paying the old deal
 * quietly and for ever.
 *
 * `courses.revenue_share_pct` is left alone. It is not read any more, but the
 * figures already written into `teacher_earnings` were worked out from it, and
 * a column that explains an old payout is worth more than a tidy schema.
 *
 * Existing teachers get null, which reads as the school-wide figure on the
 * settings page — the same 25% they are on today, so nobody's pay moves
 * because of this migration.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [rows] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'teacher_payout_details'
    AND column_name = 'revenue_share_pct'
`)

if (Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('teacher_payout_details.revenue_share_pct is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  ALTER TABLE teacher_payout_details
    ADD COLUMN revenue_share_pct SMALLINT UNSIGNED NULL AFTER swift
`)

console.log('teacher_payout_details.revenue_share_pct added.')
process.exit(0)
