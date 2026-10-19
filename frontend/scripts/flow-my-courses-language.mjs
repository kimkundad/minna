/**
 * Two rules on one home page, and the line between them.
 *
 *   node scripts/flow-my-courses-language.mjs [baseUrl]
 *
 * What is on sale follows the language the site is being read in — the new
 * courses rail, the recommended rail, and the catalogue — because the school
 * sells a course in the language it is taught in, and a visitor to the
 * Indonesian site is not shopping for Thai lessons.
 *
 * What the member already owns does not. A course does not stop being theirs
 * because they switched the site to another language, and a Thai course they
 * are halfway through has to be reachable from wherever they are standing. So
 * "คอร์สของฉัน" carries all of them, in every language, on every language's
 * home page.
 *
 * The two rules sit next to each other on one page and each is easy to apply
 * to the other by mistake — it has been got wrong in both directions already —
 * so this holds both at once.
 *
 * Makes two free courses of its own, one Thai and one Indonesian, so the
 * expected answer is known rather than read back out of the catalogue. Deletes
 * them, and its account, at the end.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@minna.local'
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'ChangeMe!2026'

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const stamp = Date.now()
const member = {
  email: `flow-minelang-${stamp}@example.com`,
  password: 'Str0ng-Pass!2026',
  firstName: 'ทด',
  lastName: 'สอบ',
}

const registered = await fetch(`${API}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    ...member,
    birthdate: '2000-01-15',
    acceptedTerms: true,
    locale: 'th',
    memberType: 'student',
  }),
})
if (!registered.ok) {
  console.error('could not register:', registered.status, await registered.text())
  process.exit(1)
}
const memberToken = (await registered.json()).accessToken
console.log(`  member: ${member.email}\n`)

const adminToken = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
})
  .then((r) => (r.ok ? r.json() : null))
  .then((b) => b?.accessToken ?? null)
if (!adminToken) {
  console.error(`could not sign in as ${ADMIN_EMAIL}. Set SMOKE_ADMIN_EMAIL / _PASSWORD.`)
  process.exit(1)
}

/** Who teaches them does not matter here, only that somebody does. */
const teacherId = await fetch(`${API}/teachers`, {
  headers: { Authorization: `Bearer ${adminToken}` },
})
  .then((r) => r.json())
  .then((b) => b.data?.[0]?.id ?? null)

const made = []
async function makeFreeCourse(title, contentLocale) {
  const res = await fetch(`${API}/courses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title,
      slug: `${title}-${stamp}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      categoryId: 2,
      price: 0,
      level: 'beginner',
      contentLocale,
      status: 'approved',
      sellable: true,
      // Featured, so the recommended rail puts them first and a check for
      // them there is not really a check on how many courses the school
      // happens to have. The Thai catalogue has fourteen and the rail holds
      // eight, which is how the positive check on /th failed while the rule
      // it was testing was working perfectly.
      featured: true,
      instructorIds: teacherId ? [teacherId] : [],
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`could not make a ${contentLocale} course: ${JSON.stringify(body)}`)
  made.push(body.data.id)
  return body.data
}

const claim = (id) =>
  fetch(`${API}/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${memberToken}`,
    },
    body: JSON.stringify({ lines: [{ kind: 'course', id }], method: 'promptpay' }),
  })

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })

