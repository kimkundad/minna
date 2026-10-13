/**
 * The note an administrator leaves when a course is not approved.
 *
 *   npx tsx scripts/add-course-review.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run twice.
 *
 * The status column already carried 'rejected', and a teacher seeing it had
 * no way to learn what to change — so the obvious next thing was to ask the
 * administrator, by some other means, what they had meant. This is that
 * answer, kept with the course rather than in a message that scrolls away.
 *
 * Nullable, and cleared on approval: it describes the current verdict, not a
 * history. A record of who decided and when is what `approved_by` and
 * `approved_at` are for, and the audit log holds the rest.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

async function hasColumn(table: string, column: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

if (await hasColumn('courses', 'review_note')) {
  console.log('courses.review_note is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  ALTER TABLE courses
    ADD COLUMN review_note VARCHAR(1000) NULL AFTER approved_at
`)

console.log('courses.review_note added.')
process.exit(0)
