/**
 * Checks the course form's teacher picker with a long list: that the search box
 * appears, filters, keeps the already-chosen teacher visible, and that picking
 * one saves.
 *
 *   node scripts/flow-teacher-pick.mjs
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
await page.setViewport({ width: 1500, height: 1000 })
const problems = []
page.on('pageerror', (e) => problems.push(String(e)))

await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
await page.type('input[type="email"]', process.env.SMOKE_ADMIN_EMAIL)
await page.type('input[type="password"]', process.env.SMOKE_ADMIN_PASSWORD)
await page.click('button[type="submit"]')
await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 15000 })

await page.goto(`${BASE}/courses/1`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 2500))

/** The teacher select is the one holding a "— choose a teacher —" option. */
const read = () =>
  page.evaluate(() => {
    const select = [...document.querySelectorAll('select')].find((s) =>
      s.innerText.includes('choose a teacher'),
    )
    if (!select) return null
    const search = document.querySelector('input[type="search"]')
    return {
      hasSearch: Boolean(search),
      count: select.options.length - 1, // minus the placeholder
      chosen: select.options[select.selectedIndex]?.text.trim() ?? '',
      first3: [...select.options].slice(1, 4).map((o) => o.text.trim()),
    }
  })

console.log('with a long list:', JSON.stringify(await read(), null, 1))
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/teacher-many.png' })

// Filter to something that excludes the current teacher.
const search = await page.$('input[type="search"]')
await search.type('german')
await new Promise((r) => setTimeout(r, 300))
console.log('after searching "german":', JSON.stringify(await read(), null, 1))
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/teacher-search.png' })

// Something that matches nothing.
await search.click({ clickCount: 3 })
await search.type('zzzz')
await new Promise((r) => setTimeout(r, 300))
const empty = await page.evaluate(() => document.body.innerText.includes('Nobody matches'))
console.log('empty search says so:', empty, '| and keeps the chosen one:', (await read()).count)

// Back, and pick a different teacher.
await search.click({ clickCount: 3 })
await search.press('Backspace')
await new Promise((r) => setTimeout(r, 300))

const picked = await page.evaluate(() => {
  const select = [...document.querySelectorAll('select')].find((s) =>
    s.innerText.includes('choose a teacher'),
  )
  const option = [...select.options].find((o) => o.text.includes('Kenji Sato'))
  if (!option) return 'no Kenji'
  select.value = option.value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  return option.text.trim()
})
console.log('picked:', picked)
await new Promise((r) => setTimeout(r, 400))

const summary = await page.evaluate(() => {
  const select = [...document.querySelectorAll('select')].find((s) =>
    s.innerText.includes('choose a teacher'),
  )
  return select.parentElement.parentElement.innerText.split('\n').slice(-3).join(' | ')
})
console.log('summary under it:', summary)
await page.screenshot({ path: 'C:/Users/brack/AppData/Local/Temp/shots/teacher-picked.png' })

if (problems.length) console.log('\nproblems:', problems)
await browser.close()
