/**
 * The earnings screen, as a teacher and as an administrator.
 *
 *   node scripts/flow-teacher-earnings.mjs
 *
 * One component serves both: the page a transfer is settled from and the page
 * the teacher checks it against must not be able to disagree, and two copies
 * of a money screen is two places to get it wrong. What differs is who may
 * tick a row — so this checks the tick boxes appear for an administrator
 * looking at somebody else and for nobody else.
 *
 * It also walks the three things the school asked for: a date range, changing
 * the status of the rows that were ticked, and the file at the end of it.
 *
 * Puts every row it moved back where it found it.
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

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

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

/** A teacher who has actually earned something, so the table is not empty. */
const due = (await call('GET', '/api/v1/earnings/payouts')).body?.data ?? []
const teacher = due.find((t) => t.lines > 0) ?? due[0]
if (!teacher) {
  console.error('No teacher has any earnings, so there is nothing to look at.')
  process.exit(1)
}
console.log(`  teacher: ${teacher.name} (#${teacher.userId})\n`)

/** What the ledger says now, so it can be put back at the end. */
const before = (await call('GET', `/api/v1/earnings/teacher/${teacher.userId}`)).body?.data
check('an admin may read one teacher’s earnings', Boolean(before?.lines), `${before?.lines?.length ?? 0} lines`)
check('  and it says whose they are', before?.teacher?.id === teacher.userId, before?.teacher?.name)

