import type { SQL } from 'drizzle-orm'
import { and, asc, count, desc, eq, inArray, like, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  categories,
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

  const roots = all.filter(
    (c) =>
      c.parentId === null &&
      (!match ||
        c.name.toLowerCase().includes(match) ||
        c.slug.toLowerCase().includes(match) ||
        // A parent stays in the list when one of its children matches, or the
        // child would have nowhere to appear.
        all.some(
          (k) =>
            k.parentId === c.id &&
            (k.name.toLowerCase().includes(match) || k.slug.toLowerCase().includes(match)),
        )),
  )

  const page = roots.slice((opts.page - 1) * opts.perPage, opts.page * opts.perPage)
  const ids = new Set(page.map((c) => c.id))
  const data = all.filter((c) => ids.has(c.id) || (c.parentId !== null && ids.has(c.parentId)))

  return paged(data, roots.length, opts.page, opts.perPage)
}

export async function listCategories() {
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
      // What the admin list wants to know before deleting one.
      courseCount: sql<number>`CAST(COUNT(${courses.id}) AS SIGNED)`,
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
  return row
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
  return created!
}

export async function updateCategory(
  id: number,
  input: Partial<{
    name: string
    slug: string
    parentId: number | null
    icon: string | null
    sortOrder: number
  }>,
) {
  const before = await getCategory(id)
  if (input.slug && input.slug !== before.slug) await assertSlugFree(input.slug, id)
  // A category that is its own parent disappears from every tree walk.
  if (input.parentId === id) {
    throw conflict('A category cannot be its own parent.', { parentId: 'Pick another category.' })
  }

  await db.update(categories).set(input).where(eq(categories.id, id))
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
  locales?: ('th' | 'en' | 'jp' | 'vn')[] | undefined
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
        ? inArray(courses.contentLocale, opts.locales)
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

export async function listCourses(opts: CourseListOptions): Promise<Paged<unknown>> {
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
export async function courseFacets(opts: CourseListOptions): Promise<CourseFacets> {
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
    tally('locale', courses.contentLocale),
    tally('duration', durationKey),
    tally('price', priceKey),
    accessRow.then(([r]) => ({
      free: Number(r?.free ?? 0),
      course: Number(r?.course ?? 0),
      package: Number(r?.pkg ?? 0),
    })),
  ])

  return { total, category, level, locale, duration, price, access }
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

  return {
    ...row,
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

export async function updateCourse(id: number, input: Partial<CourseInput>) {
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
    } as Partial<typeof courses.$inferInsert>
    await db.update(courses).set(patch).where(eq(courses.id, id))
  }
  if (instructorIds) await setInstructors(id, instructorIds)

  const [after] = await db.select().from(courses).where(eq(courses.id, id)).limit(1)
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

export async function createLesson(courseId: number, input: Record<string, unknown>) {
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
