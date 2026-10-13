/**
 * Signs in to the admin and screenshots a page behind the login.
 *
 *   node scripts/shoot-admin.mjs <route> <out.png> [--w=1440] [--h=900]
 *                                [--click=SEL] [--wait=SEL] [--full] [--delay=600]
 *
 * The admin keeps its access token in memory, so there is no cookie to inject
 * and no way around actually filling the form — which is the point: a screen
 * that only renders for a session that went through the real login is the only
 * one worth looking at.
 *
 * Credentials come from SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import puppeteer from 'puppeteer-core'


const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'
const EMAIL = process.env.SMOKE_ADMIN_EMAIL
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD

// Git Bash rewrites a leading slash into a Windows path, so the route is given
// without one — `orders`, not `/orders` — and put back here.
const [rawPath, out, ...rest] = process.argv.slice(2)
const path = rawPath ? `/${rawPath.replace(/^\/+/, '')}` : rawPath
if (!path || !out) {
  console.error('usage: node scripts/shoot-admin.mjs <route-without-leading-slash> <out.png> [--w=1440] ...')
  process.exit(1)
}
if (!EMAIL || !PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD first.')
  process.exit(2)
}

const flag = (name, fallback) => {
  const hit = rest.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const has = (name) => rest.includes(`--${name}`)

const executablePath = BROWSERS.find((p) => existsSync(p))
if (!executablePath) {
  console.error('No Chromium-family browser found.')
  process.exit(1)
}

mkdirSync(dirname(out), { recursive: true })

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

const page = await browser.newPage()
await page.setViewport({
  width: Number(flag('w', 1440)),
  height: Number(flag('h', 900)),
  deviceScaleFactor: 1,
})

/** Anything the app logged, so a blank screenshot comes with its reason. */
const problems = []
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(msg.text())
})
page.on('pageerror', (err) => problems.push(String(err)))

await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
await page.type('input[type="email"]', EMAIL)
await page.type('input[type="password"]', PASSWORD)
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
  page.click('button[type="submit"]'),
])

// The router replaces the URL rather than navigating, so wait for the app to
// leave the sign-in page rather than for a load event.
await page
  .waitForFunction(() => !window.location.pathname.endsWith('/signin'), { timeout: 15000 })
  .catch(() => problems.push('still on /signin after submitting — login failed'))

await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' })

const waitFor = flag('wait', null)
if (waitFor) {
  await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => problems.push(`never saw ${waitFor}`))
}

const click = flag('click', null)
if (click) {
  for (const sel of click.split(',')) {
    await page.click(sel.trim()).catch(() => problems.push(`could not click ${sel.trim()}`))
    await new Promise((r) => setTimeout(r, 400))
  }
}

await new Promise((r) => setTimeout(r, Number(flag('delay', 600))))
await page.screenshot({ path: out, fullPage: has('full') })

// The visible text, so a screenshot can be checked without being looked at.
const text = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').trim())
console.log(text.slice(0, 2500))

if (problems.length) {
  console.log('\n--- console ---')
  for (const p of problems) console.log(`  ${p}`)
}

await browser.close()
