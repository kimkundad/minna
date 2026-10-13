/**
 * Staff chat, in a browser, both sides at once.
 *
 *   node scripts/flow-chat.mjs
 *
 * Two windows: a teacher and an admin, signed in at the same time. The teacher
 * writes, the admin answers, and the teacher's page has to show the answer
 * without being reloaded — which is the only way to tell whether the event
 * stream is actually carrying anything, as opposed to the page simply being
 * right the next time it is opened.
 *
 * The accounts are made and deleted here. They are `smoke-*@example.com`, so
 * the cleanup script's guard accepts them and nothing real can be hit.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { launchBrowser } from './browser.mjs'

const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const API_DIR = new URL('../../api/', import.meta.url).pathname.replace(/^\//, '')

/** A 1x1 PNG. Small enough to be instant, real enough to be an image. */
const DOT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const stamp = Date.now()
const password = 'Str0ng-Pass!2026'
const emails = {
  teacher: `smoke-chatui-t${stamp}@example.com`,
  admin: `smoke-chatui-a${stamp}@example.com`,
  /** A teacher nobody has ever written to, so the admin has to start it. */
  quiet: `smoke-chatui-q${stamp}@example.com`,
}

/** Distinctive, so the search box can pick these out of the real list. */
const QUIET_NAME = `Zephyrine${stamp}`
const TEACHER_NAME = `Aurelio${stamp}`

let failed = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

async function account(email, role, firstName = 'ทด') {
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
  execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, role], {
    cwd: API_DIR,
    shell: true,
    stdio: 'ignore',
  })
}

/** A signed-in page on /chat, each in its own context so the two sessions do
 *  not share a refresh cookie and sign each other out. */
async function signIn(browser, email) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: 1500, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    // The browser logs the failed bootstrap refresh too; same story as below.
    if ((m.location()?.url ?? '').endsWith('/auth/refresh')) return
    errors.push(m.text())
  })
  // Which call failed, not only that one did — a 401 on the bootstrap before
  // signing in is expected, and a 401 on the chat is not.
  page.on('response', (r) => {
    // A 401 on the bootstrap refresh is how the app finds out nobody is signed
    // in yet. Every other failed call is worth failing the run over.
    if (r.status() === 401 && r.url().endsWith('/auth/refresh')) return
    if (r.status() >= 400) errors.push(r.status() + ' ' + r.url())
  })

  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 20000 })

  await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle2' })
  await wait(1500)
  return { context, page, errors }
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

/** The bubbles, in order, as text. */
const bubbles = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#chat-draft')].length
      ? [...document.querySelectorAll('p.whitespace-pre-wrap')].map((p) => p.innerText.trim())
      : [],
  )

/** Types into the list's filter, replacing whatever was there. */
async function search(page, text) {
  await page.click('#chat-search')
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  if (text) await page.type('#chat-search', text)
  await wait(400)
}

async function say(page, text) {
  await page.waitForSelector('#chat-draft', { timeout: 10000 })
  await page.click('#chat-draft')
  await page.type('#chat-draft', text)
  await page.keyboard.press('Enter')
}

