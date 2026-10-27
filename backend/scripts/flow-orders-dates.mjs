/**
 * Finding an order by when it was placed.
 *
 *   node scripts/flow-orders-dates.mjs
 *
 * The Orders list could be narrowed by status, method and a search box, and
 * by nothing else — so "what did March come to" meant paging through
 * everything since. A day to start and a day to end, both inclusive.
 *
 * The inclusive end is the part worth a test. `to` arrives as a day with no
 * time, and comparing against it directly drops everything placed on the last
 * day of the range: the one mistake a from/to box makes that nobody notices
 * until a month's figures are short. So this picks a real order and asks for
 * a range that begins and ends on the day it was placed.
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
async function call(path) {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const signedIn = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (signedIn.status !== 200) {
  console.error(`Could not sign in as ${EMAIL} (${signedIn.status}).`)
  process.exit(1)
}
token = (await signedIn.json()).accessToken

/** Every order, so a real date is known and the counts can be compared. */
const all = await call('/api/v1/orders?perPage=100')
const rows = all.body?.data ?? []
check('the orders list answers', rows.length > 0, `${all.body?.meta?.total ?? 0} orders`)
if (!rows.length) {
  console.error('No orders to search through.')
  process.exit(1)
}

/** `2026-10-23` from whatever the API sends. */
const day = (iso) => new Date(iso).toISOString().slice(0, 10)

const newest = rows[0]
const onThatDay = day(newest.createdAt)
const sameDay = rows.filter((r) => day(r.createdAt) === onThatDay).length

/* ---------------- the API ---------------- */

const exact = await call(`/api/v1/orders?perPage=100&from=${onThatDay}&to=${onThatDay}`)
check(
  'a range of one day finds the orders placed on it',
  (exact.body?.data ?? []).length === sameDay && sameDay > 0,
  `${(exact.body?.data ?? []).length} back, ${sameDay} expected`,
)
check(
  '  and the last day of a range is inside it',
  (exact.body?.data ?? []).some((r) => r.orderNo === newest.orderNo),
  newest.orderNo,
)
check(
  '  with nothing from any other day',
  (exact.body?.data ?? []).every((r) => day(r.createdAt) === onThatDay),
)

const before = await call('/api/v1/orders?perPage=100&from=2000-01-01&to=2000-01-31')
check(
  'a range before this school existed finds nothing',
  (before.body?.data ?? []).length === 0,
  String((before.body?.data ?? []).length),
)

const openEnded = await call(`/api/v1/orders?perPage=100&from=${onThatDay}`)
check(
  'a range with only a start is allowed',
  (openEnded.body?.data ?? []).length >= sameDay,
  `${(openEnded.body?.data ?? []).length}`,
)

/* ---------------- and the screen ---------------- */

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const problems = []
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1200 })
  page.on('pageerror', (e) => problems.push(String(e)))

  await page.goto(`${ADMIN}/signin`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', EMAIL)
  await page.type('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 20000 })

  await page.goto(`${ADMIN}/orders`, { waitUntil: 'networkidle2' })
  await wait(2500)
  const everything = await page.evaluate(() => document.querySelectorAll('tbody tr').length)
  check('the page lists orders', everything > 0, String(everything))

  const boxes = await page.evaluate(
    () => document.querySelectorAll('input[type="date"]').length,
  )
  check('the filter bar offers two date boxes', boxes === 2, String(boxes))

  await page.evaluate((d) => {
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const [from, to] = document.querySelectorAll('input[type="date"]')
    set(from, d)
    set(to, d)
  }, onThatDay)
  await wait(2800)

  const narrowed = await page.evaluate(() => document.querySelectorAll('tbody tr').length)
  check(
    'typing one day narrows the list to it',
    narrowed === sameDay,
    `${everything} → ${narrowed}, ${sameDay} expected`,
  )
  check(
    '  and the order placed that day is still on screen',
    await page.evaluate((no) => document.body.innerText.includes(no), newest.orderNo),
    newest.orderNo,
  )

  check('no page errors', problems.length === 0, problems.slice(0, 2).join(' | '))
} finally {
  await browser.close()
}

console.log(failed ? `\n${failed} failed` : '\n  all good')
process.exit(failed ? 1 : 0)