try {
  const thai = await makeFreeCourse('minelang-thai', 'th')
  const indo = await makeFreeCourse('minelang-indo', 'id')
  check('a Thai course and an Indonesian one were made', Boolean(thai.id && indo.id))

  check('the member takes the Thai one', (await claim(thai.id)).ok)
  check('and the Indonesian one', (await claim(indo.id)).ok)

  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1600 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message)))

  /** The card titles inside one section of the home page. */
  const titlesIn = (id) =>
    page.evaluate(
      (sel) =>
        [...document.querySelectorAll(`#${sel} .cc`)].map((c) =>
          (c.querySelector('h3, .cc-title')?.textContent ?? '').trim(),
        ),
      id,
    )

  /** Signs in through the modal, which is how a member actually arrives. */
  async function signIn(locale) {
    await page.goto(`${BASE}/${locale}`, { waitUntil: 'networkidle2', timeout: 45000 })
    await wait(1200)
    if (await page.evaluate(() => document.querySelector('.hdr-auth') === null)) return
    await page.evaluate(() => document.querySelector('.hdr-auth button')?.click())
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    await page.type('input[type="email"]', member.email, { delay: 8 })
    await page.type('input[type="password"]', member.password, { delay: 8 })
    await page.click('form button[type="submit"]')
    await wait(3500)
  }

  await signIn('id')

  /* -------- the member's own courses: every language, both pages -------- */

  for (const locale of ['id', 'th']) {
    await page.goto(`${BASE}/${locale}`, { waitUntil: 'networkidle2', timeout: 45000 })
    await wait(2500)
    const mine = await titlesIn('my-courses')
    check(
      `/${locale}: "my courses" carries both of them`,
      mine.includes(thai.title) && mine.includes(indo.title),
      mine.join(' | ') || '(no rail)',
    )
  }

  /* -------- and what is on sale: this language only -------- */

  for (const [locale, here, away] of [
    ['id', indo, thai],
    ['th', thai, indo],
  ]) {
    await page.goto(`${BASE}/${locale}`, { waitUntil: 'networkidle2', timeout: 45000 })
    await wait(2500)
    const rec = await titlesIn('rec-courses')
    check(
      `/${locale}: the recommended rail has this language's course`,
      rec.includes(here.title),
      rec.join(' | ') || '(empty)',
    )
    check(`/${locale}:   and not the other language's`, !rec.includes(away.title), rec.join(' | '))
    // The new courses rail holds eight, and the Thai catalogue has more than
    // that, so only the absence is worth asserting on both languages.
    const fresh = await titlesIn('new-courses')
    check(
      `/${locale}: the new courses rail leaves out the other language's`,
      !fresh.includes(away.title),
      fresh.join(' | '),
    )
  }

  /* -------- and the catalogue, which is the same rule -------- */

  const catalogue = async (locale) => {
    await page.goto(`${BASE}/${locale}/courses`, { waitUntil: 'networkidle2', timeout: 45000 })
    await wait(2500)
    return page.evaluate(() =>
      [...document.querySelectorAll('.cat-grid .cc')].map((c) =>
        (c.querySelector('h3, .cc-title')?.textContent ?? '').trim(),
      ),
    )
  }

  const catId = await catalogue('id')
  check('/id/courses lists the Indonesian course', catId.includes(indo.title), String(catId.length))
  check('/id/courses:   and not the Thai one', !catId.includes(thai.title), String(catId.length))

  const catTh = await catalogue('th')
  check('/th/courses lists the Thai course', catTh.includes(thai.title), String(catTh.length))
  check('/th/courses:   and not the Indonesian one', !catTh.includes(indo.title), String(catTh.length))

  /* -------- and the shelf, which is all of them -------- */

  await page.goto(`${BASE}/id/account/learning`, { waitUntil: 'networkidle2', timeout: 45000 })
  await wait(2000)
  const shelf = await page.evaluate(() =>
    [...document.querySelectorAll('[data-mc] h3')].map((h) => h.textContent.trim()),
  )
  check(
    'the shelf holds both, whatever language the site is in',
    shelf.includes(thai.title) && shelf.includes(indo.title),
    shelf.join(' | '),
  )

  check('nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
  for (const id of made) {
    // Back to a draft first: the API refuses to delete a published course, and
    // rightly so — these are only deletable because this file published them
    // a minute ago.
    await fetch(`${API}/courses/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'draft' }),
    }).catch(() => {})
    const gone = await fetch(`${API}/courses/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => null)
    if (!gone?.ok) console.log(`  !! course ${id} is still there — remove it by hand`)
  }
  try {
    const { execFileSync } = await import('node:child_process')
    const out = execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', member.email], {
      cwd: '../api',
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log('\n  ' + out.trim().split('\n').join('\n  '))
  } catch (err) {
    console.log(`\n  !! could not delete ${member.email}`, String(err).slice(0, 200))
  }
}

console.log(failures ? `\n${failures} failed` : '\n  all good')
process.exit(failures ? 1 : 0)
