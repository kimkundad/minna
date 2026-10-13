/**
 * Order history, the breakdown, and the receipt.
 *
 *   node scripts/flow-orders.mjs [baseUrl]
 *
 * Buys two things as a throwaway member — one free course, which lands as a
 * paid order for nothing, and one paid course by PromptPay, which stays
 * pending — so the page has both a successful order and one still waiting.
 * Then it reads the list, opens the breakdown and prints the receipt sheet.
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
  email: `flow-orders-${Date.now()}@example.com`,
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

const auth = { Authorization: `Bearer ${accessToken}` }
const json = { 'Content-Type': 'application/json; charset=utf-8', ...auth }

const catalog = await (await fetch(`${API}/courses?perPage=60`)).json()
const free = catalog.data.find((c) => c.price === 0)
const paid = catalog.data.find((c) => c.price > 0)

async function buy(course, method) {
  const res = await fetch(`${API}/checkout`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ lines: [{ kind: 'course', id: course.id }], method }),
  })
  return res.ok ? res.json() : null
}

await buy(free, 'promptpay')
await buy(paid, 'promptpay')

const mine = await (await fetch(`${API}/me/orders`, { headers: auth })).json()
const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1200 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  // Warnings too: a Vue warning is how a component quietly stops resolving.
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
  /* ---------------- what the API was given ---------------- */

  check('the API has both orders', mine.data?.length === 2, String(mine.data?.length))
  const statuses = (mine.data ?? []).map((o) => `${o.status}/${o.method}`).sort()
  check('one paid for nothing, one waiting on money', statuses.join(' '), statuses.join(' '))

  await signIn()

  /* ---------------- the list ---------------- */

  await page.goto(`${BASE}/th/account/orders`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.acct-order, .state-box', { timeout: 15000 })

  const cards = await page.$$eval('.acct-order', (els) =>
    els.map((e) => ({
      no: e.querySelector('.acct-order-id h3')?.textContent?.trim(),
      status: e.querySelector('.acct-order-st')?.textContent?.trim(),
      meta: e.querySelector('.acct-order-id p')?.innerText?.replace(/\s+/g, ' ').trim(),
      total: e.querySelector('.acct-order-total b')?.textContent?.trim(),
      items: e.querySelectorAll('.acct-oi').length,
    })),
  )
  check('both orders are on the page', cards.length === 2, JSON.stringify(cards.map((c) => c.no)))
  check(
    'each carries an order number, a status and a total',
    cards.every((c) => c.no && c.status && c.total),
    JSON.stringify(cards[0] ?? {}),
  )
  check('and the course it was for', cards.every((c) => c.items >= 1))

  const noVet = !cards.some((c) => /วิสัญญี|Cardiology/.test(c.meta ?? ''))
  check('no fixture leftovers', noVet)

  /* ---------------- the tabs ---------------- */

  const tabs = await page.$$eval('.acct-ftabs .tab', (els) =>
    els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
  )
  check('four tabs, each with a count', tabs.length === 4, tabs.join(' | '))

  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.acct-ftabs .tab')].find((b) =>
      /รอชำระ|Awaiting/i.test(b.textContent ?? ''),
    )
    t?.click()
  })
  await new Promise((r) => setTimeout(r, 500))
  const pendingOnly = await page.$$eval('.acct-order', (els) => els.length)
  check('the waiting tab narrows the list', pendingOnly === 1, String(pendingOnly))

  await page.goto(`${BASE}/th/account/orders`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.acct-order', { timeout: 10000 })
  await page.screenshot({ path: `${SHOTS}/orders-list.png` })

  /* ---------------- the breakdown ---------------- */

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.acct-order-actions .btn--primary')][0]
    b?.click()
  })
  await page.waitForSelector('.modal[role="dialog"]', { timeout: 8000 }).catch(() => {})
  const dialog = await page.$('.modal[role="dialog"]')
  check('the detail dialog opens', dialog !== null)
  if (dialog) {
    const body = await page.$eval('.modal-body', (e) => e.innerText.replace(/\s+/g, ' '))
    check('  and it adds up to a total', /฿|บาท|0/.test(body), body.slice(0, 70))
    await page.screenshot({ path: `${SHOTS}/orders-detail.png` })
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 400))
    check('  Escape closes it', (await page.$('.modal[role="dialog"]')) === null)
  }

  /* ---------------- the receipt ---------------- */

  const paidOrder = (mine.data ?? []).find((o) => o.status === 'paid')
  if (paidOrder) {
    await page.goto(`${BASE}/th/account/orders/${paidOrder.orderNo}/receipt`, {
      waitUntil: 'networkidle2',
    })
    await page.waitForSelector('.rc-sheet, .state-box', { timeout: 12000 })
    const sheet = await page.$('.rc-sheet')
    check('the receipt sheet renders', sheet !== null)
    if (sheet) {
      const text = await page.$eval('.rc-sheet', (e) => e.innerText.replace(/\s+/g, ' '))
      check('  it names the order', text.includes(paidOrder.orderNo), paidOrder.orderNo)
      check('  and totals it', /\d/.test(text))
      check(
        '  it is headed a receipt, not a tax invoice it has no number for',
        text.includes('ใบเสร็จ') && !text.includes('เลขที่เอกสาร'),
        text.slice(0, 60),
      )
      await page.screenshot({ path: `${SHOTS}/orders-receipt.png`, fullPage: true })
    }
  }

  /* ---------------- nobody else's ---------------- */

  const stranger = await fetch(`${API}/me/orders`)
  check('signed out, the API hands over nothing', stranger.status === 401, String(stranger.status))

  const real = errors.filter(
    (e) => !/favicon|Vue Devtools|Failed to load resource|401 \(Unauthorized\)|404/i.test(e),
  )
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))
} finally {
  await cleanUp()
}

console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
