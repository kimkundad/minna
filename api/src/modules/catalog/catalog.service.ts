import { and, asc, count, desc, eq, inArray, like, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  categories,
  courseInstructors,
  courseModules,
  courses,
  lessons,
  users,
} from '../../db/schema/index'
import { conflict, notFound } from '../../lib/errors'
import { removeOrphanedMedia } from '../../lib/media'
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
  sort: 'newest' | 'title' | 'price' | 'popularity'
  /** The public site passes false and only ever sees approved courses. */
  includeUnpublished: boolean
  /** A teacher sees the courses they are on, not the whole catalog. */
  instructorId?: number | undefined
}

export async function listCourses(opts: CourseListOptions): Promise<Paged<unknown>> {
  const where = [
    opts.includeUnpublished ? undefined : eq(courses.status, 'approved'),
    opts.status ? eq(courses.status, opts.status) : undefined,
    opts.categoryId ? eq(courses.categoryId, opts.categoryId) : undefined,
    opts.q ? or(like(courses.title, `%${opts.q}%`), like(courses.slug, `%${opts.q}%`)) : undefined,
    opts.instructorId
      ? sql`EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.course_id = ${outer(courses.id)} AND ci.user_id = ${opts.instructorId})`
      : undefined,
  ].filter(Boolean)

  const filter = where.length ? and(...(where as never[])) : undefined

  const order =
    opts.sort === 'title'
      ? asc(courses.title)
      : opts.sort === 'price'
        ? asc(courses.price)
        : opts.sort === 'popularity'
          ? desc(courses.popularity)
          : desc(courses.createdAt)

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
    })
    .from(courses)
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(filter)
    .orderBy(order)
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return paged(rows, total, opts.page, opts.perPage)
}

export async function getCourse(id: number, includeUnpublished: boolean) {
  const [row] = await db.select().from(courses).where(eq(courses.id, id)).limit(1)
  if (!row || (!includeUnpublished && row.status !== 'approved')) {
    throw notFound('That course does not exist.')
  }

  const instructors = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarPath: users.avatarPath,
      sortOrder: courseInstructors.sortOrder,
    })
    .from(courseInstructors)
    .innerJoin(users, eq(users.id, courseInstructors.userId))
    .where(eq(courseInstructors.courseId, id))
    .orderBy(asc(courseInstructors.sortOrder))

  return { ...row, instructors }
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
