/**
 * What a shared link looks like.
 *
 *   npx tsx scripts/smoke-og.mts
 *
 * The public site is a single-page app: the HTML that arrives is nearly empty
 * and Vue fills it in. Facebook, LINE and X do not run JavaScript, so a title
 * set by Vue is one they never see and every shared link previewed as the
 * same blank page. nginx sends crawlers to these routes instead.
 *
 * What is checked is the order things fall back in, because that is the part
 * with somewhere to go wrong: a course's own wording, then its page's, then
 * the site's, each in the reader's language.
 *
 * Makes its own course and article and removes them again.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, posts, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const ROOT = API.replace(/\/api\/v1\/?$/, '')

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

/** One tag out of a card. */
async function tag(path: string, property: string): Promise<string> {
  const html = await (await fetch(ROOT + path)).text()
  const m = html.match(
    new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`),
  )
  return m?.[1] ?? ''
}

const password = 'Str0ng-Pass!2026'
const stamp = Date.now()
const email = `smoke-og-${stamp}@example.com`

const made = await call('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email,
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
await db.execute(sql`
  INSERT INTO user_roles (user_id, role_id) SELECT ${adminId}, id FROM roles WHERE name = 'admin'
`)
const login = await call('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
})
const token = login.body.accessToken as string

const courseSlug = `smoke-og-course-${stamp}`
const postSlug = `smoke-og-post-${stamp}`
let courseId = 0
let postId = 0

try {
  /* ---------------- the site's own card, per language ---------------- */

  for (const [locale, expect] of [
    ['th', 'th_TH'],
    ['en', 'en_US'],
    ['jp', 'ja_JP'],
    ['vn', 'vi_VN'],
  ]) {
    const got = await tag(`/og/${locale}/site`, 'og:locale')
    check(`${locale}: the card says which language it is in`, got === expect, got)
  }

  const th = await tag('/og/th/site', 'og:title')
  const en = await tag('/og/en/site', 'og:title')
  check('and each language has its own title', Boolean(th) && Boolean(en) && th !== en, `${th.slice(0, 24)} / ${en.slice(0, 24)}`)

  const nonsense = await tag('/og/zz/site', 'og:locale')
  check('a language that is not ours falls back to Thai', nonsense === 'th_TH', nonsense)

  /* ---------------- a course shares as itself ---------------- */

  const course = await call(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Smoke OG course',
        slug: courseSlug,
        shortDesc: 'The short description, which is what a share should use.',
        price: 100000,
        instructorIds: [adminId],
        status: 'approved',
      }),
    },
    token,
  )
  check('a course is created and approved', course.status === 201, String(course.status))
  courseId = course.body?.data?.id ?? 0

  check('it shares as its own title', (await tag(`/og/th/courses/${courseSlug}`, 'og:title')) === 'Smoke OG course')
  check(
    '  and its short description',
    (await tag(`/og/th/courses/${courseSlug}`, 'og:description')).startsWith('The short description'),
    await tag(`/og/th/courses/${courseSlug}`, 'og:description'),
  )
  check(
    '  at the address a reader would open',
    (await tag(`/og/en/courses/${courseSlug}`, 'og:url')).includes(`/en/courses/${courseSlug}`),
    await tag(`/og/en/courses/${courseSlug}`, 'og:url'),
  )

  /* ---------------- unless it says otherwise ---------------- */

  await call(
    `/courses/${courseId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ogTitle: 'A title written for a chat window',
        ogDescription: 'And a line written for one too.',
      }),
    },
    token,
  )
  check(
    'an override wins over the page title',
    (await tag(`/og/th/courses/${courseSlug}`, 'og:title')) === 'A title written for a chat window',
  )
  check(
    '  and over the short description',
    (await tag(`/og/th/courses/${courseSlug}`, 'og:description')) === 'And a line written for one too.',
  )

  /* ---------------- an unapproved course is not public ---------------- */

  await call(`/courses/${courseId}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) }, token)
  const hidden = await tag(`/og/th/courses/${courseSlug}`, 'og:title')
  check(
    'a course that is not live shares as the site, not as itself',
    hidden !== 'A title written for a chat window' && Boolean(hidden),
    hidden,
  )
  check(
    '  and still answers, rather than 404ing',
    (await fetch(`${ROOT}/og/th/courses/${courseSlug}`)).status === 200,
  )
  check(
    'a slug that never existed does the same',
    (await fetch(`${ROOT}/og/th/courses/no-such-course-at-all`)).status === 200,
  )

  /* ---------------- an article shares as an article ---------------- */

  const post = await call(
    '/posts',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Smoke OG article',
        slug: postSlug,
        excerpt: 'The excerpt, which is what a share should use.',
        status: 'published',
        contentLocale: 'th',
      }),
    },
    token,
  )
  check('an article is created and published', post.status === 201, String(post.status))
  postId = post.body?.data?.id ?? 0

  check('it shares as its own title', (await tag(`/og/th/blog/${postSlug}`, 'og:title')) === 'Smoke OG article')
  check(
    '  marked as an article, not a page',
    (await tag(`/og/th/blog/${postSlug}`, 'og:type')) === 'article',
  )
  check(
    '  with its excerpt',
    (await tag(`/og/th/blog/${postSlug}`, 'og:description')).startsWith('The excerpt'),
  )

  /* ---------------- nothing a reader writes reaches the markup ---------------- */

  await call(
    `/posts/${postId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Smoke OG article',
        slug: postSlug,
        status: 'published',
        contentLocale: 'th',
        ogTitle: 'Quote " and <tag> and & ampersand',
      }),
    },
    token,
  )
  const escaped = await (await fetch(`${ROOT}/og/th/blog/${postSlug}`)).text()
  check(
    'a quotation mark in a title cannot break out of the tag',
    !escaped.includes('content="Quote " and'),
  )
  check('  nor can a tag', !escaped.includes('<tag>'), escaped.includes('<tag>') ? 'found <tag>' : '')
  check('  and the ampersand survives as text', escaped.includes('&amp; ampersand'))

  /* ---------------- the path in the site card is not a free hand ---------------- */

  const evil = await tag('/og/th/site?path=https://evil.test', 'og:url')
  check('a path that is really somewhere else is refused', !evil.includes('evil.test'), evil)
} finally {
  if (postId) await db.delete(posts).where(eq(posts.id, postId))
  if (courseId) {
    await db.update(courses).set({ status: 'draft', publishedAt: null }).where(eq(courses.id, courseId))
    await db.delete(courses).where(eq(courses.id, courseId))
  }
  await db.delete(users).where(eq(users.id, adminId))
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
