import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  chatMessages,
  chatParticipants,
  chatThreads,
  roles,
  teacherProfiles,
  userRoles,
  users,
} from '../../db/schema/index'
import { conflict, forbidden, notFound } from '../../lib/errors'
import { instant } from '../../lib/sql'
import * as notify from '../people/notify.service'

/**
 * Everybody talking to the school.
 *
 * One rule shapes everything here: a teacher has exactly one conversation, a
 * learner has exactly one, and both are with the school rather than with a
 * particular member of staff. So nobody chooses who to write to, and nobody
 * has to wonder which of three threads the answer came back on; an admin sees
 * every thread and whoever is on duty picks one up.
 *
 * The second rule follows from the first: learners and teachers have no way to
 * reach each other. A question reaches a teacher only when an admin decides to
 * pass it on, and what arrives carries the words without the asker — because a
 * teacher who knows whose paper they are about to mark can be offered
 * something for the answer.
 *
 * That is why admins are not participants by row. Being an admin is the right
 * to read and answer any thread, and a participant row only records that
 * somebody took part — and where they had read up to.
 */

export interface Viewer {
  id: number
  roles: string[]
}

export function isStaff(viewer: Viewer): boolean {
  return viewer.roles.includes('admin') || viewer.roles.includes('superadmin')
}

export type ThreadKind = 'teacher' | 'student'

/** Everyone who may use the chat at all, which is everyone signed in. */
export function mayChat(viewer: Viewer): boolean {
  return viewer.id > 0
}

/**
 * Which conversation this person owns, if they are not staff.
 *
 * Being a teacher wins: somebody who teaches and also bought a course still
 * has one conversation, and it is the one where their courses are discussed.
 * Two would mean an answer arriving on whichever of them the admin happened to
 * pick.
 */
export function kindFor(viewer: Viewer): ThreadKind {
  return viewer.roles.includes('teacher') ? 'teacher' : 'student'
}

/**
 * The thread this person talks to the school on, made if it is their first.
 *
 * Racing two of these would insert twice; the unique key refuses the second,
 * and the catch reads the winner's row rather than failing a page load over
 * somebody opening two tabs.
 */
export async function threadFor(ownerId: number, kind: ThreadKind): Promise<number> {
  const mine = and(eq(chatThreads.ownerId, ownerId), eq(chatThreads.kind, kind))

  const [found] = await db.select({ id: chatThreads.id }).from(chatThreads).where(mine).limit(1)
  if (found) return found.id

  try {
    const [res] = await db.insert(chatThreads).values({ ownerId, kind, createdBy: ownerId })
    const id = Number(res.insertId)
    await db.insert(chatParticipants).values({ threadId: id, userId: ownerId })
    return id
  } catch {
    const [again] = await db.select({ id: chatThreads.id }).from(chatThreads).where(mine).limit(1)
    if (!again) throw conflict('Could not open that conversation.')
    return again.id
  }
}

/** Kept for the teacher-shaped callers, which are most of them. */
export const threadForTeacher = (teacherId: number) => threadFor(teacherId, 'teacher')

export interface ThreadFacts {
  id: number
  kind: ThreadKind
  ownerId: number | null
}

/** Throws unless this person may read the thread. Returns what it is. */
export async function assertMayRead(viewer: Viewer, threadId: number): Promise<ThreadFacts> {
  const [thread] = await db
    .select({ id: chatThreads.id, kind: chatThreads.kind, ownerId: chatThreads.ownerId })
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1)
  if (!thread) throw notFound('No such conversation.')
  if (isStaff(viewer)) return thread
  if (thread.ownerId !== viewer.id) {
    // Deliberately the same answer a teacher gets for another teacher's
    // thread: a learner must not be able to tell a teacher's conversation
    // apart from one that is simply not theirs.
    throw forbidden('That conversation is not yours.')
  }
  return thread
}

