import type { SQL } from 'drizzle-orm'
import { and, asc, count, desc, eq, inArray, like, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { LOCALES } from '../../db/schema/auth'
import {
  categories,
  categoryTranslations,
  courseDocuments,
  courseInstructors,
  courseModules,
  courses,
  lessons,
  teacherProfiles,
  users,
} from '../../db/schema/index'
import { conflict, notFound } from '../../lib/errors'
import { removeOrphanedMedia, removeOrphanedPath } from '../../lib/media'
import { outer } from '../../lib/sql'
import * as notify from '../people/notify.service'

/**
 * Catalog reads and writes.
 *
 * Two audiences share these queries. The public site may only ever see
 * `approved` courses, which is enforced here rather than left to each caller:
 * a draft leaking onto the storefront is a price or a lesson nobody meant to
 * publish, and "the endpoint forgot to filter" is how that happens.
 */

export interface Paged<T> {
  data: T[]
  meta: { page: number; perPage: number; total: number; totalPages: number }
}

function paged<T>(data: T[], total: number, page: number, perPage: number): Paged<T> {
  return {
    data,
    meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  }
}

/* ---------------- categories ---------------- */

/**
 * Categories, paged by their top level.
 *
 * A page boundary falling between a parent and its children would show
 * orphaned sub-categories with nothing to belong to, so the page counts
 * top-level rows and brings each one's children along with it. The totals
 * therefore describe top-level categories, which is also what someone paging
 * through them is counting.
 */
export async function listCategoriesPaged(opts: { page: number; perPage: number; q?: string }) {
  const all = await listCategories()
  const match = opts.q?.trim().toLowerCase()

  /**
   * Matches the slug and the name in any language, not only the canonical one.
   * An admin looking for the category they know as "Japanese" should find it
   * whether or not Thai is the language they filed it under.
   */
  const hit = (c: (typeof all)[number]) =>
    !match ||
    c.slug.toLowerCase().includes(match) ||
    Object.values(c.names).some((n) => n.toLowerCase().includes(match))

  const roots = all.filter(
    (c) =>
      c.parentId === null &&
      // A parent stays in the list when one of its children matches, or the
      // child would have nowhere to appear.
      (hit(c) || all.some((k) => k.parentId === c.id && hit(k))),
  )

  const page = roots.slice((opts.page - 1) * opts.perPage, opts.page * opts.perPage)
  const ids = new Set(page.map((c) => c.id))
  const data = all.filter((c) => ids.has(c.id) || (c.parentId !== null && ids.has(c.parentId)))

  return paged(data, roots.length, opts.page, opts.perPage)
}

export async function listCategories(locale?: string) {
  const rows = await categoryRows(locale)

  /**
   * Two counts, because two callers mean different things by "how many".
   *
   * `courseCount` is what is filed on this category itself, which is what the
   * admin needs before deleting one. `totalCourseCount` adds everything
   * beneath it, which is what a visitor means by "ภาษาญี่ปุ่น" — nothing is
   * filed on a parent, so its own count is always zero and showing that would
   * say a language with six courses has none.
   *
   * The subtree is built from the published count, not the raw one. Only the
   * public site reads `totalCourseCount`, and it puts the number on a card
   * that links to the catalogue — so a draft counted here is a card promising
   * a course the link does not return.
   */
  const parentOf = new Map(rows.map((c) => [c.id, c.parentId]))
  const totals = new Map<number, number>()
  for (const row of rows) {
    const n = Number(row.publishedCount)
    if (!n) continue
    let at: number | null | undefined = row.id
    const seen = new Set<number>()
    while (at != null && !seen.has(at)) {
      seen.add(at)
      totals.set(at, (totals.get(at) ?? 0) + n)
      at = parentOf.get(at)
    }
  }

  const names = await translatedNames(rows.map((r) => r.id))

  return rows.map((r) => ({
    ...r,
    courseCount: Number(r.courseCount),
    totalCourseCount: totals.get(r.id) ?? 0,
    /**
     * Every language at once, rather than the reader's.
     *
     * There are eighteen of these and the list is fetched whole and cached, so
     * four short names each is nothing on the wire — and it saves teaching the
     * ten other queries that read a category name which language to answer in,
     * and saves a join on the catalog query, which is the hot one.
     *
     * The canonical name is written last, so a stray row claiming to be `th`
     * cannot disagree with the column the admin actually edits.
     */
    names: { ...names.get(r.id), [CANONICAL_LOCALE]: r.name },
  }))
}

/** The language the name on the category itself is written in. */
const CANONICAL_LOCALE = 'th'

/** One query for the whole list, rather than one per category. */
async function translatedNames(ids: number[]): Promise<Map<number, Record<string, string>>> {
  const out = new Map<number, Record<string, string>>()
  if (!ids.length) return out

  const rows = await db
    .select({
      categoryId: categoryTranslations.categoryId,
      locale: categoryTranslations.locale,
      name: categoryTranslations.name,
    })
    .from(categoryTranslations)
    .where(inArray(categoryTranslations.categoryId, ids))

  for (const row of rows) {
    const bag = out.get(row.categoryId) ?? {}
    bag[row.locale] = row.name
    out.set(row.categoryId, bag)
  }
  return out
}

/**
 * Every category with its two counts.
 *
 * `locale` narrows the published count to courses a reader of that language
 * can actually take — the ones taught in it, plus the ones marked as suiting
 * every language. Without it the count is every published course, which is
 * what the admin wants.
 *
 * It matters because the number sits on a card that links to the catalogue:
 * once the catalogue shows only the reader's language, a count taken across
 * all of them is a card promising fifteen courses behind a link that returns
 * none.
 */
async function categoryRows(locale?: string) {
  const inLanguage = locale
    ? sql`AND ${courses.contentLocale} IN (${locale}, 'all')`
    : sql`AND 1 = 1`

  // A join rather than a correlated subquery: inside a raw `sql` fragment
  // drizzle renders a column unqualified, so `c.category_id = ${categories.id}`
  // became `c.category_id = c.id` and every count came back zero.
  return db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      slug: categories.slug,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
      // What the admin list wants to know before deleting one: everything
      // filed here, drafts included, because deleting the category orphans
      // those too.
      courseCount: sql<number>`CAST(COUNT(${courses.id}) AS SIGNED)`,
      /**
       * Only what a visitor can actually open.
       *
       * The two differ, and the difference was visible: the Japanese card
       * promised eleven courses and the catalogue returned ten, because one of
       * them was still a draft. A count on a public card is a promise about
       * what is behind the link.
       */
      publishedCount: sql<number>`CAST(SUM(${courses.status} = 'approved' ${inLanguage}) AS SIGNED)`,
    })
    .from(categories)
    .leftJoin(courses, eq(courses.categoryId, categories.id))
    .groupBy(
      categories.id,
      categories.parentId,
      categories.name,
      categories.slug,
      categories.icon,
      categories.sortOrder,
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name))
}

