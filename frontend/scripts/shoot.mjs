/**
 * Screenshots a page at a real device width, optionally after clicking
 * something open.
 *
 * Edge's own `--headless --screenshot` cannot do this: `--window-size` has a
 * floor around 516px, so every "phone" screenshot taken that way is really
 * 477px wide and never exercises the rules below it. It also cannot click, so
 * checking a drawer or a dialog meant editing the component to open by default
 * — which fires the route watchers that close it again, and proves nothing.
 *
 *   node scripts/shoot.mjs <url> <out.png> [--w=390] [--h=844] [--click=SEL]
 *                          [--wait=SEL] [--full] [--delay=800]
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import puppeteer from 'puppeteer-core'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

const [url, out, ...rest] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: node scripts/shoot.mjs <url> <out.png> [--w=390] [--click=SEL] ...')
  process.exit(1)
}

const flag = (name, fallback) => {
  const hit = rest.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const has = (name) => rest.includes(`--${name}`)

const executablePath = BROWSERS.find((p) => existsSync(p))
if (!executablePath) {
  console.error('No Chromium-family browser found. Install Edge or Chrome.')
  process.exit(1)
}

mkdirSync(dirname(out), { recursive: true })

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

try {
  const page = await browser.newPage()
  const width = Number(flag('w', 390))
  await page.setViewport({
    width,
    height: Number(flag('h', 844)),
    deviceScaleFactor: 2,
    // Below the design's own phone breakpoint, report as a touch device so
    // `(pointer: coarse)` rules apply the way they would on a real one.
    isMobile: width <= 767,
    hasTouch: width <= 767,
  })

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 })

  const waitFor = flag('wait')
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15_000 })

  // Several selectors, clicked in order: opening a dialog and then choosing
  // something inside it is the usual case.
  for (const sel of (flag('click', '') || '').split(',').filter(Boolean)) {
    await page.waitForSelector(sel, { timeout: 15_000 })
    await page.click(sel)
    await new Promise((r) => setTimeout(r, 350))
  }

  await new Promise((r) => setTimeout(r, Number(flag('delay', 800))))

  const measured = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    sw: document.documentElement.scrollWidth,
  }))

  await page.screenshot({ path: out, fullPage: has('full') })
  console.log(`${out}  viewport=${measured.vw}  scrollWidth=${measured.sw}`)
  if (measured.sw > measured.vw + 1) {
    console.log(`  WARNING: page is ${measured.sw - measured.vw}px wider than the viewport`)
  }
} finally {
  await browser.close()
}
