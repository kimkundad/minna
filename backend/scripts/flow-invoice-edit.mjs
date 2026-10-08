/**
 * Corrects an invoice through the admin UI, and checks that a bad tax ID is
 * refused with the message under the right box.
 *
 *   node scripts/flow-invoice-edit.mjs
 *
 * Needs the demo invoices in place (api/scripts/demo-invoices.mjs) and
 * SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD.
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
await page.setViewport({ width: 1600, height: 1300 })

const problems = []
page.on('pageerror', (e) => problems.push(String(e)))

await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
await page.type('input[type="email"]', process.env.SMOKE_ADMIN_EMAIL)
await page.type('input[type="password"]', process.env.SMOKE_ADMIN_PASSWORD)
await page.click('button[type="submit"]')
await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 15000 })

await page.goto(`${BASE}/invoices`, { waitUntil: 'networkidle2' })
await page.waitForSelector('tbody tr')

/** The row with no document number — the only one that can be corrected. */
const opened = await page.evaluate(() => {
  const row = [...document.querySelectorAll('tbody tr')].find((r) =>
    r.textContent.includes('Not yet issued'),
  )
  if (!row) return false
  row.click()
  return true
})
console.log('opened an unissued invoice:', opened)
await new Promise((r) => setTimeout(r, 900))

const clickText = (text) =>
  page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)
    if (!btn) return false
    btn.click()
    return true
  }, text)

console.log('opened the form:', await clickText('Correct the details'))
await new Promise((r) => setTimeout(r, 500))

/** Replaces what is in a field rather than appending to it. */
async function setField(selector, value) {
  const el = await page.$(selector)
  await el.click({ clickCount: 3 })
  await el.press('Backspace')
  await el.type(value)
}

// A tax ID one digit out from a real one: the typo this is meant to catch.
await setField('form input[inputmode="numeric"]', '1101700207022')
console.log('saved with a bad ID:', await clickText('Save'))
await new Promise((r) => setTimeout(r, 1200))

const refused = await page.evaluate(() => {
  const msg = [...document.querySelectorAll('form .text-error-500')]
    .map((e) => e.textContent.trim())
    .filter((t) => t.length > 1)
  return { stillOpen: Boolean(document.querySelector('form textarea')), msg }
})
console.log('form stayed open:', refused.stillOpen)
console.log('message shown:', JSON.stringify(refused.msg))
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/invoice-badid.png', fullPage: true })

// Now a good one, with a changed name.
await setField('form input[inputmode="numeric"]', '1101700207021')
await setField('form input[maxlength="255"]', 'สมหญิง เรียนดีมาก')
console.log('saved with a good ID:', await clickText('Save'))
await new Promise((r) => setTimeout(r, 1600))

const after = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n'))
console.log('--- after saving ---')
console.log(after.slice(after.indexOf('DOCUMENT'), after.indexOf('DOCUMENT') + 700))
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/invoice-saved.png', fullPage: true })

if (problems.length) console.log('\nproblems:', problems)
await browser.close()