export async function getCategory(id: number) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1)
  if (!row) throw notFound('That category does not exist.')
  /**
   * The translations only — no canonical name folded in, unlike the list.
   *
   * The list is read by the site, which wants one bag it can look any language
   * up in. This is read by the admin form, where the canonical name is already
   * its own field; a copy of it in here would be a second place to type the
   * same thing, and would make every save look like a change in the audit log.
   */
  const names = await translatedNames([id])
  return { ...row, names: names.get(id) ?? {} }
}

/**
 * Writes the translations of one category.
 *
 * A name that arrives blank is a deletion, not a blank translation: the
 * fallback to the canonical name is the behaviour wanted for a category nobody
 * has translated, and an empty row would defeat it by looking like an answer.
 *
 * Locales absent from `names` are left alone, so a caller may send one
 * language without wiping the other two.
 */
async function saveNames(categoryId: number, names: Record<string, string>): Promise<void> {
  for (const [locale, raw] of Object.entries(names)) {
    if (locale === CANONICAL_LOCALE) continue
    const name = raw.trim()
    if (!name) {
      await db
        .delete(categoryTranslations)
        .where(
          and(
            eq(categoryTranslations.categoryId, categoryId),
            eq(categoryTranslations.locale, locale),
          ),
        )
      continue
    }
    await db
      .insert(categoryTranslations)
      .values({ categoryId, locale, name })
      .onDuplicateKeyUpdate({ set: { name } })
  }
}

async function assertSlugFree(slug: string, exceptId?: number) {
  const clash = await db
    .select({ id: categories.id })
    .from(categories)
    .where(exceptId ? and(eq(categories.slug, slug), ne(categories.id, exceptId)) : eq(categories.slug, slug))
    .limit(1)
  if (clash.length) throw conflict('That slug is already in use.', { slug: 'Already in use.' })
}

export async function createCategory(input: {
  name: string
  slug: string
  parentId?: number | null | undefined
  icon?: string | null | undefined
  sortOrder: number
  names?: Record<string, string> | undefined
}) {
  await assertSlugFree(input.slug)
  await db.insert(categories).values({
    name: input.name,
    slug: input.slug,
    parentId: input.parentId ?? null,
    icon: input.icon ?? null,
    sortOrder: input.sortOrder,
  })
  const [created] = await db.select().from(categories).where(eq(categories.slug, input.slug)).limit(1)
  if (input.names) await saveNames(created!.id, input.names)
  return getCategory(created!.id)
}

export async function updateCategory(
  id: number,
  input: Partial<{
    name: string
    slug: string
    parentId: number | null
    icon: string | null
    sortOrder: number
    names: Record<string, string>
  }>,
) {
  const before = await getCategory(id)
  if (input.slug && input.slug !== before.slug) await assertSlugFree(input.slug, id)
  // A category that is its own parent disappears from every tree walk.
  if (input.parentId === id) {
    throw conflict('A category cannot be its own parent.', { parentId: 'Pick another category.' })
  }

  // The translations live in their own table, so they cannot go into the same
  // `set` as the rest without drizzle trying to write a column that is not there.
  const { names, ...columns } = input
  if (Object.keys(columns).length) {
    await db.update(categories).set(columns).where(eq(categories.id, id))
  }
  if (names) await saveNames(id, names)

  return { before, after: await getCategory(id) }
}

export async function deleteCategory(id: number) {
  const row = await getCategory(id)

  // Courses survive a deleted category (the column is ON DELETE SET NULL), but
  // they would quietly fall out of every category filter on the site. Say so
  // instead of letting someone find out later.
  const [{ value: used } = { value: 0 }] = await db
    .select({ value: count() })
    .from(courses)
    .where(eq(courses.categoryId, id))
  if (used > 0) {
    throw conflict(`${used} course(s) are still in this category.`)
  }

  const [{ value: children } = { value: 0 }] = await db
    .select({ value: count() })
    .from(categories)
    .where(eq(categories.parentId, id))
  if (children > 0) {
    throw conflict(`${children} sub-categor${children === 1 ? 'y is' : 'ies are'} inside this one.`)
  }

  await db.delete(categories).where(eq(categories.id, id))
  return row
}

/* ---------------- courses ---------------- */

export interface CourseListOptions {
  page: number
  perPage: number
  q?: string | undefined
  status?: 'draft' | 'pending' | 'approved' | 'rejected' | 'ended' | undefined
  categoryId?: number | undefined
  /**
   * Several categories at once. The catalog's filter panel is a list of
   * checkboxes, so one id would make it a radio group.
   */
  categoryIds?: number[] | undefined
  levels?: ('beginner' | 'intermediate' | 'advanced')[] | undefined
  locales?: ('th' | 'en' | 'jp' | 'vn' | 'id' | 'zh' | 'ko' | 'tw')[] | undefined
  /** Bands rather than numbers, because that is what the panel offers. */
  durations?: ('le1' | '1-3' | '3-6' | 'gt6')[] | undefined
  prices?: ('free' | 'lt1000' | '1000-2000' | 'gt2000')[] | undefined
  /** How it is reached: free, bought on its own, or inside a package. */
  access?: ('free' | 'course' | 'package')[] | undefined
  sort: 'recommended' | 'newest' | 'title' | 'price' | 'price-desc' | 'popularity'
  /** The public site passes false and only ever sees approved courses. */
  includeUnpublished: boolean
  /** A teacher sees the courses they are on, not the whole catalog. */
  instructorId?: number | undefined
}

