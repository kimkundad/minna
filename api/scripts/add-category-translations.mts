/**
 * Category names in the other three languages.
 *
 *   npx tsx scripts/add-category-translations.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL has `sql_require_primary_key = ON`). Safe to run twice.
 *
 * An overlay rather than three more columns on `categories`. The name on the
 * category stays the canonical one — it is what the admin types first, what a
 * missing translation falls back to, and what the row is ordered by — and a
 * translation is an optional row on top of it. So the table can go in empty
 * and nothing changes: every name reads exactly as it does today until
 * somebody fills one in.
 *
 * A fifth language is then data rather than a migration, which matters because
 * this is the first of several things that will want the same treatment.
 *
 * Only the name is translated. The slug is an identifier and stays single, so
 * a link to a category is the same link in every language.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

async function exists(table: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ${table}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

if (await exists('category_translations')) {
  console.log('category_translations is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  CREATE TABLE category_translations (
    category_id BIGINT UNSIGNED NOT NULL,
    /** th, en, jp, vn. Not an enum: adding a language should not be a schema
        change, which is the whole reason this is a table. */
    locale VARCHAR(8) NOT NULL,
    name VARCHAR(150) NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (category_id, locale),
    CONSTRAINT category_translations_category_fk FOREIGN KEY (category_id)
      REFERENCES categories (id) ON DELETE CASCADE
  )
`)

console.log('category_translations created.')
process.exit(0)
