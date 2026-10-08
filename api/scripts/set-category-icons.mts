/**
 * Gives every category a glyph the site can actually draw.
 *
 *   npx tsx scripts/set-category-icons.mts
 *
 * `icon` is a free-text column holding a name from the site's own icon set, and
 * the seeds were written with names that are not in it — "language" draws an
 * empty circle wherever a category is shown. The set is fixed and small
 * (`frontend/src/vendor/icons.js`), so the right names have to be chosen from
 * it rather than guessed at.
 *
 * Matched by slug, so re-running it is safe and a category added later simply
 * keeps whatever it was given.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { categories } from '../src/db/schema/index'

/** slug → icon. Every value here exists in the site's icon set. */
const ICONS: Record<string, string> = {
  // A language, at the top level. There are no flags in the set, and a flag
  // would be wrong anyway — a language is not a country.
  japanese: 'globe',
  english: 'globe',
  chinese: 'globe',
  vietnamese: 'globe',

  // What you do in it.
  'japanese-conversation': 'message-square',
  'english-conversation': 'message-square',
  'chinese-conversation': 'message-square',
  'vietnamese-conversation': 'message-square',
  'japanese-grammar': 'book-open',
  'japanese-kanji': 'pen',
  'japanese-jlpt': 'clipboard-check',
  'chinese-hsk': 'clipboard-check',
  'english-exam': 'clipboard-check',
  'japanese-business': 'briefcase',
  'english-business': 'briefcase',
}

let changed = 0
for (const [slug, icon] of Object.entries(ICONS)) {
  const [row] = await db
    .select({ id: categories.id, icon: categories.icon })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1)

  if (!row) {
    console.warn(`no category "${slug}" — skipped`)
    continue
  }
  if (row.icon === icon) continue

  await db.update(categories).set({ icon }).where(eq(categories.id, row.id))
  console.log(`${slug}: ${row.icon ?? '(none)'} -> ${icon}`)
  changed += 1
}

console.log(changed ? `${changed} categories updated` : 'nothing to change')
process.exit(0)
