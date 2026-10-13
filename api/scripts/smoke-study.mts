/**
 * Studying a course: the curriculum, the player's URL, and progress.
 *
 *   npx tsx scripts/smoke-study.mts
 *
 * The product is on the other side of these three routes, so most of this is
 * about what they refuse: somebody with no entitlement, somebody whose access
 * has ended, a lesson belonging to a course they did not buy, and a browser
 * claiming to have watched more of a lesson than the lesson contains.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, entitlements, lessonProgress, lessons, users } from '../src/db/schema/index'

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

const password = 'Str0ng-Pass!2026'
async function member(tag: string) {
  const email = `smoke-study-${tag}-${Date.now()}@example.com`
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
  return { email, id: made.body.user.id as number, token: made.body.accessToken as string }
}

const student = await member('a')
const stranger = await member('b')
console.log(`  student: ${student.email}\n`)

try {
  // A course with lessons that have a running time, since progress is measured
  // against it.
  const [course] = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      lessonCount: sql<number>`(SELECT COUNT(*) FROM lessons l WHERE l.course_id = courses.id)`,
    })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(40)
    .then((rows) => rows.filter((r) => Number(r.lessonCount) >= 3))
  if (!course) throw new Error('need an approved course with at least three lessons')

  /* ---------------- what it refuses ---------------- */

  check(
    'a stranger with no session is refused',
    (await call(`/me/courses/${course.slug}/curriculum`)).status === 401,
  )

  const notMine = await call(`/me/courses/${course.slug}/curriculum`, {}, student.token)
  check('and a member who has not bought it', notMine.status === 403, String(notMine.status))
  check(
    '  saying so rather than pretending the course is missing',
    notMine.status === 403,
    notMine.body?.error?.message ?? '',
  )

  /* ---------------- with an entitlement ---------------- */

  await db.insert(entitlements).values({
    userId: student.id,
    courseId: course.id,
    source: 'purchase',
    status: 'active',
  })

  const got = await call(`/me/courses/${course.slug}/curriculum`, {}, student.token)
  check('an entitled member gets the curriculum', got.status === 200, String(got.status))

  const data = got.body.data
  const all = [...data.modules.flatMap((m: { lessons: unknown[] }) => m.lessons), ...data.loose] as {
    id: number
    title: string
    durationSeconds: number
    hasVideo: boolean
    progress: { completedAt: string | null }
  }[]
  check('with every lesson on it', all.length === Number(course.lessonCount), `${all.length} lessons`)
  check(
    'none of which leaks where the file is kept',
    !JSON.stringify(data).includes('video_path') && !JSON.stringify(data).includes('.mp4'),
  )
  check('nothing is finished yet', data.progress.done === 0, JSON.stringify(data.progress))
  check(
    'and it says where to start',
    data.resumeLessonId === all[0]?.id,
    `${data.resumeLessonId} vs first ${all[0]?.id}`,
  )

  /* ---------------- the player's url ---------------- */

  const timed = all.find((l) => l.durationSeconds > 0) ?? all[0]!
  const play = await call(`/me/lessons/${timed.id}/play`, {}, student.token)
  check(
    'a lesson hands back a URL, or says nothing is uploaded',
    play.status === 200 || play.status === 404,
    play.status === 404 ? 'no file uploaded for it yet' : String(play.status),
  )
  if (play.status === 200) {
    check('  which is signed and expires', /[?&](X-Amz-|token=|exp=)/i.test(play.body.data.url))
  }

  const stolen = await call(`/me/lessons/${timed.id}/play`, {}, stranger.token)
  check('somebody else cannot play it by guessing the id', stolen.status === 403, String(stolen.status))

  /* ---------------- progress ---------------- */

  const half = Math.floor(timed.durationSeconds / 2)
  const halfway = await call(
    `/me/lessons/${timed.id}/progress`,
    { method: 'PUT', body: JSON.stringify({ positionSeconds: half }) },
    student.token,
  )
  check('progress is recorded', halfway.status === 200, String(halfway.status))
  check(
    '  and halfway is not finished',
    halfway.body.data.completedAt === null,
    String(halfway.body.data.completedAt),
  )

  const rewound = Math.max(0, half - Math.max(1, Math.floor(timed.durationSeconds / 10)))
  const back = await call(
    `/me/lessons/${timed.id}/progress`,
    { method: 'PUT', body: JSON.stringify({ positionSeconds: rewound }) },
    student.token,
  )
  check(
    'scrubbing back does not undo what was watched',
    back.body.data.maxPositionSeconds === half && back.body.data.lastPositionSeconds === rewound,
    `max ${back.body.data.maxPositionSeconds}, last ${back.body.data.lastPositionSeconds} (from ${half})`,
  )

  const overrun = await call(
    `/me/lessons/${timed.id}/progress`,
    { method: 'PUT', body: JSON.stringify({ positionSeconds: timed.durationSeconds * 10 }) },
    student.token,
  )
  check(
    'a position past the end is clamped to the lesson',
    overrun.body.data.maxPositionSeconds <= timed.durationSeconds,
    `${overrun.body.data.maxPositionSeconds} of ${timed.durationSeconds}`,
  )
  check(
    '  and watching to the end finishes it',
    overrun.body.data.completedAt !== null,
    String(overrun.body.data.completedAt),
  )
  check(
    '  with the course total coming back too',
    overrun.body.data.course.done === 1 && overrun.body.data.course.total === all.length,
    JSON.stringify(overrun.body.data.course),
  )

  const liar = all.find((l) => l.id !== timed.id && l.durationSeconds > 0)
  if (liar) {
    const claimed = await call(
      `/me/lessons/${liar.id}/progress`,
      { method: 'PUT', body: JSON.stringify({ positionSeconds: 0, completed: true }) },
      student.token,
    )
    check(
      'claiming to have finished a video does not finish it',
      claimed.body.data.completedAt === null,
      String(claimed.body.data.completedAt),
    )
  }

  const theirs = await call(
    `/me/lessons/${timed.id}/progress`,
    { method: 'PUT', body: JSON.stringify({ positionSeconds: 1 }) },
    stranger.token,
  )
  check('somebody else cannot write progress on it', theirs.status === 403, String(theirs.status))

  const after = await call(`/me/courses/${course.slug}/curriculum`, {}, student.token)
  check(
    'the curriculum now shows it done',
    after.body.data.progress.done === 1,
    JSON.stringify(after.body.data.progress),
  )
  check(
    'and points at the next lesson, not the one just finished',
    after.body.data.resumeLessonId !== timed.id && after.body.data.resumeLessonId !== null,
    String(after.body.data.resumeLessonId),
  )

  // The shelf is built from the same rows, so it has to agree.
  const shelf = await call('/me/courses', {}, student.token)
  const mine = (shelf.body.data as { course: { id: number }; progress: { done: number } }[]).find(
    (i) => i.course.id === course.id,
  )
  check('and "คอร์สของฉัน" agrees', mine?.progress.done === 1, JSON.stringify(mine?.progress))

  /* ---------------- access that has ended ---------------- */

  await db
    .update(entitlements)
    .set({ expiresAt: sql`DATE_SUB(NOW(), INTERVAL 1 DAY)` as never })
    .where(and(eq(entitlements.userId, student.id), eq(entitlements.courseId, course.id)))

  const lapsed = await call(`/me/courses/${course.slug}/curriculum`, {}, student.token)
  check('once access ends, the course closes', lapsed.status === 403, String(lapsed.status))
  check(
    '  and so does the player',
    (await call(`/me/lessons/${timed.id}/play`, {}, student.token)).status === 403,
  )
} finally {
  for (const who of [student, stranger]) {
    await db.delete(lessonProgress).where(eq(lessonProgress.userId, who.id))
    await db.delete(entitlements).where(eq(entitlements.userId, who.id))
    await db.delete(users).where(eq(users.id, who.id))
  }
  console.log(`\n  cleaned up ${student.email}`)
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
