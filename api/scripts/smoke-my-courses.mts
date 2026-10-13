/**
 * The member's own shelf: what "คอร์สของฉัน" is built from.
 *
 *   npx tsx scripts/smoke-my-courses.mts
 *
 * Three entitlements are made for one throwaway account — one untouched, one
 * half watched, one lapsed — because the only interesting thing this endpoint
 * does is decide which group each course belongs in, and that cannot be checked
 * with a single row.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courseModules, courses, entitlements, lessonProgress, lessons, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

async function call(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

interface Item {
  group: string
  blocked: string | null
  expiresAt: string | null
  source: string
  progress: { done: number; total: number; pct: number; resume: { id: number } | null }
  quiz: { exists: boolean; passed: boolean } | null
  course: { id: number; title: string; slug: string; lessonCount: number; instructors: unknown[] }
}

const email = `smoke-shelf-${Date.now()}@example.com`
const password = 'Str0ng-Pass!2026'
const made = await call('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password,
    firstName: 'ทด',
    lastName: 'สอบ',
    birthdate: '2000-01-15',
    acceptedTerms: true,
    locale: 'th',
    memberType: 'student',
  }),
})
const token = made.body.accessToken as string
const userId = made.body.user.id as number
console.log(`  member: ${email}\n`)

try {
  /* ---------------- an empty shelf is an empty list ---------------- */

  const empty = await call('/me/courses', {}, token)
  check('a new member has nothing to study', empty.status === 200 && empty.body.data.length === 0)
  check(
    'and a stranger is refused outright',
    (await call('/me/courses')).status === 401,
  )

  /* ---------------- three courses, three states ---------------- */

  // Courses with lessons, because progress is counted against lessons that
  // exist and a course with none would hide a division by zero.
  const withLessons = await db
    .select({
      id: courses.id,
      title: courses.title,
      lessonCount: sql<number>`(SELECT COUNT(*) FROM lessons l WHERE l.course_id = courses.id)`,
    })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(30)
  const usable = withLessons.filter((c) => Number(c.lessonCount) >= 2).slice(0, 3)
  if (usable.length < 3) throw new Error('need three approved courses with at least two lessons')

  const [untouched, halfway, lapsed] = usable as [typeof usable[0], typeof usable[0], typeof usable[0]]

  await db.insert(entitlements).values([
    { userId, courseId: untouched.id, source: 'purchase', status: 'active' },
    { userId, courseId: halfway.id, source: 'free', status: 'active' },
    {
      userId,
      courseId: lapsed.id,
      source: 'purchase',
      status: 'active',
      // Yesterday: still `active` in the column, over in fact. Which of the two
      // the endpoint believes is exactly the thing worth testing.
      expiresAt: sql`DATE_SUB(NOW(), INTERVAL 1 DAY)` as never,
    },
  ])

  // One lesson of the middle course watched to the end.
  const [firstLesson, secondLesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .leftJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .where(eq(lessons.courseId, halfway.id))
    .orderBy(asc(courseModules.sortOrder), asc(lessons.sortOrder), asc(lessons.id))
    .limit(2)
  await db.insert(lessonProgress).values({
    userId,
    courseId: halfway.id,
    lessonId: firstLesson!.id,
    maxPositionSeconds: 600,
    lastPositionSeconds: 600,
    completedAt: sql`NOW()` as never,
  })

  const shelf = await call('/me/courses', {}, token)
  const items = shelf.body.data as Item[]
  check('all three appear', items.length === 3, String(items.length))

  const byCourse = new Map(items.map((i) => [i.course.id, i]))
  const a = byCourse.get(untouched.id)!
  const b = byCourse.get(halfway.id)!
  const c = byCourse.get(lapsed.id)!

  check('one nobody has opened is "not started"', a.group === 'not-started', a.group)
  check('  with no progress', a.progress.done === 0 && a.progress.pct === 0)
  check(
    '  and the first lesson to carry on from',
    a.progress.resume !== null,
    String(a.progress.resume?.id),
  )

  check('one part watched is "in progress"', b.group === 'in-progress', b.group)
  check(
    '  counting the lesson that was finished',
    b.progress.done === 1 && b.progress.total === Number(halfway.lessonCount),
    `${b.progress.done}/${b.progress.total}`,
  )
  check(
    '  and resuming at the next one, not the one just done',
    b.progress.resume?.id === secondLesson!.id,
    String(b.progress.resume?.id),
  )
  check('  and it knows it was free', b.source === 'free', b.source)

  check('one whose access ran out is "expired"', c.group === 'expired', c.group)
  check('  and says why it cannot be opened', c.blocked === 'expired', String(c.blocked))

  /* ---------------- the card is a card ---------------- */

  check(
    'each row carries a drawable course',
    items.every((i) => i.course.slug && i.course.title && Array.isArray(i.course.instructors)),
  )
  check(
    'the lapsed one sorts last',
    items.at(-1)!.course.id === lapsed.id,
    items.map((i) => i.group).join(' → '),
  )

  /* ---------------- finishing it ---------------- */

  // Every lesson of the middle course done. With no quiz behind it that is the
  // whole course, so it should move groups.
  const all = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.courseId, halfway.id))
  await db
    .insert(lessonProgress)
    .values(
      all
        .filter((l) => l.id !== firstLesson!.id)
        .map((l) => ({
          userId,
          courseId: halfway.id,
          lessonId: l.id,
          maxPositionSeconds: 600,
          lastPositionSeconds: 600,
          completedAt: sql`NOW()` as never,
        })),
    )

  const after = (await call('/me/courses', {}, token)).body.data as Item[]
  const done = after.find((i) => i.course.id === halfway.id)!
  const hasQuiz = done.quiz?.exists === true
  check(
    hasQuiz
      ? 'every lesson done, but the test is not passed, so not "completed"'
      : 'every lesson done and no test: "completed"',
    hasQuiz ? done.group === 'in-progress' : done.group === 'completed',
    `${done.group}, quiz ${hasQuiz ? 'yes' : 'no'}`,
  )
  check('  and it is 100% of the lessons either way', done.progress.pct === 100, String(done.progress.pct))
  check('  with nothing left to carry on to', done.progress.resume === null)
} finally {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (row) {
    await db.delete(lessonProgress).where(eq(lessonProgress.userId, row.id))
    await db.delete(entitlements).where(eq(entitlements.userId, row.id))
    await db.delete(users).where(eq(users.id, row.id))
    console.log(`\n  cleaned up ${email}`)
  }
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