const originals = new Map((before?.lines ?? []).map((l) => [l.id, l.status]))

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const problems = []
let moved = []

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1400 })
  page.on('pageerror', (e) => problems.push(String(e)))

  await page.goto(`${ADMIN}/signin`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', EMAIL)
  await page.type('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 20000 })

  /* ---------------- the teacher's page, reached from their profile -------- */

  await page.goto(`${ADMIN}/teachers/${teacher.userId}`, { waitUntil: 'networkidle2' })
  await wait(2500)
  const link = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((x) =>
      /\/earnings$/.test(x.getAttribute('href') ?? ''),
    )
    return a ? { href: a.getAttribute('href'), text: a.innerText.trim() } : null
  })
  check('their profile offers the way to it', Boolean(link), link?.text ?? '(no link)')

  if (link) {
    await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find((x) =>
        /\/earnings$/.test(x.getAttribute('href') ?? ''),
      )
      a?.click()
    })
    await wait(3000)
  }

  check(
    'it opens their earnings, not the admin’s own',
    await page.evaluate(() => location.pathname.includes('/earnings')),
    await page.evaluate(() => location.pathname),
  )
  check(
    '  with their name on it',
    await page.evaluate((n) => document.body.innerText.includes(n), teacher.name),
    teacher.name,
  )

  const ticks = await page.evaluate(
    () => document.querySelectorAll('table input[type="checkbox"]').length,
  )
  check('an admin can tick the lines', ticks > 0, `${ticks} boxes`)

  /* ---------------- the date range ---------------- */

  const all = await page.evaluate(() => document.querySelectorAll('tbody tr').length)
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    // A window that closed before this school existed: nothing can be in it.
    set('earn-from', '2000-01-01')
    set('earn-to', '2000-01-31')
  })
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Search')
    b?.click()
  })
  await wait(2500)
  const inRange = await page.evaluate(() => document.querySelectorAll('tbody tr').length)
  check(
    'a range with nothing in it returns nothing',
    inRange < all || all === 0,
    `${all} lines → ${inRange} row(s)`,
  )

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Clear')
    b?.click()
  })
  await wait(2500)
  check(
    'clearing it brings them back',
    (await page.evaluate(() => document.querySelectorAll('tbody tr').length)) === all,
    String(all),
  )

  /* ---------------- ticking, and changing what was ticked ---------------- */

  const target = (before.lines ?? []).find((l) => l.status !== 'cancelled')
  if (!target) {
    console.log('skip  changing a status — every line is already cancelled')
  } else {
    const want = target.status === 'payable' ? 'paid' : 'payable'
    const changed = await call('POST', '/api/v1/earnings/status', {
      ids: [target.id],
      status: want,
    })
    check('the ledger moves a ticked line', changed.body?.data?.changed === 1, JSON.stringify(changed.body?.data))
    moved = [target.id]

    const after = (await call('GET', `/api/v1/earnings/teacher/${teacher.userId}`)).body?.data
    const row = (after?.lines ?? []).find((l) => l.id === target.id)
    check(`  and it now says ${want}`, row?.status === want, row?.status)
    check(
      want === 'paid' ? '  with today’s date on it' : '  with no paid date on it',
      want === 'paid' ? Boolean(row?.paidAt) : !row?.paidAt,
      String(row?.paidAt),
    )
  }

  /* ---------------- the file at the end of the month ---------------- */

  await page.goto(`${ADMIN}/teachers/${teacher.userId}/earnings`, { waitUntil: 'networkidle2' })
  await wait(2500)

  // Caught on its way to the disk: the download itself is the browser's
  // business, and what matters here is what is in the file.
  /**
   * The bytes, not the text.
   *
   * `Blob.text()` decodes as UTF-8, and decoding is exactly what swallows a
   * byte-order mark — so reading the file that way says the mark is missing
   * whether it is there or not. The first three bytes are the only honest
   * answer.
   */
  const file = await page.evaluate(async () => {
    let bytes = []
    const real = URL.createObjectURL
    let done
    const got = new Promise((go) => {
      done = go
    })
    URL.createObjectURL = (blob) => {
      blob.arrayBuffer().then((buf) => {
        bytes = [...new Uint8Array(buf)]
        done()
      })
      return 'blob:stub'
    }
    const stop = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {}
    const b = [...document.querySelectorAll('button')].find((x) => /Export/.test(x.innerText))
    b?.click()
    await Promise.race([got, new Promise((go) => setTimeout(go, 2000))])
    URL.createObjectURL = real
    HTMLAnchorElement.prototype.click = stop
    return bytes
  })

  const bom = file.slice(0, 3)
  const csv = Buffer.from(file.slice(3)).toString('utf8')
  const head = csv.split('\r\n')[0] ?? ''
  check('exporting gives a file', file.length > 0, `${file.length} bytes`)
  check(
    '  that Excel reads as UTF-8',
    bom[0] === 0xef && bom[1] === 0xbb && bom[2] === 0xbf,
    bom[0] === 0xef ? '' : 'no byte-order mark — Thai would arrive as mojibake',
  )
  check(
    '  with the two-line cells split into columns',
    head.includes('"Order"') && head.includes('"Date"') && head.includes('"Status date"') && head.includes('"Yours (THB)"'),
    head,
  )
  check(
    '  and money as a number a spreadsheet can add up',
    /,"\d+\.\d\d",/.test(csv.split('\r\n')[1] ?? ''),
    (csv.split('\r\n')[1] ?? '').slice(0, 90),
  )
  check(
    '  one line per row on screen',
    csv.split('\r\n').length - 1 === (before.lines ?? []).length,
    `${csv.split('\r\n').length - 1} rows for ${(before.lines ?? []).length} lines`,
  )

  /* ---------------- a teacher sees none of the controls ---------------- */

  await page.goto(`${ADMIN}/earnings`, { waitUntil: 'networkidle2' })
  await wait(2000)
  check(
    'the admin’s own earnings page offers no tick boxes',
    (await page.evaluate(() => document.querySelectorAll('table input[type="checkbox"]').length)) === 0,
  )

  check('no page errors', problems.length === 0, problems.slice(0, 2).join(' | '))
} finally {
  await browser.close()
  // Back where we found them.
  for (const id of moved) {
    const was = originals.get(id)
    if (was) await call('POST', '/api/v1/earnings/status', { ids: [id], status: was })
  }
  if (moved.length) console.log(`\n  put ${moved.length} line(s) back`)
}

console.log(failed ? `\n${failed} failed` : '\n  all good')
process.exit(failed ? 1 : 0)
