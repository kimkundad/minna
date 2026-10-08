/**
 * Issues a document number through the admin UI.
 *
 *   node scripts/flow-invoice-issue.mjs
 *
 * Expects an invoice against a paid order with no number yet — the state that
 * the Issue button exists for.
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'

const browser = await puppeteer.launch({
  executablePath: BROWSERS.find((p) => existsSync(p)),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1200 })

const problems = []
page.on('pageerror', (e) => problems.push(String(e)))

await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
await page.type('input[type="email"]', process.env.SMOKE_ADMIN_EMAIL)
await page.type('input[type="password"]', process.env.SMOKE_ADMIN_PASSWORD)
await page.click('button[type="submit"]')
await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 15000 })

await page.goto(`${BASE}/invoices?`, { waitUntil: 'networkidle2' })
await page.waitForSelector('tbody tr')

// The company one: its order is paid, so it is the row that offers Issue.
const opened = await page.evaluate(() => {
  const row = [...document.querySelectorAll('tbody tr')].find(
    (r) => r.textContent.includes('Not yet issued') && r.textContent.includes('A company'),
  )
  if (!row) return false
  row.click()
  return true
})
console.log('opened the paid-but-unnumbered invoice:', opened)
await new Promise((r) => setTimeout(r, 900))

const clickText = (text) =>
  page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)
    if (!btn) return false
    btn.click()
    return true
  }, text)

console.log('clicked Issue a number:', await clickText('Issue a number'))
await new Promise((r) => setTimeout(r, 600))
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/invoice-issue-ask.png' })

const confirmed = await page.evaluate(() => {
  const dialog = document.querySelector('[role="alertdialog"]')
  if (!dialog) return 'no dialog'
  const btn = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Issue')
  if (!btn) return 'no Issue button in the dialog'
  btn.click()
  return 'ok'
})
console.log('confirmed:', confirmed)
await new Promise((r) => setTimeout(r, 1800))

const text = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n'))
const start = text.indexOf('DOCUMENT')
console.log('--- after issuing ---')
console.log(text.slice(start, start + 600))
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/invoice-issued.png', fullPage: true })

if (problems.length) console.log('\nproblems:', problems)
await browser.close()