/** The duration bands the filter panel offers, in seconds. */
const DURATION_BANDS: Record<string, [number, number]> = {
  le1: [0, 3600],
  '1-3': [3601, 10800],
  '3-6': [10801, 21600],
  gt6: [21601, Number.MAX_SAFE_INTEGER],
}

/** The price bands, in satang. */
const PRICE_BANDS: Record<string, [number, number]> = {
  free: [0, 0],
  lt1000: [1, 99999],
  '1000-2000': [100000, 200000],
  gt2000: [200001, Number.MAX_SAFE_INTEGER],
}

function bandClause(
  column: typeof courses.price | typeof courses.durationSeconds,
  bands: Record<string, [number, number]>,
  chosen: string[],
) {
  const parts = chosen.flatMap((key) => {
    const band = bands[key]
    return band ? [sql`${column} BETWEEN ${band[0]} AND ${band[1]}`] : []
  })
  return parts.length ? or(...parts) : undefined
}

/**
 * A filter group, named the way the catalog's panel names it.
 *
 * `skip` leaves one group out. That is what a facet count needs: how many you
 * would get if this one option were the only thing ticked in its own group,
 * with every other group left as it is.
 */
export type FacetGroup = 'category' | 'level' | 'locale' | 'duration' | 'price' | 'access'

/**
 * Every category id under these, the ones given included.
 *
 * Courses are filed on the leaves — "ภาษาญี่ปุ่น · คันจิ", never "ภาษาญี่ปุ่น"
 * — so filtering by a parent on its own matches nothing, and a visitor who
 * clicks "ภาษาญี่ปุ่น" expecting Japanese courses gets an empty catalog. A
 * parent therefore means itself and everything beneath it, which is what
 * choosing a parent has always looked like it would do.
 *
 * Walks down a level at a time rather than assuming two, because nothing stops
 * an administrator nesting further.
 */
export async function expandCategories(ids: number[]): Promise<number[]> {
  if (!ids.length) return ids

  const all = await db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)

  const byParent = new Map<number, number[]>()
  for (const c of all) {
    if (c.parentId === null) continue
    const list = byParent.get(c.parentId) ?? []
    list.push(c.id)
    byParent.set(c.parentId, list)
  }

  const out = new Set<number>(ids)
  const queue = [...ids]
  while (queue.length) {
    for (const child of byParent.get(queue.shift()!) ?? []) {
      if (out.has(child)) continue
      out.add(child)
      queue.push(child)
    }
  }
  return [...out]
}

/**
 * Adds each category's descendants into its own count.
 *
 * `GROUP BY category_id` counts the courses filed on exactly that category,
 * and nothing is filed on a parent — so without this the checkbox for
 * "ภาษาญี่ปุ่น" would read 0 beside six Japanese courses, and ticking it would
 * then return all six. The number has to promise what the click does.
 *
 * A category with nothing under it anywhere is left out, so "no courses" still
 * reads as absent rather than as a zero.
 */
async function rollUpCategories(direct: Record<string, number>): Promise<Record<string, number>> {
  const all = await db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)

  // Walk up from each category that has courses, adding its count to every
  // ancestor. One pass, rather than resolving a subtree per category.
  const parentOf = new Map(all.map((c) => [c.id, c.parentId]))
  const out: Record<string, number> = {}

  for (const [id, n] of Object.entries(direct)) {
    if (!n) continue
    let at: number | null | undefined = Number(id)
    const seen = new Set<number>()
    while (at != null && !seen.has(at)) {
      seen.add(at)
      out[String(at)] = (out[String(at)] ?? 0) + n
      at = parentOf.get(at)
    }
  }
  return out
}

/** The same options with any parent category widened to its whole subtree. */
async function withCategoryTree(opts: CourseListOptions): Promise<CourseListOptions> {
  if (!opts.categoryIds?.length) return opts
  return { ...opts, categoryIds: await expandCategories(opts.categoryIds) }
}

function courseWhere(opts: CourseListOptions, skip?: FacetGroup) {
  const where = [
    opts.includeUnpublished ? undefined : eq(courses.status, 'approved'),
    opts.status ? eq(courses.status, opts.status) : undefined,
    opts.categoryId ? eq(courses.categoryId, opts.categoryId) : undefined,
    skip === 'category'
      ? undefined
      : opts.categoryIds?.length
        ? inArray(courses.categoryId, opts.categoryIds)
        : undefined,
    skip === 'level' ? undefined : opts.levels?.length ? inArray(courses.level, opts.levels) : undefined,
    skip === 'locale'
      ? undefined
      : opts.locales?.length
        ? // A course marked 'all' belongs to every language, so it answers
          // whichever one was asked for. Without this, narrowing the catalogue
          // to Japanese would hide exactly the courses that said they suit
          // everybody.
          inArray(courses.contentLocale, [...new Set([...opts.locales, 'all' as const])])
        : undefined,
    skip === 'duration'
      ? undefined
      : opts.durations?.length
        ? bandClause(courses.durationSeconds, DURATION_BANDS, opts.durations)
        : undefined,
    skip === 'price'
      ? undefined
      : opts.prices?.length
        ? bandClause(courses.price, PRICE_BANDS, opts.prices)
        : undefined,
    skip === 'access' ? undefined : opts.access?.length ? accessClause(opts.access) : undefined,
    /**
     * Searches the teacher's name too, because that is how somebody looks for
     * "the course Aiko teaches". The display name is matched as well as the
     * account name: the first is what the site shows, the second is what a
     * colleague would type.
     */
    opts.q
      ? or(
          like(courses.title, `%${opts.q}%`),
          like(courses.slug, `%${opts.q}%`),
          like(courses.shortDesc, `%${opts.q}%`),
          sql`EXISTS (
            SELECT 1 FROM categories cat
            WHERE cat.id = ${outer(courses.categoryId)} AND cat.name LIKE ${`%${opts.q}%`}
          )`,
          sql`EXISTS (
            SELECT 1 FROM course_instructors ci
            JOIN users u ON u.id = ci.user_id
            LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
            WHERE ci.course_id = ${outer(courses.id)}
              AND (CONCAT(u.first_name, ' ', u.last_name) LIKE ${`%${opts.q}%`}
                   OR tp.display_name LIKE ${`%${opts.q}%`})
          )`,
        )
      : undefined,
    opts.instructorId
      ? sql`EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = ${outer(courses.id)} AND ci.user_id = ${opts.instructorId})`
      : undefined,
  ].filter(Boolean)

  return where.length ? and(...(where as never[])) : undefined
}