/** A token, for the parts of the setup that have no business being clicked. */
async function apiLogin(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`)
  return (await res.json()).accessToken
}

const apiCall = (path, token, init = {}) =>
  fetch(API + path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      Authorization: `Bearer ${token}`,
    },
  })

await account(emails.teacher, 'teacher', TEACHER_NAME)
await account(emails.admin, 'admin')
await account(emails.quiet, 'teacher', QUIET_NAME)

/**
 * A backlog, so the transcript is taller than the window.
 *
 * Without it there is nothing to scroll and the check below would pass on an
 * empty conversation, which proves nothing.
 */
const teacherToken = await apiLogin(emails.teacher)
const adminToken = await apiLogin(emails.admin)
const threadId = (await (await apiCall('/me/chats', teacherToken, { method: 'POST', body: '{}' })).json())
  .data.id
for (let n = 1; n <= 30; n++) {
  await apiCall(`/me/chats/${threadId}/messages`, adminToken, {
    method: 'POST',
    body: JSON.stringify({ body: `เก่า ${n}` }),
  })
}

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

let teacher
let admin
try {
  /* ---------------- the teacher's side ---------------- */

  teacher = await signIn(browser, emails.teacher)
  check(
    'a teacher lands on a conversation with the school',
    await teacher.page.evaluate(() => document.body.innerText.includes('ทีมงาน Minna')),
  )
  // Opening a conversation should put you at the newest message, the way
  // every chat does — not at the top of a month of backlog.
  const scrolled = await teacher.page.evaluate(() => {
    const box = [...document.querySelectorAll('div')].find(
      (d) => d.scrollHeight > d.clientHeight + 50 && d.className.includes('overflow-y-auto'),
    )
    if (!box) return null
    return {
      fromBottom: Math.round(box.scrollHeight - box.scrollTop - box.clientHeight),
      overflowing: box.scrollHeight - box.clientHeight,
    }
  })
  check('  there is a backlog to scroll through', (scrolled?.overflowing ?? 0) > 200, JSON.stringify(scrolled))
  check(
    '  and it opens at the newest message',
    (scrolled?.fromBottom ?? 999) < 5,
    JSON.stringify(scrolled),
  )
  check(
    '  showing the last line of it',
    await teacher.page.evaluate(() => document.body.innerText.includes('เก่า 30')),
  )

  check(
    '  and is shown no list of other teachers',
    await teacher.page.evaluate(() => !document.querySelector('#chat-search')),
  )

  await say(teacher.page, 'ขอสอบถามเรื่องคอร์สครับ')
  await wait(1200)
  check(
    '  what they write appears',
    (await bubbles(teacher.page)).includes('ขอสอบถามเรื่องคอร์สครับ'),
    JSON.stringify(await bubbles(teacher.page)),
  )

  /* ---------------- the admin's side ---------------- */

  admin = await signIn(browser, emails.admin)
  check(
    'an admin gets a list to search',
    await admin.page.evaluate(() => Boolean(document.querySelector('#chat-search'))),
  )

  // The waiting conversation is the one that should be open already.
  const opened = await bubbles(admin.page)
  check(
    '  opened on whoever is waiting',
    opened.includes('ขอสอบถามเรื่องคอร์สครับ'),
    JSON.stringify(opened),
  )

  await say(admin.page, 'ได้ครับ สอบถามได้เลย')
  await wait(1200)
  check('  and the answer sends', (await bubbles(admin.page)).includes('ได้ครับ สอบถามได้เลย'))

  /* ---------------- the stream ---------------- */

  // No reload. The teacher's page has been sitting there the whole time.
  await teacher.page.waitForFunction(
    () => document.body.innerText.includes('ได้ครับ สอบถามได้เลย'),
    { timeout: 15000, polling: 500 },
  )
  check('the answer reaches the teacher without a reload', true)

  /* ---------------- the admin writing first ---------------- */

  /**
   * A teacher nobody has written to has no thread yet, so their row carries no
   * id. Opening them has to make one — otherwise the composer posts to thread
   * zero and the API rejects it out of hand.
   */
  await search(admin.page, QUIET_NAME)
  await admin.page.evaluate(() => document.querySelector('#chat-search').closest('aside').querySelector('ul button').click())
  await wait(1500)
  await say(admin.page, 'สวัสดีครับ อาจารย์')
  await wait(1500)
  check(
    'an admin can write first to a teacher with no conversation yet',
    (await bubbles(admin.page)).includes('สวัสดีครับ อาจารย์'),
    JSON.stringify(await bubbles(admin.page)),
  )

  /* ---------------- somebody else writing meanwhile ---------------- */

  /**
   * The admin is reading one teacher while another writes. The open
   * conversation is on the stream; the rest of the list is not, so it has to
   * find out by asking — and until it does, nothing on screen says anything
   * happened.
   */
  await apiCall(`/me/chats/${threadId}/messages`, teacherToken, {
    method: 'POST',
    body: JSON.stringify({ body: 'ทักมาตอนเปิดห้องอื่นอยู่' }),
  })
  await search(admin.page, TEACHER_NAME)
  const noticed = await admin.page
    .waitForFunction(
      () => {
        const list = document.querySelector('#chat-search').closest('aside')
        const row = list.querySelector('ul li')
        return row ? /\b[1-9]\d*\b/.test(row.innerText.split('\n').pop() ?? '') : false
      },
      { timeout: 25000, polling: 500 },
    )
    .then(() => true)
    .catch(() => false)
  check('  another teacher writing shows up as unread in the list', noticed)
  await admin.page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/chat-unread.png' })

  /* ---------------- following the notification ---------------- */

  /**
   * The bell is on every page, this one included — so clicking a chat notice
   * while already looking at another conversation changes only the query, and
   * nothing remounts. Reading the thread id once at load is not enough, and
   * the link would quietly do nothing.
   */
  await search(admin.page, '')
  const before = new URL(admin.page.url()).searchParams.get('thread')

  await admin.page.click('button[aria-expanded][aria-label*="การแจ้งเตือน"], button[aria-expanded][aria-label*="รายการใหม่"]')
  await wait(600)
  const clicked = await admin.page.evaluate(() => {
    const panel = document.querySelector('div[role="dialog"][aria-label="การแจ้งเตือน"]')
    const row = [...(panel?.querySelectorAll('li button') ?? [])].find((b) =>
      b.innerText.includes('มีข้อความใหม่จาก'),
    )
    if (!row) return false
    row.click()
    return true
  })
  check('the bell holds the chat notice', clicked)

  const arrived = await admin.page
    .waitForFunction(
      (was) => {
        const now = new URLSearchParams(location.search).get('thread')
        return (
          location.pathname === '/chat' &&
          now !== was &&
          document.body.innerText.includes('ทักมาตอนเปิดห้องอื่นอยู่')
        )
      },
      { timeout: 15000, polling: 300 },
      before,
    )
    .then(() => true)
    .catch(() => false)
  check('  and following it opens that conversation, from the chat page itself', arrived)

  // The same link from somewhere else entirely, as a teacher — who has one
  // conversation and so reaches it by arriving at the page at all.
  await teacher.page.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
  await say(admin.page, 'ตอบกลับให้แล้วนะครับ')
  await wait(1500)
  await teacher.page.waitForFunction(
    () => {
      const bell = document.querySelector('button[aria-expanded][aria-label*="รายการใหม่"]')
      if (!bell) return false
      bell.click()
      return true
    },
    // The bell polls once a minute, so this is the wait for one round of
    // that — not a hopeful pause.
    { timeout: 75000, polling: 2000 },
  )
  await wait(600)
  const teacherFollowed = await teacher.page
    .evaluate(() => {
      const panel = document.querySelector('div[role="dialog"][aria-label="การแจ้งเตือน"]')
      const row = [...(panel?.querySelectorAll('li button') ?? [])].find((b) =>
        b.innerText.includes('มีข้อความใหม่จากทีมงาน'),
      )
      if (!row) return false
      row.click()
      return true
    })
  check('a teacher gets the same notice', teacherFollowed)
  const teacherArrived = await teacher.page
    .waitForFunction(
      () =>
        location.pathname === '/chat' &&
        document.body.innerText.includes('ตอบกลับให้แล้วนะครับ'),
      { timeout: 15000, polling: 300 },
    )
    .then(() => true)
    .catch(() => false)
  check('  and following it lands in the conversation', teacherArrived)

  /* ---------------- a picture ---------------- */

  /**
   * The one that was wrong first time round: a picture you have just sent has
   * to be a picture, not its own filename. The signed link is fetched after
   * the bubble is on screen, so this is really a test of whether anything
   * notices the message arriving.
   */
  const picture = `${process.env.TEMP ?? '.'}/chat-flow-dot.png`
  writeFileSync(picture, Buffer.from(DOT_PNG, 'base64'))

  const chooser = await teacher.page.$('input[type="file"]')
  await chooser.uploadFile(picture)
  // Straight to the store and back; a kilobyte, but over a real network.
  await teacher.page.waitForFunction(
    () => Boolean(document.querySelector('img[alt$=".png"]')),
    { timeout: 30000, polling: 500 },
  )
  check('a picture sent shows as a picture, not a filename', true)

  await admin.page.waitForFunction(() => Boolean(document.querySelector('img[alt$=".png"]')), {
    timeout: 20000,
    polling: 500,
  })
  check('  and reaches the other side the same way', true)

  /**
   * Reopening with a picture in the transcript.
   *
   * This is the case a single scroll after render misses: the bubbles are laid
   * out, the view goes to the bottom, and then the picture's signed link
   * arrives and makes everything taller under it.
   */
  await teacher.page.reload({ waitUntil: 'networkidle2' })
  await teacher.page.waitForFunction(() => Boolean(document.querySelector('img[alt$=".png"]')), {
    timeout: 30000,
    polling: 300,
  })
  await wait(800)
  const afterPicture = await teacher.page.evaluate(() => {
    const box = [...document.querySelectorAll('div')].find(
      (d) => d.scrollHeight > d.clientHeight + 50 && d.className.includes('overflow-y-auto'),
    )
    return box ? Math.round(box.scrollHeight - box.scrollTop - box.clientHeight) : null
  })
  check(
    '  and reopening still lands at the bottom, picture and all',
    (afterPicture ?? 999) < 5,
    String(afterPicture),
  )

  await teacher.page.screenshot({
    path: 'C:/Users/brack/AppData/Local/Temp/shots/chat-teacher.png',
  })
  await admin.page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/chat-admin.png' })

  check('nothing threw on the teacher page', teacher.errors.length === 0, teacher.errors.join(' | '))
  check('nothing threw on the admin page', admin.errors.length === 0, admin.errors.join(' | '))
} finally {
  await browser.close()
  // One address per call: the script takes one, and checks it against the
  // test-account pattern before it deletes anything.
  for (const email of [emails.teacher, emails.admin, emails.quiet]) {
    execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', email], {
      cwd: API_DIR,
      shell: true,
      stdio: 'inherit',
    })
  }
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
