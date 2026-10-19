/**
 * "คอร์สของฉัน" in a real browser.
 *
 *   node scripts/flow-my-courses.mjs [baseUrl]
 *
 * Signs up, takes the free course — which grants an entitlement the same way a
 * paid order does — and checks the page shows it, counts it in the right tab,
 * and offers the right thing to do next. An empty shelf is checked first,
 * because that is what most new members see.
 *
 * Deletes its account at the end, pass or fail.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const SHOTS = process.env.SHOT_DIR ?? '.'


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const member = {
  email: `flow-shelf-${Date.now()}@example.com`,
  password: 'Str0ng-Pass!2026',
  firstName: 'ทด',
  lastName: 'สอบ',
}
const register = await fetch(`${API}/auth/register`, {
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
if (!register.ok) {
  console.error('could not register:', register.status, await register.text())
  process.exit(1)
}
const { accessToken } = await register.json()
console.log(`  member: ${member.email}\n`)

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1100 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

async function cleanUp() {
  await browser.close().catch(() => {})
  try {
    const { execFileSync } = await import('node:child_process')
    const out = execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', member.email], {
      cwd: '../api',
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log('\n  ' + out.trim().split('\n').join('\n  '))
  } catch {
    console.log(`\n  !! could not delete ${member.email} — remove it by hand`)
  }
}

/** Signs in through the real dialog, so the page is reached the way a member
 *  reaches it rather than by a token poked into memory. */
async function signIn() {
  await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.hdr-auth button', { timeout: 10000 })
  await page.click('.hdr-auth button')
  await page.waitForSelector('input[type="password"]', { timeout: 10000 })
  await page.type('input[type="email"]', member.email, { delay: 8 })
  await page.type('input[type="password"]', member.password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), {
    timeout: 15000,
  })
}

const rows = () => page.$$eval('[data-mc]', (els) => els.length)
const tabCount = (g) =>
  page.$eval(`[data-count="${g}"]`, (el) => Number(el.textContent.trim())).catch(() => -1)

