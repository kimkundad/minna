import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  categories,
  courseInstructors,
  courseModules,
  courses,
  entitlements,
  lessonProgress,
  lessons,
  quizAttempts,
  quizzes,
  teacherProfiles,
  users,
} from '../../db/schema/index'
import { instant, outer } from '../../lib/sql'

/**
 * The courses one member may study, and how far through each they are.
 *
 * An entitlement is the fact that matters: a paid order grants one, a free
 * enrolment grants one, a package grants one. This reads them rather than the
 * orders behind them, so a course granted by hand on the admin's mark-as-paid
 * button appears here exactly like a course bought with a card.
 *
 * Revoked entitlements are left out — that access was taken away, and a row
 * saying so would invite the question of why. Expired ones stay: somebody who
 * has lost access is entitled to know they once had it, and to buy it again.
 *
 * The course columns are the same ones the catalog sends, because the public
 * site already knows how to draw a course from that shape. Four queries for the
 * page rather than four per course.
 */

export interface MyCourseItem {
  entitlementId: number
  source: string
  grantedAt: string
  /** Null means lifetime. */
  expiresAt: string | null
  /** Why this cannot be studied, or null when it can. */
  blocked: 'expired' | 'ended' | null
  group: 'in-progress' | 'not-started' | 'completed' | 'expired'
  progress: {
    done: number
    total: number
    /** Whole percent, against the lessons that exist today. */
    pct: number
    /** Where to carry on, or null when there is nothing left. */
    resume: { id: number; title: string; type: string } | null
    lastStudiedAt: string | null
  }
  quiz: { exists: boolean; passed: boolean; scorePct: number | null } | null
  course: Record<string, unknown>
}

export async function myCourses(userId: number): Promise<MyCourseItem[]> {
  const rows = await db
    .select({
      entitlementId: entitlements.id,
      source: entitlements.source,
      grantedAt: entitlements.grantedAt,
      expiresAt: entitlements.expiresAt,
      status: entitlements.status,

      // The catalog's own card projection, so the browser draws these with the
      // same code it draws a search result with.
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      categoryId: courses.categoryId,
      categoryName: categories.name,
      thumbnailPath: courses.thumbnailPath,
      level: courses.level,
      price: courses.price,
      currency: courses.currency,
      normalPrice: courses.normalPrice,
      status_: courses.status,
      sellable: courses.sellable,
      featured: courses.featured,
      durationSeconds: courses.durationSeconds,
      publishedAt: courses.publishedAt,
      createdAt: courses.createdAt,
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
       * Completed lessons, counted through `lessons` rather than straight off
       * `lesson_progress`: a lesson that has since been deleted still has its
       * progress row, and counting those gives 11 of 10.
       */
      doneCount: sql<number>`(
        SELECT COUNT(*) FROM lesson_progress lp
        JOIN lessons l ON l.id = lp.lesson_id
        WHERE lp.user_id = ${userId}
          AND l.course_id = ${outer(courses.id)}
          AND lp.completed_at IS NOT NULL
      )`,
      lastStudiedAt: sql<string | null>`(
        SELECT MAX(lp.last_watched_at) FROM lesson_progress lp
        JOIN lessons l ON l.id = lp.lesson_id
        WHERE lp.user_id = ${userId} AND l.course_id = ${outer(courses.id)}
      )`,
      startedCount: sql<number>`(
        SELECT COUNT(*) FROM lesson_progress lp
        JOIN lessons l ON l.id = lp.lesson_id
        WHERE lp.user_id = ${userId} AND l.course_id = ${outer(courses.id)}
      )`,
    })
    .from(entitlements)
    .innerJoin(courses, eq(courses.id, entitlements.courseId))
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(and(eq(entitlements.userId, userId), ne(entitlements.status, 'revoked')))
    .orderBy(desc(entitlements.grantedAt))

  if (!rows.length) return []

  const courseIds = rows.map((r) => r.id)
  const [resume, quizzes, instructors] = await Promise.all([
    resumeLessons(userId, courseIds),
    quizState(userId, courseIds),
    instructorsFor(courseIds),
  ])

  const now = Date.now()

  const items = rows.map((r): MyCourseItem => {
    const total = Number(r.lessonCount)
    const done = Math.min(Number(r.doneCount), total)
    const expiresAt = r.expiresAt ? String(r.expiresAt) : null

    // Either reason means the same thing to a reader — this cannot be studied —
    // but they are not the same sentence, so they stay apart.
    const lapsed =
      r.status === 'expired' || (expiresAt !== null && new Date(expiresAt).getTime() < now)
    const blocked: MyCourseItem['blocked'] = lapsed ? 'expired' : r.status_ === 'ended' ? 'ended' : null

    const quiz = quizzes.get(r.id) ?? null
    // A course with a test is not finished until it is passed. Without one, the
    // lessons are the whole of it.
    const finished = total > 0 && done === total && (!quiz?.exists || quiz.passed)

    const group: MyCourseItem['group'] = lapsed
      ? 'expired'
      : finished
        ? 'completed'
        : Number(r.startedCount) === 0
          ? 'not-started'
          : 'in-progress'

    return {
      entitlementId: r.entitlementId,
      source: r.source,
      grantedAt: String(r.grantedAt),
      expiresAt,
      blocked,
      group,
      progress: {
        done,
        total,
        pct: total ? Math.round((done / total) * 100) : 0,
        resume: resume.get(r.id) ?? null,
        lastStudiedAt: instant(r.lastStudiedAt),
      },
      quiz,
      course: {
        id: r.id,
        title: r.title,
        slug: r.slug,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        thumbnailPath: r.thumbnailPath,
        level: r.level,
        price: r.price,
        normalPrice: r.normalPrice,
        status: r.status_,
        sellable: r.sellable,
        featured: r.featured,
        durationSeconds: r.durationSeconds,
        publishedAt: r.publishedAt,
        createdAt: r.createdAt,
        shortDesc: r.shortDesc,
        contentLocale: r.contentLocale,
        badge: r.badge,
        accessType: r.accessType,
        accessDurationDays: r.accessDurationDays,
        repurchase: r.repurchase,
        popularity: r.popularity,
        updatedAt: r.updatedAt,
        lessonCount: total,
        inPackage: false,
        instructors: instructors.get(r.id) ?? [],
      },
    }
  })

  /**
   * What you are working on first, what you have lost access to last, and
   * within a group the one you touched most recently.
   *
   * Sorted here rather than in the browser because the tab counts and the list
   * have to agree, and both are built from this one array.
   */
  const RANK = { 'in-progress': 0, 'not-started': 1, completed: 2, expired: 3 } as const
  return items.sort(
    (a, b) =>
      RANK[a.group] - RANK[b.group] ||
      String(b.progress.lastStudiedAt ?? b.grantedAt).localeCompare(
        String(a.progress.lastStudiedAt ?? a.grantedAt),
      ),
  )
}

