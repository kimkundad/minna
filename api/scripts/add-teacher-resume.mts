/**
 * A teacher's CV as it stands now, rather than as it was when they applied.
 *
 *   npx tsx scripts/add-teacher-resume.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * The only CV in the system was the one attached to the application, and it
 * stays there untouched: that document is what somebody was looking at when
 * they decided this person could teach here, and letting it be replaced would
 * rewrite the evidence for a decision already made.
 *
 * This is the one that can be replaced — by the teacher when their work moves
 * on, or by an administrator for a teacher who sent it by message. Empty until
 * somebody uploads one, and until then the application's CV is shown in its
 * place, so nobody loses the document they already had on file.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [rows] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'teacher_payout_details'
    AND column_name = 'resume_path'
`)

if (Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('teacher_payout_details.resume_path is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  ALTER TABLE teacher_payout_details
    ADD COLUMN resume_path VARCHAR(512) NULL AFTER id_document_by,
    ADD COLUMN resume_uploaded_at DATETIME NULL AFTER resume_path
`)

console.log('teacher_payout_details.resume_path and resume_uploaded_at added.')
process.exit(0)
