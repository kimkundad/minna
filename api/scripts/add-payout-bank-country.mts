/**
 * Which country a teacher's bank account is in.
 *
 *   npx tsx scripts/add-payout-bank-country.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * The form asked for a bank and an account number without ever asking where
 * the account was, which decides what both of them mean — an eight-digit
 * number is an account in Thailand and half an account in Britain, and a
 * transfer abroad needs the country before it needs anything else.
 *
 * Rows that exist are left null rather than assumed to be Thailand. Most of
 * them will be, but a blank the teacher fills in is better than a guess
 * somebody has to notice is wrong.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [rows] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'teacher_payout_details'
    AND column_name = 'bank_country'
`)

if (Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('teacher_payout_details.bank_country is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  ALTER TABLE teacher_payout_details
    ADD COLUMN bank_country VARCHAR(2) NULL AFTER id_document_uploaded_at
`)

console.log('teacher_payout_details.bank_country added.')
process.exit(0)
