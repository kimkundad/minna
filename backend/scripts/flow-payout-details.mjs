/**
 * The teacher's own Identity and payouts card, on screen.
 *
 *   node scripts/flow-payout-details.mjs
 *
 * The rules are proved in `api/scripts/smoke-payout-details.mts`. What that
 * cannot say is whether a teacher can reach them — the revenue share sat in a
 * column for months with no form offering it, and nobody noticed.
 *
 * So this signs in as a teacher, fills the card in, saves, reloads, and reads
 * the values back off a fresh page. It also checks the card is not on a
 * student's version of the same page: the wording asks for a passport, and
 * asking somebody for one who will never be paid is worse than useless.
 *
 * Makes its own accounts through the admin API and removes them again.
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
  process.exit(1)
}
token = signedIn.body.accessToken

const stamp = Date.now()
const TEACHER_PW = 'Str0ng-Pass!2026'
const made = {}

async function makeAccount(kind, roles) {
  const email = `smoke-payoutui-${kind}-${stamp}@example.com`
  const res = await call('POST', '/api/v1/members', {
    email,
    password: TEACHER_PW,
    confirmPassword: TEACHER_PW,
    firstName: 'ทด',
    lastName: 'สอบ',
    roles,
  })
  if (res.status !== 201) {
    console.error(`Could not create the ${kind} account:`, res.status, JSON.stringify(res.body))
    process.exit(1)
  }
  made[kind] = { id: res.body.data.id, email }
  return made[kind]
}

const teacher = await makeAccount('teacher', ['teacher'])
const student = await makeAccount('student', ['student'])

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const problems = []

async function signInAs(page, email) {
  await page.goto(`${ADMIN}/signin`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', TEACHER_PW)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 20000 })
}

/** The input under a label, by the label's own words. */
const fillByLabel = (label, value) =>
  `(() => {
     const l = [...document.querySelectorAll('label')].find((x) => x.innerText.trim() === ${JSON.stringify(label)})
     const el = l.parentElement.querySelector('input, select')
     el.value = ${JSON.stringify(value)}
     el.dispatchEvent(new Event('input', { bubbles: true }))
     el.dispatchEvent(new Event('change', { bubbles: true }))
     return true
   })()`

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1500, height: 1200 })
  page.on('pageerror', (e) => problems.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'warning' && /resolve component|failed to resolve/i.test(m.text())) {
      problems.push(m.text())
    }
  })

  await signInAs(page, teacher.email)
  await page.goto(`${ADMIN}/profile`, { waitUntil: 'networkidle2' })
  await page.waitForFunction(
    () => [...document.querySelectorAll('h3')].some((h) => /Identity and payouts/i.test(h.innerText)),
    { timeout: 20000 },
  )
  check('a teacher sees the Identity and payouts card', true)

  const wording = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  check(
    '  with the ID wording the customer asked for',
    wording.includes(
      'Please upload a clear photo or copy of your National ID Card or Passport for identity verification.',
    ),
  )
  check(
    '  and the bank wording',
    wording.includes(
      'Enter your bank information for payouts. Account name must match the full name on your submitted ID/Passport.',
    ),
  )

  const currencyCount = await page.evaluate(() => {
    const l = [...document.querySelectorAll('label')].find((x) => x.innerText.trim() === 'Pay me in')
    return l ? l.parentElement.querySelector('select').options.length : 0
  })
  // The payout list is the school's own, not the eighteen Stripe will take
  // a payment in: where a teacher banks has nothing to do with what a
  // course is priced in.
  check(
    'the payout currency offers the whole payout list, plus no preference',
    currencyCount > 90,
    String(currencyCount),
  )

  await page.evaluate(fillByLabel('Bank', 'กสิกรไทย'))
  await page.evaluate(fillByLabel('Account name', 'ธนา รักดี'))
  await page.evaluate(fillByLabel('Account Number / IBAN', '123-4-56789-0'))
  await page.evaluate(fillByLabel('Pay me in', 'JPY'))

  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find((x) => /Identity and payouts/i.test(x.innerText))
    const form = h.closest('section').querySelector('form')
    form.querySelector('button[type="submit"]').click()
  })
  await new Promise((r) => setTimeout(r, 2500))

  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForFunction(
    () => [...document.querySelectorAll('h3')].some((h) => /Identity and payouts/i.test(h.innerText)),
    { timeout: 20000 },
  )
  await new Promise((r) => setTimeout(r, 1200))

  const back = await page.evaluate(() => {
    const read = (label) => {
      const l = [...document.querySelectorAll('label')].find((x) => x.innerText.trim() === label)
      return l ? l.parentElement.querySelector('input, select').value : null
    }
    return {
      bank: read('Bank'),
      name: read('Account name'),
      number: read('Account Number / IBAN'),
      currency: read('Pay me in'),
    }
  })
  check('what was typed comes back after a reload', back.number === '123-4-56789-0', JSON.stringify(back))
  check('  including the payout currency', back.currency === 'JPY', String(back.currency))

  /* ---------------- a student is not asked for a passport ---------------- */

  // Its own browser context, or the teacher's session comes along: /signin
  // would redirect straight back out and there would be no form to fill.
  const studentContext = await browser.createBrowserContext()
  const studentPage = await studentContext.newPage()
  await studentPage.setViewport({ width: 1500, height: 1200 })
  // Stronger than hiding the card: a student never gets through the door.
  // The admin sign-in turns away anyone who is not staff, so there is no page
  // on which the question of showing them a passport box arises. (That the
  // route itself refuses them is proved in smoke-payout-details.mts.)
  await studentPage.goto(`${ADMIN}/signin`, { waitUntil: 'networkidle2' })
  await studentPage.type('input[type="email"]', student.email)
  await studentPage.type('input[type="password"]', TEACHER_PW)
  await studentPage.click('button[type="submit"]')
  await new Promise((r) => setTimeout(r, 3000))

  const stillOut = await studentPage.evaluate(() => ({
    path: location.pathname,
    said: document.body.innerText.replace(/\s+/g, ' '),
  }))
  check('a student cannot sign in to the admin at all', stillOut.path.endsWith('/signin'), stillOut.path)
  check(
    '  and is told why',
    stillOut.said.includes('does not have access to the admin'),
    stillOut.said.slice(0, 80),
  )

  check('no page errors or unresolved components', problems.length === 0, problems.join(' | '))
} finally {
  await browser.close()
  for (const who of Object.values(made)) {
    await call('DELETE', `/api/v1/members/${who.id}`)
  }
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