export async function listCourses(input: CourseListOptions): Promise<Paged<unknown>> {
  const opts = await withCategoryTree(input)
  const filter = courseWhere(opts)

  const order =
    opts.sort === 'title'
      ? [asc(courses.title)]
      : opts.sort === 'price'
        ? [asc(courses.price)]
        : opts.sort === 'price-desc'
          ? [desc(courses.price)]
          : opts.sort === 'popularity'
            ? [desc(courses.popularity)]
            : opts.sort === 'recommended'
              ? // Featured first, then by how popular. Two keys, because
                // "recommended" with one is just that one.
                [desc(courses.featured), desc(courses.popularity)]
              : [desc(courses.publishedAt), desc(courses.createdAt)]

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(courses)
    .where(filter)

  const rows = await db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      categoryId: courses.categoryId,
      categoryName: categories.name,
      thumbnailPath: courses.thumbnailPath,
      level: courses.level,
      price: courses.price,
      // Without this a card falls back to baht and writes "฿100" over a price
      // of $100 — the right number under the wrong currency, which is the one
      // mistake a price must never make.
      currency: courses.currency,
      normalPrice: courses.normalPrice,
      status: courses.status,
      sellable: courses.sellable,
      featured: courses.featured,
      durationSeconds: courses.durationSeconds,
      publishedAt: courses.publishedAt,
      createdAt: courses.createdAt,
      // Everything below is what a card on the catalog shows and the list used
      // to make the browser fetch each course separately for.
      shortDesc: courses.shortDesc,
      contentLocale: courses.contentLocale,
      badge: courses.badge,
      accessType: courses.accessType,
      accessDurationDays: courses.accessDurationDays,
      repurchase: courses.repurchase,
      popularity: courses.popularity,
      updatedAt: courses.updatedAt,
      lessonCount: sql<number>`(
        SELECT COUNT(*) FROM lessons l WHERE l.course_id = ${outer(courses.id)}
      )`,
      /**
       * How many people may study this course today.
       *
       * Entitlements rather than orders, so a free enrolment and an access
       * granted by hand count the same as a sale — the question a teacher asks
       * is how many people are in their class, not how many receipts exist.
       *
       * Revoked access is left out, and so is access whose date has passed:
       * both are people who are no longer in the room.
       */
      enrolmentCount: sql<number>`(
        SELECT COUNT(*) FROM entitlements e
        WHERE e.course_id = ${outer(courses.id)}
          AND e.status = 'active'
          AND (e.expires_at IS NULL OR e.expires_at > NOW())
      )`,
      inPackage: sql<boolean>`EXISTS (
        SELECT 1 FROM package_courses pc WHERE pc.course_id = ${outer(courses.id)}
      )`,
    })
    .from(courses)
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(filter)
    .orderBy(...order)
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  // One query for every teacher on the page, rather than one per course.
  const byCourse = await instructorsFor(rows.map((r) => r.id))

  return paged(
    rows.map((r) => ({
      ...r,
      lessonCount: Number(r.lessonCount),
      enrolmentCount: Number(r.enrolmentCount),
      inPackage: Boolean(r.inPackage),
      instructors: byCourse.get(r.id) ?? [],
    })),
    total,
    opts.page,
    opts.perPage,
  )
}

/** Free, bought on its own, or reachable through a package. */
function accessClause(chosen: string[]) {
  const parts = chosen
    .map((key) =>
      key === 'free'
        ? sql`${courses.price} = 0`
        : key === 'course'
          ? sql`${courses.price} > 0 AND ${courses.sellable} = 1`
          : key === 'package'
            ? sql`EXISTS (SELECT 1 FROM package_courses pc WHERE pc.course_id = ${outer(courses.id)})`
            : undefined,
    )
    .filter(Boolean)
  return parts.length ? or(...(parts as never[])) : undefined
}

/** A band column as a `CASE` that names the band a row falls in. */
function bandCase(
  column: typeof courses.price | typeof courses.durationSeconds,
  bands: Record<string, [number, number]>,
) {
  const whens = Object.entries(bands).map(
    ([key, [lo, hi]]) => sql`WHEN ${column} BETWEEN ${lo} AND ${hi} THEN ${key}`,
  )
  return sql<string>`CASE ${sql.join(whens, sql` `)} END`
}

/** How many courses each filter option would give you. */
export interface CourseFacets {
  total: number
  category: Record<string, number>
  level: Record<string, number>
  locale: Record<string, number>
  duration: Record<string, number>
  price: Record<string, number>
  access: Record<string, number>
}

/**
 * The number beside each checkbox in the catalog's filter panel.
 *
 * A count is what you would get with that one option ticked and nothing else
 * in its own group, every other group left exactly as it is — so the number
 * says what clicking it does. That is why each group is counted with its own
 * filter lifted: counting "beginner" while "beginner" is the active filter
 * would only ever return the current result, and every other level would read
 * zero the moment you ticked one.
 *
 * Counted here rather than in the browser because the browser is only ever
 * sent one page of results, and a count of a page is not a count.
 *
 * One query per group, and the same `courseWhere` the listing uses — a count
 * built from a second, similar clause is a count that disagrees with the list
 * it sits next to.
 */
