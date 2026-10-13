/**
 * A learner asking the school, and the school passing it on.
 *
 *   node scripts/flow-student-chat.mjs [baseUrl]
 *
 * Three windows at once: a learner on the site, an admin in the back office,
 * and a teacher. The learner writes, the admin reads it under ผู้เรียน and
 * relays it, and the teacher gets the question — without the learner's name
 * anywhere on it.
 *
 * That last check is the point of the whole arrangement. A teacher who knows
 * whose work they are about to mark can be offered something for the answer,
 * so the question travels and the asker does not.
 *
 * Deletes the three accounts at the end, pass or fail.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:5173'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const SHOTS = process.env.SHOT_DIR ?? 'C:/Users/brack/AppData/Local/Temp/shots'
const API_DIR = new URL('../../api/', import.meta.url).pathname.replace(/^\//, '')


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

/** A 1x1 PNG. Small enough to be instant, real enough to be an image. */
const DOT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const stamp = Date.now()
const password = 'Str0ng-Pass!2026'
const emails = {
  learner: `smoke-ask-l${stamp}@example.com`,
  teacher: `smoke-ask-t${stamp}@example.com`,
  admin: `smoke-ask-a${stamp}@example.com`,
}
/** Distinctive, so "the teacher was not told who asked" is a real check. */
const LEARNER_NAME = `Chalisa${stamp}`
const TEACHER_NAME = `Watcharin${stamp}`
const QUESTION = `ข้อ 7 ทำไมใช้รูปนี้ครับ ${stamp}`

async function account(email, role, firstName) {
  const made = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName,
      lastName: 'สอบ',
      birthdate: '1990-01-01',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  if (!made.ok) throw new Error(`register ${email}: ${made.status} ${await made.text()}`)
  if (role) {
    execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, role], {
      cwd: API_DIR,
      shell: true,
      stdio: 'ignore',
    })
  }
}

await account(emails.learner, null, LEARNER_NAME)
await account(emails.teacher, 'teacher', TEACHER_NAME)
await account(emails.admin, 'admin', 'แอด')

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

/**
 * A signed-in page, in its own context so three sessions do not sign each
 * other out.
 *
 * The two apps are entered differently: the admin has a sign-in page, and the
 * site opens a dialog from the header. Same credentials, same API behind both.
 */
async function session(where, email, landOn) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: 1500, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('response', (r) => {
    if (r.status() === 401 && r.url().endsWith('/auth/refresh')) return
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
  })

  if (where === 'site') {
    await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('.hdr-auth button', { timeout: 15000 })
    await page.click('.hdr-auth button')
    await page.waitForSelector('input[type="password"]', { timeout: 15000 })
  } else {
    await page.goto(`${ADMIN}/signin`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('input[type="password"]', { timeout: 15000 })
  }

  await page.type('input[type="email"]', email, { delay: 8 })
  await page.type('input[type="password"]', password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), {
    timeout: 25000,
  })

  await page.goto(landOn, { waitUntil: 'networkidle2' })
  await wait(1800)
  return { page, errors }
}

async function say(page, text) {
  await page.waitForSelector('#chat-draft', { timeout: 15000 })
  await page.click('#chat-draft')
  await page.type('#chat-draft', text)
  await page.keyboard.press('Enter')
  await wait(1500)
}

