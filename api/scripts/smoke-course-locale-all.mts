/**
 * A course that belongs to every language.
 *
 *   npx tsx scripts/smoke-course-locale-all.mts
 *
 * The catalogue's language filter is a promise: tick Japanese and you get the
 * courses you could follow in Japanese. A course taught bilingually, or one
 * that is mostly pictures, could not make that promise in any of the four — so
 * it had to claim one and mislead, or claim the wrong one and vanish from the
 * filter that should have found it.
 *
 * 'all' is the same escape articles have always had. What is worth proving is
 * that it behaves like belonging rather than like a fifth language:
 *
 *   - a course set to 'all' survives every single-language filter
 *   - and every combination of them
 *   - the filter still offers four options, not five
 *   - each count includes the 'all' courses it would actually return
 *
 * Makes its own course and removes it again.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, users } from '../src/db/schema/index'

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
const stamp = Date.now()
const slug = `smoke-all-${stamp}`

const made = await call('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email: `smoke-locale-${stamp}@example.com`,
    password,
    firstName: 'ทด',
    lastName: 'สอบ',
    birthdate: '1990-01-15',
    acceptedTerms: true,
    locale: 'th',
    memberType: 'student',
  }),
})
const adminId = made.body.user.id as number
for (const role of ['admin', 'superadmin']) {
  await db.execute(sql`
    INSERT INTO user_roles (user_id, role_id) SELECT ${adminId}, id FROM roles WHERE name = ${role}
  `)
}
const token = (
  await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: `smoke-locale-${stamp}@example.com`, password }),
  })
).body.accessToken as string

/** How many courses a filter returns, and whether ours is among them. */
async function listed(query: string) {
  const res = await call(`/courses?perPage=100&${query}`)
  const rows = (res.body?.data ?? []) as { slug: string }[]
  return { total: rows.length, mine: rows.some((r) => r.slug === slug) }
}

let courseId = 0

try {
  const created = await call(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Smoke every-language course',
        slug,
        price: 100000,
        contentLocale: 'all',
        instructorIds: [adminId],
      }),
    },
    token,
  )
  check("a course can be created as 'all'", created.status === 201, String(created.status))
  courseId = created.body?.data?.id ?? 0
  check('  and it is stored that way', created.body?.data?.contentLocale === 'all', created.body?.data?.contentLocale)

  // Only an approved course is in the public catalogue at all.
  await call(`/courses/${courseId}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }, token)

  const unfiltered = await listed('')
  check('it is in the catalogue', unfiltered.mine, `${unfiltered.total} courses`)

  for (const locale of ['th', 'en', 'jp', 'vn']) {
    const one = await listed(`locales=${locale}`)
    check(`  and survives the ${locale} filter`, one.mine, `${one.total} courses`)
  }

  const pair = await listed('locales=jp,vn')
  check('  and a filter on two languages at once', pair.mine, `${pair.total} courses`)

  /* ---------------- the filter stays four options ---------------- */

  // Facets ride along with the list rather than having a route of their own —
  // `/courses/facets` is read as a course called "facets".
  const facets = await call('/courses?facets=1&perPage=1')
  const locales = (facets.body?.facets?.locale ?? {}) as Record<string, number>
  check('the list returns facets', Object.keys(locales).length > 0, JSON.stringify(locales))
  check(
    "the language filter does not grow an 'all' option",
    !('all' in locales),
    Object.keys(locales).join(', '),
  )

  // Every count should include this course, because every one of those filters
  // would return it. A count that promises less than it gives is a wrong count.
  const counted = ['th', 'en', 'jp', 'vn'].every((l) => Number(locales[l] ?? 0) >= 1)
  check(
    '  and every count includes the courses it would return',
    counted,
    JSON.stringify(locales),
  )

  const jpCount = Number(locales.jp ?? 0)
  const jpListed = await listed('locales=jp')
  check(
    '  so the Japanese count matches what Japanese returns',
    jpCount === jpListed.total,
    `count ${jpCount} vs ${jpListed.total} returned`,
  )
} finally {
  if (courseId) {
    await db.update(courses).set({ status: 'draft', publishedAt: null }).where(eq(courses.id, courseId))
    await db.delete(courses).where(eq(courses.id, courseId))
  }
  await db.delete(users).where(eq(users.id, adminId))
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
