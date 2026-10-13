/**
 * What each member has agreed to be sent.
 *
 *   npx tsx scripts/add-consents-table.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL has `sql_require_primary_key = ON`). Safe to run twice.
 *
 * One row per member, and only once they have touched a switch: no row means
 * nobody has said anything, which is not the same as having said no — but it
 * is treated as no, because that is the only safe reading of silence and the
 * only lawful one.
 *
 * Kept as its own table rather than columns on `users` so that the record
 * carries its own timestamp. "When did they agree" is the question PDPA
 * actually asks, and `users.updated_at` moves every time somebody fixes a
 * typo in their surname.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [row] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'member_consents'
`)
if (Number((row as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('the member_consents table is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  CREATE TABLE member_consents (
    user_id BIGINT UNSIGNED NOT NULL,
    news TINYINT(1) NOT NULL DEFAULT 0,
    new_courses TINYINT(1) NOT NULL DEFAULT 0,
    expiry_alert TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    CONSTRAINT member_consents_user_fk FOREIGN KEY (user_id)
      REFERENCES users (id) ON DELETE CASCADE
  )
`)

console.log('member_consents created.')
process.exit(0)
