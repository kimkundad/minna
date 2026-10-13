import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  categories,
  contactMessages,
  posts,
  roles,
  subscribers,
  teacherProfiles,
  testimonials,
  userRoles,
  users,
} from '../../db/schema/index'
import type { POST_LOCALES } from '../../db/schema/content'
import { conflict, notFound } from '../../lib/errors'
import { removeOrphanedMedia } from '../../lib/media'
import { expandCategories } from '../catalog/catalog.service'

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

export type PostLocale = (typeof POST_LOCALES)[number]

export interface PostInput {
  title: string
  slug: string
  excerpt: string | null
  coverPath: string | null
  contentHtml: string | null
  contentLocale: PostLocale
  status: 'draft' | 'published'
  /** From the same list the courses use. Null when it fits nowhere. */
  categoryId: number | null
  /** How it looks when shared, where that should differ from the page. */
  ogTitle?: string | null | undefined
  ogDescription?: string | null | undefined
  ogImagePath?: string | null | undefined
  /**
   * Who it is by. Absent leaves it as it was — which on a create means the
   * person creating it, and on an edit means whoever is already credited.
   *
   * Null counts as absent rather than as "no author". An article always has
   * one: it is the name and the biography on the card at the end of it, and a
   * blank there is a gap on a published page rather than a tidy empty field.
   */
  authorId?: number | null | undefined
}

export async function listPosts(opts: {
  page: number
  perPage: number
  status?: 'draft' | 'published' | undefined
  locale?: PostLocale | undefined
  categoryId?: number | undefined
  q?: string | undefined
}) {
  const term = `%${opts.q ?? ''}%`
  const where = [
    opts.status ? eq(posts.status, opts.status) : undefined,
    opts.locale ? eq(posts.contentLocale, opts.locale) : undefined,
    opts.categoryId ? eq(posts.categoryId, opts.categoryId) : undefined,
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
      categoryId: posts.categoryId,
      categoryName: categories.name,
    })
    .from(posts)
    .leftJoin(users, eq(users.id, posts.authorId))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .leftJoin(categories, eq(categories.id, posts.categoryId))
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

/* ---------------- articles, as a reader sees them ---------------- */

/**
 * What the public site is told about an article.
 *
 * Deliberately narrower than the admin's row: no draft, no `createdAt`, no
 * author id. A reader gets the author's name because a byline is part of an
 * article; they do not get the row.
 */
const READER_COLUMNS = {
  id: posts.id,
  title: posts.title,
  slug: posts.slug,
  excerpt: posts.excerpt,
  coverPath: posts.coverPath,
  contentLocale: posts.contentLocale,
  publishedAt: posts.publishedAt,
  updatedAt: posts.updatedAt,
  categoryId: posts.categoryId,
  categoryName: categories.name,
  /**
   * The teacher's public name where they have one, falling back to the
   * account's. The same rule the catalog uses: a byline reading "Aiko Tanaka"
   * under a course card that says "田中 愛子 (Aiko Tanaka)" reads as two people.
   */
  authorName: sql<string>`COALESCE(
    ${teacherProfiles.displayName},
    TRIM(CONCAT(COALESCE(${users.firstName}, ''), ' ', COALESCE(${users.lastName}, '')))
  )`,
  authorHeadline: teacherProfiles.headline,
  authorBio: teacherProfiles.bio,
  authorAvatarPath: users.avatarPath,
} as const

/**
 * Published articles, newest first.
 *
 * `status = 'published'` is enforced here rather than left to the route, for
 * the same reason the catalog enforces `approved`: a draft leaking onto the
 * public site is writing nobody meant to publish, and "the endpoint forgot to
 * filter" is how that happens.
 *
 * An article with no `published_at` is excluded too. That should not happen —
 * publishing stamps it — but a row edited by hand could, and a dateless
 * article would sort to the end of time.
 */
