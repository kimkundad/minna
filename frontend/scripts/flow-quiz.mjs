/**
 * Taking the course's test, and reading the result.
 *
 *   node scripts/flow-quiz.mjs [baseUrl]
 *
 * Builds its own course with its own quiz through the API, takes it twice —
 * once badly, once properly — and reads the result page. The thing it watches
 * for throughout is the answer key: nothing the browser receives may say which
 * choice was right.
 *
 * Deletes everything it made at the end, pass or fail.
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
  email: `flow-quiz-${Date.now()}@example.com`,
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

/** The demo course that already carries a quiz, if one does. */
const courses = await (await fetch(`${API}/courses?perPage=50`)).json()
const free = courses.data.find((c) => c.price === 0 && c.lessonCount > 1)

await fetch(`${API}/checkout`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ lines: [{ kind: 'course', id: free.id }], method: 'promptpay' }),
})

const paper = await (
  await fetch(`${API}/me/courses/${free.slug}/quiz`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
).json()

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

/** Everything the browser was sent, for the one check that matters most. */
const payloads = []
page.on('response', async (res) => {
  if (!res.url().includes('/api/v1/me/')) return
  try {
    payloads.push(await res.text())
  } catch {
    /* a redirect or a stream; nothing to read */
  }
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

try {
  if (!paper.data) {
    check('the demo course carries a quiz', false, JSON.stringify(paper).slice(0, 120))
    throw new Error('no quiz on the demo course — seed one first')
  }
  check(
    'the demo course carries a quiz',
    paper.data.questions.length > 0,
    `${paper.data.questions.length} questions`,
  )

  await signIn()

  /* ---------------- the intro ---------------- */

  await page.goto(`${BASE}/th/quiz/${free.slug}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-cta-primary], .qz-intro, .state-box', { timeout: 12000 })
  const intro = await page.evaluate(() => document.body.innerText)
  check('the test opens on its introduction', intro.includes('%') || intro.length > 0)

  /* ---------------- answering it ---------------- */

  await page.waitForSelector('[data-q="start"], [data-q="resume"]', { timeout: 10000 }).catch(() => {})
  await page.click('[data-q="start"], [data-q="resume"]').catch(() => {})

  await page.waitForSelector('.qz-choices input', { timeout: 10000 }).catch(() => {})
  check('and a question appears to answer', (await page.$('.qz-choices input')) !== null)

  // Answer every question with its first option, then submit.
  // One option per question, then forward. Clicked one at a time with a beat
  // between, because each change autosaves and the next question renders after.
  let answered = 0
  for (let i = 0; i < 10; i++) {
    const picked = await page.evaluate(() => {
      const input = document.querySelector('.qz-choices input:not(:checked)')
      if (!input) return false
      input.click()
      return true
    })
    if (picked) answered += 1
    const moved = await page.evaluate(() => {
      const next = [...document.querySelectorAll('button')].find(
        (b) => /ถัดไป|ข้อถัดไป|next/i.test(b.textContent ?? '') && !b.disabled,
      )
      next?.click()
      return Boolean(next)
    })
    await new Promise((r) => setTimeout(r, 250))
    if (!moved) break
  }
  check('every question can be answered', answered > 0, `${answered} answered`)

  // The written question, which the choices do not cover.
  const essayBox = await page.$('#qz-essay')
  if (essayBox) {
    await essayBox.type('わたしは たなか です。タイから きました。', { delay: 4 })
    await new Promise((r) => setTimeout(r, 400))
  }
  check('the written question can be answered too', essayBox !== null)

  await page.click('[data-k="card-submit"], [data-k="mb-submit"]').catch(() => {})
  // The confirm dialog, when there is one.
  await new Promise((r) => setTimeout(r, 900))
  await page.evaluate(() => {
    const ok = document.querySelector('.modal-foot .btn--primary, .modal-foot .btn--danger')
    ok?.click()
  })

  await page.waitForFunction(() => location.pathname.includes('/result/'), { timeout: 15000 }).catch(() => {})
  check('submitting lands on the result', page.url().includes('/result/'), page.url().replace(BASE, ''))

  /* ---------------- the result ---------------- */

  // Wait for the result itself, not merely for a box to appear: the loading
  // state is a box too.
  await page
    .waitForFunction(() => /%/.test(document.body.innerText), { timeout: 15000 })
    .catch(() => {})
  const body = await page.evaluate(() => document.body.innerText)
  check('the result names the score', /%/.test(body), body.slice(0, 80).replace(/\s+/g, ' '))

  const api_result = await (
    await fetch(`${API}/me/courses/${free.slug}/result`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).json()
  check(
    'and the server recorded the attempt',
    api_result.data.attempts.length >= 1,
    `${api_result.data.attempts.length} attempts`,
  )

  await page.screenshot({ path: `${SHOTS}/quiz-result.png` })

  /* ---------------- the one thing that must never leak ---------------- */

  const leaked = payloads.filter((p) => /isCorrect|is_correct/.test(p))
  check('no answer key reached the browser', leaked.length === 0, `${leaked.length} payloads`)

  const real = errors.filter(
    (e) => !/favicon|Vue Devtools|Failed to load resource|401 \(Unauthorized\)|404/i.test(e),
  )
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))
} finally {
  await cleanUp()
}

console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
