/**
 * Setting a teacher's share, on the two screens an administrator uses.
 *
 *   node scripts/flow-revenue-share.mjs
 *
 * The API rules are proved in `api/scripts/smoke-revenue-share.mts`. What that
 * cannot say is whether anybody can reach them: the share spent its whole life
 * as a column with a default because no form ever offered it. So this opens
 * the settings page and a course, types in both boxes, saves, and reads the
 * numbers back out of a fresh page load.
 *
 * It also checks the box's own limit. The percent input was written for VAT
 * and capped at 30, which would have refused most of the shares anybody would
 * actually agree.
 *
 * Puts the site default back to what it found.
 */
import { launchBrowser } from './browser.mjs'

const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://127.0.0.1:3000'
const EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@minna.local'
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'ChangeMe!2026'

let failed = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

let token = null
async function call(method, path, body) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  try {
    return { status: res.status, body: text ? JSON.parse(text) : null }
  } catch {
    return { status: res.status, body: { raw: text } }
  }
}

const signedIn = await call('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD })
if (signedIn.status !== 200) {
  console.error(`Could not sign in as ${EMAIL} (${signedIn.status}).`)
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD if the seeded admin has changed.')
  process.exit(1)
}
token = signedIn.body.accessToken

const settings = await call('GET', '/api/v1/settings')
const shareRow = (settings.body?.data ?? []).find((s) => s.key === 'revenue_share_pct')
const wasDefault = shareRow?.value ?? '25'
check('the share is a setting the admin API offers', Boolean(shareRow), JSON.stringify(shareRow?.value))
check('  with a ceiling above a VAT rate', shareRow?.max === 100, String(shareRow?.max))

// A course to type into. Its own share is put back at the end.
const courses = await call('GET', '/api/v1/courses?perPage=1&status=approved')
const courseId = courses.body?.data?.[0]?.id
if (!courseId) {
  console.error('No course to edit.')
  process.exit(1)
}
const wasCourseShare = (await call('GET', `/api/v1/courses/${courseId}`)).body?.data?.revenueSharePct

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const problems = []

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1200 })
  page.on('pageerror', (e) => problems.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'warning' && /resolve component|failed to resolve/i.test(m.text())) {
      problems.push(m.text())
    }
  })

  await page.goto(`${ADMIN}/signin`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', EMAIL)
  await page.type('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 20000 })

  /* ---------------- the settings page ---------------- */

  await page.goto(`${ADMIN}/settings`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('#set-revenue_share_pct', { timeout: 15000 })

  const box = await page.$eval('#set-revenue_share_pct', (el) => ({
    value: el.value,
    max: el.getAttribute('max'),
  }))
  check('the settings page has a box for it', true, `value ${box.value}`)
  check('  and the box allows more than 30', box.max === '100', String(box.max))

  await page.$eval('#set-revenue_share_pct', (el) => {
    el.value = '45'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const saveBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /save/i.test(b.innerText)),
  )
  await saveBtn.asElement()?.click()
  await new Promise((r) => setTimeout(r, 2500))

  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForSelector('#set-revenue_share_pct', { timeout: 15000 })
  const saved = await page.$eval('#set-revenue_share_pct', (el) => el.value)
  check('45% saves and comes back', saved === '45', saved)

  /* ---------------- the course form ---------------- */

  await page.goto(`${ADMIN}/courses/${courseId}`, { waitUntil: 'networkidle2' })
  await page.waitForFunction(
    () => [...document.querySelectorAll('label')].some((l) => /Teacher's share/i.test(l.innerText)),
    { timeout: 20000 },
  )
  check('the course form shows the share field', true)

  await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) =>
      /Teacher's share/i.test(l.innerText),
    )
    const input = label.parentElement.querySelector('input')
    input.value = '55'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

  const courseSave = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /save|บันทึก/i.test(b.innerText)),
  )
  await courseSave.asElement()?.click()
  await new Promise((r) => setTimeout(r, 3000))

  const stored = (await call('GET', `/api/v1/courses/${courseId}`)).body?.data?.revenueSharePct
  check('typing 55 on the course form stores 55', stored === 55, String(stored))

  await page.goto(`${ADMIN}/courses/${courseId}`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 2000))
  const shown = await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) =>
      /Teacher's share/i.test(l.innerText),
    )
    return label?.parentElement.querySelector('input')?.value ?? null
  })
  check('  and the form shows it again on reload', shown === '55', String(shown))

  check('no page errors or unresolved components', problems.length === 0, problems.join(' | '))
} finally {
  await browser.close()
  await call('PUT', '/api/v1/settings', { revenue_share_pct: wasDefault })
  if (wasCourseShare !== undefined) {
    await call('PATCH', `/api/v1/courses/${courseId}`, { revenueSharePct: wasCourseShare })
  }
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