export async function listPublishedPosts(opts: {
  page: number
  perPage: number
  locale?: PostLocale | undefined
  categoryId?: number | undefined
  q?: string | undefined
  /** Left out of the results. For "other articles" beside the one being read. */
  excludeId?: number | undefined
}) {
  const term = `%${opts.q ?? ''}%`
  const where = [
    eq(posts.status, 'published'),
    sql`${posts.publishedAt} IS NOT NULL`,
    opts.locale
      ? opts.locale === 'all'
        ? eq(posts.contentLocale, 'all')
        : or(eq(posts.contentLocale, opts.locale), eq(posts.contentLocale, 'all'))
      : undefined,
    opts.categoryId ? inArray(posts.categoryId, await expandCategories([opts.categoryId])) : undefined,
    opts.excludeId ? sql`${posts.id} <> ${opts.excludeId}` : undefined,
    // The body as well as the title: somebody searching for a word they
    // remember from inside an article should find it.
    opts.q
      ? sql`(${posts.title} LIKE ${term} OR ${posts.excerpt} LIKE ${term} OR ${posts.contentHtml} LIKE ${term})`
      : undefined,
  ].filter(Boolean)
  const filter = and(...(where as never[]))

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(posts)
    .where(filter)

  const rows = await db
    .select(READER_COLUMNS)
    .from(posts)
    .leftJoin(users, eq(users.id, posts.authorId))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .leftJoin(categories, eq(categories.id, posts.categoryId))
    .where(filter)
    .orderBy(desc(posts.publishedAt))
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

/** One published article, by the slug in its URL. */
export async function getPublishedPost(slug: string) {
  const [row] = await db
    .select({ ...READER_COLUMNS, contentHtml: posts.contentHtml })
    .from(posts)
    .leftJoin(users, eq(users.id, posts.authorId))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .leftJoin(categories, eq(categories.id, posts.categoryId))
    .where(and(eq(posts.slug, slug), eq(posts.status, 'published')))
    .limit(1)

  // The same answer for a draft as for a slug that was never used: whether an
  // unpublished article exists is not a reader's business.
  if (!row) throw notFound('That article does not exist.')
  return row
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

/**
 * Whether somebody may be credited with an article.
 *
 * Staff and teachers, and nobody else. Without this an administrator could
 * put any user id in the field and credit an article to a student — who would
 * then have their name on the public site, under writing they did not do and
 * cannot take down.
 */
async function assertCanBeAuthor(userId: number) {
  const [row] = await db
    .select({ role: roles.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.id, userId), inArray(roles.name, ['teacher', 'admin', 'superadmin'])))
    .limit(1)

  if (!row) {
    throw conflict('That person cannot be an author.', {
      authorId: 'Pick a teacher or a member of staff.',
    })
  }
}

export async function createPost(input: PostInput, createdBy: number) {
  if (await slugTaken(input.slug)) throw conflict('That web address is already in use.')
  if (input.authorId) await assertCanBeAuthor(input.authorId)

  const [res] = await db.insert(posts).values({
    ...input,
    // Whoever was picked, or the person doing the creating. Most articles are
    // written by the person filing them, so the fallback is the common case
    // rather than a guess.
    authorId: input.authorId ?? createdBy,
    // Stamped when it first goes live, and never moved afterwards: the date on
    // an article is part of what it says.
    publishedAt: input.status === 'published' ? new Date() : null,
  })
  return getPost(Number(res.insertId))
}

export async function updatePost(id: number, input: PostInput) {
  const before = await getPost(id)
  if (await slugTaken(input.slug, id)) throw conflict('That web address is already in use.')
  if (input.authorId) await assertCanBeAuthor(input.authorId)

  await db
    .update(posts)
    .set({
      ...input,
      // Absent means unchanged. Spreading `input` would otherwise write
      // undefined over the existing author on any save that left it out.
      ...(input.authorId === undefined || input.authorId === null
        ? { authorId: before.authorId }
        : { authorId: input.authorId }),
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
