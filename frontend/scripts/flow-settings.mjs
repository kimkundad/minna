/**
 * Account settings, on real data.
 *
 *   node scripts/flow-settings.mjs [baseUrl]
 *
 * Walks every box on the page and checks it against the API afterwards — a
 * field that looks saved and is not is the exact failure this page used to
 * have, when the whole form wrote to a fixture in localStorage.
 *
 * Also watches for what must no longer be there: the prototype asked for a
 * veterinary licence, a clinic and a province, and nothing stores any of them.
 *
 * Deletes the account at the end, pass or fail.
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
  email: `flow-settings-${Date.now()}@example.com`,
  password: 'Str0ng-Pass!2026',
  firstName: 'สมหญิง',
  lastName: 'ใจดี',
}

const register = await fetch(`${API}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    ...member,
    birthdate: '1998-03-20',
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
const auth = { Authorization: `Bearer ${accessToken}` }
console.log(`  member: ${member.email}\n`)

const get = async (path) => (await fetch(`${API}${path}`, { headers: auth })).json()

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1400 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'warning') errors.push('warn: ' + m.text())
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
    console.log('\n  ' + out.trim().split('\n')[0])
  } catch {
    console.log(`\n  !! could not delete ${member.email} — remove it by hand`)
  }
}

try {
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

  await page.goto(`${BASE}/th/account/profile`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('#pf-basic', { timeout: 15000 })
  await new Promise((r) => setTimeout(r, 900))

  const body = await page.evaluate(() => document.body.innerText)

  /* ---------------- what must not be there ---------------- */

  check(
    'no veterinary licence box',
    !/เลขใบอนุญาต|licence|license no/i.test(body),
  )
  check('no clinic or province', !/สถานที่ทำงาน|จังหวัด/.test(body))
  check('no interests picked from a veterinary taxonomy', !/วิสัญญี|อายุรศาสตร์|Cardiology/.test(body))

  /* ---------------- what is there, and what it saves ---------------- */

  const sections = await page.$$eval('.acct-pf h2', (els) => els.map((e) => e.textContent.trim()))
  check('four sections', sections.length === 4, sections.join(' | '))

  const readonly = await page.$$eval('#pf-basic input[readonly]', (els) =>
    els.map((e) => ({ id: e.id, value: e.value })),
  )
  check(
    'the email is shown and not editable',
    readonly.some((f) => f.id === 'pf-email' && f.value === member.email),
    JSON.stringify(readonly.map((f) => f.id)),
  )
  const dob = await page.$eval('#pf-dob', (e) => ({ type: e.type, value: e.value, readOnly: e.readOnly }))
  check('the birthdate is shown as a date it can edit', dob.type === 'date' && !dob.readOnly, JSON.stringify(dob))
  check('  filled in with what was registered', dob.value === '1998-03-20', dob.value)

  // Change the name and the phone, then ask the API what it holds.
  await page.evaluate(() => {
    const fn = document.querySelector('#pf-fn')
    fn.value = ''
    fn.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.type('#pf-fn', 'สมชาย', { delay: 10 })
  await page.evaluate(() => {
    const d = document.querySelector('#pf-dob')
    d.value = '1995-12-01'
    d.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const phoneBox = await page.$('#pf-phone')
  if (phoneBox) await phoneBox.type('811234567', { delay: 10 })
  await new Promise((r) => setTimeout(r, 400))

  await page.evaluate(() => {
    const save = [...document.querySelectorAll('#pf-basic button[type="submit"]')][0]
    save?.click()
  })
  await new Promise((r) => setTimeout(r, 1500))

  const profile = (await get('/me/profile')).data
  check('the name reaches the API', profile.firstName === 'สมชาย', profile.firstName)
  check('and so does the phone', profile.phoneNational === '811234567', String(profile.phoneNational))
  check('and the corrected birthdate too', profile.birthdate === '1995-12-01', String(profile.birthdate))

  /* ---------------- the tax details ---------------- */

  await page.evaluate(() => {
    document.querySelector('#pf-btax').value = ''
  })
  await page.type('#pf-btax', '1101700207129', { delay: 4 })
  await page.type('#pf-bname', 'สมชาย ใจดี', { delay: 4 })
  await page.type('#pf-baddr', 'เลขที่ 1 กรุงเทพมหานคร 10110', { delay: 2 })
  await page.evaluate(() => {
    const save = [...document.querySelectorAll('#pf-billing button[type="submit"]')][0]
    save?.click()
  })
  await new Promise((r) => setTimeout(r, 1400))

  const billing = (await get('/me/billing')).data
  check('the tax details reach the API', billing?.taxId === '1101700207129', String(billing?.taxId))
  check('  with the name typed', billing?.name === 'สมชาย ใจดี', String(billing?.name))

  /* ---------------- the devices ---------------- */

  const devices = await page.$$eval('.acct-dev', (els) =>
    els.map((e) => ({
      text: e.innerText.replace(/\s+/g, ' ').trim(),
      current: e.classList.contains('is-current'),
      canSignOut: Boolean(e.querySelector('.acct-dev-out')),
    })),
  )
  check('this browser is listed as a device', devices.length >= 1, `${devices.length}`)
  const here = devices.find((d) => d.current)
  check('  exactly one row is this browser', devices.filter((d) => d.current).length === 1,
    JSON.stringify(devices.map((d) => d.current)))
  check('  it says so', /อุปกรณ์นี้|this device/i.test(here?.text ?? ''), here?.text?.slice(0, 70))
  check('  and offers no button to sign itself out', here?.canSignOut === false)
  check(
    '  the others do offer one',
    devices.filter((d) => !d.current).every((d) => d.canSignOut),
  )

  /* ---------------- what may be sent ---------------- */

  const switches = await page.$$eval('#pf-consent .acct-switch-row', (els) =>
    els.map((e) => ({
      label: e.querySelector('b')?.textContent?.trim(),
      on: e.querySelector('input')?.checked,
    })),
  )
  check('three consent switches', switches.length === 3, JSON.stringify(switches.map((s) => s.label)))
  check(
    'marketing starts off and the expiry warning starts on',
    switches[0]?.on === false && switches[1]?.on === false && switches[2]?.on === true,
    JSON.stringify(switches.map((s) => s.on)),
  )

  await page.evaluate(() => {
    document.querySelector('#pf-consent .acct-switch-row input')?.click()
  })
  await new Promise((r) => setTimeout(r, 1000))
  const consents = (await get('/me/consents')).data
  check('flicking one saves it straight away', consents.news === true, JSON.stringify(consents))
  check('  and leaves the others alone', consents.expiryAlert === true && consents.newCourses === false)

  await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true })

  /* ---------------- the password dialog ---------------- */

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#pf-security button')].find((x) =>
      /รหัสผ่าน|password/i.test(x.textContent ?? ''),
    )
    b?.click()
  })
  await page.waitForSelector('#pf-pw-form', { timeout: 8000 }).catch(() => {})
  check('the password dialog opens', (await page.$('#pf-pw-form')) !== null)

  await page.type('#pw-cur', member.password, { delay: 4 })
  await page.type('#pw-new', 'An0ther-Pass!2026', { delay: 4 })
  await page.type('#pw-conf', 'mismatch-on-purpose', { delay: 4 })
  await page.evaluate(() => {
    document.querySelector('.modal-foot .btn--primary')?.click()
  })
  await new Promise((r) => setTimeout(r, 600))
  const mismatch = await page.$eval('#pf-pw-form', (e) => e.innerText)
  check('  mismatched confirmations are caught before sending', /ไม่ตรงกัน|do not match/i.test(mismatch))

  /* ---------------- the way across to the admin ---------------- */

  // A student has no business there and is offered no door. The teacher's half
  // of this is covered by flow-teaching.mjs, which needs an account with the
  // role and so cannot share this one.
  const cross = await page.$('.acct-nav-cross')
  check('a student is offered no way into the admin', cross === null)

  const real = errors.filter(
    (e) => !/favicon|Vue Devtools|Failed to load resource|401 \(Unauthorized\)|404/i.test(e),
  )
  check('no console errors or warnings', real.length === 0, real.slice(0, 3).join(' | '))
} finally {
  await cleanUp()
}

console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
