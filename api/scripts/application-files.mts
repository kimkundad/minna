/**
 * What files an application to teach ended up carrying.
 *
 *   npx tsx scripts/application-files.mts somebody@example.com
 *
 * Prints one line of JSON: `{ "resumePath": …, "sampleVideoPath": … }`, with
 * nulls where nothing arrived, or `{}` when there is no application at all.
 *
 * It exists for the browser test of the application form, which can watch the
 * dialog say the files were sent and cannot see whether they landed: the
 * application is the administrator's record, not something the applicant's own
 * `/me` returns, and what the test is really asking is what a reviewer will
 * open.
 *
 * Reads only. Takes an address rather than an id because that is what a test
 * has in its hand.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { teacherApplications } from '../src/db/schema/index'

const email = process.argv[2]
if (!email) {
  console.error('Usage: npx tsx scripts/application-files.mts <email>')
  process.exit(1)
}

const [row] = await db
  .select({
    id: teacherApplications.id,
    status: teacherApplications.status,
    resumePath: teacherApplications.resumePath,
    sampleVideoPath: teacherApplications.sampleVideoPath,
  })
  .from(teacherApplications)
  .where(eq(teacherApplications.email, email))
  .limit(1)

console.log(JSON.stringify(row ?? {}))
process.exit(0)
