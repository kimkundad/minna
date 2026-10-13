/**
 * Where a teacher's identity document and bank details live.
 *
 *   npx tsx scripts/add-teacher-payout-details.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * A table of its own rather than columns on `teacher_profiles`. That row is
 * what the public teacher page is built from, and it is spread whole into
 * responses in several places, so an account number living on it would be one
 * careless `{ ...row }` away from being published. The same mistake had
 * already published every course's revenue share.
 *
 * Nothing here is served publicly. `id_document_path` points into private
 * storage — outside `content/`, the only folder served without a signature —
 * and is read through a short-lived signed link issued to the owner or to an
 * administrator.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [rows] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'teacher_payout_details'
`)

if (Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('teacher_payout_details is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  CREATE TABLE teacher_payout_details (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    id_document_path VARCHAR(512) NULL,
    id_document_uploaded_at DATETIME NULL,
    bank_name VARCHAR(120) NULL,
    account_name VARCHAR(150) NULL,
    account_number VARCHAR(64) NULL,
    branch VARCHAR(120) NULL,
    swift VARCHAR(16) NULL,
    payout_currency VARCHAR(3) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT teacher_payout_details_user_fk
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )
`)

console.log('teacher_payout_details created.')
process.exit(0)
