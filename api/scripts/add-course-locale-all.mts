/**
 * 'all' as a course's content language.
 *
 *   npx tsx scripts/add-course-locale-all.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * The catalogue lets a visitor filter by the language the lessons are in, and
 * every course had to claim one. A course that belongs to no single language
 * vanished the moment anybody narrowed the list — so it gets the same escape
 * articles have had all along, where `POST_LOCALES` is the four plus 'all'.
 *
 * Widening an enum keeps every row: the values already stored are all still in
 * the new list. Nothing is rewritten, and a course that said 'th' still says
 * 'th'.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [rows] = await db.execute(sql`
  SELECT COLUMN_TYPE AS t FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'courses'
    AND column_name = 'content_locale'
`)
const type = String((rows as unknown as { t: string }[])[0]?.t ?? '')

if (!type) {
  console.error('courses.content_locale is not there at all — run the earlier migrations first.')
  process.exit(1)
}

if (type.includes("'all'")) {
  console.log("courses.content_locale already allows 'all' — nothing to do")
  process.exit(0)
}

await db.execute(sql`
  ALTER TABLE courses
    MODIFY COLUMN content_locale ENUM('th','en','jp','vn','all') NOT NULL DEFAULT 'th'
`)

console.log("courses.content_locale now allows 'all'.")
process.exit(0)
