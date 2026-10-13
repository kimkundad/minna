/**
 * What a shared link looks like: per course, per article, and site-wide.
 *
 *   npx tsx scripts/add-og-tags.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run twice.
 *
 * All three columns are nullable on purpose, on both tables. A course that
 * says nothing here shares as its own title, its short description and its
 * cover — which is right nearly always, and is what every course published so
 * far will keep doing without anyone touching it. The columns exist for the
 * handful where the sales copy and the shared copy should differ: a title
 * that reads well on a page and badly in a chat window, or a cover that is
 * beautiful at 16:9 on the page and cropped to nonsense at 1200×630.
 *
 * The site-wide defaults are settings rather than columns, because they
 * belong to the site and not to any one thing on it.
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

for (const table of ['courses', 'posts']) {
  if (await hasColumn(table, 'og_title')) {
    console.log(`${table} already has the sharing columns — skipped`)
    continue
  }
  // One statement per table: MySQL takes the whole ALTER or none of it, so a
  // half-added set is not a state this can leave behind.
  await db.execute(sql`
    ALTER TABLE ${sql.raw(table)}
      ADD COLUMN og_title VARCHAR(255) NULL,
      ADD COLUMN og_description VARCHAR(500) NULL,
      ADD COLUMN og_image_path VARCHAR(512) NULL
  `)
  console.log(`${table}: og_title, og_description, og_image_path added`)
}

/**
 * The site-wide fallbacks, used when a course or article says nothing and
 * for every page that is neither — the home page, the catalog, the about
 * page. Inserted empty rather than guessed at: a wrong description shared a
 * thousand times is worse than none, and the admin screen asks for them.
 */
const SETTINGS = [
  ['og_title', ''],
  ['og_description', ''],
  ['og_image_path', ''],
] as const

for (const [key, value] of SETTINGS) {
  await db.execute(sql`
    INSERT INTO site_settings (\`key\`, value, \`group\`) VALUES (${key}, ${value}, 'sharing')
    ON DUPLICATE KEY UPDATE \`key\` = \`key\`
  `)
}
console.log(`site settings ready: ${SETTINGS.map(([k]) => k).join(', ')}`)

process.exit(0)