/**
 * What the language filter should say each of its options would give you.
 *
 * Grouping by the column alone answers a different question: it would offer
 * "All languages (4)" as a fifth choice beside Japanese and English, while a
 * visitor filtering to Japanese silently got those four as well — so every
 * count on the list was wrong by the number of courses that suit everybody.
 *
 * A count beside a filter is a promise about what clicking it does. These are
 * the four languages, each counting the courses that answer to it, and no
 * separate row for 'all', because a course marked 'all' is already in all four.
 */
function spreadAllOverLanguages(counts: Record<string, number>): Record<string, number> {
  const { all = 0, ...named } = counts
  if (!all) return named

  const out: Record<string, number> = { ...named }
  for (const locale of LOCALES) out[locale] = (out[locale] ?? 0) + all
  return out
}

export async function courseFacets(input: CourseListOptions): Promise<CourseFacets> {
  const opts = await withCategoryTree(input)

  const tally = async (
    group: FacetGroup,
    key: SQL<string> | typeof courses.level | typeof courses.contentLocale | typeof courses.categoryId,
  ) => {
    const rows = await db
      .select({ key, n: count() })
      .from(courses)
      .where(courseWhere(opts, group))
      .groupBy(key)
    const out: Record<string, number> = {}
    for (const row of rows) {
      if (row.key === null) continue
      out[String(row.key)] = Number(row.n)
    }
    return out
  }

  const durationKey = bandCase(courses.durationSeconds, DURATION_BANDS)
  const priceKey = bandCase(courses.price, PRICE_BANDS)

  /**
   * Access is three overlapping questions, not one column — a free course
   * inside a package belongs under both — so it cannot be grouped. Three sums
   * over the same rows answer all three in one pass.
   */
  const accessRow = db
    .select({
      free: sql<number>`SUM(${courses.price} = 0)`,
      course: sql<number>`SUM(${courses.price} > 0 AND ${courses.sellable} = 1)`,
      pkg: sql<number>`SUM(EXISTS (
        SELECT 1 FROM package_courses pc WHERE pc.course_id = ${outer(courses.id)}
      ))`,
    })
    .from(courses)
    .where(courseWhere(opts, 'access'))

  const [total, category, level, locale, duration, price, access] = await Promise.all([
    db
      .select({ value: count() })
      .from(courses)
      .where(courseWhere(opts))
      .then(([r]) => Number(r?.value ?? 0)),
    tally('category', courses.categoryId),
    tally('level', courses.level),
    tally('locale', courses.contentLocale).then(spreadAllOverLanguages),
    tally('duration', durationKey),
    tally('price', priceKey),
    accessRow.then(([r]) => ({
      free: Number(r?.free ?? 0),
      course: Number(r?.course ?? 0),
      package: Number(r?.pkg ?? 0),
    })),
  ])

  return { total, category: await rollUpCategories(category), level, locale, duration, price, access }
}

/**
 * The teachers on each of these courses.
 *
 * The public name is the one on their profile, falling back to the account's.
 * A course page that says "Aiko Tanaka" where the site everywhere else says
 * "田中 愛子 (Aiko Tanaka)" reads as two different people.
 */
/**
 * `withBio` is for the course page, which has room for a paragraph about
 * each teacher. A card has not, and `bio` is a TEXT column — sending one per
 * course with a page of twenty-four would be most of the response.
 */
async function instructorsFor(courseIds: number[], withBio = false) {
  const map = new Map<number, CourseInstructor[]>()
  if (!courseIds.length) return map

  const rows = await db
    .select({
      courseId: courseInstructors.courseId,
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarPath: users.avatarPath,
      displayName: teacherProfiles.displayName,
      shortName: teacherProfiles.shortName,
      headline: teacherProfiles.headline,
      slug: teacherProfiles.slug,
      sortOrder: courseInstructors.sortOrder,
      ...(withBio
        ? {
            bio: teacherProfiles.bio,
            credentials: teacherProfiles.credentials,
            yearsExperience: teacherProfiles.yearsExperience,
          }
        : {}),
    })
    .from(courseInstructors)
    .innerJoin(users, eq(users.id, courseInstructors.userId))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .where(inArray(courseInstructors.courseId, courseIds))
    .orderBy(asc(courseInstructors.sortOrder))

  for (const r of rows) {
    const account = `${r.firstName} ${r.lastName}`.trim()
    const list = map.get(r.courseId) ?? []
    list.push({
      id: r.id,
      name: r.displayName ?? account,
      short: r.shortName ?? account,
      headline: r.headline,
      slug: r.slug,
      avatarPath: r.avatarPath,
      sortOrder: r.sortOrder,
      ...(withBio
        ? {
            bio: (r as { bio?: string | null }).bio ?? null,
            credentials: (r as { credentials?: string | null }).credentials ?? null,
            yearsExperience: (r as { yearsExperience?: number | null }).yearsExperience ?? null,
          }
        : {}),
    })
    map.set(r.courseId, list)
  }
  return map
}

export interface CourseInstructor {
  id: number
  /** What the site shows: the profile's name, or the account's if there is none. */
  name: string
  short: string
  headline: string | null
  /** Their public page, when they have one. */
  slug: string | null
  avatarPath: string | null
  sortOrder: number
}

/**
 * The numeric id behind whatever the URL said.
 *
 * Public links carry the slug, because `/courses/japanese-n5` survives a
 * reseed and says what it is; the admin links by id, because a slug is
 * editable and a link held open in a tab must not start pointing somewhere
 * else. Both arrive here, so both are accepted: all digits is an id, anything
 * else is a slug.
 *
 * Throws rather than returning null, so a caller cannot forget to check.
 */
export async function resolveCourseRef(ref: string): Promise<number> {
  if (/^\d+$/.test(ref)) return Number(ref)

  const [row] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.slug, ref))
    .limit(1)
  if (!row) throw notFound('That course does not exist.')
  return row.id
}

