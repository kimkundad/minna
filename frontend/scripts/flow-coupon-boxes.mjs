/**
 * The two coupon boxes on the checkout, and what each says when it refuses.
 *
 *   node scripts/flow-coupon-boxes.mjs [baseUrl]
 *
 * There is a box on every course and one on the basket, and nothing on either
 * says which codes belong where, because only the coupon knows. A basket code
 * typed into a course's box used to be quietly moved to the basket: it looked
 * like it had worked, and then there was no way out of it. The line showed no
 * discount, so there was no chip to remove; typing the same code into the box
 * it belonged in did nothing either, because the discount had already been
 * given and the total would not move again — and the page called that "that
 * coupon does not apply", about a perfectly good code.
 *
 * So the box refuses it, says which box it belongs in, and leaves the code out
 * of the basket. This walks that in a browser, because the trap was in what
 * the page did with the answer rather than in the answer.
 *
 * The API's own rules are proved in `api/scripts/smoke-coupon-scope.mts`.
 *
 * The throwaway account is deleted at the end, pass or fail.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

/** A basket coupon the seeds create. Nothing here changes it. */
const BASKET_CODE = process.env.BASKET_COUPON ?? 'TEST10'

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const stamp = Date.now()
const buyer = {
  email: `flow-coupon-${stamp}@example.com`,
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

const courses = await (await fetch(`${API}/courses?perPage=50`)).json()
const paid = courses.data.find((c) => c.price > 0 && c.sellable)
if (!paid) {
  console.error('nothing is on sale, so there is no coupon box to type into')
  process.exit(1)
}

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })

/** Whatever the checkout currently says the order comes to, in whole units. */
const total = (page) =>
  page.$eval('.co-total-amt', (el) => Number(el.textContent.replace(/[^\d]/g, '')))

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1200 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message)))

  await page.goto(`${BASE}/th/checkout?items=${paid.slug}`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.co-guest, .co-layout', { timeout: 10000 })

  await page.click('[data-act="login"]')
  await page.waitForSelector('input[type="email"]', { timeout: 8000 })
  await page.type('input[type="email"]', buyer.email, { delay: 8 })
  await page.type('input[type="password"]', buyer.password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForSelector('.co-layout', { timeout: 15000 })
  await wait(1200)

  const before = await total(page)
  check('the order has a total to discount', before > 0, String(before))

  /* ---------------- 1. a basket code, typed on the course ---------------- */

  const courseForm = `[data-cp-form="${paid.slug}"]`
  await page.waitForSelector(courseForm, { timeout: 8000 })
  await page.type(`${courseForm} input[name="code"]`, BASKET_CODE, { delay: 8 })
  await page.click(`${courseForm} button[type="submit"]`)
  await wait(2500)

  check('the total did not move', (await total(page)) === before, `${await total(page)}`)

  const courseError = await page
    .$eval(`${courseForm} .field-error`, (el) => el.innerText.trim())
    .catch(() => '')
  check('the course box says it was refused', courseError.length > 0, courseError)
  check(
    '  and says which box it belongs in, not just "does not apply"',
    /ตะกร้า|basket/i.test(courseError),
    courseError,
  )

  /* ---------------- 2. and it can be taken back out ---------------- */

  const clear = await page.$(`[data-cp-clear="${paid.slug}"]`)
  check('a refused code can be cleared in one click', clear !== null)
  if (clear) {
    await clear.click()
    await wait(1500)
    const left = await page.$eval(`${courseForm} input[name="code"]`, (el) => el.value)
    check('  and the box is empty afterwards', left === '', JSON.stringify(left))
    const stillWrong = await page
      .$eval(`${courseForm} .field-error`, (el) => el.innerText.trim())
      .catch(() => '')
    check('  with the complaint gone too', stillWrong === '', stillWrong)
  }

  /* ---------------- 3. the same code, in the box it belongs in ------------ */

  const basketForm = '[data-cp-form="order"], .co-sum form'
  await page.waitForSelector(basketForm, { timeout: 8000 })
  await page.type(`${basketForm} input[name="code"]`, BASKET_CODE, { delay: 8 })
  await page.click(`${basketForm} button[type="submit"]`)
  await wait(2500)

  const after = await total(page)
  check(
    'the same code works in the basket box — which it could not before',
    after < before,
    `${before} → ${after}`,
  )

  const basketError = await page
    .$eval(`${basketForm} .field-error`, (el) => el.innerText.trim())
    .catch(() => '')
  check('  with nothing said against it', basketError === '', basketError)

  /* ---------------- 4. a code nobody issued ---------------- */

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.co-sum button, .co-cp-applied button')].find((b) =>
      /ลบคูปอง|remove/i.test(b.innerText + (b.getAttribute('aria-label') ?? '')),
    )
    btn?.click()
  })
  await wait(2000)
  await page.type(`${basketForm} input[name="code"]`, `NOPE${stamp}`, { delay: 8 })
  await page.click(`${basketForm} button[type="submit"]`)
  await wait(2500)
  const unknown = await page
    .$eval(`${basketForm} .field-error`, (el) => el.innerText.trim())
    .catch(() => '')
  check('a made-up code is refused with a reason', unknown.length > 0, unknown)

  check('nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
  // The same remover the other flow scripts use. It carries the guard that
  // only a flow/smoke address at example.com can be deleted, so the rule lives
  // in one place rather than in each test.
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
    console.log(
      `\n  !! could not delete ${buyer.email} — remove it by hand`,
      String(err).slice(0, 200),
    )
  }
}

console.log(failures ? `\n${failures} failed` : '\n  all good')
process.exit(failures ? 1 : 0)
