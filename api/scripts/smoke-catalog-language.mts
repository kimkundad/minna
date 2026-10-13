/**
 * A reader sees the courses in their own language, and the ones for everybody.
 *
 *   npx tsx scripts/smoke-catalog-language.mts
 *
 * The rule the customer asked for: pick Indonesian and the catalogue holds the
 * courses taught in Indonesian plus the courses a teacher marked as suiting
 * every language. Nothing else.
 *
 * Two halves are worth proving separately, because they are two queries that
 * have to agree:
 *
 *  - `/courses?locales=xx` returns those and only those;
 *  - `/categories?all=1&locale=xx` counts those and only those, since that
 *    count sits on a card linking straight to the catalogue. A card promising
 *    fifteen courses behind a link that returns none is the bug this guards.
 *
 * Makes its own courses and categories and deletes them again, so it can run
 * against a real database without touching the catalog.
 */
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { categories, courses } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const get = async (path: string) => {
  const res = await fetch(API + path)
  return { status: res.status, body: await res.json() }
}

const stamp = Date.now()
const slugOf = (s: string) => `smoke-lang-${s}-${stamp}`

/** One category of its own, so the counts below are about these courses only. */
const [{ insertId: categoryId }] = (await db.execute(sql`
  INSERT INTO categories (name, slug, sort_order)
  VALUES (${`ทดสอบภาษา ${stamp}`}, ${slugOf('cat')}, 995)
`)) as unknown as { insertId: number }[]

/**
 * One course per case. `all` is the one that has to appear everywhere, and the
 * Korean one is the case that did not work before: a language the site speaks
 * but nobody had taught in.
 */
const PLAN: { key: string; locale: string }[] = [
  { key: 'th', locale: 'th' },
  { key: 'ko', locale: 'ko' },
  { key: 'all', locale: 'all' },
]

const made: number[] = []
for (const p of PLAN) {
  const [{ insertId }] = (await db.execute(sql`
    INSERT INTO courses
      (title, slug, category_id, content_locale, status, price, currency, access_type, published_at)
    VALUES
      (${`ทดสอบ ${p.key} ${stamp}`}, ${slugOf(p.key)}, ${categoryId}, ${p.locale},
       'approved', 100000, 'THB', 'lifetime', NOW())
  `)) as unknown as { insertId: number }[]
  made.push(insertId)
}

try {
  /* ---------------- the catalogue ---------------- */

  for (const locale of ['th', 'ko', 'id']) {
    const res = await get(`/courses?perPage=100&locales=${locale}&categoryIds=${categoryId}`)
    const slugs = (res.body.data as { slug: string }[]).map((c) => c.slug).sort()

    // Its own language, plus `all`, and nothing else.
    const want = [slugOf(locale), slugOf('all')].filter((s) =>
      PLAN.some((p) => slugOf(p.key) === s),
    )
    check(
      `${locale}: the catalogue holds its own language and the all-languages course`,
      JSON.stringify(slugs) === JSON.stringify(want.sort()),
      slugs.join(', ') || '(none)',
    )
  }

  const thai = await get(`/courses?perPage=100&locales=th&categoryIds=${categoryId}`)
  check(
    'a course in another language is left out',
    !(thai.body.data as { slug: string }[]).some((c) => c.slug === slugOf('ko')),
    (thai.body.data as { slug: string }[]).map((c) => c.slug).join(', '),
  )

  /* ---------------- and the counts that link to it ---------------- */

  for (const locale of ['th', 'ko', 'id']) {
    const list = await get(`/categories?all=1&locale=${locale}`)
    const row = (list.body.data as { id: number; totalCourseCount: number }[]).find(
      (c) => c.id === categoryId,
    )
    const inCatalogue = (
      await get(`/courses?perPage=100&locales=${locale}&categoryIds=${categoryId}`)
    ).body.data.length

    check(
      `${locale}: the category count equals what the catalogue returns`,
      row?.totalCourseCount === inCatalogue,
      `card says ${row?.totalCourseCount}, catalogue has ${inCatalogue}`,
    )
  }

  const noLocale = await get('/categories?all=1')
  const row = (noLocale.body.data as { id: number; totalCourseCount: number }[]).find(
    (c) => c.id === categoryId,
  )
  check(
    'asked without a language, the count is every published course',
    row?.totalCourseCount === PLAN.length,
    `${row?.totalCourseCount} of ${PLAN.length}`,
  )

  const bogus = await get('/categories?all=1&locale=xx')
  const bogusRow = (bogus.body.data as { id: number; totalCourseCount: number }[]).find(
    (c) => c.id === categoryId,
  )
  check(
    'an unknown language counts everything rather than nothing',
    bogusRow?.totalCourseCount === PLAN.length,
    `${bogusRow?.totalCourseCount} of ${PLAN.length}`,
  )
} finally {
  if (made.length) await db.delete(courses).where(inArray(courses.id, made))
  await db.delete(categories).where(eq(categories.id, categoryId))
  console.log(`\n  cleaned up ${made.length} courses and 1 category`)
}

console.log(failed ? `\n${failed} failed` : '\n  all good')
process.exit(failed ? 1 : 0)