/**
 * The first lesson of each course this member has not finished.
 *
 * In the order the course is taught — module, then lesson — so "carry on" means
 * the next thing rather than the lowest id. One query for the whole page, with
 * `ROW_NUMBER` picking the first row per course.
 */
async function resumeLessons(userId: number, courseIds: number[]) {
  const map = new Map<number, { id: number; title: string; type: string }>()
  if (!courseIds.length) return map

  // Every lesson of these courses, in teaching order, with whether this member
  // has finished it. A member's own shelf is tens of lessons, not thousands, so
  // the first unfinished one per course is picked here rather than with a window
  // function — which keeps this a query the rest of the codebase's shape.
  const rows = await db
    .select({
      courseId: lessons.courseId,
      id: lessons.id,
      title: lessons.title,
      type: lessons.type,
      completedAt: lessonProgress.completedAt,
    })
    .from(lessons)
    .leftJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .leftJoin(
      lessonProgress,
      and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)),
    )
    .where(inArray(lessons.courseId, courseIds))
    .orderBy(asc(courseModules.sortOrder), asc(lessons.sortOrder), asc(lessons.id))

  for (const row of rows) {
    if (row.completedAt) continue
    if (map.has(row.courseId)) continue
    map.set(row.courseId, { id: row.id, title: row.title, type: row.type })
  }
  return map
}

/** Whether each course has a test, and this member's best result on it. */
async function quizState(userId: number, courseIds: number[]) {
  const map = new Map<number, { exists: boolean; passed: boolean; scorePct: number | null }>()
  if (!courseIds.length) return map

  // Best of every attempt, not the latest: a pass is not undone by sitting it
  // again out of interest.
  const rows = await db
    .select({
      courseId: quizzes.courseId,
      passed: sql<number>`MAX(${quizAttempts.passed})`,
      scorePct: sql<number | null>`MAX(${quizAttempts.scorePct})`,
    })
    .from(quizzes)
    .leftJoin(
      quizAttempts,
      and(eq(quizAttempts.quizId, quizzes.id), eq(quizAttempts.userId, userId)),
    )
    .where(inArray(quizzes.courseId, courseIds))
    .groupBy(quizzes.courseId)

  for (const row of rows) {
    map.set(row.courseId, {
      exists: true,
      passed: Number(row.passed ?? 0) === 1,
      scorePct: row.scorePct === null ? null : Number(row.scorePct),
    })
  }
  return map
}

/**
 * The teachers on each course.
 *
 * Deliberately a copy of the catalog's query rather than an import of it: that
 * one is private to the catalog service and returns a shape the catalog owns.
 * Two short queries that happen to look alike are easier to change one at a
 * time than one shared one with a flag.
 */
async function instructorsFor(courseIds: number[]) {
  const map = new Map<number, unknown[]>()
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
    })
    .from(courseInstructors)
    .innerJoin(users, eq(users.id, courseInstructors.userId))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .where(inArray(courseInstructors.courseId, courseIds))
    .orderBy(asc(courseInstructors.sortOrder))

  for (const r of rows) {
    // The same shape the catalog sends, down to the fallbacks: the browser's
    // `personOf` reads `name` and `short`, and handing it the raw columns
    // instead gave a card with no teacher on it.
    const account = `${r.firstName} ${r.lastName}`.trim()
    map.set(r.courseId, [
      ...(map.get(r.courseId) ?? []),
      {
        id: r.id,
        name: r.displayName ?? account,
        short: r.shortName ?? account,
        headline: r.headline,
        slug: r.slug,
        avatarPath: r.avatarPath,
      },
    ])
  }
  return map
}

/** One course, for the player's own guard: may this member study it today? */
export async function mayStudy(userId: number, courseId: number): Promise<boolean> {
  const [row] = await db
    .select({ expiresAt: entitlements.expiresAt, status: entitlements.status })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.courseId, courseId),
        eq(entitlements.status, 'active'),
      ),
    )
    .orderBy(asc(entitlements.expiresAt))
    .limit(1)

  if (!row) return false
  return row.expiresAt === null || new Date(String(row.expiresAt)).getTime() > Date.now()
}
