/**
 * Widens the notifications table for the ones we actually send.
 *
 *   npx tsx scripts/add-notifications-table.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL has `sql_require_primary_key = ON`). Safe to run twice.
 *
 * The table came with the original schema and was never written to. Three
 * things it needs before it can be:
 *
 *   • `surface` — the two apps sit on different hosts, and a learner's
 *     notification must not send them to the admin or the other way round;
 *   • `subject_type`/`subject_id` with a unique key over them, so a webhook
 *     delivered twice does not tell somebody twice;
 *   • `mailed_at`, so "did we already email this" is answerable without
 *     keeping a second list.
 *
 * `type` loses its ENUM. A new kind of notification is a code change either
 * way, and an ENUM makes it a schema change as well — on a database where
 * schema changes are hand-written SQL, that is a reason to invent fewer of
 * them than the product needs.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

async function has(column: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'notifications'
      AND column_name = ${column}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

const [existing] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'notifications'
`)
if (Number((existing as unknown as { n: number }[])[0]?.n ?? 0) === 0) {
  throw new Error('the notifications table is missing — run the base migrations first')
}

const [count] = await db.execute(sql`SELECT COUNT(*) AS n FROM notifications`)
const rows = Number((count as unknown as { n: number }[])[0]?.n ?? 0)

if (!(await has('surface'))) {
  await db.execute(sql`
    ALTER TABLE notifications
      ADD COLUMN surface ENUM('site','admin') NOT NULL DEFAULT 'site' AFTER type
  `)
  console.log('  surface added')
}

if (!(await has('subject_type'))) {
  await db.execute(sql`
    ALTER TABLE notifications
      ADD COLUMN subject_type VARCHAR(40) NULL AFTER cta_url,
      ADD COLUMN subject_id BIGINT UNSIGNED NULL AFTER subject_type
  `)
  console.log('  subject_type and subject_id added')
}

if (!(await has('mailed_at'))) {
  await db.execute(sql`
    ALTER TABLE notifications ADD COLUMN mailed_at DATETIME NULL AFTER read_at
  `)
  console.log('  mailed_at added')
}

// Widening the enum to a varchar is only safe while nothing depends on the old
// set, which is the case: the table has never been written to in anger.
await db.execute(sql`
  ALTER TABLE notifications
    MODIFY COLUMN type VARCHAR(40) NOT NULL
`)

const [idx] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'notifications'
    AND index_name = 'notifications_subject_unique'
`)
if (Number((idx as unknown as { n: number }[])[0]?.n ?? 0) === 0) {
  await db.execute(sql`
    ALTER TABLE notifications
      ADD UNIQUE KEY notifications_subject_unique (user_id, type, subject_type, subject_id)
  `)
  console.log('  the one-per-subject key added')
}

console.log(`\n  notifications is ready (${rows} existing rows).`)
process.exit(0)
