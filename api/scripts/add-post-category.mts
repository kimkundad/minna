/**
 * Gives an article a category, from the same list the courses use.
 *
 *   npx tsx scripts/add-post-category.mts
 *
 * Applied by hand rather than by `drizzle-kit push`, which this database
 * refuses: DigitalOcean's MySQL runs with `sql_require_primary_key = ON`, and
 * push rebuilds tables through a copy that has no key yet.
 *
 * Safe to run twice — it checks for the column first.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [existing] = await db.execute(sql`
  SELECT COUNT(*) AS n
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'posts' AND column_name = 'category_id'
`)
const already = Number((existing as unknown as { n: number }[])[0]?.n ?? 0) > 0

if (already) {
  console.log('posts.category_id is already there — nothing to do')
  process.exit(0)
}

// Nullable, and SET NULL on delete: an article is about a subject, but it is
// still a readable article if that category is later removed. Losing the badge
// is not a reason to lose the writing.
await db.execute(sql`
  ALTER TABLE posts
    ADD COLUMN category_id BIGINT UNSIGNED NULL AFTER slug,
    ADD CONSTRAINT posts_category_id_categories_id_fk
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    ADD INDEX posts_category_idx (category_id)
`)

console.log('added posts.category_id')
process.exit(0)
