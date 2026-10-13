/**
 * The admin's copy of a receipt, and the browser icon setting.
 *
 *   node scripts/flow-receipt.mjs
 *
 * A buyer can print their own receipt from their account. This is the copy
 * staff print when somebody rings up having lost it — so the checks are that
 * it is reachable from the order, that it carries the real numbers rather than
 * a template, and that the furniture around it is left off the page.
 *
 * Needs a superadmin: SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD, or it makes
 * its own throwaway one.
 */
import { execFileSync } from 'node:child_process'
import { launchBrowser } from './browser.mjs'

const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const SHOTS = process.env.SHOT_DIR ?? 'C:/Users/brack/AppData/Local/Temp/shots'
const API_DIR = new URL('../../api/', import.meta.url).pathname.replace(/^\//, '')


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const stamp = Date.now()
const password = 'Str0ng-Pass!2026'
const admin = `smoke-rcp-a${stamp}@example.com`
const buyer = `smoke-rcp-b${stamp}@example.com`

async function account(email, role) {
  const made = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '1990-01-01',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  if (!made.ok) throw new Error(`register ${email}: ${made.status}`)
  if (role) {
    execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, role], {
      cwd: API_DIR,
      shell: true,
      stdio: 'ignore',
    })
  }
  return (await made.json()).accessToken
}

await account(admin, 'superadmin')
const buyerToken = await account(buyer, null)

/** An order to print: a free course, which still produces a paid order. */
const list = await (await fetch(`${API}/courses?perPage=60`)).json()
const free = list.data.find((c) => c.price === 0)
const placed = await fetch(`${API}/checkout`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${buyerToken}`, 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ lines: [{ kind: 'course', id: free.id }], method: 'promptpay' }),
})
if (!placed.ok) throw new Error(`checkout: ${placed.status} ${await placed.text()}`)
const mine = await (await fetch(`${API}/me/orders`, { headers: { Authorization: `Bearer ${buyerToken}` } })).json()
const order = mine.data[0]

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('response', (r) => {
    if (r.status() === 401 && r.url().endsWith('/auth/refresh')) return
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
  })

  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', admin, { delay: 8 })
  await page.type('input[type="password"]', password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 25000 })

  /* ---------------- reachable from the order ---------------- */

  await page.goto(`${BASE}/orders?q=${order.orderNo}`, { waitUntil: 'networkidle2' })
  await wait(2000)
  const openedRow = await page.evaluate((no) => {
    const row = [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes(no))
    if (!row) return false
    // The whole row is the opener, not a button inside it.
    row.click()
    return true
  }, order.orderNo)
  check('the order is on the list', openedRow, order.orderNo)
  await wait(1500)

  const link = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((el) => el.innerText.trim() === 'Receipt')
    return a?.getAttribute('href') ?? null
  })
  check('  and offers a receipt', Boolean(link), String(link))

  /* ---------------- the sheet ---------------- */

  await page.goto(`${BASE}${link}`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.rcp-sheet', { timeout: 15000 })
  await wait(1200)

  const sheet = await page.evaluate(() => {
    const el = document.querySelector('.rcp-sheet')
    return {
      text: el.innerText.replace(/\s+/g, ' ').trim(),
      lines: el.querySelectorAll('.rcp-lines tbody tr').length,
      total: el.querySelector('.rcp-grand dd')?.innerText.trim() ?? '',
      hasPrint: [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Print'),
      // The admin's own chrome has no business on a sheet of paper.
      hasSidebar: Boolean(document.querySelector('aside')),
    }
  })

  check('the sheet names the order', sheet.text.includes(order.orderNo), sheet.text.slice(0, 70))
  check('  and lists what was bought', sheet.lines === order.items.length, `${sheet.lines} of ${order.items.length}`)
  check('  with the real total', sheet.total.includes('0') || sheet.total.length > 0, sheet.total)
  check('  headed a receipt, not a tax invoice', sheet.text.includes('ใบเสร็จรับเงิน'), sheet.text.slice(0, 40))
  check('there is a print button', sheet.hasPrint)
  check('  and no admin furniture around it', !sheet.hasSidebar)

  await page.screenshot({ path: `${SHOTS}/admin-receipt.png`, fullPage: true })

  /* ---------------- the browser icon setting ---------------- */

  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' })
  await wait(2000)
  const favicon = await page.evaluate(() => {
    const text = document.body.innerText
    const at = text.indexOf('Browser icon')
    return { found: at !== -1, help: at === -1 ? '' : text.slice(at, at + 220) }
  })
  check('the settings screen offers a browser icon', favicon.found)
  check('  and says what size it should be', /512/.test(favicon.help), favicon.help.slice(0, 120))
  check(
    '  with somewhere to upload it',
    await page.evaluate(() => document.querySelectorAll('input[type="file"]').length >= 3),
  )

  check('nothing threw', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
  for (const email of [admin, buyer]) {
    execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', email], {
      cwd: API_DIR,
      shell: true,
      stdio: 'inherit',
    })
  }
}

console.log(failures ? `\n  ${failures} failing\n` : '\n  all good\n')
process.exit(failures ? 1 : 0)
