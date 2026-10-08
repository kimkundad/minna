/**
 * Buys something, in a real browser, as a real account.
 *
 *   node scripts/flow-checkout.mjs [baseUrl]
 *
 * Registers a throwaway student, takes a free course through to a granted
 * order, then takes a paid one as far as Stripe's own page — and no further,
 * because entering card details on somebody else's site is not this test's
 * business. The account and everything it created are deleted at the end,
 * whether the test passed or not.
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

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

/* ---------------- a throwaway buyer ---------------- */

const stamp = Date.now()
const buyer = {
  email: `flow-checkout-${stamp}@example.com`,
  password: 'Str0ng-Pass!2026',
  firstName: 'มาลี',
  lastName: 'ทดสอบ',
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
  console.error('could not register a test buyer:', register.status, await register.text())
  process.exit(1)
}
console.log(`  buyer: ${buyer.email}\n`)

/* ---------------- what is on sale ---------------- */

const courses = await (await fetch(`${API}/courses?perPage=50`)).json()
const free = courses.data.find((c) => c.price === 0)
const paid = courses.data.find((c) => c.price > 0 && c.sellable)

const browser = await puppeteer.launch({
  executablePath: BROWSERS.find((p) => existsSync(p)),
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

/**
 * There is no self-delete endpoint — deleting your own account is a product
 * decision nobody has made — so the row goes directly, through a script that
 * refuses any address which is not a test one. The database's cascades take
 * the orders and entitlements with it.
 */
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
  } catch (err) {
    console.log(`\n  !! could not delete ${buyer.email} — remove it by hand`, String(err).slice(0, 200))
  }
}

try {
  /* ---------------- 1. the gate ---------------- */

  await page.goto(`${BASE}/th/checkout?items=${paid.slug}`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.co-guest, .co-layout', { timeout: 10000 })
  check('a signed-out visitor meets the gate', (await page.$('.co-guest')) !== null)

  const preview = await page.$$eval('.co-mini li', (els) => els.map((e) => e.innerText))
  check(
    'and is shown what is waiting behind it',
    preview.length === 1 && preview[0].includes(paid.title),
    preview[0]?.replace(/\n/g, ' | '),
  )

  /* ---------------- 2. signing in ---------------- */

  await page.click('[data-act="login"]')
  await page.waitForSelector('input[type="email"]', { timeout: 8000 })
  await page.type('input[type="email"]', buyer.email, { delay: 8 })
  await page.type('input[type="password"]', buyer.password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForSelector('.co-layout', { timeout: 15000 })
  check('signing in turns the gate into the order', true)

  /* ---------------- 3. the total is the server's ---------------- */

  const quote = await (async () => {
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ email: buyer.email, password: buyer.password }),
    })
    const { accessToken } = await login.json()
    const res = await fetch(`${API}/checkout/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ lines: [{ kind: 'course', id: paid.id }] }),
    })
    return (await res.json()).data
  })()

  const shownTotal = await page.$eval('.co-total-amt', (el) =>
    Number(el.textContent.replace(/[^\d]/g, '')),
  )
  check(
    'the total on the page is the total the server quoted',
    shownTotal === Math.round(quote.total / 100),
    `page ${shownTotal}, server ${quote.total} satang`,
  )

  // Read as baht with its decimals, not as digits: ฿97.48 stripped of
  // punctuation is 9748, which happens to equal the satang and would have made
  // a broken page look right.
  const vatRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#co-rows-slot .co-rows div')]
    const vat = rows.find((r) => /VAT|ภาษี/i.test(r.querySelector('dt')?.textContent ?? ''))
    return vat ? Number(vat.querySelector('dd').textContent.replace(/[^\d.]/g, '')) : null
  })
  check(
    'VAT is shown where the server charged it',
    quote.vatAmount === 0
      ? vatRow === null
      : Math.abs(vatRow * 100 - quote.vatAmount) < 1,
    `server ${quote.vatAmount} satang, page ฿${vatRow}`,
  )

  /* ---------------- 4. the form has to be filled in ---------------- */

  await page.click('#co-submit')
  await new Promise((r) => setTimeout(r, 600))
  check(
    'confirming with an empty form is refused',
    (await page.$$eval('.field.has-error', (e) => e.length)) > 0,
    `${await page.$$eval('.field.has-error', (e) => e.length)} fields marked`,
  )
  check('and says so near the button', (await page.$eval('#co-cta-msg', (e) => e.textContent.trim())).length > 0)

  /* ---------------- 5. a paid order reaches the payment page ---------------- */

  await page.type('#co-phone', '0812345678', { delay: 8 })
  await page.click('#co-terms')
  await page.screenshot({ path: `${SHOTS}/checkout.png` })

  await page.click('#co-submit')
  await page
    .waitForFunction(() => !location.href.includes('localhost:5174'), { timeout: 25000 })
    .catch(() => {})
  check(
    'a paid order is handed to the payment provider',
    page.url().includes('stripe.com'),
    page.url().slice(0, 70),
  )

  /* ---------------- 6. a free order is granted outright ---------------- */

  if (free) {
    await page.goto(`${BASE}/th/checkout?items=${free.slug}`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('.co-layout', { timeout: 15000 })
    check('a free course asks for no payment method', (await page.$('.co-free')) !== null)
    check('and no tax invoice', (await page.$('#co-sec-tax')) === null)

    await page.type('#co-phone', '0812345678', { delay: 8 })
    await page.click('#co-terms')
    await page.click('#co-submit')
    await page
      .waitForFunction(() => location.pathname.includes('/checkout/success'), { timeout: 20000 })
      .catch(() => {})
    check('claiming it goes straight through', page.url().includes('/checkout/success'), page.url())

    const orderNo = new URL(page.url()).searchParams.get('order')
    check('with an order number to quote at support', Boolean(orderNo), orderNo ?? '(none)')

    /* ---------------- 7. the success page says what happened ---------------- */

    // Waited past the loading box, which is also a `.state-box`.
    await page
      .waitForFunction(() => document.querySelector('.cs-ref, .state-box--error') !== null, {
        timeout: 12000,
      })
      .catch(() => {})
    await new Promise((r) => setTimeout(r, 400))
    const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    check('the success page names the order', body.includes(orderNo), orderNo)
    check('and the course that was claimed', body.includes(free.title), free.title)
    check('and offers somewhere to start', (await page.$('.cs-ctas a')) !== null)

    // The same order, read back through the API: what the page shows has to be
    // what was actually recorded.
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ email: buyer.email, password: buyer.password }),
    })
    const { accessToken } = await login.json()
    const stored = await (
      await fetch(`${API}/orders/by-no/${orderNo}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    ).json()
    check('the order was recorded as paid', stored.data.status === 'paid', stored.data.status)
    check('for nothing', stored.data.total === 0, `${stored.data.total} satang`)
    check(
      'with the course on it',
      stored.data.items.some((i) => i.courseId === free.id),
      stored.data.items.map((i) => i.title).join(', '),
    )

    // And the point of the whole thing: access.
    await page.goto(`${BASE}/th/checkout?items=${free.slug}`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('.co-layout, .state-box', { timeout: 12000 })
    check(
      'buying it again warns that they already have it',
      (await page.evaluate(() => document.body.innerText)).includes('มีสิทธิ์เรียน'),
    )
  }

  const real = errors.filter(
    (e) => !/favicon|Vue Devtools|Failed to load resource|401 \(Unauthorized\)/i.test(e),
  )
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))
} finally {
  await cleanUp()
}

console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
