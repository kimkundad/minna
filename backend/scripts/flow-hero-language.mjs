/**
 * Choosing which language a home slide belongs to, from the admin.
 *
 *   node scripts/flow-hero-language.mjs
 *
 * The form had no language field. A slide took the language from the picker
 * beside the "Add a slide" button — in the page header, above the list, out of
 * sight once the form was open — so somebody writing a headline could not see
 * which language they were writing it in. The only hint was a Thai example
 * under the link boxes, which read `/th/courses` under every language and
 * would have sent a Korean reader to the Thai site if anyone had copied it.
 *
 * So: the form names the language, it can be changed there, the examples
 * follow it, and a slide moved to another language does not vanish.
 *
 * Makes its own slide and deletes it again.
 */
import { execFileSync } from 'node:child_process'
import { launchBrowser } from './browser.mjs'

const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
/** The api package holds the scripts that grant a role and remove an account —
 *  neither is something the API offers over HTTP, and neither should be. */
const API_DIR = new URL('../../api/', import.meta.url).pathname.replace(/^\//, '')

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const stamp = Date.now()
const headline = `ทดสอบภาษาสไลด์ ${stamp}`

/** A throwaway admin, so nobody's real password is in a test. */
const password = 'Str0ng-Pass!2026'
const admin = `flow-heroadm-${stamp}@example.com`

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

const made = await call('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email: admin,
    password,
    firstName: 'ทด',
    lastName: 'สอบ',
    birthdate: '1990-01-15',
    acceptedTerms: true,
    locale: 'th',
    memberType: 'student',
  }),
})
if (made.status >= 400) {
  console.error('could not register the test admin:', made.status, JSON.stringify(made.body))
  process.exit(1)
}

// Roles are granted by the api package's own script: there is no API for
// making yourself an administrator, and there should not be.
execFileSync('npx', ['tsx', 'scripts/grant-role.mts', admin, 'admin'], {
  cwd: API_DIR,
  shell: true,
  stdio: 'ignore',
})

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })
let slideId = null

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('response', (r) => {
    if (r.status() === 401 && r.url().endsWith('/auth/refresh')) return
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
  })

  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', admin, { delay: 8 })
  await page.type('input[type="password"]', password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 25000 })

  /* ---------------- 1. the form says which language ---------------- */

  await page.goto(`${BASE}/hero-slides`, { waitUntil: 'networkidle2' })
  await wait(1200)

  await page.click('[data-action="hero-add"]')
  await page.waitForSelector('#hs-locale', { timeout: 8000 }).catch(() => {})

  const hasField = await page.$('#hs-locale')
  check('the form has a language of its own', Boolean(hasField))
  if (!hasField) throw new Error('no language field in the slide form')

  const options = await page.$$eval('#hs-locale option', (els) =>
    els.map((o) => ({ value: o.value, label: o.textContent.trim() })),
  )
  check(
    'it offers every language the site speaks, and "every language"',
    options.length === 9 && options.some((o) => o.value === 'all'),
    options.map((o) => o.value).join(','),
  )

  /* ---------------- 2. the examples follow it ---------------- */

  await page.select('#hs-locale', 'ko')
  await wait(200)
  const koreanExample = await page.$eval(
    'input[placeholder$="/courses"]',
    (el) => el.placeholder,
  )
  check('the link example is in the chosen language', koreanExample === '/ko/courses', koreanExample)

  await page.select('#hs-locale', 'all')
  await wait(200)
  const everyExample = await page.$eval('input[placeholder$="/courses"]', (el) => el.placeholder)
  check(
    'an every-language slide shows the shape rather than one language',
    everyExample.includes('<language>'),
    everyExample,
  )

  /* ---------------- 3. the slide is saved into that language ---------------- */

  await page.select('#hs-locale', 'ko')
  await wait(200)
  const headlineBox = await page.$$('input[maxlength="200"]')
  await headlineBox[0].type(headline, { delay: 6 })
  await page.click('form button[type="submit"]')
  await wait(2000)

  const token = (
    await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: admin, password }) })
  ).body.accessToken
  const korean = await call('/hero-slides?locale=ko', {}, token)
  const mine = (korean.body.data ?? []).find((s) => s.titleA === headline)
  slideId = mine?.id ?? null
  check('the slide is saved into the language the form named', Boolean(mine), mine?.locale ?? 'not found')

  /* ---------------- 4. and the list follows it ---------------- */

  // The picker's own 'every language' is a view of all of them, not the slides
  // whose setting is `all` — one phrase used to mean both, and picking it on a
  // page called 'Home slideshow' showed a handful rather than everything.
  await page.select('select', '*')
  await wait(1500)
  const everyView = await page.evaluate(() => ({
    rows: document.querySelectorAll('ul.divide-y > li').length,
    arrows: document.body.innerText.includes('↑'),
  }))
  const everySlide = (await call('/hero-slides', {}, token)).body.data.length
  check(
    'the every-language view lists every slide there is',
    everyView.rows === everySlide,
    `list ${everyView.rows}, API ${everySlide}`,
  )
  check('and hides the order arrows, which are per language', !everyView.arrows)
  await page.select('select', 'ko')
  await wait(1200)

  const shown = await page.$eval('select', (el) => el.value)
  check(
    'the list switched to that language rather than losing the slide',
    shown === 'ko',
    `list is showing ${shown}`,
  )

  const onScreen = await page.evaluate((t) => document.body.innerText.includes(t), headline)
  check('and the slide is on screen', onScreen)

  check('nothing failed to load', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  if (slideId) {
    const token = (
      await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: admin, password }) })
    ).body.accessToken
    await call(`/hero-slides/${slideId}`, { method: 'DELETE' }, token)
    console.log(`\n  removed the test slide (#${slideId})`)
  }
  execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', admin], {
    cwd: API_DIR,
    shell: true,
    stdio: 'ignore',
  })
  await browser.close()
}

console.log(failures ? `\n${failures} failed` : '\n  all good')
process.exit(failures ? 1 : 0)
