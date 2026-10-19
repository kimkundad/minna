/**
 * The "carry on" rail on the home page follows the language of the page.
 *
 *   node scripts/flow-my-courses-language.mjs [baseUrl]
 *
 * Every list on the home page is narrowed to the language the site is being
 * read in — except this one, which came from the member rather than from the
 * catalogue and arrived unfiltered. So signing in on the Indonesian home page
 * added a row of Thai courses to a page that had been entirely Indonesian a
 * moment before: the courses a visitor is not shown, appearing because
 * somebody signed in. "คอร์สมั่วไปหมด", as the school put it.
 *
 * Hiding somebody's own purchase would be the worse bug of the two, so what
 * the page leaves out it says out loud, with the way through to all of it.
 *
 * Makes two free courses of its own — one Thai, one Indonesian — so the
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
  await page.setViewport({ width: 1440, height: 1400 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message)))

  /** Signs in through the modal, which is how a member actually arrives. */
  async function signIn(locale) {
    await page.goto(`${BASE}/${locale}`, { waitUntil: 'networkidle2', timeout: 45000 })
    await wait(1200)
    const already = await page.evaluate(() => document.querySelector('.hdr-auth') === null)
    if (already) return
    await page.evaluate(() => document.querySelector('.hdr-auth button')?.click())
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    await page.type('input[type="email"]', member.email, { delay: 8 })
    await page.type('input[type="password"]', member.password, { delay: 8 })
    await page.click('form button[type="submit"]')
    await wait(3500)
  }

  /** The rail's cards, and the footnote under it. */
  const rail = () =>
    page.evaluate(() => ({
      titles: [...document.querySelectorAll('#my-courses .cc')].map((c) =>
        (c.querySelector('h3, .cc-title')?.textContent ?? '').trim(),
      ),
      note: document.querySelector('#my-courses .home-mine-elsewhere')?.innerText.trim() ?? '',
    }))

  /* ---------------- the Indonesian home page ---------------- */

  await signIn('id')
  await page.goto(`${BASE}/id`, { waitUntil: 'networkidle2', timeout: 45000 })
  await wait(2500)
  const onId = await rail()
  check(
    'the Indonesian home page carries the Indonesian course',
    onId.titles.includes(indo.title),
    onId.titles.join(' | ') || '(no rail)',
  )
  check(
    '  and not the Thai one — which is the bug',
    !onId.titles.includes(thai.title),
    onId.titles.join(' | '),
  )
  check(
    '  and says how many it is not showing',
    /1/.test(onId.note),
    onId.note || '(nothing said)',
  )

  /* ---------------- and the Thai one ---------------- */

  await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2', timeout: 45000 })
  await wait(2500)
  const onTh = await rail()
  check(
    'the Thai home page carries the Thai course',
    onTh.titles.includes(thai.title),
    onTh.titles.join(' | ') || '(no rail)',
  )
  check('  and not the Indonesian one', !onTh.titles.includes(indo.title), onTh.titles.join(' | '))

  /* ---------------- a language they own nothing in ---------------- */

  await page.goto(`${BASE}/jp`, { waitUntil: 'networkidle2', timeout: 45000 })
  await wait(2500)
  const onJp = await rail()
  check('a language they own nothing in has no rail', onJp.titles.length === 0, onJp.titles.join(' | '))
  check(
    '  but still says their courses are elsewhere',
    /2/.test(onJp.note),
    onJp.note || '(nothing said)',
  )

  /* ---------------- nothing is lost ---------------- */

  await page.goto(`${BASE}/id/account/learning`, { waitUntil: 'networkidle2', timeout: 45000 })
  await wait(2000)
  const shelf = await page.evaluate(() =>
    [...document.querySelectorAll('[data-mc] h3')].map((h) => h.textContent.trim()),
  )
  check(
    'both are still on the shelf, whatever language the site is in',
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
