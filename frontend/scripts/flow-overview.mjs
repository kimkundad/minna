/**
 * The account landing page, on real data.
 *
 *   node scripts/flow-overview.mjs [baseUrl]
 *
 * Enrols a throwaway member on two free courses and watches one lesson, so the
 * page has a shelf, a count that can be checked against the API, and a row to
 * carry on from. What it mostly watches for is the prototype: this page used to
 * greet everybody as a veterinarian called พิมพ์ชนก, announce a package nobody
 * can buy, and link to a course id that does not exist.
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
  email: `flow-overview-${Date.now()}@example.com`,
  password: 'Str0ng-Pass!2026',
  firstName: 'สมหญิง',
  lastName: 'ใจดี',
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

const auth = { Authorization: `Bearer ${accessToken}` }
const json = { 'Content-Type': 'application/json; charset=utf-8', ...auth }

const catalog = await (await fetch(`${API}/courses?perPage=60`)).json()
const freebies = catalog.data.filter((c) => c.price === 0).slice(0, 2)
for (const c of freebies) {
  await fetch(`${API}/checkout`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ lines: [{ kind: 'course', id: c.id }], method: 'promptpay' }),
  })
}

/** Part of one lesson watched, so one course is genuinely in progress. */
const shelf = await (await fetch(`${API}/me/courses`, { headers: auth })).json()
const started = shelf.data?.[0]
if (started?.progress?.resume) {
  const saved = await fetch(`${API}/me/lessons/${started.progress.resume.id}/progress`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify({ positionSeconds: 90 }),
  })
  if (!saved.ok) console.log(`  !! could not record progress: ${saved.status}`)
}
const after = await (await fetch(`${API}/me/courses`, { headers: auth })).json()
const api = after.data ?? []

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1300 })

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
  check('the API gave the member a shelf', api.length === 2, `${api.length} courses`)

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

  /* ---------------- no fabricated count over the bell ---------------- */

  const bell = await page.$eval('.hdr-bell', (e) => ({
    badge: e.querySelector('.count-badge')?.textContent ?? null,
  })).catch(() => ({ badge: null }))
  check('the bell carries no made-up count', bell.badge === null, String(bell.badge))

  /* ---------------- the page ---------------- */

  await page.goto(`${BASE}/th/account`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.acct-welcome', { timeout: 15000 })
  await page.waitForFunction(() => !/กำลังโหลด|Loading/.test(document.body.innerText), {
    timeout: 15000,
  }).catch(() => {})

  const body = await page.evaluate(() => document.body.innerText)

  check(
    'it greets the member by their own name',
    body.includes(`${member.firstName} ${member.lastName}`) || body.includes(member.firstName),
    (await page.$eval('#ov-welcome-h', (e) => e.textContent.trim()).catch(() => '')),
  )
  check(
    'and not the prototype veterinarian',
    !/พิมพ์ชนก|วัฒนศิริ|สัตวแพทย์|Veterinarian/.test(body),
  )
  check('nor a package nobody can buy', !/แพ็กเกจปัจจุบัน|อ่านเฉพาะออนไลน์/.test(body))
  check('nor invented notifications', !/Ultrasound|Essay ผ่าน|สิทธิ์เรียนหมดอายุแล้ว/.test(body))

  /* ---------------- the counts match the API ---------------- */

  const stats = await page.$$eval('.acct-stat', (els) =>
    els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
  )
  check('three summary tiles', stats.length === 3, stats.join(' | '))

  const apiInProgress = api.filter((i) => i.group === 'in-progress').length
  const apiDone = api.filter((i) => i.progress.pct >= 100).length
  const nums = await page.$$eval('.acct-stat--sm .stat-value', (els) =>
    els.map((e) => Number(e.textContent.replace(/\D/g, ''))),
  )
  check(
    'the "in progress" count is the API\'s',
    nums[0] === apiInProgress,
    `page ${nums[0]} vs api ${apiInProgress}`,
  )
  check('the "finished" count is the API\'s', nums[1] === apiDone, `page ${nums[1]} vs api ${apiDone}`)

  const totalLessons = api.reduce((n, i) => n + i.progress.total, 0)
  const doneLessons = api.reduce((n, i) => n + i.progress.done, 0)
  const wide = await page.$eval('.acct-stat--third', (e) => e.innerText.replace(/\s+/g, ' ').trim())
  check(
    'and the shelf tile counts the real lessons',
    wide.includes(String(totalLessons)) && wide.includes(String(api.length)),
    wide,
  )
  check('  with the lessons actually done', wide.includes(String(doneLessons)), String(doneLessons))

  /* ---------------- the resume rows go somewhere real ---------------- */

  const rows = await page.$$eval('.acct-rs', (els) =>
    els.map((e) => ({
      title: e.querySelector('.acct-rs-title')?.textContent?.trim(),
      links: [...e.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    })),
  )
  check('there is something to carry on with', rows.length > 0, `${rows.length} rows`)
  const slugs = api.map((i) => i.course.slug)
  check(
    'every link points at a course that exists',
    rows.every((r) => r.links.every((h) => !/COURSE-\d+/.test(h ?? ''))),
    JSON.stringify(rows[0]?.links ?? []),
  )
  check(
    '  by its real slug',
    rows.every((r) => slugs.some((s) => (r.links[0] ?? '').includes(s))),
    slugs.join(', '),
  )

  // And the continue button actually opens the lesson player.
  const cta = rows[0]?.links?.find((h) => (h ?? '').includes('/learn/'))
  check('the continue button goes to the player', Boolean(cta), String(cta))
  if (cta) {
    await page.goto(`${BASE}${cta}`, { waitUntil: 'networkidle2' })
    await new Promise((r) => setTimeout(r, 1200))
    const learn = await page.evaluate(() => document.body.innerText)
    check(
      '  and the player opens the course, not a dead end',
      !/ไม่พบ|not found|404/i.test(learn.slice(0, 400)),
      learn.slice(0, 60).replace(/\s+/g, ' '),
    )
  }

  await page.goto(`${BASE}/th/account`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.acct-welcome', { timeout: 10000 })
  await page.screenshot({ path: `${SHOTS}/overview.png`, fullPage: true })

  const real = errors.filter(
    (e) => !/favicon|Vue Devtools|Failed to load resource|401 \(Unauthorized\)|404/i.test(e),
  )
  check('no console errors or warnings', real.length === 0, real.slice(0, 3).join(' | '))
} finally {
  await cleanUp()
}

console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
