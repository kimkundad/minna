import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  contactMessages,
  posts,
  subscribers,
  testimonials,
  users,
} from '../../db/schema/index'
import { conflict, notFound } from '../../lib/errors'
import { removeOrphanedMedia } from '../../lib/media'

/**
 * The site's own content: articles, testimonials, enquiries, subscribers.
 *
 * Four small tables with nothing in common except that they belong to the
 * public site rather than to the school. Two are written here and read there
 * (articles, testimonials); two are written there and read here (enquiries,
 * subscribers). Keeping them in one file keeps four almost-identical CRUD
 * modules from existing.
 */

/* ---------------- articles ---------------- */

export interface PostInput {
  title: string
  slug: string
  excerpt: string | null
  coverPath: string | null
  contentHtml: string | null
  contentLocale: 'th' | 'en' | 'jp' | 'vn'
  status: 'draft' | 'published'
}

export async function listPosts(opts: {
  page: number
  perPage: number
  status?: 'draft' | 'published' | undefined
  locale?: 'th' | 'en' | 'jp' | 'vn' | undefined
  q?: string | undefined
}) {
  const term = `%${opts.q ?? ''}%`
  const where = [
    opts.status ? eq(posts.status, opts.status) : undefined,
    opts.locale ? eq(posts.contentLocale, opts.locale) : undefined,
    opts.q ? sql`(${posts.title} LIKE ${term} OR ${posts.slug} LIKE ${term})` : undefined,
  ].filter(Boolean)
  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(posts)
    .where(filter)

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      coverPath: posts.coverPath,
      contentLocale: posts.contentLocale,
      status: posts.status,
      publishedAt: posts.publishedAt,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      authorId: posts.authorId,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
    })
    .from(posts)
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(filter)
    .orderBy(desc(posts.createdAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows,
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
    },
  }
}

export async function getPost(id: number) {
  const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1)
  if (!row) throw notFound('That article does not exist.')
  return row
}

async function slugTaken(slug: string, exceptId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.slug, slug))
    .limit(1)
  return Boolean(row && row.id !== exceptId)
}

export async function createPost(input: PostInput, authorId: number) {
  if (await slugTaken(input.slug)) throw conflict('That web address is already in use.')

  const [res] = await db.insert(posts).values({
    ...input,
    authorId,
    // Stamped when it first goes live, and never moved afterwards: the date on
    // an article is part of what it says.
    publishedAt: input.status === 'published' ? new Date() : null,
  })
  return getPost(Number(res.insertId))
}

export async function updatePost(id: number, input: PostInput) {
  const before = await getPost(id)
  if (await slugTaken(input.slug, id)) throw conflict('That web address is already in use.')

  await db
    .update(posts)
    .set({
      ...input,
      // Publishing stamps the date; unpublishing and republishing keeps the
      // original, because readers and search engines have seen it.
      publishedAt:
        input.status === 'published' ? (before.publishedAt ?? new Date()) : before.publishedAt,
    })
    .where(eq(posts.id, id))

  const after = await getPost(id)
  // After the write, never before: the question is what still points at a
  // picture, and the answer has to come from what is now stored.
  await removeOrphanedMedia(before.contentHtml, after.contentHtml)
  return { before, after }
}

export async function deletePost(id: number) {
  const post = await getPost(id)
  await db.delete(posts).where(eq(posts.id, id))
  await removeOrphanedMedia(post.contentHtml, null)
  return post
}

/* ---------------- testimonials ---------------- */

export interface TestimonialInput {
  name: string
  designation: string | null
  content: string
  rating: number
  avatarPath: string | null
  status: 'draft' | 'published'
  sortOrder: number
}

export async function listTestimonials(opts: {
  page: number
  perPage: number
  status?: 'draft' | 'published' | undefined
  q?: string | undefined
}) {
  const term = `%${opts.q ?? ''}%`
  const where = [
    opts.status ? eq(testimonials.status, opts.status) : undefined,
    opts.q
      ? sql`(${testimonials.name} LIKE ${term} OR ${testimonials.content} LIKE ${term})`
      : undefined,
  ].filter(Boolean)
  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(testimonials)
    .where(filter)

  const rows = await db
    .select()
    .from(testimonials)
    .where(filter)
    // The order they appear in on the site, which is the order to edit them in.
    .orderBy(testimonials.sortOrder, desc(testimonials.createdAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows,
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
    },
  }
}

export async function getTestimonial(id: number) {
  const [row] = await db.select().from(testimonials).where(eq(testimonials.id, id)).limit(1)
  if (!row) throw notFound('That testimonial does not exist.')
  return row
}

export async function createTestimonial(input: TestimonialInput) {
  const [res] = await db.insert(testimonials).values(input)
  return getTestimonial(Number(res.insertId))
}

