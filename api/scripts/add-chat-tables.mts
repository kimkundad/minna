/**
 * Staff talking to each other.
 *
 *   npx tsx scripts/add-chat-tables.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL has `sql_require_primary_key = ON`). Safe to run twice.
 *
 * Three tables rather than two. A thread could have been a pair of user ids on
 * one row, which is smaller and makes a conversation between three people a
 * schema change; a participants table makes it a second row. Teachers will
 * want a course's instructors in one place soon enough.
 *
 * The read mark lives on the participant, not the message: "how many have I
 * not seen" is a question about a reader, and marking fifty messages read one
 * at a time to answer it is fifty writes for a number. It is a message id and
 * not a timestamp, because DATETIME keeps whole seconds here — a reply written
 * in the same second as the mark compared equal and counted as already seen.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

async function exists(table: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ${table}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

if (await exists('chat_threads')) {
  // An earlier version of this script marked reads with a timestamp. Bring it
  // forward rather than asking anyone to drop the conversations.
  if (!(await hasColumn('chat_participants', 'last_read_message_id'))) {
    await db.execute(sql`
      ALTER TABLE chat_participants
        ADD COLUMN last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER user_id
    `)
    if (await hasColumn('chat_participants', 'last_read_at')) {
      await db.execute(sql`ALTER TABLE chat_participants DROP COLUMN last_read_at`)
    }
    console.log('chat_participants now marks reads by message id')
    process.exit(0)
  }
  console.log('the chat tables are already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  CREATE TABLE chat_threads (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    /** The teacher this conversation belongs to. One each, and the unique key
        is what makes that true rather than a rule the code remembers. */
    teacher_id BIGINT UNSIGNED NULL,
    /** Null on a teacher thread, which is named after the teacher. */
    title VARCHAR(150) NULL,
    created_by BIGINT UNSIGNED NULL,
    /** Copied from the newest message, so the list can be ordered without
        touching every message. */
    last_message_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY chat_threads_teacher_unique (teacher_id),
    KEY chat_threads_recent_idx (last_message_at),
    CONSTRAINT chat_threads_teacher_fk FOREIGN KEY (teacher_id)
      REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chat_threads_creator_fk FOREIGN KEY (created_by)
      REFERENCES users (id) ON DELETE SET NULL
  )
`)

await db.execute(sql`
  CREATE TABLE chat_participants (
    thread_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    /** The newest message this reader has seen. 0 means none. */
    last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (thread_id, user_id),
    KEY chat_participants_user_idx (user_id),
    CONSTRAINT chat_participants_thread_fk FOREIGN KEY (thread_id)
      REFERENCES chat_threads (id) ON DELETE CASCADE,
    CONSTRAINT chat_participants_user_fk FOREIGN KEY (user_id)
      REFERENCES users (id) ON DELETE CASCADE
  )
`)

await db.execute(sql`
  CREATE TABLE chat_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    thread_id BIGINT UNSIGNED NOT NULL,
    /** Null once the sender's account is gone; the words stay, because the
        other side of the conversation still needs to read back. */
    user_id BIGINT UNSIGNED NULL,
    body TEXT NULL,
    /** A stored path, never a URL. Served through the thread, so only the
        people in it can fetch the file. */
    attachment_path VARCHAR(512) NULL,
    attachment_name VARCHAR(255) NULL,
    attachment_size INT NULL,
    /** image, file. What the bubble draws. */
    attachment_kind ENUM('image','file') NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- The transcript reads newest-first within one thread, and nothing else.
    KEY chat_messages_thread_idx (thread_id, id),
    CONSTRAINT chat_messages_thread_fk FOREIGN KEY (thread_id)
      REFERENCES chat_threads (id) ON DELETE CASCADE,
    CONSTRAINT chat_messages_user_fk FOREIGN KEY (user_id)
      REFERENCES users (id) ON DELETE SET NULL
  )
`)

console.log('chat_threads, chat_participants and chat_messages created.')
process.exit(0)
