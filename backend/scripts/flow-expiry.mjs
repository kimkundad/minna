/**
 * Giving somebody a few more days, from the student page.
 *
 *   node scripts/flow-expiry.mjs
 *
 * The API rules are covered by `api/scripts/smoke-access-expiry.mts`. What is
 * checked here is the part a person touches: that the dialog opens, that the
 * shortcut buttons move a real date, that the calendar is a calendar rather
 * than the browser's `mm/dd/yyyy` box, and that saving actually changes what
 * the row says.
 */
import { execFileSync } from 'node:child_process'
import { launchBrowser } from './browser.mjs'

const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const SHOTS = process.env.SHOT_DIR ?? 'C:/Users/brack/AppData/Local/Temp/shots'
const API_DIR = new URL('../../api/', import.meta.url).pathname.replace(/^\//, '')


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const stamp = Date.now()
const password = 'Str0ng-Pass!2026'
const admin = `smoke-exp-a${stamp}@example.com`
const learner = `smoke-exp-l${stamp}@example.com`

async function account(email, role) {
  const made = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '1990-01-01',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const body = await made.json()
  if (role) {
    execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, role], {
      cwd: API_DIR,
      shell: true,
      stdio: 'ignore',
    })
  }
  return { id: body.user.id, token: body.accessToken }
}

await account(admin, 'superadmin')
const L = await account(learner, null)

const list = await (await fetch(`${API}/courses?perPage=60`)).json()
const free = list.data.find((c) => c.price === 0)
await fetch(`${API}/checkout`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${L.token}`, 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ lines: [{ kind: 'course', id: free.id }], method: 'promptpay' }),
})

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

/** The box somebody can actually see: flatpickr hides the original and copies
 *  its class onto the one it draws. */
const visibleField = (page) =>
  page.evaluate(() => {
    const alt = [...document.querySelectorAll('input')].find(
      (i) => i.placeholder === 'Pick a date' && i.getBoundingClientRect().width > 100,
    )
    if (!alt) return null
    const r = alt.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), value: alt.value }
  })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1300, height: 960 })
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

  await page.goto(`${BASE}/students/${L.id}?tab=courses`, { waitUntil: 'networkidle2' })
  await wait(2500)

  const before = await page.evaluate(
    () => document.querySelector('tbody tr')?.innerText.replace(/\s+/g, ' ') ?? '',
  )
  check('the course is listed with its expiry', before.includes('Lifetime'), before.slice(0, 80))

  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.innerText.trim() === 'Change expiry',
    )
    if (!b) return false
    b.click()
    return true
  })
  check('a superadmin can open the expiry dialog', opened)
  await wait(600)

  // Lifetime starts ticked, which leaves the date box off.
  await page.evaluate(() => document.querySelector('input[type=checkbox]')?.click())
  await wait(300)
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '+90 days')?.click()
  })
  await wait(400)

  const field = await visibleField(page)
  check('the shortcut fills a real date', Boolean(field?.value), String(field?.value))
  check(
    '  written out, not as mm/dd/yyyy',
    /\d{1,2} [A-Za-z]+ \d{4}/.test(field?.value ?? ''),
    field?.value,
  )

  await page.mouse.click(field.x, field.y)
  await wait(900)
  const calendar = await page.evaluate(() => ({
    open: Boolean(document.querySelector('.flatpickr-calendar.open')),
    days: document.querySelectorAll('.flatpickr-calendar.open .flatpickr-day').length,
  }))
  check('clicking it opens a calendar', calendar.open)
  check('  with a month of days in it', calendar.days >= 28, String(calendar.days))
  await page.screenshot({ path: `${SHOTS}/expiry-picker.png` })

  // Pick a day from the calendar rather than typing one.
  await page.evaluate(() => {
    const day = [...document.querySelectorAll('.flatpickr-calendar.open .flatpickr-day')].find(
      (d) => !d.classList.contains('prevMonthDay') && !d.classList.contains('nextMonthDay'),
    )
    day?.click()
  })
  await wait(500)
  const picked = await visibleField(page)
  check('  and picking a day fills the field', Boolean(picked?.value), String(picked?.value))

  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Save')?.click()
  })
  await wait(2000)

  const after = await page.evaluate(
    () => document.querySelector('tbody tr')?.innerText.replace(/\s+/g, ' ') ?? '',
  )
  check('saving changes what the row says', !after.includes('Lifetime'), after.slice(0, 80))
  check('  and the course is still theirs', after.includes('Active'), after.slice(0, 80))

  check('nothing threw', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
  for (const email of [admin, learner]) {
    execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', email], {
      cwd: API_DIR,
      shell: true,
      stdio: 'inherit',
    })
  }
}

console.log(failures ? `\n  ${failures} failing\n` : '\n  all good\n')
process.exit(failures ? 1 : 0)
