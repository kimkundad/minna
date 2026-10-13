import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '../../db/client'
import { notifications, roles, userRoles, users } from '../../db/schema/index'
import type { Mail, MailLogger } from '../../lib/mailer'
import { sendMail } from '../../lib/mailer'
import { instant } from '../../lib/sql'
import * as consents from './consents.service'

/**
 * Telling somebody that something happened.
 *
 * One way in, so the rules live in one place rather than beside each event:
 * what is written down, which app the link belongs to, whether an email goes
 * with it, and whether this person agreed to be sent that kind of thing.
 *
 * The words are written at the moment of the event and kept. A notification
 * saying "ข้อเขียนของสมหญิง รอตรวจ" has to keep saying that after she changes
 * her name, and a sale has to keep naming the price it sold at. Re-rendering
 * from the event later would quietly rewrite history.
 *
 * Nothing here throws into the caller. A sale that completed must not be
 * undone because a mail server was down, and the person's access does not
 * depend on them hearing about it.
 */

export type Surface = 'site' | 'admin'

export interface NotifyInput {
  userId: number
  /** `order.paid`, `essay.submitted`, … Free text; see the callers. */
  type: string
  surface: Surface
  title: string
  body?: string | null
  /** A path within its surface, never a URL. */
  link?: string | null
  /** What it is about. With `type` and the user, this is what stops a webhook
   *  delivered twice from telling somebody twice. */
  subject?: { type: string; id: number } | null
  /**
   * The email to send alongside, if one should go. Built by the caller because
   * only the caller knows what it should say; `to` is filled in here.
   */
  mail?: Omit<Mail, 'to'> | null
  /**
   * Which consent switch governs this, if any.
   *
   * Transactional messages — a receipt, a verdict on work somebody submitted —
   * have none: they are part of the thing the person asked for, and a school
   * that stopped sending receipts because of a marketing preference would be
   * failing at the transaction, not respecting a choice.
   */
  consent?: 'news' | 'newCourses' | 'expiryAlert' | null
  log?: MailLogger | undefined
}

export async function notify(input: NotifyInput): Promise<boolean> {
  try {
    const subjectType = input.subject?.type ?? null
    const subjectId = input.subject?.id ?? null

    // The unique key refuses a second one; this catches the ordinary case
    // without relying on an error, and tells the caller nothing was sent.
    if (subjectType !== null) {
      const [seen] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, input.userId),
            eq(notifications.type, input.type),
            eq(notifications.subjectType, subjectType),
            eq(notifications.subjectId, subjectId as number),
          ),
        )
        .limit(1)
      if (seen) return false
    }

    let mayMail = Boolean(input.mail)
    if (mayMail && input.consent) {
      const held = await consents.get(input.userId)
      mayMail = held[input.consent] === true
    }

    const [res] = await db.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      surface: input.surface,
      title: input.title,
      body: input.body ?? null,
      ctaUrl: input.link ?? null,
      subjectType,
      subjectId,
      mailedAt: mayMail ? new Date() : null,
    })

    if (mayMail && input.mail) {
      const [to] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1)
      // Deliberately not awaited: the caller is usually inside a webhook that
      // Stripe is timing.
      // A console logger stands in when the caller had none: the mailer
      // needs somewhere to say what it did, and losing that is worse than
      // the untidiness.
      if (to) void sendMail({ ...input.mail, to: to.email }, input.log ?? console)
    }

    return Number(res.insertId) > 0
  } catch (err) {
    // A notification that could not be written is not a reason to fail the
    // thing it was about.
    input.log?.warn({ err, type: input.type, userId: input.userId }, 'could not notify')
    return false
  }
}

/**
 * Everyone who can act on a thing that needs staff.
 *
 * Both roles, because a superadmin is an admin with more, not an admin with
 * less — and an application sitting unreviewed because the only person told
 * was on holiday is the failure this exists to prevent.
 */
export async function notifyAdmins(
  input: Omit<NotifyInput, 'userId' | 'surface'>,
): Promise<number> {
  const ids = await adminIds()
  let sent = 0
  for (const id of ids) {
    if (await notify({ ...input, userId: id, surface: 'admin' })) sent += 1
  }
  return sent
}


/* ---------------- reading them ---------------- */

export interface NotificationRow {
  id: number
  type: string
  surface: Surface
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

/**
 * Somebody's own notifications for one app.
 *
 * Narrowed by surface rather than merged: the public site cannot open an admin
 * link and has no business listing one.
 */
export async function listFor(
  userId: number,
  surface: Surface,
  opts: { unreadOnly?: boolean; limit?: number; page?: number } = {},
): Promise<{
  rows: NotificationRow[]
  unread: number
  /** How many match the filter, so a page can say whether there are more. */
  total: number
  page: number
  perPage: number
  totalPages: number
}> {
  const where = [eq(notifications.userId, userId), eq(notifications.surface, surface)]
  if (opts.unreadOnly) where.push(isNull(notifications.readAt) as never)
  const filter = and(...where)

  const perPage = opts.limit ?? 30
  const page = Math.max(1, opts.page ?? 1)

  const rows = await db
    .select()
    .from(notifications)
    .where(filter)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(perPage)
    .offset((page - 1) * perPage)

  const [matching] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(filter)

  // Counted without the filter, because the badge means "unread" whatever the
  // page is currently showing.
  const [count] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.surface, surface),
        isNull(notifications.readAt),
      ),
    )

  const total = Number(matching?.n ?? 0)
  return {
    rows: rows.map((r) => ({
      id: r.id,
      type: r.type,
      surface: r.surface,
      title: r.title,
      body: r.body,
      link: r.ctaUrl,
      readAt: instant(r.readAt),
      createdAt: instant(r.createdAt) ?? '',
    })),
    unread: Number(count?.n ?? 0),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  }
}

export async function unreadCount(userId: number, surface: Surface): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.surface, surface),
        isNull(notifications.readAt),
      ),
    )
  return Number(row?.n ?? 0)
}

/** Scoped by user as well as id, so an id from somewhere else marks nothing. */
export async function markRead(userId: number, id: number): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
}

export async function markAllRead(userId: number, surface: Surface): Promise<number> {
  const open = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.surface, surface),
        isNull(notifications.readAt),
      ),
    )
  if (!open.length) return 0
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.surface, surface),
        isNull(notifications.readAt),
      ),
    )
  return open.length
}

/**
 * Take back a notice about something that no longer needs doing.
 *
 * Deleted rather than marked read, and that is deliberate. `subject` is a
 * unique key, so a row that stays would stop the same thing ever being
 * announced again — and "you have an unread message" is a pointer to a
 * situation, not a record of an event. Once the messages have been read the
 * pointer is wrong, and the conversation itself is the history.
 *
 * Nothing here throws, for the same reason `notify` does not.
 */
export async function clear(
  userIds: number | number[],
  type: string,
  subject: { type: string; id: number },
): Promise<number> {
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).filter((n) => n > 0)
  if (!ids.length) return 0
  try {
    const [res] = await db
      .delete(notifications)
      .where(
        and(
          inArray(notifications.userId, ids),
          eq(notifications.type, type),
          eq(notifications.subjectType, subject.type),
          eq(notifications.subjectId, subject.id),
        ),
      )
    return Number(res.affectedRows ?? 0)
  } catch {
    // A stale notice is untidy, not harmful.
    return 0
  }
}

/** Everyone who would be told about something needing staff. */
export async function adminIds(): Promise<number[]> {
  const staff = await db
    .select({ id: users.id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(inArray(roles.name, ['admin', 'superadmin']), eq(users.status, 'active')))
  return [...new Set(staff.map((s) => s.id))]
}