export async function getCourse(id: number, includeUnpublished: boolean) {
  const [row] = await db.select().from(courses).where(eq(courses.id, id)).limit(1)
  if (!row || (!includeUnpublished && row.status !== 'approved')) {
    throw notFound('That course does not exist.')
  }

  // The same shape the list returns, so a card and a course page never
  // disagree about what a teacher is called.
  const instructors = (await instructorsFor([id], true)).get(id) ?? []

  const [extra] = await db
    .select({
      categoryName: categories.name,
      lessonCount: sql<number>`(SELECT COUNT(*) FROM lessons l WHERE l.course_id = ${id})`,
      inPackage: sql<boolean>`EXISTS (
        SELECT 1 FROM package_courses pc WHERE pc.course_id = ${id}
      )`,
    })
    .from(courses)
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(eq(courses.id, id))
    .limit(1)

  /**
   * What the school pays the teacher is nobody else's business.
   *
   * This route is the public course page as well as the admin form, and the
   * row was being spread whole — so the rate agreed with each teacher was
   * readable by anyone who opened the page in a browser's network tab. It
   * mattered less while every course sat on the same figure; now that each
   * carries its own, it is a commercial term between two parties, visible
   * side by side for every teacher on the site.
   *
   * `includeUnpublished` is already the "may see this course's workings"
   * signal — an admin, or the teacher whose course it is, both of whom should
   * know the figure.
   */
  /**
   * The share is no longer a property of a course.
   *
   * It is agreed with the teacher and read from their record, so the column
   * here is a leftover that explains old `teacher_earnings` rows and nothing
   * else. Returning it would offer a second answer to a question that now has
   * one, which is how a payout argument starts.
   */
  const { revenueSharePct: _retired, ...publicFields } = row

  return {
    ...publicFields,
    categoryName: extra?.categoryName ?? null,
    lessonCount: Number(extra?.lessonCount ?? 0),
    inPackage: Boolean(extra?.inPackage),
    instructors,
  }
}

async function assertCourseSlugFree(slug: string, exceptId?: number) {
  const clash = await db
    .select({ id: courses.id })
    .from(courses)
    .where(exceptId ? and(eq(courses.slug, slug), ne(courses.id, exceptId)) : eq(courses.slug, slug))
    .limit(1)
  if (clash.length) throw conflict('That slug is already in use.', { slug: 'Already in use.' })
}

/** The pivot is rewritten wholesale: position in the array is the order, and
 *  the first one is the lead instructor a course card shows. */
async function setInstructors(courseId: number, ids: number[]) {
  await db.delete(courseInstructors).where(eq(courseInstructors.courseId, courseId))
  if (!ids.length) return

  const known = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids))
  const valid = ids.filter((id) => known.some((k) => k.id === id))
  if (!valid.length) return

  await db
    .insert(courseInstructors)
    .values(valid.map((userId, i) => ({ courseId, userId, sortOrder: i })))
}

type CourseInput = Record<string, unknown> & { slug: string; instructorIds?: number[] }

export async function createCourse(input: CourseInput, createdBy: number) {
  await assertCourseSlugFree(input.slug)

  const { instructorIds, ...fields } = input
  // The zod schema already shaped these; drizzle only needs to be told so.
  const values = { ...fields, createdBy } as typeof courses.$inferInsert

  await db.insert(courses).values(values)

  const [created] = await db.select().from(courses).where(eq(courses.slug, input.slug)).limit(1)
  if (!created) throw new Error('course row vanished right after insert')

  if (instructorIds) await setInstructors(created.id, instructorIds)
  return created
}

/**
 * Telling the people a review concerns that it happened.
 *
 * Three moves matter and the rest do not. A teacher sending a course in needs
 * an administrator to know it is waiting; an administrator approving or
 * refusing one needs the teacher to know which, and if refused, why. A course
 * moved from draft to draft, or ended years later, is nobody's news.
 *
 * Failures are swallowed. The decision is already recorded; a mail server
 * being down is not a reason to refuse the save that already happened.
 */
async function announceReview(
  course: typeof courses.$inferSelect,
  was: string,
  actorId: number | null,
) {
  try {
    const teachers = (
      await db
        .select({ userId: courseInstructors.userId })
        .from(courseInstructors)
        .where(eq(courseInstructors.courseId, course.id))
    ).map((r) => r.userId)

    if (course.status === 'pending' && was !== 'pending') {
      await notify.notifyAdmins({
        type: 'course_submitted',
        title: 'A course is waiting for review',
        body: course.title,
        link: `/courses/${course.id}`,
        subject: { type: 'course', id: course.id },
      })
      return
    }

    // Both verdicts go to whoever teaches it — which is who did the work, and
    // who can act on the answer. The person who pressed the button is left out
    // of their own news.
    const audience = teachers.filter((t) => t !== actorId)
    if (!audience.length) return

    if (course.status === 'approved') {
      for (const userId of audience) {
        await notify.notify({
          userId,
          surface: 'admin',
          type: 'course_approved',
          title: 'Your course is live',
          body: course.title,
          link: `/courses/${course.id}`,
          subject: { type: 'course', id: course.id },
        })
      }
    } else if (course.status === 'rejected') {
      for (const userId of audience) {
        await notify.notify({
          userId,
          surface: 'admin',
          type: 'course_rejected',
          title: 'Your course needs changes',
          // The reason, where the teacher will actually meet it. Without this
          // the notice says only that something is wrong.
          body: course.reviewNote ? `${course.title} — ${course.reviewNote}` : course.title,
          link: `/courses/${course.id}`,
          subject: { type: 'course', id: course.id },
        })
      }
    }
  } catch {
    // Nothing above changes what is stored.
  }
}