export async function updateTestimonial(id: number, input: TestimonialInput) {
  const before = await getTestimonial(id)
  await db.update(testimonials).set(input).where(eq(testimonials.id, id))
  return { before, after: await getTestimonial(id) }
}

export async function deleteTestimonial(id: number) {
  const row = await getTestimonial(id)
  await db.delete(testimonials).where(eq(testimonials.id, id))
  return row
}

/* ---------------- enquiries ---------------- */

export async function listMessages(opts: {
  page: number
  perPage: number
  unreadOnly?: boolean | undefined
  q?: string | undefined
}) {
  const term = `%${opts.q ?? ''}%`
  const where = [
    opts.unreadOnly ? sql`${contactMessages.readAt} IS NULL` : undefined,
    opts.q
      ? sql`(${contactMessages.name} LIKE ${term} OR ${contactMessages.email} LIKE ${term}
             OR ${contactMessages.subject} LIKE ${term} OR ${contactMessages.message} LIKE ${term})`
      : undefined,
  ].filter(Boolean)
  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(contactMessages)
    .where(filter)

  const [{ value: unread } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(contactMessages)
    .where(sql`${contactMessages.readAt} IS NULL`)

  const rows = await db
    .select()
    .from(contactMessages)
    .where(filter)
    .orderBy(desc(contactMessages.createdAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows,
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
      unread: Number(unread),
    },
  }
}

export async function getMessage(id: number) {
  const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1)
  if (!row) throw notFound('That message does not exist.')
  return row
}

/**
 * Marks one read, or back to unread.
 *
 * Both directions on purpose: "read" here means somebody has dealt with it, and
 * opening a message by accident should not be able to lose it.
 */
export async function setMessageRead(id: number, read: boolean) {
  await getMessage(id)
  await db
    .update(contactMessages)
    .set({ readAt: read ? new Date() : null })
    .where(eq(contactMessages.id, id))
  return getMessage(id)
}

export async function deleteMessage(id: number) {
  const row = await getMessage(id)
  await db.delete(contactMessages).where(eq(contactMessages.id, id))
  return row
}

/* ---------------- subscribers ---------------- */

export async function listSubscribers(opts: {
  page: number
  perPage: number
  state?: 'confirmed' | 'pending' | 'unsubscribed' | undefined
  q?: string | undefined
}) {
  const where = [
    opts.state === 'confirmed'
      ? sql`${subscribers.confirmedAt} IS NOT NULL AND ${subscribers.unsubscribedAt} IS NULL`
      : undefined,
    opts.state === 'pending'
      ? sql`${subscribers.confirmedAt} IS NULL AND ${subscribers.unsubscribedAt} IS NULL`
      : undefined,
    opts.state === 'unsubscribed'
      ? sql`${subscribers.unsubscribedAt} IS NOT NULL`
      : undefined,
    opts.q ? sql`${subscribers.email} LIKE ${`%${opts.q}%`}` : undefined,
  ].filter(Boolean)
  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(subscribers)
    .where(filter)

  const [counts] = await db
    .select({
      confirmed: sql<number>`SUM(CASE WHEN confirmed_at IS NOT NULL AND unsubscribed_at IS NULL THEN 1 ELSE 0 END)`,
      pending: sql<number>`SUM(CASE WHEN confirmed_at IS NULL AND unsubscribed_at IS NULL THEN 1 ELSE 0 END)`,
      gone: sql<number>`SUM(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(subscribers)

  const rows = await db
    .select()
    .from(subscribers)
    .where(filter)
    .orderBy(desc(subscribers.createdAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows,
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
      confirmed: Number(counts?.confirmed ?? 0),
      pending: Number(counts?.pending ?? 0),
      unsubscribed: Number(counts?.gone ?? 0),
    },
  }
}

/**
 * Takes somebody off the list from the admin.
 *
 * Recorded as unsubscribed rather than deleted. If they ask to be removed and
 * the row goes, the next time they are imported from anywhere they are back on
 * it — the record of having asked is the point.
 */
export async function unsubscribe(id: number) {
  const [row] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1)
  if (!row) throw notFound('That subscriber does not exist.')
  if (row.unsubscribedAt) return row

  await db
    .update(subscribers)
    .set({ unsubscribedAt: new Date() })
    .where(eq(subscribers.id, id))

  const [after] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1)
  return after!
}

/** The confirmed addresses, for whoever sends the mail. */
export async function exportSubscribers(): Promise<string[]> {
  const rows = await db
    .select({ email: subscribers.email })
    .from(subscribers)
    .where(sql`${subscribers.confirmedAt} IS NOT NULL AND ${subscribers.unsubscribedAt} IS NULL`)
    .orderBy(subscribers.email)
  return rows.map((r) => r.email)
}
