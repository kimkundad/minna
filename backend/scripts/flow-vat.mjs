/**
 * Changes VAT through the admin, then asks the checkout what a course costs.
 *
 *   node scripts/flow-vat.mjs
 *
 * The point is the second half: a setting that saves but does not reach the
 * pricing is worse than no setting at all, because it looks like it worked.
 * Puts the rate back to 7% inclusive at the end.
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://127.0.0.1:3000'
const EMAIL = process.env.SMOKE_ADMIN_EMAIL
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD

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

const admin = await call('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD })
token = admin.body.accessToken

const before = await call('POST', '/api/v1/checkout/quote', {
  lines: [{ kind: 'course', id: 1 }],
})
console.log('quote at 7% inclusive:', JSON.stringify(before.body?.data && {
  subtotal: before.body.data.subtotal,
  vatAmount: before.body.data.vatAmount,
  total: before.body.data.total,
}))

const browser = await puppeteer.launch({
  executablePath: BROWSERS.find((p) => existsSync(p)),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1200 })
const problems = []
page.on('pageerror', (e) => problems.push(String(e)))

await page.goto(`${ADMIN}/signin`, { waitUntil: 'networkidle2' })
await page.type('input[type="email"]', EMAIL)
await page.type('input[type="password"]', PASSWORD)
await page.click('button[type="submit"]')
await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 15000 })

await page.goto(`${ADMIN}/settings`, { waitUntil: 'networkidle2' })
await page.waitForSelector('#set-vat_percent')

// 10% and exclusive: both fields at once, and the bigger of the two changes.
const rate = await page.$('#set-vat_percent')
await rate.click({ clickCount: 3 })
await rate.type('10')
await page.click('#set-vat_inclusive')
await new Promise((r) => setTimeout(r, 400))

const previewed = await page.evaluate(() => {
  const box = [...document.querySelectorAll('dl')].at(-1)
  return box ? box.innerText.replace(/\n/g, ' | ') : 'no preview'
})
console.log('preview before saving:', previewed)
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/settings-pending.png', fullPage: true })

const clickText = (t) =>
  page.evaluate((text) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
    if (!btn) return false
    btn.click()
    return true
  }, t)

console.log('clicked Save changes:', await clickText('Save changes'))
await new Promise((r) => setTimeout(r, 600))
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/settings-confirm.png' })

const confirmed = await page.evaluate(() => {
  const d = document.querySelector('[role="alertdialog"]')
  if (!d) return 'no dialog'
  const text = d.innerText
  const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save')
  if (!btn) return 'no Save in the dialog'
  btn.click()
  return text.replace(/\n/g, ' | ')
})
console.log('the warning said:', confirmed)
await new Promise((r) => setTimeout(r, 1500))
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/settings-saved.png', fullPage: true })

const after = await call('POST', '/api/v1/checkout/quote', {
  lines: [{ kind: 'course', id: 1 }],
})
console.log('quote at 10% exclusive:', JSON.stringify(after.body?.data && {
  subtotal: after.body.data.subtotal,
  vatAmount: after.body.data.vatAmount,
  total: after.body.data.total,
}))

// Put it back, through the API this time.
await call('PUT', '/api/v1/settings', { vat_percent: '7', vat_inclusive: 'true' })
const restored = await call('POST', '/api/v1/checkout/quote', {
  lines: [{ kind: 'course', id: 1 }],
})
console.log('restored:', JSON.stringify(restored.body?.data && {
  vatAmount: restored.body.data.vatAmount,
  total: restored.body.data.total,
}))

if (problems.length) console.log('\nproblems:', problems)
await browser.close()