export async function updateCourse(
  id: number,
  input: Partial<CourseInput>,
  /** Who is making the change, for the approval stamp and the notices. */
  actor?: { sub: number } | undefined,
) {
  const [row] = await db.select().from(courses).where(eq(courses.id, id)).limit(1)
  if (!row) throw notFound('That course does not exist.')

  // The teachers are a separate table, so a bare course row has no
  // `instructorIds` — and an audit diff against the request body would record
  // every teacher change as "was nothing", which is worse than not recording it
  // at all.
  const before = {
    ...row,
    instructorIds: (
      await db
        .select({ userId: courseInstructors.userId })
        .from(courseInstructors)
        .where(eq(courseInstructors.courseId, id))
        .orderBy(courseInstructors.sortOrder)
    ).map((r) => r.userId),
  }

  if (input.slug && input.slug !== row.slug) await assertCourseSlugFree(input.slug, id)

  const { instructorIds, ...fields } = input
  if (Object.keys(fields).length) {
    // Approving is what publishes, so the date follows the status rather than
    // being a second thing to remember to set.
    const publishing = fields.status === 'approved' && row.status !== 'approved'
    const patch = {
      ...fields,
      ...(publishing ? { publishedAt: new Date() } : {}),
      // Who decided, and when. Written here rather than by the caller so that
      // every route through approval records it, including the next one.
      ...(publishing
        ? { approvedAt: new Date(), approvedBy: actor?.sub ?? null, reviewNote: null }
        : {}),
      // A course going back for work keeps the note; one going anywhere else
      // loses it, because it described a verdict that no longer applies.
      ...(fields.status && fields.status !== 'rejected' && !publishing
        ? { reviewNote: null }
        : {}),
    } as Partial<typeof courses.$inferInsert>
    await db.update(courses).set(patch).where(eq(courses.id, id))
  }
  if (instructorIds) await setInstructors(id, instructorIds)

  const [after] = await db.select().from(courses).where(eq(courses.id, id)).limit(1)

  // After the write, and not awaited into the response: a course that saved
  // has saved, and a notice that fails to send is not a reason to tell the
  // person it did not.
  if (fields.status && fields.status !== row.status) {
    void announceReview(after!, row.status, actor?.sub ?? null)
  }
  // After the write: whether a picture is still in use is answered by what is
  // now stored, including by other courses and articles.
  await removeOrphanedMedia(row.description, after!.description)
  // The cover and the sample are files of their own, not links inside prose,
  // so replacing one leaves the old file behind unless it is swept separately.
  await removeOrphanedPath(row.thumbnailPath, after!.thumbnailPath)
  await removeOrphanedPath(row.sampleVideoPath, after!.sampleVideoPath)
  return { before, after: after! }
}

export async function deleteCourse(id: number) {
  const [row] = await db.select().from(courses).where(eq(courses.id, id)).limit(1)
  if (!row) throw notFound('That course does not exist.')

  // Deleting a course someone paid for would take their lessons with it. Ending
  // it hides it from the catalog and leaves everyone who bought it intact.
  if (row.status === 'approved' || row.publishedAt) {
    throw conflict('A published course cannot be deleted. Set its status to "ended" instead.')
  }

  await db.delete(courses).where(eq(courses.id, id))
  await removeOrphanedMedia(row.description, null)
  await removeOrphanedPath(row.thumbnailPath, null)
  await removeOrphanedPath(row.sampleVideoPath, null)
  return row
}

/** Whether this teacher is on this course, for the ownership check. */
export async function isCourseInstructor(courseId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ userId: courseInstructors.userId })
    .from(courseInstructors)
    .where(and(eq(courseInstructors.courseId, courseId), eq(courseInstructors.userId, userId)))
    .limit(1)
  return Boolean(row)
}

/* ---------------- curriculum ---------------- */

/**
 * A course's modules and lessons, in the order they are taught.
 *
 * Lessons belong to the course, not to the module: `module_id` is nullable, so
 * a short course can be a flat list and deleting a module leaves its lessons
 * on the course rather than taking them with it.
 */
/**
 * One lesson that the school has marked as a free sample.
 *
 * Checked here rather than left to the route, and checked in full: the course
 * has to be published, the lesson has to belong to that course, and it has to
 * be the one marked as a preview. Any of those missing is the same answer —
 * whether a lesson exists behind a paywall is not a visitor's business.
 *
 * The file stays in the private folder where every other lesson video lives.
 * What a visitor gets is a signature that expires, for that one file.
 */
export async function getPreviewLesson(courseId: number, lessonId: number) {
  const [row] = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      subtitle: lessons.subtitle,
      type: lessons.type,
      durationSeconds: lessons.durationSeconds,
      videoPath: lessons.videoPath,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(lessons)
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .where(
      and(
        eq(lessons.id, lessonId),
        eq(lessons.courseId, courseId),
        eq(lessons.isPreview, true),
        eq(courses.status, 'approved'),
      ),
    )
    .limit(1)

  if (!row) throw notFound('There is no free sample at that address.')
  return row
}

export async function getCurriculum(courseId: number) {
  const mods = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(asc(courseModules.sortOrder), asc(courseModules.id))

  const items = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, courseId))
    .orderBy(asc(lessons.sortOrder), asc(lessons.id))

  return {
    modules: mods.map((m) => ({
      ...m,
      lessons: items.filter((l) => l.moduleId === m.id),
    })),
    /** Lessons attached to the course itself. */
    loose: items.filter((l) => l.moduleId === null),
    totalSeconds: items.reduce((sum, l) => sum + l.durationSeconds, 0),
  }
}

/**
 * Keeps `courses.duration_seconds` equal to the sum of its lessons.
 *
 * It is cached on the course so the catalog can filter by length without
 * joining every lesson, which means it has to be recomputed whenever a lesson
 * is added, edited or removed. Doing it here rather than at each call site is
 * what stops the two drifting apart.
 */