/* ---------------- the list ---------------- */

export interface ThreadRow {
  id: number
  kind: ThreadKind
  /** Who the other side is, from this reader's point of view. */
  withUserId: number | null
  name: string
  subtitle: string | null
  avatarPath: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  unread: number
}

/**
 * The conversations this person has.
 *
 * A teacher or a learner has one — theirs, with the school. Staff have one per
 * teacher and one per learner who has written.
 *
 * The two sides are not listed the same way, and that asymmetry is the point.
 * Every teacher appears whether or not they have ever written, because an
 * admin starting a conversation with a teacher is a normal thing to do.
 * Learners appear only once they have written, because there are thousands of
 * them and the school has nothing to say to a learner unprompted.
 */
export async function listThreads(viewer: Viewer): Promise<ThreadRow[]> {
  if (!isStaff(viewer)) {
    const kind = kindFor(viewer)
    const threadId = await threadFor(viewer.id, kind)
    return [await describeOwn(threadId, viewer.id, kind)]
  }

  const [teacherRows, studentRows] = await Promise.all([staffSeesTeachers(), staffSeesStudents()])
  const rows = [...teacherRows, ...studentRows]

  const threadIds = rows.map((r) => r.id).filter((n) => n > 0)
  const lasts = threadIds.length ? await lastMessages(threadIds) : new Map()
  const unreads = threadIds.length ? await unreadCounts(viewer.id, threadIds) : new Map()

  return rows
    .map((r) => ({
      ...r,
      lastMessage: r.id ? (lasts.get(r.id) ?? null) : null,
      unread: r.id ? (unreads.get(r.id) ?? 0) : 0,
    }))
    .sort((a, b) => {
      // Anything said recently first; teachers nobody has written to yet fall
      // to the bottom in name order rather than in whatever the join produced.
      if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt)
      if (a.lastMessageAt) return -1
      if (b.lastMessageAt) return 1
      return a.name.localeCompare(b.name)
    })
}

type Partial = Omit<ThreadRow, 'lastMessage' | 'unread'>

