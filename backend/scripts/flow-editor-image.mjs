/**
 * Types into the rich editor, drops a picture in, saves, reloads, and checks
 * the picture is still there and still loads.
 *
 *   node scripts/flow-editor-image.mjs
 *
 * The point is the reload. A signed URL would work for the first few hours and
 * then stop, so an upload that appears to work proves nothing on its own — what
 * matters is the address written into the saved HTML.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'
const SHOTS = 'C:/Users/brack/AppData/Local/Temp/shots'

/** A real PNG, written to disk so the file chooser has something to pick. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAWklEQVR42u3QMQEAAAgDoC251a3g' +
    'LwKQ1sFuBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCg' +
    'QIECBQoUKPgtWMQBAWqz0e4AAAAASUVORK5CYII=',
  'base64',
)
const file = 'C:/Users/brack/AppData/Local/Temp/editor-test.png'
mkdirSync(SHOTS, { recursive: true })
writeFileSync(file, PNG)

const browser = await puppeteer.launch({
  executablePath: BROWSERS.find((p) => existsSync(p)),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 1200 })

const problems = []
page.on('pageerror', (e) => problems.push(String(e)))
page.on('response', (r) => {
  const u = r.url()
  if (u.includes('/api/v1/media/') || u.includes('/uploads')) {
    console.log(' ', r.status(), r.request().method(), u.slice(0, 110))
  }
})

await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
await page.type('input[type="email"]', process.env.SMOKE_ADMIN_EMAIL)
await page.type('input[type="password"]', process.env.SMOKE_ADMIN_PASSWORD)
await page.click('button[type="submit"]')
await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 15000 })

/* ---- write an article with a picture in it ---- */

await page.goto(`${BASE}/posts`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))

const clickText = (t) =>
  page.evaluate((text) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === text)
    if (!b) return false
    b.click()
    return true
  }, t)

console.log('opened the form:', await clickText('Write one'))
await page.waitForSelector('.ck-editor__editable', { timeout: 20000 })
console.log('the editor loaded')

await page.type('form input[maxlength="255"]', 'Smoke editor picture test')
await new Promise((r) => setTimeout(r, 300))

// Type into the editor itself.
await page.click('.ck-editor__editable')
await page.keyboard.type('A paragraph above the picture.')
await new Promise((r) => setTimeout(r, 300))

// Insert the picture through the toolbar's own file chooser.
const chooser = page.waitForFileChooser({ timeout: 10000 })
await page.evaluate(() => {
  const btn = document.querySelector('.ck-toolbar button[data-cke-tooltip-text^="Insert image"]')
  if (btn) btn.click()
})
await new Promise((r) => setTimeout(r, 400))
// The split button may need its action half, or the menu's "Upload from computer".
await page.evaluate(() => {
  const item = [...document.querySelectorAll('.ck-button__label, .ck-list__item button')].find((e) =>
    /upload from computer/i.test(e.textContent ?? ''),
  )
  if (item) (item.closest('button') ?? item).click()
})

const fc = await chooser.catch(() => null)
if (!fc) {
  console.log('FAIL: no file chooser opened')
  await page.screenshot({ path: `${SHOTS}/ck-no-chooser.png`, fullPage: true })
  await browser.close()
  process.exit(1)
}
await fc.accept([file])
console.log('picture chosen; uploading…')
await new Promise((r) => setTimeout(r, 6000))

const inEditor = await page.evaluate(() => {
  const img = document.querySelector('.ck-editor__editable img')
  return img ? img.getAttribute('src') : null
})
console.log('src in the editor:', inEditor)

await page.screenshot({ path: `${SHOTS}/ck-with-image.png`, fullPage: true })

console.log('saved:', await clickText('Create'))
await new Promise((r) => setTimeout(r, 2500))

/* ---- reload and check it survived ---- */

await page.goto(`${BASE}/posts`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1500))
console.log('reopened:', await clickText('Edit'))
await page.waitForSelector('.ck-editor__editable', { timeout: 20000 })
await new Promise((r) => setTimeout(r, 2500))

const after = await page.evaluate(() => {
  const img = document.querySelector('.ck-editor__editable img')
  if (!img) return { src: null, loaded: false }
  return { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 }
})
console.log('src after reload:', after.src)
console.log('the picture actually loaded:', after.loaded)
await page.screenshot({ path: `${SHOTS}/ck-after-reload.png`, fullPage: true })

if (problems.length) console.log('\nproblems:', problems)
await browser.close()
