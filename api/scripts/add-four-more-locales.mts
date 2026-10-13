/**
 * Indonesian, Chinese, Korean and Taiwanese, in every column that names a
 * language.
 *
 *   npx tsx scripts/add-four-more-locales.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * Five columns are `ENUM('th','en','jp','vn')` or that plus `'all'`, each
 * built from one list in the code. Widening an enum keeps every row — the
 * values already stored are all still in the new list — so nothing is
 * rewritten and nobody's language changes.
 *
 * Chinese and Taiwanese are two entries, not one: the mainland writes 简体 and
 * Taiwan writes 繁體, which is a different script rather than a different
 * accent. `zh` is the first and `tw` the second.
 *
 * What this does NOT touch is `teacher_profiles.languages`, which is JSON
 * rather than an enum and answers a different question — what a teacher
 * teaches, not what the site is translated into. The school teaches five
 * languages and is not opening Korean classes because the website learned to
 * speak Korean.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

/** Every column, with the list it should end up allowing. */
const COLUMNS: { table: string; column: string; values: string[]; fallback: string }[] = [
  { table: 'users', column: 'locale', values: ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw'], fallback: 'th' },
  {
    table: 'courses',
    column: 'content_locale',
    values: ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw', 'all'],
    fallback: 'th',
  },
  {
    table: 'posts',
    column: 'content_locale',
    values: ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw', 'all'],
    fallback: 'th',
  },
  {
    table: 'ads',
    column: 'locale',
    values: ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw', 'all'],
    fallback: 'all',
  },
  {
    table: 'hero_slides',
    column: 'locale',
    values: ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw', 'all'],
    fallback: 'th',
  },
]

let changed = 0

for (const c of COLUMNS) {
  const [rows] = await db.execute(sql`
    SELECT COLUMN_TYPE AS t FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ${c.table}
      AND column_name = ${c.column}
  `)
  const type = String((rows as unknown as { t: string }[])[0]?.t ?? '')

  if (!type) {
    console.log(`  ${c.table}.${c.column} is not there — skipped`)
    continue
  }
  if (type.includes("'ko'")) {
    console.log(`  ${c.table}.${c.column} already knows the new ones`)
    continue
  }

  const list = c.values.map((v) => `'${v}'`).join(',')
  // Table and column names cannot be parameters, and these are from the list
  // above rather than from anything a request could reach.
  await db.execute(
    sql.raw(
      `ALTER TABLE ${c.table} MODIFY COLUMN ${c.column} ENUM(${list}) NOT NULL DEFAULT '${c.fallback}'`,
    ),
  )
  console.log(`  ${c.table}.${c.column} now allows ${c.values.length} values`)
  changed += 1
}

console.log(changed ? `\n${changed} column(s) widened.` : '\nNothing to do.')
process.exit(0)
