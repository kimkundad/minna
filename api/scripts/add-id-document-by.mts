/**
 * Who uploaded a teacher's identity document.
 *
 *   npx tsx scripts/add-id-document-by.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * Administrators can now upload on a teacher's behalf, which somebody has to
 * be able to do — for a teacher who cannot work the form, or who sent a photo
 * by message. The cost is that the one document proving the bank details
 * belong to the person named on them could come from the same desk that typed
 * the account number.
 *
 * That cannot be made impossible without making the school unable to help
 * anybody, so this makes it visible: every document says whose upload it was,
 * and a pair that arrived from one desk is something a second person can
 * notice.
 *
 * Existing rows stay null, which reads as the teacher's own — true of every
 * document uploaded before this, because until now nobody else could.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [rows] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'teacher_payout_details'
    AND column_name = 'id_document_by'
`)

if (Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('teacher_payout_details.id_document_by is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  ALTER TABLE teacher_payout_details
    ADD COLUMN id_document_by BIGINT UNSIGNED NULL AFTER id_document_uploaded_at,
    ADD CONSTRAINT teacher_payout_details_id_doc_by_fk
      FOREIGN KEY (id_document_by) REFERENCES users (id) ON DELETE SET NULL
`)

console.log('teacher_payout_details.id_document_by added.')
process.exit(0)
