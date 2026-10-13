/**
 * Lets the journey tables hold the closing call to action as well.
 *
 *   npx tsx scripts/add-home-bands.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * The two bands at the bottom of the home page are the same shape: a small
 * line, a heading, a paragraph, a button, and a short list of items with an
 * icon each. The only difference is that a journey step has a sentence under
 * its title and a call-to-action chip is the title alone.
 *
 * So one pair of tables holds both, told apart by `band`, rather than a second
 * pair that would be the same columns with different names — and one screen in
 * the admin edits either, rather than two screens to keep in step.
 *
 * `journey_sections` keyed on the language alone cannot hold two bands for one
 * language, so its key becomes (band, locale). The rows already there are the
 * journey, which is the default, so nothing moves.
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

let changed = 0

for (const table of ['journey_sections', 'journey_steps']) {
  if (await hasColumn(table, 'band')) {
    console.log(`  ${table}.band is already there`)
    continue
  }
  await db.execute(
    sql.raw(
      `ALTER TABLE ${table} ADD COLUMN band ENUM('journey','cta') NOT NULL DEFAULT 'journey' AFTER ${
        table === 'journey_sections' ? 'locale' : 'id'
      }`,
    ),
  )
  console.log(`  ${table}.band added`)
  changed += 1
}

// The key has to admit two bands per language. Checked by looking at what the
// key is made of rather than by trying and catching, because a failed ALTER
// here would leave the table keyed on one column and the next run would think
// it was done.
const [keyRows] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'journey_sections' AND index_name = 'PRIMARY'
`)
const keyParts = Number((keyRows as unknown as { n: number }[])[0]?.n ?? 0)

if (keyParts >= 2) {
  console.log('  journey_sections is already keyed on both')
} else {
  await db.execute(sql.raw('ALTER TABLE journey_sections DROP PRIMARY KEY, ADD PRIMARY KEY (band, locale)'))
  console.log('  journey_sections now keyed on (band, locale)')
  changed += 1
}

// An index that starts with the band, since every read names one.
const [idxRows] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'journey_steps'
    AND index_name = 'journey_steps_band_idx'
`)
if (Number((idxRows as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('  journey_steps already has its index')
} else {
  await db.execute(
    sql.raw('CREATE INDEX journey_steps_band_idx ON journey_steps (band, locale, sort_order)'),
  )
  console.log('  journey_steps index created')
  changed += 1
}

console.log(changed ? `\n${changed} change(s) applied.` : '\nNothing to do.')
process.exit(0)