try {
  /* ---------------- 1. signed out, the shell says so ---------------- */

  await page.goto(`${BASE}/th/account/learning`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.acct-gate, .acct-li-list, .state-box', { timeout: 10000 })
  check('a signed-out visitor meets the gate', (await page.$('.acct-gate')) !== null)

  const gateWorks = await page
    .$eval('.acct-gate .btn--primary', (el) => el.textContent.trim().length > 0)
    .catch(() => false)
  if (gateWorks) {
    await page.click('.acct-gate .btn--primary')
    await page.waitForSelector('input[type="password"]', { timeout: 6000 }).catch(() => {})
  }
  check('and its sign-in button opens the dialog', (await page.$('input[type="password"]')) !== null)

  /* ---------------- 2. signed in with nothing yet ---------------- */

  await page.reload({ waitUntil: 'networkidle2' })
  await signIn()
  await page.goto(`${BASE}/th/account/learning`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.state-actions .btn--primary, [data-mc]', { timeout: 10000 })
  check('a member with no courses is past the gate', (await page.$('.acct-gate')) === null)
  check('and is told how to find one', (await page.$('.state-actions .btn--primary')) !== null)
  check('with nothing counted in the tabs', (await tabCount('all')) === 0, String(await tabCount('all')))

  /* ---------------- 3. the free course arrives ---------------- */

  /**
   * A free course the Thai catalogue actually lists.
   *
   * This asked the catalogue without a language and took the first free
   * course it found, which is now a Taiwanese one — so the checks further
   * down, which open `/th/courses` and look for its card, were waiting for a
   * course the Thai catalogue is right not to show. The site is read in one
   * language at a time; a test of it has to pick a language too.
   */
  const list = await (await fetch(`${API}/courses?perPage=50&locales=th`)).json()
  const free = list.data.find((c) => c.price === 0)
  if (!free) throw new Error('no free course on the Thai catalogue to enrol in')

  const placed = await fetch(`${API}/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ lines: [{ kind: 'course', id: free.id }], method: 'promptpay' }),
  })
  check('taking a free course works', placed.ok, String(placed.status))

  await page.goto(`${BASE}/th/account/learning`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('[data-mc]', { timeout: 10000 })
  check('it appears on the shelf', (await rows()) === 1, String(await rows()))
  check(
    'with its real title, not a fixture one',
    (await page.$eval('[data-mc] h3', (el) => el.textContent.trim())) === free.title,
    await page.$eval('[data-mc] h3', (el) => el.textContent.trim()),
  )
  check(
    'linking by slug',
    (await page.$eval('[data-mc] h3 a', (el) => el.getAttribute('href'))) ===
      `/th/courses/${free.slug}`,
    await page.$eval('[data-mc] h3 a', (el) => el.getAttribute('href')),
  )
  check(
    'counted under "not started"',
    (await page.$eval('[data-mc]', (el) => el.dataset.group)) === 'not-started',
    await page.$eval('[data-mc]', (el) => el.dataset.group),
  )
  check('and the tab agrees', (await tabCount('not-started')) === 1, String(await tabCount('not-started')))
  check('as does "all"', (await tabCount('all')) === 1)
  check(
    'it says how many lessons there are to do',
    (await page.$eval('.acct-li-prog-top .tabular', (el) => el.textContent.trim())).includes(
      String(free.lessonCount),
    ),
    await page.$eval('.acct-li-prog-top .tabular', (el) => el.textContent.trim()),
  )
  check(
    'and that the access does not run out',
    (await page.$$eval('.acct-fact-v', (els) => els.map((e) => e.textContent.trim()))).some((s) =>
      /ไม่มีวันหมดอายุ/.test(s),
    ),
    (await page.$$eval('.acct-fact-v', (els) => els.map((e) => e.textContent.trim()))).join(' | '),
  )
  check(
    'it knows the course was free',
    (await page.$eval('.acct-fact small', (el) => el.textContent.trim())).includes('ฟรี'),
    await page.$eval('.acct-fact small', (el) => el.textContent.trim()),
  )

  /* ---------------- 3b. and the rest of the site knows ---------------- */

  // A course somebody owns is never for sale again on a card, and the home page
  // gives them a way back into it rather than another row of things to buy.
  await page.goto(`${BASE}/th/courses`, { waitUntil: 'networkidle2' })
  await page.waitForSelector(`.cc[data-cid="${free.slug}"] [data-action], .cc[data-cid="${free.slug}"] a.btn`, {
    timeout: 10000,
  })
  const ownedButton = await page.$eval(
    `.cc[data-cid="${free.slug}"] .cc-foot a, .cc[data-cid="${free.slug}"] .cc-foot button`,
    (el) => el.textContent.trim(),
  )
  check('a course they own says "เริ่มเรียน" on its card', ownedButton.includes('เริ่มเรียน'), ownedButton)
  const cardHref = await page.$eval(
    `.cc[data-cid="${free.slug}"] .cc-foot a`,
    (el) => el.getAttribute('href'),
  )
  check(
    '  and that button goes into the room',
    cardHref === `/th/learn/${free.slug}`,
    cardHref ?? '(not a link)',
  )

  // And the course's own page stops being a till.
  await page.goto(`${BASE}/th/courses/${free.slug}`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('#cd-ctas', { timeout: 12000 })
  check(
    'the course page shows progress instead of a price',
    (await page.$('.cd-buy .cd-prog')) !== null && (await page.$('.cd-buy .cd-price')) === null,
    (await page.$('.cd-buy .cd-price')) ? 'the price is still there' : 'progress shown',
  )
  check(
    'and says how they came by it',
    ((await page.$eval('.cd-access', (el) => el.textContent.trim()).catch(() => '')) || '').includes(
      'ฟรี',
    ),
    await page.$eval('.cd-access', (el) => el.textContent.trim()).catch(() => '(no note)'),
  )
  const panelHref = await page
    .$eval('[data-owned-cta]', (el) => el.getAttribute('href'))
    .catch(() => null)
  check(
    'the course page sends them into the room',
    (panelHref ?? '').startsWith(`/th/learn/${free.slug}`),
    panelHref ?? '(none)',
  )
  check(
    'with a way into the lessons, not a way to buy it again',
    (await page.$('[data-owned-cta]')) !== null &&
      (await page.$('.cd-buy [data-action="add-cart"], .cd-buy [data-action="buy"]')) === null,
    await page
      .$eval('#cd-ctas', (el) => el.textContent.replace(/s+/g, ' ').trim())
      .catch(() => '(none)'),
  )
  await page.screenshot({ path: `${SHOTS}/course-owned.png` })

  await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
  const rail = await page.waitForSelector('#my-courses', { timeout: 10000 }).catch(() => null)
  check('the home page grows a "คอร์สของฉัน" rail', rail !== null)
  if (rail) {
    check(
      'carrying the course they own',
      (await page.$eval('#my-courses .cc-title', (el) => el.textContent.trim())) === free.title,
      await page.$eval('#my-courses .cc-title', (el) => el.textContent.trim()),
    )
    check(
      'and a way through to the whole shelf',
      (await page.$eval('#my-courses a[href*="/account/learning"]', (el) => el.getAttribute('href'))) ===
        '/th/account/learning',
    )
    await page.screenshot({ path: `${SHOTS}/home-mine.png` })
  }

  await page.goto(`${BASE}/th/account/learning`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('[data-mc]', { timeout: 10000 })
  const shelfHref = await page.$eval('[data-mc] .acct-li-cta a', (el) => el.getAttribute('href'))
  check(
    'and so does the shelf',
    (shelfHref ?? '').startsWith(`/th/learn/${free.slug}`),
    shelfHref ?? '(none)',
  )

  /* ---------------- 4. the tabs filter ---------------- */

  await page.click('#ml-tab-completed')
  await page.waitForFunction(() => document.querySelectorAll('[data-mc]').length === 0, {
    timeout: 6000,
  }).catch(() => {})
  check('a tab with nothing in it says so', (await page.$('.state-box')) !== null)
  check('and the url carries the choice', page.url().includes('tab=completed'), page.url())

  await page.click('#ml-tab-all')
  await page.waitForSelector('[data-mc]', { timeout: 6000 })
  check('going back to "all" brings it back', (await rows()) === 1)

  await page.screenshot({ path: `${SHOTS}/my-courses.png` })

  const realErrors = errors.filter(
    (e) => !/favicon|Vue Devtools|Failed to load resource|401 \(Unauthorized\)/i.test(e),
  )
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
} finally {
  await cleanUp()
}

console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
