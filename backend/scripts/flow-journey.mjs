/**
 * Writing the home page's journey band from the admin.
 *
 *   node scripts/flow-journey.mjs
 *
 * The band was a heading and four steps typed into the page in Thai: seven
 * languages read the Thai, it described the reference project's veterinary
 * scheme — filter by CE points, collect a certificate, neither of which this
 * school does — and changing a word meant changing the page.
 *
 * What this proves is the three things the customer asked for: every language
 * is editable here, the steps are theirs to create, and the icon comes from a
 * list rather than from typing a name. The last one matters because an icon
 * the site cannot draw is not an error anywhere — it renders as an empty
 * circle, which reads as a broken design.
 *
 * Makes its own step and deletes it again, so it can run against a real
 * database without changing what the home page says.
 */
import { execFileSync } from 'node:child_process'
import { launchBrowser } from './browser.mjs'

const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'
const SITE = process.env.SITE_URL ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const API_DIR = new URL('../../api/', import.meta.url).pathname.replace(/^\//, '')

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const stamp = Date.now()
const title = `ขั้นตอนทดสอบ ${stamp}`
const password = 'Str0ng-Pass!2026'
const admin = `flow-journey-${stamp}@example.com`

const call = async (path, init = {}, token) => {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

await call('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email: admin,
    password,
    firstName: 'ทด',
    lastName: 'สอบ',
    birthdate: '1990-01-01',
    acceptedTerms: true,
    locale: 'th',
    memberType: 'student',
  }),
})
execFileSync('npx', ['tsx', 'scripts/grant-role.mts', admin, 'admin'], {
  cwd: API_DIR,
  shell: true,
  stdio: 'ignore',
})
const token = (
  await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: admin, password }) })
).body.accessToken

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })
let madeId = null

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 1100 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('response', (r) => {
    if (r.status() === 401 && r.url().endsWith('/auth/refresh')) return
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
  })

  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', admin, { delay: 6 })
  await page.type('input[type="password"]', password, { delay: 6 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 25000 })

  await page.goto(`${BASE}/journey`, { waitUntil: 'networkidle2' })
  await wait(1500)

  /* ---------------- 1. every language is editable here ---------------- */

  const languages = await page.$$eval('[data-action="journey-locale"] option', (els) =>
    els.map((o) => o.value),
  )
  check(
    'every language the site speaks can be written here',
    languages.length === 8 && !languages.includes('all'),
    languages.join(','),
  )

  const heading = await page.$eval('[data-field="heading"]', (el) => el.value)
  check('the heading is loaded, not hard-coded in the page', heading.length > 0, heading)

  /* ---------------- 2. the steps are theirs to make ---------------- */

  await page.click('[data-action="journey-add"]')
  await page.waitForSelector('[data-field="step-title"]', { timeout: 8000 })

  /* ---------------- 3. the icon comes from a list ---------------- */

  await page.click('[data-action="journey-icon"]')
  await page.waitForSelector('[data-field="icon-search"]', { timeout: 8000 })
  const offered = await page.$$eval('[data-field="icon-search"] ~ div button', (els) =>
    els.map((b) => b.textContent.trim()),
  )
  check('the icons are offered as a list, not typed', offered.length > 50, `${offered.length} icons`)

  const fromApi = (await call('/journey/icons')).body.data
  check(
    'and the list is the set the site can actually draw',
    offered.length === fromApi.length,
    `form ${offered.length}, API ${fromApi.length}`,
  )

  // Drawn, not just named: half a dozen names are plausible for any one step,
  // and a list of words meant saving and going to look at the site to tell.
  const drawn = await page.$$eval(
    '[data-field="icon-search"] ~ div button svg',
    (els) => els.length,
  )
  check('each one is drawn, not only named', drawn === offered.length, `${drawn} drawings for ${offered.length} icons`)

  await page.type('[data-field="icon-search"]', 'award', { delay: 10 })
  await wait(300)
  const narrowed = await page.$$eval('[data-field="icon-search"] ~ div button', (els) =>
    els.map((b) => b.textContent.trim()),
  )
  check('the list can be searched', narrowed.includes('award'), narrowed.join(','))
  await page.click('[data-field="icon-search"] ~ div button')
  await wait(200)

  await page.type('[data-field="step-title"]', title, { delay: 6 })
  // The step form's own button: the heading above it is a form too, and the
  // first submit on the page belongs to that one.
  await page.click('[data-action="journey-step-save"]')
  await wait(1800)

  const mine = (await call('/journey?locale=th', {}, token)).body.data.steps.find(
    (s) => s.title === title,
  )
  madeId = mine?.id ?? null
  check('a step written here is saved', Boolean(mine), mine ? `icon ${mine.icon}` : 'not found')
  check('with the icon that was picked', mine?.icon === 'award', mine?.icon ?? '')

  /* ---------------- 4. an icon the site cannot draw is refused ---------- */

  const bogus = await call(
    '/journey/steps',
    {
      method: 'POST',
      body: JSON.stringify({ locale: 'th', icon: 'not-an-icon', title: 'x', text: null }),
    },
    token,
  )
  check(
    'an icon the site cannot draw is refused by the server too',
    bogus.status === 400 || bogus.status === 422,
    `${bogus.status} ${JSON.stringify(bogus.body).slice(0, 90)}`,
  )

  /* ---------------- 5. and it reaches the home page ---------------- */

  const site = await browser.newPage()
  await site.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('minna:locale', 'th')
    } catch {
      /* a private window still renders */
    }
  })
  await site.goto(`${SITE}/th`, { waitUntil: 'networkidle2', timeout: 45000 })
  await wait(1200)
  const onSite = await site.evaluate(
    () => document.querySelector('#journey')?.innerText?.replace(/\n+/g, ' | ') ?? '',
  )
  check('the step is on the home page', onSite.includes(title), onSite.slice(0, 120))
  await site.close()

  /* ---------------- 6. and the same screen writes the closing band ------- */

  /**
   * Reached by clicking the menu, not by loading the address.
   *
   * Both entries open the same component, so Vue keeps the instance it already
   * has and `onMounted` does not run again — which left the journey's heading
   * and steps on screen under the closing band's address, two menu items that
   * looked like one screen. Loading the URL directly builds the page from
   * scratch and looks right, which is why checking it that way found nothing.
   */
  for (const link of await page.$$('aside a, nav a')) {
    if ((await link.evaluate((e) => e.getAttribute('href'))) === '/journey/cta') {
      await link.click()
      break
    }
  }
  await wait(1800)
  check('the menu reaches the closing band', page.url().endsWith('/journey/cta'), page.url())
  const closing = await page.evaluate(() => ({
    heading: document.querySelector('[data-field="heading"]')?.value ?? '',
    rows: document.querySelectorAll('ul.divide-y > li').length,
  }))
  check(
    'the closing band is written on the same screen',
    closing.heading.length > 0 && closing.rows === 4,
    `${closing.rows} chips — ${closing.heading}`,
  )

  const onPage = await (await fetch(`${API}/journey/public?band=cta&locale=th`)).json()
  check(
    'and it is what the home page shows',
    onPage.data?.steps?.length === 4,
    onPage.data ? `${onPage.data.steps.length} chips` : 'nothing published',
  )

  check('nothing failed to load', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  if (madeId) {
    await call(`/journey/steps/${madeId}`, { method: 'DELETE' }, token)
    console.log(`\n  removed the test step (#${madeId})`)
  }
  await browser.close()
  execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', admin], {
    cwd: API_DIR,
    shell: true,
    stdio: 'ignore',
  })
}

console.log(failures ? `\n${failures} failed` : '\n  all good')
process.exit(failures ? 1 : 0)
