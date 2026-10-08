/**
 * Walks every tab on a student's page and prints what each one shows, then
 * saves a billing address through the last one.
 *
 *   node scripts/flow-student-tabs.mjs <studentId>
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'
const ID = process.argv[2]
if (!ID) {
  console.error('usage: node scripts/flow-student-tabs.mjs <studentId>')
  process.exit(1)
}

const browser = await puppeteer.launch({
  executablePath: BROWSERS.find((p) => existsSync(p)),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 1000 })
const problems = []
page.on('pageerror', (e) => problems.push(String(e)))

await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
await page.type('input[type="email"]', process.env.SMOKE_ADMIN_EMAIL)
await page.type('input[type="password"]', process.env.SMOKE_ADMIN_PASSWORD)
await page.click('button[type="submit"]')
await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 15000 })

await page.goto(`${BASE}/students/${ID}`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))

const clickTab = (label) =>
  page.evaluate((text) => {
    const btn = [...document.querySelectorAll('[role="tablist"] [role="tab"]')].find(
      (b) => b.textContent.trim() === text,
    )
    if (!btn) return false
    btn.click()
    return true
  }, label)

/** What is below the tab bar, which is the tab's own content. */
const body = () =>
  page.evaluate(() => {
    const nav = document.querySelector('[role="tablist"]')
    const panel = nav?.parentElement?.nextElementSibling
    return (panel?.innerText ?? '(nothing)').replace(/\n{2,}/g, '\n').trim()
  })

for (const label of ['Courses and access', 'Learning', 'Payments', 'Billing address']) {
  console.log(`\n=== ${label} (opened: ${await clickTab(label)}) ===`)
  await new Promise((r) => setTimeout(r, 1100))
  console.log((await body()).slice(0, 700))
  console.log('url:', await page.evaluate(() => location.search))
  await page.screenshot({
    path: `C:/Users/brack/AppData/Local/Temp/shots/student-${label.split(' ')[0].toLowerCase()}.png`,
  })
}

// Save a billing address from the last tab.
console.log('\n=== saving a billing address ===')
const opened = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    ['Add details', 'Edit'].includes(b.textContent.trim()),
  )
  if (!btn) return false
  btn.click()
  return true
})
console.log('form opened:', opened)
await new Promise((r) => setTimeout(r, 400))

async function fill(selector, value) {
  const el = await page.$(selector)
  await el.click({ clickCount: 3 })
  await el.press('Backspace')
  await el.type(value)
}

await fill('form input[maxlength="255"]', 'บริษัท ทดสอบ จำกัด')
// A deliberately wrong check digit first.
await fill('form input[inputmode="numeric"][maxlength="20"]', '0105536091239')
await fill('form textarea', '1 ถนนทดสอบ กรุงเทพฯ 10110')

const submit = () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('form button')].find(
      (b) => b.textContent.trim() === 'Save',
    )
    btn.click()
  })

await submit()
await new Promise((r) => setTimeout(r, 1200))
console.log(
  'bad tax ID refused with:',
  await page.evaluate(() =>
    [...document.querySelectorAll('form .text-error-500')]
      .map((e) => e.textContent.trim())
      .filter((t) => t.length > 1)
      .join(' | '),
  ),
)

await fill('form input[inputmode="numeric"][maxlength="20"]', '0105536091238')
await submit()
await new Promise((r) => setTimeout(r, 1400))
console.log('after saving:')
console.log((await body()).slice(0, 600))
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/student-billing-saved.png' })

if (problems.length) console.log('\nproblems:', problems)
await browser.close()
