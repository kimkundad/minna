import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { users } from './auth'

/**
 * Staff talking to each other.
 *
 * Three tables rather than two. A thread could have been a pair of user ids on
 * one row, which is smaller and makes a conversation between three people a
 * schema change; a participants table makes it a second row.
 */
export const chatThreads = mysqlTable(
  'chat_threads',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    /**
     * Whose side of the school this conversation is.
     *
     * Both kinds talk to the same other party — the school — and neither talks
     * to the other. A learner's question reaches a teacher only when an admin
     * decides to pass it on, stripped of who asked: a teacher who knows which
     * learner is asking is a teacher who can be offered something for the
     * answer.
     */
    kind: mysqlEnum('kind', ['teacher', 'student']).default('teacher').notNull(),
    /**
     * The teacher or learner this conversation belongs to.
     *
     * One thread each, and the unique key on (kind, owner) is what makes that
     * true rather than a rule the code remembers: they talk to the school, not
     * to a particular member of staff, so whoever is on duty picks it up and
     * nobody has to wonder which of three conversations to use.
     *
     * Admins are not participants by row. Any of them may read and answer any
     * thread; the participants table only records who has actually taken part,
     * and where each of them had read up to.
     */
    ownerId: bigint('owner_id', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'cascade',
    }),
    /** Null on these threads, which are named after whoever owns them. */
    title: varchar('title', { length: 150 }),
    createdBy: bigint('created_by', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Copied from the newest message, so the list can be ordered without
     *  touching every message in every thread. */
    lastMessageAt: datetime('last_message_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    uniqueIndex('chat_threads_owner_unique').on(t.kind, t.ownerId),
    index('chat_threads_recent_idx').on(t.lastMessageAt),
  ],
)

export const chatParticipants = mysqlTable(
  'chat_participants',
  {
    threadId: bigint('thread_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The newest message this reader has seen. 0 means none.
     *
     * On the participant rather than the message because "how many have I not
     * seen" is a question about a reader, and answering it by marking fifty
     * messages one at a time is fifty writes for a number.
     *
     * An id rather than a timestamp, and that is the whole point: DATETIME
     * here keeps whole seconds, so a reply written in the same second as the
     * read mark compared equal and was counted as already seen. Ids are exact
     * and come from one source, which no pair of clocks ever is.
     */
    lastReadMessageId: bigint('last_read_message_id', { mode: 'number', unsigned: true })
      .default(0)
      .notNull(),
    joinedAt: datetime('joined_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.userId] }),
    index('chat_participants_user_idx').on(t.userId),
  ],
)

export const chatMessages = mysqlTable(
  'chat_messages',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    threadId: bigint('thread_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    /** Null once the sender's account is gone. The words stay, because the
     *  other side of the conversation still needs to read back. */
    userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'set null',
    }),
    /**
     * The learner's message an admin passed on to a teacher.
     *
     * Staff only. Handing a teacher the pointer would hand them the learner,
     * which is the one thing this arrangement exists to prevent — so the API
     * tells a teacher only that a message was relayed, never from whom.
     */
    forwardedFromId: bigint('forwarded_from_id', { mode: 'number', unsigned: true }),
    body: text('body'),
    /** A stored path, never a URL. Fetched through the thread, so only the
     *  people in it can reach the file. */
    attachmentPath: varchar('attachment_path', { length: 512 }),
    attachmentName: varchar('attachment_name', { length: 255 }),
    attachmentSize: int('attachment_size'),
    attachmentKind: mysqlEnum('attachment_kind', ['image', 'file']),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('chat_messages_thread_idx').on(t.threadId, t.id)],
)

export const chatThreadsRelations = relations(chatThreads, ({ many }) => ({
  participants: many(chatParticipants),
  messages: many(chatMessages),
}))

export const chatParticipantsRelations = relations(chatParticipants, ({ one }) => ({
  thread: one(chatThreads, { fields: [chatParticipants.threadId], references: [chatThreads.id] }),
  user: one(users, { fields: [chatParticipants.userId], references: [users.id] }),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, { fields: [chatMessages.threadId], references: [chatThreads.id] }),
  sender: one(users, { fields: [chatMessages.userId], references: [users.id] }),
}))
