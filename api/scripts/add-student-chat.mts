/**
 * Learners get a conversation too — with the school, never with a teacher.
 *
 *   npx tsx scripts/add-student-chat.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL has `sql_require_primary_key = ON`). Safe to run twice.
 *
 * `teacher_id` becomes `kind` + `owner_id`. The column was the rule — one
 * thread per teacher, enforced by a unique key rather than by code remembering
 * to check — and that rule still holds, it just has to hold for two kinds of
 * person now. A pair of nullable columns with a unique key each would say the
 * same thing in a way that has to be read twice.
 *
 * A learner never writes to a teacher. Questions go to the school, and an
 * admin passes on what is worth passing on — which is why `forwarded_from_id`
 * exists: the relayed message is a new message in the teacher's thread, with a
 * pointer back that only staff are ever shown. The teacher sees the question
 * and not who asked it, so a grade cannot be traded for an answer.
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

async function hasIndex(table: string, name: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = ${table} AND index_name = ${name}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

async function hasConstraint(table: string, name: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = ${table} AND constraint_name = ${name}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

if (!(await hasColumn('chat_threads', 'owner_id'))) {
  await db.execute(sql`
    ALTER TABLE chat_threads
      ADD COLUMN kind ENUM('teacher','student') NOT NULL DEFAULT 'teacher' AFTER id,
      ADD COLUMN owner_id BIGINT UNSIGNED NULL AFTER kind
  `)
  // Every thread that exists today is a teacher's.
  await db.execute(sql`UPDATE chat_threads SET owner_id = teacher_id`)

  // The old key has to go before the column it is on, and the foreign key
  // before the unique index it leans on.
  if (await hasConstraint('chat_threads', 'chat_threads_teacher_fk')) {
    await db.execute(sql`ALTER TABLE chat_threads DROP FOREIGN KEY chat_threads_teacher_fk`)
  }
  if (await hasIndex('chat_threads', 'chat_threads_teacher_unique')) {
    await db.execute(sql`ALTER TABLE chat_threads DROP INDEX chat_threads_teacher_unique`)
  }
  await db.execute(sql`ALTER TABLE chat_threads DROP COLUMN teacher_id`)

  await db.execute(sql`
    ALTER TABLE chat_threads
      ADD UNIQUE KEY chat_threads_owner_unique (kind, owner_id),
      ADD CONSTRAINT chat_threads_owner_fk FOREIGN KEY (owner_id)
        REFERENCES users (id) ON DELETE CASCADE
  `)
  console.log('chat_threads now holds a kind and an owner')
} else {
  console.log('chat_threads already has an owner — nothing to do')
}

if (!(await hasColumn('chat_messages', 'forwarded_from_id'))) {
  await db.execute(sql`
    ALTER TABLE chat_messages
      /** The learner's message this was passed on from. Staff only: showing it
          to a teacher is exactly what this arrangement exists to prevent. */
      ADD COLUMN forwarded_from_id BIGINT UNSIGNED NULL AFTER user_id,
      ADD CONSTRAINT chat_messages_forward_fk FOREIGN KEY (forwarded_from_id)
        REFERENCES chat_messages (id) ON DELETE SET NULL
  `)
  console.log('chat_messages can now say what it was forwarded from')
} else {
  console.log('chat_messages already records forwarding — nothing to do')
}

process.exit(0)