/** Every teacher, with their thread where one exists. */
async function staffSeesTeachers(): Promise<Partial[]> {
  const teachers = await db
    .selectDistinct({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarPath: users.avatarPath,
      headline: teacherProfiles.headline,
      shortName: teacherProfiles.shortName,
      threadId: chatThreads.id,
      lastMessageAt: chatThreads.lastMessageAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .leftJoin(
      chatThreads,
      and(eq(chatThreads.ownerId, users.id), eq(chatThreads.kind, 'teacher')),
    )
    .where(and(eq(roles.name, 'teacher'), eq(users.status, 'active')))

  return teachers.map((t) => ({
    id: t.threadId ?? 0,
    kind: 'teacher' as const,
    withUserId: t.id,
    name: t.shortName?.trim() || `${t.firstName} ${t.lastName}`.trim(),
    subtitle: t.headline ?? null,
    avatarPath: t.avatarPath,
    lastMessageAt: instant(t.lastMessageAt),
  }))
}

/** Only the learners who have actually written. */
async function staffSeesStudents(): Promise<Partial[]> {
  const learners = await db
    .select({
      threadId: chatThreads.id,
      lastMessageAt: chatThreads.lastMessageAt,
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarPath: users.avatarPath,
      email: users.email,
    })
    .from(chatThreads)
    .innerJoin(users, eq(users.id, chatThreads.ownerId))
    .where(eq(chatThreads.kind, 'student'))

  return learners.map((l) => ({
    id: l.threadId,
    kind: 'student' as const,
    withUserId: l.id,
    name: `${l.firstName} ${l.lastName}`.trim() || l.email,
    // The address, so support can match them to an order without leaving here.
    subtitle: l.email,
    avatarPath: l.avatarPath,
    lastMessageAt: instant(l.lastMessageAt),
  }))
}

async function describeOwn(threadId: number, userId: number, kind: ThreadKind): Promise<ThreadRow> {
  const lasts = await lastMessages([threadId])
  const unreads = await unreadCounts(userId, [threadId])
  const [thread] = await db
    .select({ lastMessageAt: chatThreads.lastMessageAt })
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1)

  return {
    id: threadId,
    kind,
    // The other side is the school, not one person, so there is nobody to name.
    withUserId: null,
    name: 'ทีมงาน Minna',
    subtitle: kind === 'teacher' ? 'ฝ่ายดูแลผู้สอน' : 'ฝ่ายดูแลผู้เรียน',
    avatarPath: null,
    lastMessage: lasts.get(threadId) ?? null,
    lastMessageAt: instant(thread?.lastMessageAt ?? null),
    unread: unreads.get(threadId) ?? 0,
  }
}

/** One query for every thread on the page rather than one per thread. */
async function lastMessages(threadIds: number[]): Promise<Map<number, string>> {
  const rows = await db
    .select({
      threadId: chatMessages.threadId,
      body: chatMessages.body,
      attachmentName: chatMessages.attachmentName,
      id: chatMessages.id,
    })
    .from(chatMessages)
    .where(
      and(
        inArray(chatMessages.threadId, threadIds),
        sql`${chatMessages.id} = (
          SELECT MAX(m2.id) FROM chat_messages m2 WHERE m2.thread_id = ${chatMessages.threadId}
        )`,
      ),
    )
  return new Map(
    rows.map((r) => [
      r.threadId,
      (r.body?.trim() || r.attachmentName || 'ไฟล์แนบ').slice(0, 120),
    ]),
  )
}

/**
 * How many each thread holds that this reader has not seen.
 *
 * Counted by message id against the reader's mark, and their own messages
 * never count — being shown "1 unread" for something you just typed is the
 * sort of thing that makes a badge untrustworthy.
 *
 * One query for the whole page: the mark arrives on a left join, and a missing
 * participant row has to mean nothing has been read rather than no rows at
 * all, which is why COALESCE and not an inner join.
 */
async function unreadCounts(userId: number, threadIds: number[]): Promise<Map<number, number>> {
  if (!threadIds.length) return new Map()

  const rows = await db
    .select({ threadId: chatMessages.threadId, n: sql<number>`COUNT(*)` })
    .from(chatMessages)
    .leftJoin(
      chatParticipants,
      and(
        eq(chatParticipants.threadId, chatMessages.threadId),
        eq(chatParticipants.userId, userId),
      ),
    )
    .where(
      and(
        inArray(chatMessages.threadId, threadIds),
        or(isNull(chatMessages.userId), sql`${chatMessages.userId} <> ${userId}`),
        sql`${chatMessages.id} > COALESCE(${chatParticipants.lastReadMessageId}, 0)`,
      ),
    )
    .groupBy(chatMessages.threadId)

  return new Map(rows.map((r) => [r.threadId, Number(r.n)]))
}

/* ---------------- the transcript ---------------- */

export interface MessageRow {
  id: number
  threadId: number
  userId: number | null
  name: string
  avatarPath: string | null
  /** Whether this reader wrote it, which decides which side it is drawn on. */
  mine: boolean
  body: string | null
  attachment: { name: string; kind: 'image' | 'file'; sizeBytes: number | null } | null
  /**
   * Passed on from a learner by an admin.
   *
   * A flag and not the learner's id, because the teacher reading it must not
   * be able to work out who asked. Staff get `forwardedFromId` instead, which
   * is how the admin side can show the two halves beside each other.
   */
  forwarded: boolean
  forwardedFromId?: number | null
  createdAt: string
}

/**
 * Messages, oldest last.
 *
 * Paged backwards from `before`, because a conversation is read from the end:
 * opening one should show what was said most recently, and scrolling up asks
 * for more.
 */
export async function messages(
  viewer: Viewer,
  threadId: number,
  opts: { before?: number; limit?: number } = {},
): Promise<{ rows: MessageRow[]; hasMore: boolean }> {
  await assertMayRead(viewer, threadId)
  const staff = isStaff(viewer)
  const limit = Math.min(100, Math.max(1, opts.limit ?? 40))

  const where = [eq(chatMessages.threadId, threadId)]
  if (opts.before) where.push(lt(chatMessages.id, opts.before) as never)

  const rows = await db
    .select({
      id: chatMessages.id,
      threadId: chatMessages.threadId,
      userId: chatMessages.userId,
      body: chatMessages.body,
      attachmentName: chatMessages.attachmentName,
      attachmentKind: chatMessages.attachmentKind,
      attachmentSize: chatMessages.attachmentSize,
      forwardedFromId: chatMessages.forwardedFromId,
      createdAt: chatMessages.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarPath: users.avatarPath,
    })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.userId))
    .where(and(...where))
    .orderBy(desc(chatMessages.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return {
    // Reversed here rather than in the query: the page is the newest `limit`,
    // and it reads oldest-first once it is on screen.
    rows: page.reverse().map((r) => ({
      id: r.id,
      threadId: r.threadId,
      userId: r.userId,
      name: r.userId
        ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || 'ผู้ใช้'
        : 'บัญชีที่ถูกลบแล้ว',
      avatarPath: r.avatarPath ?? null,
      mine: r.userId === viewer.id,
      body: r.body,
      attachment: r.attachmentName
        ? {
            name: r.attachmentName,
            kind: (r.attachmentKind ?? 'file') as 'image' | 'file',
            sizeBytes: r.attachmentSize,
          }
        : null,
      forwarded: r.forwardedFromId !== null,
      // Staff only. The teacher is told that a question was relayed and not
      // whose it was, which is the whole of the arrangement.
      ...(staff ? { forwardedFromId: r.forwardedFromId } : {}),
      createdAt: instant(r.createdAt) ?? '',
    })),
    hasMore,
  }
}

/* ---------------- saying something ---------------- */

export interface SendInput {
  body?: string | null
  attachmentPath?: string | null
  attachmentName?: string | null
  attachmentKind?: 'image' | 'file' | null
  attachmentSize?: number | null
}

export async function send(
  viewer: Viewer,
  threadId: number,
  input: SendInput,
): Promise<MessageRow> {
  await assertMayRead(viewer, threadId)

  const body = input.body?.trim() ?? ''
  if (!body && !input.attachmentPath) {
    throw conflict('Write something, or attach a file.')
  }

  const [res] = await db.insert(chatMessages).values({
    threadId,
    userId: viewer.id,
    body: body || null,
    attachmentPath: input.attachmentPath ?? null,
    attachmentName: input.attachmentName ?? null,
    attachmentKind: input.attachmentKind ?? null,
    attachmentSize: input.attachmentSize ?? null,
  })

  await db
    .update(chatThreads)
    // The database's clock, not this process's. Every other timestamp on
    // these tables is written by MySQL, and comparing the two is comparing
    // two clocks that are not the same one.
    .set({ lastMessageAt: sql`NOW()` as never })
    .where(eq(chatThreads.id, threadId))

  // Taking part is what puts an admin in the participants table, which is also
  // where their own read mark lives — so sending is reading, up to now.
  await markRead(viewer, threadId)

  const [row] = (await messages(viewer, threadId, { limit: 1 })).rows
  if (!row) throw conflict('The message was saved but could not be read back.')

  await announce(viewer, threadId, row)
  return { ...row, id: Number(res.insertId) }
}

/**
 * Passing a learner's question on to the teacher who can answer it.
 *
 * This is the whole reason learners and teachers do not talk directly. A
 * teacher who knows which learner is asking is a teacher who can be offered
 * something for the answer, and a learner who can reach a teacher privately
 * can offer it. So the question travels and the asker does not: what lands in
 * the teacher's thread is a new message, written by the admin who relayed it,
 * quoting the words and naming nobody.
 *
 * The attachment is deliberately left behind. A photograph of a worksheet can
 * have a name on it, and a file that was uploaded into one conversation has
 * no business being served out of another — an admin who wants a teacher to
 * see it can attach it themselves, having looked at it.
 */
export async function forward(
  viewer: Viewer,
  input: { messageId: number; teacherId: number; note?: string },
): Promise<MessageRow> {
  if (!isStaff(viewer)) {
    throw forbidden('Only the school can pass a question on.')
  }

  const [source] = await db
    .select({
      id: chatMessages.id,
      body: chatMessages.body,
      attachmentName: chatMessages.attachmentName,
      threadKind: chatThreads.kind,
    })
    .from(chatMessages)
    .innerJoin(chatThreads, eq(chatThreads.id, chatMessages.threadId))
    .where(eq(chatMessages.id, input.messageId))
    .limit(1)

  if (!source) throw notFound('No such message.')
  if (source.threadKind !== 'student') {
    // Relaying between teachers would be an odd thing to want, and allowing it
    // would make "forwarded" mean two different things in the same column.
    throw conflict('Only a learner’s message can be passed on.')
  }

  const [teaches] = await db
    .select({ id: users.id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(
      and(
        eq(users.id, input.teacherId),
        eq(roles.name, 'teacher'),
        eq(users.status, 'active'),
      ),
    )
    .limit(1)
  if (!teaches) throw notFound('No such teacher.')

  const quoted = (source.body?.trim() || `[ไฟล์แนบ: ${source.attachmentName ?? 'ไม่มีชื่อ'}]`).slice(
    0,
    3500,
  )
  const note = input.note?.trim()
  // Marked as a question from a learner, and that is all the teacher is told.
  const body = ['คำถามจากผู้เรียน:', quoted, note ? `\n— ${note}` : null]
    .filter(Boolean)
    .join('\n')

  const threadId = await threadFor(input.teacherId, 'teacher')
  const [res] = await db.insert(chatMessages).values({
    threadId,
    userId: viewer.id,
    forwardedFromId: source.id,
    body,
  })

  await db
    .update(chatThreads)
    .set({ lastMessageAt: sql`NOW()` as never })
    .where(eq(chatThreads.id, threadId))

  await markRead(viewer, threadId)

  const [row] = (await messages(viewer, threadId, { limit: 1 })).rows
  if (!row) throw conflict('The question was passed on but could not be read back.')
  await announce(viewer, threadId, row)
  return { ...row, id: Number(res.insertId) }
}

/** What a notification about this message says it is. */
const CHAT_NOTICE = 'chat.message'
const chatSubject = (threadId: number) => ({ type: 'chat_thread', id: threadId })

/**
 * Telling the other side there is something waiting.
 *
 * One notice per conversation, not one per message: `subject` is a unique key,
 * so the first unread message writes a row and the next twenty are refused.
 * Reading the thread deletes it, which is what lets the conversation after
 * that announce itself again. Without that, somebody sending five lines in a
 * row would fill the bell with five copies of the same errand.
 *
 * No email goes with it. A chat is a thing you have open or you do not, and a
 * mail per message is how people come to filter the address.
 */
async function announce(sender: Viewer, threadId: number, message: MessageRow): Promise<void> {
  const [thread] = await db
    .select({ kind: chatThreads.kind, ownerId: chatThreads.ownerId })
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1)

  const ownerId = thread?.ownerId ?? null
  if (!ownerId) return
  const forLearner = thread?.kind === 'student'

  const preview = (message.body?.trim() || message.attachment?.name || 'ไฟล์แนบ').slice(0, 120)

  // A link belongs to whoever is being told, not to the thread. Staff always
  // read in the admin, whichever side wrote; a learner always reads on the
  // site. Deriving one link from the thread sent admins to a learner's page,
  // which in the admin is a 404.
  const inAdmin = `/chat?thread=${threadId}`
  const onSite = '/account/messages'

  if (isStaff(sender)) {
    // Somebody on the staff side has answered, so it is no longer an errand
    // waiting for whoever is on duty — including the admins who never saw it.
    await notify.clear(await notify.adminIds(), CHAT_NOTICE, chatSubject(threadId))
    // An admin writing in their own thread is talking to themselves.
    if (ownerId === sender.id) return
    await notify.notify({
      userId: ownerId,
      type: CHAT_NOTICE,
      surface: forLearner ? 'site' : 'admin',
      title: 'มีข้อความใหม่จากทีมงาน',
      body: preview,
      link: forLearner ? onSite : inAdmin,
      subject: chatSubject(threadId),
    })
    return
  }

  await notify.notifyAdmins({
    type: CHAT_NOTICE,
    // Which side it came from, because the two are answered differently: a
    // teacher's question is usually answered, a learner's is often relayed.
    title: forLearner
      ? `ผู้เรียนถามเข้ามา: ${message.name}`
      : `มีข้อความใหม่จาก ${message.name}`,
    body: preview,
    // Always the admin: this one is read by staff, whichever side wrote it.
    link: inAdmin,
    subject: chatSubject(threadId),
  })
}

/**
 * Where this reader has got to: the newest message in the thread.
 *
 * Idempotent, cheap enough to call on every scroll, and read from the thread
 * itself rather than from whatever the client claims to have seen — a client
 * that reports a number can report a wrong one.
 */
export async function markRead(viewer: Viewer, threadId: number): Promise<void> {
  await assertMayRead(viewer, threadId)
  const [newest] = await db
    .select({ id: sql<number>`COALESCE(MAX(${chatMessages.id}), 0)` })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
  const upTo = Number(newest?.id ?? 0)

  await db
    .insert(chatParticipants)
    .values({ threadId, userId: viewer.id, lastReadMessageId: upTo })
    // Never backwards: two tabs reading at once, the later one arriving first.
    .onDuplicateKeyUpdate({
      set: { lastReadMessageId: sql`GREATEST(last_read_message_id, ${upTo})` as never },
    })

  // The bell was pointing at this. It no longer has anything to point at.
  await notify.clear(viewer.id, CHAT_NOTICE, chatSubject(threadId))
}

/** The badge in the header: everything unread across every thread they can see. */
export async function unreadTotal(viewer: Viewer): Promise<number> {
  const threads = await listThreads(viewer)
  return threads.reduce((sum, t) => sum + t.unread, 0)
}

/* ---------------- attachments ---------------- */

/**
 * The stored path behind one message, for whoever may read the thread.
 *
 * Fetched through the thread rather than signed by path, so reaching a file
 * means being in the conversation it was sent to. A chat attachment is not
 * public, and nothing else in the store should be reachable from here.
 */
export async function attachmentPath(
  viewer: Viewer,
  threadId: number,
  messageId: number,
): Promise<string> {
  await assertMayRead(viewer, threadId)
  const [row] = await db
    .select({ path: chatMessages.attachmentPath })
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.threadId, threadId)))
    .limit(1)
  if (!row?.path) throw notFound('That message has no attachment.')
  return row.path
}

/** Messages newer than `since`, for the live stream. */
export async function since(
  viewer: Viewer,
  threadId: number,
  afterId: number,
): Promise<MessageRow[]> {
  await assertMayRead(viewer, threadId)
  const rows = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.threadId, threadId), gt(chatMessages.id, afterId)))
    .orderBy(asc(chatMessages.id))
    .limit(50)
  if (!rows.length) return []
  const all = await messages(viewer, threadId, { limit: 100 })
  return all.rows.filter((r) => r.id > afterId)
}