let learner
let admin
let teacher
try {
  /* ---------------- the learner asks ---------------- */

  learner = await session('site', emails.learner, `${BASE}/th/account/messages`)
  check(
    'a learner has a conversation on the site',
    await learner.page.evaluate(() => Boolean(document.querySelector('#chat-draft'))),
  )
  check(
    '  told plainly that the school relays, not the teacher',
    await learner.page.evaluate(() => document.body.innerText.includes('ไม่บอกชื่อผู้ถาม')),
  )

  await say(learner.page, QUESTION)
  check(
    '  and what they write appears',
    await learner.page.evaluate((q) => document.body.innerText.includes(q), QUESTION),
  )
  // A photograph of the question is the natural way to ask about a worksheet,
  // so it has to work from the site and not only from the back office.
  const picture = `${process.env.TEMP ?? '.'}/ask-flow-dot.png`
  writeFileSync(picture, Buffer.from(DOT_PNG, 'base64'))
  const chooser = await learner.page.$('input[type="file"]')
  await chooser.uploadFile(picture)
  const sentPicture = await learner.page
    .waitForFunction(() => Boolean(document.querySelector('.chat-bubble img')), {
      timeout: 30000,
      polling: 500,
    })
    .then(() => true)
    .catch(() => false)
  check('  and they can send a picture of what they are asking about', sentPicture)

  await learner.page.screenshot({ path: `${SHOTS}/ask-learner.png` })

  /* ---------------- the school reads it ---------------- */

  admin = await session('admin', emails.admin, `${ADMIN}/chat`)
  // Learners are a second list, not mixed in with the teachers.
  const switched = await admin.page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find((b) =>
      b.innerText.trim().startsWith('ผู้เรียน'),
    )
    if (!tab) return false
    tab.click()
    return true
  })
  check('the admin has a learners tab', switched)
  await wait(1200)

  const opened = await admin.page.evaluate((name) => {
    const list = document.querySelector('#chat-search')?.closest('aside')
    const row = [...(list?.querySelectorAll('ul button') ?? [])].find((b) =>
      b.innerText.includes(name),
    )
    if (!row) return false
    row.click()
    return true
  }, LEARNER_NAME)
  check('  with the learner who just wrote in it', opened)
  await wait(1800)
  check(
    '  and the question is readable',
    await admin.page.evaluate((q) => document.body.innerText.includes(q), QUESTION),
  )

  /* ---------------- and passes it on ---------------- */

  const relayOpened = await admin.page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.innerText.trim() === 'ส่งต่อให้ผู้สอน',
    )
    if (!button) return false
    button.click()
    return true
  })
  check('a learner message offers to be passed on', relayOpened)
  await wait(600)

  const picked = await admin.page.evaluate((name) => {
    const select = document.querySelector('#relay-to')
    const option = [...(select?.options ?? [])].find((o) => o.text.includes(name))
    if (!select || !option) return false
    select.value = option.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, TEACHER_NAME)
  check('  to a teacher of the admin’s choosing', picked)

  await admin.page.screenshot({ path: `${SHOTS}/ask-relay.png` })
  await admin.page.evaluate(() => {
    const send = [...document.querySelectorAll('button')].find(
      (b) => b.innerText.trim() === 'ส่งต่อ',
    )
    send?.click()
  })
  await wait(2000)

  /* ---------------- the teacher gets a question, not a name ------------- */

  teacher = await session('admin', emails.teacher, `${ADMIN}/chat`)
  const seen = await teacher.page.evaluate(() => document.body.innerText)
  check('the teacher receives the question', seen.includes(QUESTION), seen.slice(0, 80))
  check('  marked as coming from a learner', seen.includes('คำถามจากผู้เรียน'))

  // The one that matters.
  check(
    '  but naming nobody',
    !seen.includes(LEARNER_NAME),
    seen.includes(LEARNER_NAME) ? 'the learner’s name is on the page' : '',
  )
  check(
    '  and carrying no id to look them up by',
    await teacher.page.evaluate(() => !document.body.innerHTML.includes('forwardedFromId')),
  )
  await teacher.page.screenshot({ path: `${SHOTS}/ask-teacher.png` })

  check('nothing threw on the learner page', learner.errors.length === 0, learner.errors.join(' | '))
  check('nothing threw on the admin page', admin.errors.length === 0, admin.errors.join(' | '))
  check('nothing threw on the teacher page', teacher.errors.length === 0, teacher.errors.join(' | '))
} finally {
  await browser.close()
  for (const email of Object.values(emails)) {
    execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', email], {
      cwd: API_DIR,
      shell: true,
      stdio: 'inherit',
    })
  }
}

console.log(failures ? `\n  ${failures} failing\n` : '\n  all good\n')
process.exit(failures ? 1 : 0)