async function refreshCourseDuration(courseId: number) {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${lessons.durationSeconds}), 0)` })
    .from(lessons)
    .where(eq(lessons.courseId, courseId))

  await db
    .update(courses)
    .set({ durationSeconds: Number(row?.total ?? 0) })
    .where(eq(courses.id, courseId))
}

/* ---------------- the course's own handouts ---------------- */

/**
 * Files that belong to the course rather than to one lesson — a handbook, a
 * sheet of exercises, a glossary. They show in the learning room's documents
 * tab under every lesson, which is the point: a reference is wanted wherever
 * you are, not only on the page it was uploaded to.
 *
 * Stored by path like everything else, and served through a signed URL that
 * expires. The name is the school's to choose; a reader sees it and nothing of
 * where the file lives.
 */
export async function listDocuments(courseId: number) {
  return db
    .select({
      id: courseDocuments.id,
      fileName: courseDocuments.fileName,
      filePath: courseDocuments.filePath,
      sizeBytes: courseDocuments.sizeBytes,
      createdAt: courseDocuments.createdAt,
    })
    .from(courseDocuments)
    .where(eq(courseDocuments.courseId, courseId))
    .orderBy(asc(courseDocuments.id))
}

export async function addDocument(
  courseId: number,
  input: { fileName: string; filePath: string; sizeBytes?: number | null },
) {
  const [res] = await db.insert(courseDocuments).values({
    courseId,
    fileName: input.fileName,
    filePath: input.filePath,
    sizeBytes: input.sizeBytes ?? null,
  })
  const [row] = await db
    .select()
    .from(courseDocuments)
    .where(eq(courseDocuments.id, Number(res.insertId)))
    .limit(1)
  return row!
}

/** Only the name. Replacing the file is removing one and adding another, so
 *  that a link somebody has open does not quietly become a different document. */
export async function renameDocument(courseId: number, documentId: number, fileName: string) {
  const [row] = await db
    .select()
    .from(courseDocuments)
    .where(and(eq(courseDocuments.id, documentId), eq(courseDocuments.courseId, courseId)))
    .limit(1)
  if (!row) throw notFound('No such document on this course.')

  await db.update(courseDocuments).set({ fileName }).where(eq(courseDocuments.id, documentId))
  return { ...row, fileName }
}

export async function deleteDocument(courseId: number, documentId: number) {
  const [row] = await db
    .select()
    .from(courseDocuments)
    .where(and(eq(courseDocuments.id, documentId), eq(courseDocuments.courseId, courseId)))
    .limit(1)
  if (!row) throw notFound('No such document on this course.')

  await db.delete(courseDocuments).where(eq(courseDocuments.id, documentId))
  // The file itself is left in the store on purpose: several courses may share
  // one handout, and a delete that took the bytes with it would empty the
  // others. Tidying the store is its own job, done knowingly.
  return row
}

export async function createModule(courseId: number, input: { title: string; sortOrder: number }) {
  await db.insert(courseModules).values({ courseId, ...input })
  const [created] = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(desc(courseModules.id))
    .limit(1)
  return created!
}

export async function updateModule(
  courseId: number,
  moduleId: number,
  input: Partial<{ title: string; sortOrder: number }>,
) {
  const [before] = await db
    .select()
    .from(courseModules)
    .where(and(eq(courseModules.id, moduleId), eq(courseModules.courseId, courseId)))
    .limit(1)
  if (!before) throw notFound('That module does not exist on this course.')

  if (Object.keys(input).length) {
    await db.update(courseModules).set(input).where(eq(courseModules.id, moduleId))
  }
  const [after] = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1)
  return { before, after: after! }
}

export async function deleteModule(courseId: number, moduleId: number) {
  const [row] = await db
    .select()
    .from(courseModules)
    .where(and(eq(courseModules.id, moduleId), eq(courseModules.courseId, courseId)))
    .limit(1)
  if (!row) throw notFound('That module does not exist on this course.')

  // The foreign key is ON DELETE SET NULL, so the lessons survive and land back
  // on the course. Losing a section heading must not lose the teaching.
  await db.delete(courseModules).where(eq(courseModules.id, moduleId))
  return row
}

/**
 * A course has one quiz, or none.
 *
 * `quizzes` already carries a unique index on the course, so a second set of
 * questions could never be stored — but nothing stopped a second quiz *lesson*
 * being added, which left two rows in the curriculum pointing at one quiz and
 * no way to say which was which. Results are counted per course, so two is not
 * a richer course, it is an ambiguous one.
 *
 * Refused here rather than only hidden in the admin: a screen can be out of
 * date, and this is the rule.
 */
async function assertOneQuiz(courseId: number, exceptLessonId?: number) {
  const [existing] = await db
    .select({ id: lessons.id, title: lessons.title })
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), eq(lessons.type, 'quiz')))
    .limit(2)

  if (existing && existing.id !== exceptLessonId) {
    throw conflict(
      `This course already has a quiz — "${existing.title}". Edit that one, or delete it first.`,
    )
  }
}

export async function createLesson(courseId: number, input: Record<string, unknown>) {
  if (input.type === 'quiz') await assertOneQuiz(courseId)

  const values = { ...input, courseId } as typeof lessons.$inferInsert
  await db.insert(lessons).values(values)

  const [created] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, courseId))
    .orderBy(desc(lessons.id))
    .limit(1)

  await refreshCourseDuration(courseId)
  return created!
}

export async function updateLesson(
  courseId: number,
  lessonId: number,
  input: Record<string, unknown>,
) {
  const [before] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
    .limit(1)
  if (!before) throw notFound('That lesson does not exist on this course.')

  // Turning an ordinary lesson into the quiz counts as adding one.
  if (input.type === 'quiz' && before.type !== 'quiz') {
    await assertOneQuiz(courseId, lessonId)
  }

  if (Object.keys(input).length) {
    await db
      .update(lessons)
      .set(input as Partial<typeof lessons.$inferInsert>)
      .where(eq(lessons.id, lessonId))
  }

  await refreshCourseDuration(courseId)
  const [after] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1)
  return { before, after: after! }
}

export async function deleteLesson(courseId: number, lessonId: number) {
  const [row] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
    .limit(1)
  if (!row) throw notFound('That lesson does not exist on this course.')

  await db.delete(lessons).where(eq(lessons.id, lessonId))
  await refreshCourseDuration(courseId)
  return row
}

/** Rewrites sort order from the position of each id in the list. */
export async function reorder(
  table: 'modules' | 'lessons',
  courseId: number,
  ids: number[],
): Promise<void> {
  const target = table === 'modules' ? courseModules : lessons
  // One statement per row, but a curriculum is tens of rows, not thousands,
  // and a CASE expression here would be harder to read than it is fast.
  for (const [index, id] of ids.entries()) {
    await db
      .update(target)
      .set({ sortOrder: index })
      .where(and(eq(target.id, id), eq(target.courseId, courseId)))
  }
}
