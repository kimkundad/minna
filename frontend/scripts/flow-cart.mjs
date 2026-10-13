/**
 * The basket, in a real browser.
 *
 *   node scripts/flow-cart.mjs [baseUrl]
 *
 * Adds from a course card, checks the header badge agrees, unticks a line and
 * watches the total change, removes one and puts it back with the undo, then
 * goes through to checkout with what is left ticked. Deletes its account at the
 * end, pass or fail.
 */
import { existsSync } from 'node:fs'
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const SHOTS = process.env.SHOT_DIR ?? '.'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const buyer = {
  email: `flow-cart-${Date.now()}@example.com`,
  password: 'Str0ng-Pass!2026',
  firstName: 'ทด',
  lastName: 'สอบ',
}
const register = await fetch(`${API}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    ...buyer,
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
console.log(`  buyer: ${buyer.email}\n`)

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1100 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

async function cleanUp() {
  await browser.close().catch(() => {})
  try {
    const { execFileSync } = await import('node:child_process')
    const out = execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', buyer.email], {
      cwd: '../api',
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log('\n  ' + out.trim().split('\n').join('\n  '))
  } catch {
    console.log(`\n  !! could not delete ${buyer.email} — remove it by hand`)
  }
}

const badge = () =>
  page.$eval('[data-cart-count]', (el) => Number(el.textContent.trim())).catch(() => 0)
const cartTotal = () =>
  page.$eval('.co-total-amt', (el) => Number(el.textContent.replace(/[^\d]/g, '')))

try {
  /* ---------------- 1. a guest is asked to sign in ---------------- */

  const onSale = await (await fetch(`${API}/courses?perPage=50`)).json()
  const forSale = onSale.data.filter((c) => c.price > 0 && c.sellable)

  /**
   * Two courses priced in the same currency.
   *
   * A basket can only be paid for in one currency — the server refuses the
   * second course outright otherwise — so picking the first two on offer
   * started failing the moment a course was priced in dollars. That is the
   * rule working, not the basket breaking, and this test is about the basket.
   */
  const currency = (c) => c.currency ?? 'THB'
  const together = forSale.find(
    (c) => forSale.filter((o) => currency(o) === currency(c)).length >= 2,
  )
  const [first, second] = forSale.filter((c) => currency(c) === currency(together))
  if (!second) throw new Error('needs two sellable courses in one currency')

  await page.goto(`${BASE}/th/courses/${first.slug}`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('[data-action="add-cart"]', { timeout: 10000 })
  await page.click('[data-action="add-cart"]')
  await new Promise((r) => setTimeout(r, 900))
  check(
    'a signed-out visitor is asked to sign in rather than refused',
    (await page.$('input[type="password"]')) !== null,
  )

  /* ---------------- 2. and the course goes in once they do ---------------- */

  await page.type('input[type="email"]', buyer.email, { delay: 8 })
  await page.type('input[type="password"]', buyer.password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(
    () => Number(document.querySelector('[data-cart-count]')?.textContent ?? 0) > 0,
    { timeout: 15000 },
  ).catch(() => {})
  check('the click that was interrupted is not thrown away', (await badge()) === 1, `badge ${await badge()}`)

  /* ---------------- 3. a second course, straight off a card ---------------- */

  // From the catalog this time. A card's one button is the basket, and most
  // people meet a course on a card rather than on its own page — so this is the
  // path that has to work, not just the one on the detail page.
  await page.goto(`${BASE}/th/courses`, { waitUntil: 'networkidle2' })
  await page.waitForSelector(`.cc[data-cid="${second.slug}"] [data-action]`, { timeout: 10000 })
  const cardButton = await page.$(`.cc[data-cid="${second.slug}"] [data-action]`)
  check(
    "a paid card's button is the basket, not the till",
    (await cardButton.evaluate((el) => el.dataset.action)) === 'add-cart',
    await cardButton.evaluate((el) => `${el.dataset.action}: ${el.textContent.trim()}`),
  )

  await cardButton.click()
  await page
    .waitForFunction(() => Number(document.querySelector('[data-cart-count]')?.textContent ?? 0) === 2, {
      timeout: 8000,
    })
    .catch(() => {})
  check('a second course joins it', (await badge()) === 2, `badge ${await badge()}`)
  check('without leaving the catalog', !page.url().includes('/checkout'), page.url())
  check(
    'and the card now says it is in there',
    (
      await page.$eval(`.cc[data-cid="${second.slug}"] [data-action]`, (el) => el.textContent.trim())
    ).includes('ตะกร้า'),
    await page.$eval(`.cc[data-cid="${second.slug}"] [data-action]`, (el) => el.textContent.trim()),
  )

  // The click has to say something, and then stop saying it. A confirmation
  // that stays on screen is the next thing in the way of the next course.
  const toastText = await page
    .waitForSelector('#toast-region .toast-msg', { timeout: 4000 })
    .then((el) => el.evaluate((e) => e.textContent.trim()))
    .catch(() => null)
  check(
    'adding it says so, naming the course',
    toastText !== null && toastText.includes(second.title),
    toastText ?? '(no toast)',
  )
  const wentAway = await page
    .waitForFunction(() => !document.querySelector('#toast-region .toast'), { timeout: 4500 })
    .then(() => true)
    .catch(() => false)
  check('and takes itself away a few seconds later', wentAway)

  /* ---------------- 4. the cart page agrees ---------------- */

  await page.goto(`${BASE}/th/cart`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.ct-item', { timeout: 10000 })
  check('the cart page shows both', (await page.$$eval('.ct-item', (e) => e.length)) === 2)

  const apiCart = await (async () => {
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ email: buyer.email, password: buyer.password }),
    })
    const { accessToken } = await login.json()
    return (
      await (await fetch(`${API}/cart`, { headers: { Authorization: `Bearer ${accessToken}` } })).json()
    ).data
  })()
  check(
    'and its total is the one the server quoted',
    (await cartTotal()) === Math.round(apiCart.quote.total / 100),
    `page ${await cartTotal()}, server ${apiCart.quote.total} satang`,
  )

  /* ---------------- 5. unticking takes it out of the total ---------------- */

  const both = await cartTotal()
  await page.click('.ct-item [data-sel]')
  await page.waitForFunction((was) => {
    const el = document.querySelector('.co-total-amt')
    return el && Number(el.textContent.replace(/[^\d]/g, '')) !== was
  }, { timeout: 8000 }, both).catch(() => {})
  const one = await cartTotal()
  check('unticking lowers the total', one < both, `${both} → ${one}`)
  check('but leaves the line in the basket', (await page.$$eval('.ct-item', (e) => e.length)) === 2)
  check('and the badge still counts it', (await badge()) === 2, `badge ${await badge()}`)

  await page.click('#ct-all')
  await page.waitForFunction((want) => {
    const el = document.querySelector('.co-total-amt')
    return el && Number(el.textContent.replace(/[^\d]/g, '')) === want
  }, { timeout: 8000 }, both).catch(() => {})
  check('ticking everything brings it back', (await cartTotal()) === both, `${await cartTotal()}`)

  /* ---------------- 6. removing, and the undo ---------------- */

  await page.click('.ct-item .ct-remove')
  // The confirm dialog's last button is the one that does it; it is danger-red
  // here, which is also how it is told from "cancel" by eye.
  await page.waitForSelector('.modal-foot .btn--danger', { timeout: 8000 })
  await page.click('.modal-foot .btn--danger')
  await page.waitForFunction(() => document.querySelectorAll('.ct-item').length === 1, {
    timeout: 8000,
  }).catch(() => {})
  check('removing takes the line away', (await page.$$eval('.ct-item', (e) => e.length)) === 1)
  check('and the badge follows', (await badge()) === 1, `badge ${await badge()}`)

  const undo = await page.$('.toast-action')
  if (undo) {
    await undo.click()
    await page.waitForFunction(() => document.querySelectorAll('.ct-item').length === 2, {
      timeout: 8000,
    }).catch(() => {})
    check('the undo puts it back', (await page.$$eval('.ct-item', (e) => e.length)) === 2)
  } else {
    check('the undo puts it back', false, 'no undo offered')
  }

  await page.screenshot({ path: `${SHOTS}/cart.png` })

  /* ---------------- 7. through to checkout ---------------- */

  await page.click('#ct-sum [data-checkout]')
  await page.waitForFunction(() => location.pathname.includes('/checkout'), { timeout: 10000 })
  check('the basket reaches checkout', page.url().includes('/checkout?items='), page.url())
  await page
    .waitForFunction(
      () =>
        document.querySelector('.co-item') !== null ||
        document.querySelector('.state-box--error, .co-guest') !== null,
      { timeout: 15000 },
    )
    .catch(() => {})
  check(
    'with the ticked courses on the order',
    (await page.$$eval('.co-item', (e) => e.length)) === 2,
    `${await page.$$eval('.co-item', (e) => e.length)} lines`,
  )

  /* ---------------- 8. an empty basket suggests real courses ---------------- */

  await page.goto(`${BASE}/th/cart`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.ct-item', { timeout: 10000 })
  for (const _ of [0, 1]) {
    const rm = await page.$('.ct-item .ct-remove')
    if (!rm) break
    await rm.click()
    await page.waitForSelector('.modal-foot .btn--danger', { timeout: 8000 }).catch(() => {})
    const ok = await page.$('.modal-foot .btn--danger')
    if (ok) await ok.click()
    await new Promise((r) => setTimeout(r, 1200))
  }
  await page.waitForSelector('#cart-rec .cc', { timeout: 10000 }).catch(() => {})
  const suggested = await page.$$eval('#cart-rec .cc-title', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check('an empty basket suggests courses', suggested.length > 0, `${suggested.length}`)

  const real = await (await fetch(`${API}/courses?perPage=50`)).json()
  const titles = real.data.map((c) => c.title)
  check(
    'and they are real courses, not the prototype fixtures',
    suggested.every((s) => titles.includes(s)),
    suggested.filter((s) => !titles.includes(s)).join(', ') || 'all real',
  )

  const links = await page.$$eval('#cart-rec .cc-title a', (els) =>
    els.map((a) => a.getAttribute('href')),
  )
  check(
    'linking by slug, not by COURSE-00n',
    links.every((h) => /^\/th\/courses\/[a-z0-9-]+$/.test(h)),
    links[0] ?? '(none)',
  )

  const realErrors = errors.filter(
    (e) => !/favicon|Vue Devtools|Failed to load resource|401 \(Unauthorized\)/i.test(e),
  )
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
} finally {
  await cleanUp()
}

console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
