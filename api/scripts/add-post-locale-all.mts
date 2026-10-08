/**
 * Lets an article be shown in every language.
 *
 *   npx tsx scripts/add-post-locale-all.mts
 *
 * Widens `posts.content_locale` to accept 'all', the same value the hero
 * slides already use. Some writing is not about a language — how long learning
 * takes, how to revise — and filing it under Thai hides it from everyone
 * reading the site in English.
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (`sql_require_primary_key = ON`). Safe to run twice.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [row] = await db.execute(sql`
  SELECT COLUMN_TYPE AS t
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'posts' AND column_name = 'content_locale'
`)
const current = String((row as unknown as { t: string }[])[0]?.t ?? '')

if (current.includes("'all'")) {
  console.log('posts.content_locale already accepts all — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  ALTER TABLE posts
    MODIFY COLUMN content_locale ENUM('th','en','jp','vn','all') NOT NULL DEFAULT 'th'
`)

console.log(`content_locale: ${current} -> enum('th','en','jp','vn','all')`)
process.exit(0)
