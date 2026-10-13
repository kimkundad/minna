/**
 * Runs every stored rich text field through the sanitiser.
 *
 *   npx tsx scripts/clean-rich-text.mts --dry-run
 *   npx tsx scripts/clean-rich-text.mts
 *
 * `richTextField()` cleans these on the way in, but only from the moment it
 * existed. Everything written before — seeds, and anything an admin saved —
 * went in untouched, and the website now renders three of these fields as
 * HTML rather than as text. So whatever is already stored has to be put
 * through the same filter once.
 *
 * Safe to run again: cleaning something already clean returns it unchanged,
 * and rows that do not change are not written.
 *
 * Point it at production the same way as the other scripts:
 *
 *   DATABASE_URL="mysql://...@db-....ondigitalocean.com:25060/minna" \
 *   DATABASE_SSL=true DATABASE_SSL_CA=./certs/ca-certificate.crt \
 *   npx tsx scripts/clean-rich-text.mts
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { cleanRichText } from '../src/lib/rich-text'
import { courses, lessons, posts, teacherProfiles } from '../src/db/schema/index'

const dryRun = process.argv.includes('--dry-run')

/**
 * Each field that is written as HTML, and where it lives.
 *
 * `prop` is the property name drizzle wants in `.set()`, spelled out rather
 * than derived from the column — deriving it meant a loop that read the table
 * object back to find the key it had just been given.
 */
const FIELDS = [
  {
    what: 'course descriptions',
    table: courses,
    column: courses.description,
    prop: 'description',
    id: courses.id,
  },
  {
    what: 'lesson descriptions',
    table: lessons,
    column: lessons.description,
    prop: 'description',
    id: lessons.id,
  },
  {
    what: 'article bodies',
    table: posts,
    column: posts.contentHtml,
    prop: 'contentHtml',
    id: posts.id,
  },
  {
    what: 'teacher biographies',
    table: teacherProfiles,
    column: teacherProfiles.bio,
    prop: 'bio',
    id: teacherProfiles.userId,
  },
] as const

const url = process.env.DATABASE_URL ?? ''
console.log(`Database: ${url.replace(/\/\/[^@]*@/, '//') || '(from .env)'}`)
console.log(dryRun ? 'Dry run — nothing will be written.\n' : '')

let changed = 0
let checked = 0

for (const field of FIELDS) {
  const rows = await db
    .select({ id: field.id, value: field.column })
    .from(field.table as never)

  let touched = 0
  for (const row of rows) {
    const before = row.value as string | null
    if (!before) continue
    checked += 1

    const after = cleanRichText(before)
    if (after === before) continue

    touched += 1
    changed += 1

    // What was taken out, so this is reviewable rather than a number. Long
    // values are not printed whole — the point is the difference.
    const removed = before.length - (after?.length ?? 0)
    console.log(`  ${field.what} #${row.id}: ${removed} characters removed`)
    if (!after) console.log(`    (left empty — it held no text)`)

    if (!dryRun) {
      await db
        .update(field.table as never)
        .set({ [field.prop]: after } as never)
        .where(eq(field.id as never, row.id as never))
    }
  }

  console.log(`${field.what}: ${rows.length} rows, ${touched} ${dryRun ? 'would change' : 'changed'}`)
}


console.log(
  `\n${checked} fields checked, ${changed} ${dryRun ? 'would be rewritten' : 'rewritten'}.`,
)
if (dryRun && changed) console.log('Run again without --dry-run to apply.')

// Nothing above touches this, but it is the question somebody asks next.
const [[{ n }]] = (await db.execute(
  sql`SELECT COUNT(*) AS n FROM teacher_profiles WHERE bio LIKE '%<script%' OR bio LIKE '%onerror%'`,
)) as unknown as [{ n: number }[]]
if (Number(n) > 0) console.log(`\n  !! ${n} biographies still look dangerous — look at them by hand`)

process.exit(0)
