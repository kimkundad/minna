/**
 * The way from the public site across to the admin.
 *
 *   node scripts/flow-teaching.mjs [baseUrl]
 *
 * A teacher approved this morning has an account that just gained a role which
 * unlocks a different app on a different address. Nothing else on the public
 * site points at it, so if this link is missing they are approved and stuck.
 *
 * Each account gets its own browser context: the refresh cookie from one would
 * otherwise leave the next page already signed in, and the test would be
 * reading the wrong person's sidebar.
 *
 * Deletes both accounts at the end, pass or fail.
 */
import { execFileSync } from 'node:child_process'
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:5173'


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const stamp = Date.now()
const student = `flow-teaching-s${stamp}@example.com`
const teacher = `flow-teaching-t${stamp}@example.com`
const password = 'Str0ng-Pass!2026'

async function register(email) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '1990-05-05',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  if (!res.ok) {
    console.error(`could not register ${email}:`, res.status, await res.text())
    process.exit(1)
  }
}

await register(student)
await register(teacher)
// The role an approved application grants. Granting it directly keeps this
// test about the link rather than about the admin's review screen.
execFileSync('npx', ['tsx', 'scripts/grant-role.mts', teacher, 'teacher'], {
  cwd: '../api',
  shell: true,
  stdio: 'ignore',
})
console.log(`  student: ${student}\n  teacher: ${teacher}\n`)

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

const errors = []

async function sidebarOf(email) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: 1440, height: 1100 })
  page.on('pageerror', (e) => errors.push(String(e.message)))
  page.on('console', (m) => {
    if (m.type() === 'warning') errors.push('warn: ' + m.text())
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.hdr-auth button', { timeout: 15000 })
  await page.click('.hdr-auth button')
  await page.waitForSelector('input[type="password"]', { timeout: 15000 })
  await page.type('input[type="email"]', email, { delay: 6 })
  await page.type('input[type="password"]', password, { delay: 6 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), {
    timeout: 15000,
  })

  await page.goto(`${BASE}/th/account`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.acct-nav', { timeout: 15000 })
  const found = await page.evaluate(() => {
    const a = document.querySelector('.acct-nav-cross')
    return a ? { text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') } : null
  })
  const role = await page.$eval('.acct-id p, .acct-id small, .acct-who', (e) => e.textContent.trim())
    .catch(() => '')
  await page.close()
  await ctx.close()
  return { found, role }
}

try {
  const asStudent = await sidebarOf(student)
  check('a student is offered no way into the admin', asStudent.found === null, JSON.stringify(asStudent.found))

  const asTeacher = await sidebarOf(teacher)
  check('a teacher is', asTeacher.found !== null, JSON.stringify(asTeacher.found))
  check(
    '  and it points at the admin, not the public site',
    asTeacher.found?.href === ADMIN,
    String(asTeacher.found?.href),
  )
  check(
    '  with a label that says what is on the other side',
    /จัดการสอน|Teaching/i.test(asTeacher.found?.text ?? ''),
    asTeacher.found?.text,
  )

  const real = errors.filter(
    (e) => !/favicon|Vue Devtools|Failed to load resource|401 \(Unauthorized\)|404/i.test(e),
  )
  check('no console errors or warnings', real.length === 0, real.slice(0, 3).join(' | '))
} finally {
  await browser.close().catch(() => {})
  for (const email of [student, teacher]) {
    try {
      execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', email], {
        cwd: '../api',
        shell: true,
        stdio: 'ignore',
      })
    } catch {
      console.log(`  !! could not delete ${email} — remove it by hand`)
    }
  }
  console.log('\n  cleaned up both accounts')
}

console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
