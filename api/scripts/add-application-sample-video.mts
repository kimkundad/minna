/**
 * A clip of somebody teaching, sent with their application.
 *
 *   npx tsx scripts/add-application-sample-video.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice.
 *
 * Paragraphs about teaching are worth less than a minute of watching somebody
 * do it, which is why this was asked for. What makes it different from the CV
 * beside it is what happens afterwards: the file is deleted as soon as the
 * application is decided, and this column is nulled with it.
 *
 * A hundred megabytes each, in a queue that only ever grows, of video showing
 * a person's face and voice — kept no longer than the question it answers.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [rows] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'teacher_applications'
    AND column_name = 'sample_video_path'
`)

if (Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('teacher_applications.sample_video_path is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  ALTER TABLE teacher_applications
    ADD COLUMN sample_video_path VARCHAR(512) NULL AFTER resume_path
`)

console.log('teacher_applications.sample_video_path added.')
process.exit(0)
