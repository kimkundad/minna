/**
 * Asking for a full tax invoice at the checkout, as a company and as a person.
 *
 *   node scripts/flow-tax-invoice.mjs [baseUrl]
 *
 * The panel shows one box or the other: a company types its tax ID, a person
 * types their national ID. The check asked for the company's box whichever
 * panel was on screen — so a person who filled theirs in correctly was refused
 * on a box that was not there. Nothing was marked, and the message said to look
 * at the marked fields. The order simply could not be placed.
 *
 * `flow-checkout` never caught it because it only ever buys as a company.
 *
 * So this walks both, and both ways of getting the number wrong: too few digits,
 * which this page answers, and thirteen digits that do not add up, which only
 * the server can answer. Either way the complaint has to land under the box the
 * buyer actually typed in.
 *
 * It stops at Stripe's own page, as `flow-checkout` does — entering card
 * details on somebody else's site is not this test's business. The account is
 * deleted at the end, pass or fail.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

/** Both pass the check digit. The third is thirteen digits that do not. */
const COMPANY_TAX_ID = '0105536000020'
const PERSON_ID = '1101700207595'
const BAD_CHECK_DIGIT = '1234567890123'

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const stamp = Date.now()
const buyer = {
  email: `flow-tax-${stamp}@example.com`,
  password: 'Str0ng-Pass!2026',
  firstName: 'มาลี',
  lastName: 'ทดสอบ',
}

const registered = await fetch(`${API}/auth/register`, {
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
if (!registered.ok) {
  console.error('could not register:', registered.status, await registered.text())
  process.exit(1)
}
console.log(`  buyer: ${buyer.email}\n`)

const courses = await (await fetch(`${API}/courses?perPage=50&locales=th`)).json()
const paid = courses.data.find((c) => c.price > 0 && c.sellable)
if (!paid) {
  console.error('nothing is on sale, so there is no invoice to ask for')
  process.exit(1)
}

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1200 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message)))

  /**
   * Types into the box carrying this name, the way a person does.
   *
   * Through the native setter and an `input` event, because Vue listens for
   * the event rather than for the assignment — and the address is a textarea
   * while the rest are inputs, so the setter has to come from the right
   * prototype.
   */
  const fill = (name, value) =>
    page.evaluate(
      (n, v) => {
        const el = document.querySelector(`[name="${n}"]`)
        if (!el) return false
        const proto =
          el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      },
      name,
      value,
    )

  /** What the page is complaining about, and where. */
  const complaints = () =>
    page.evaluate(() => ({
      cta: document.querySelector('.co-cta-msg, [role="alert"]')?.innerText?.trim() ?? '',
      marked: [...document.querySelectorAll('.field.has-error')]
        .map((f) => f.querySelector('[name]')?.getAttribute('name') ?? '?')
        .join(','),
      url: location.href,
    }))

  const order = () =>
    page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        /สั่งซื้อ|ชำระเงิน|ยืนยัน|confirm|pay/i.test(x.innerText),
      )
      b?.click()
    })

  /** A fresh checkout, signed in, with the buyer's own details already typed. */
  async function openCheckout(signIn) {
    await page.goto(`${BASE}/th/checkout?items=${paid.slug}`, {
      waitUntil: 'networkidle2',
      timeout: 45000,
    })
    if (signIn) {
      await page.waitForSelector('[data-act="login"]', { timeout: 15000 })
      await page.click('[data-act="login"]')
      await page.waitForSelector('input[type="email"]', { timeout: 10000 })
      await page.type('input[type="email"]', buyer.email, { delay: 8 })
      await page.type('input[type="password"]', buyer.password, { delay: 8 })
      await page.click('form button[type="submit"]')
    }
    await page.waitForSelector('.co-layout', { timeout: 20000 })
    await wait(1800)
    await fill('buyerName', 'มาลี ทดสอบ')
    await fill('buyerEmail', buyer.email)
    await fill('buyerPhone', '0812345678')
    await page.evaluate(() => {
      const t = document.querySelector('input[name="terms"], #co-terms')
      if (t && !t.checked) t.click()
    })
  }

  /** Ticks "I want a tax invoice" and picks which kind. */
  async function wantInvoice(type) {
    await page.evaluate(() => document.querySelector('input[name="taxWant"][value="yes"]')?.click())
    await wait(500)
    await page.evaluate(
      (t) => document.querySelector(`input[name="taxType"][value="${t}"]`)?.click(),
      type,
    )
    await wait(500)
  }

  /* ---------------- a person, filled in correctly ---------------- */

  await openCheckout(true)
  await wantInvoice('individual')

  const offered = await page.evaluate(() =>
    [...document.querySelectorAll('#co-sec-tax [name]')].map((e) => e.getAttribute('name')),
  )
  check(
    'the panel asks a person for their national ID, not a tax ID',
    offered.includes('idCard') && !offered.includes('taxId'),
    offered.join(', '),
  )

  await fill('taxFirstName', 'มาลี')
  await fill('taxLastName', 'ทดสอบ')
  await fill('idCard', PERSON_ID)
  await fill('address', '1 ถนนทดสอบ กรุงเทพฯ 10100')
  await order()
  await wait(6000)

  let now = await complaints()
  check(
    'a person with a valid ID reaches the payment page',
    now.url.startsWith('https://checkout.stripe.com/'),
    now.cta || now.url.slice(0, 70),
  )

  /* ---------------- a person, too few digits ---------------- */

  await openCheckout(false)
  await wantInvoice('individual')
  await fill('taxFirstName', 'มาลี')
  await fill('taxLastName', 'ทดสอบ')
  await fill('idCard', '110170020')
  await fill('address', '1 ถนนทดสอบ กรุงเทพฯ 10100')
  await order()
  await wait(2500)

  now = await complaints()
  check('too few digits does not place the order', !now.url.includes('stripe.com'))
  check(
    '  and the complaint is under the box they typed in',
    now.marked.includes('idCard'),
    now.marked || '(nothing marked)',
  )
  check('  with something said about it', now.cta.length > 0, now.cta)

  /* ---------------- a person, thirteen digits that do not add up ---------- */

  await openCheckout(false)
  await wantInvoice('individual')
  await fill('taxFirstName', 'มาลี')
  await fill('taxLastName', 'ทดสอบ')
  await fill('idCard', BAD_CHECK_DIGIT)
  await fill('address', '1 ถนนทดสอบ กรุงเทพฯ 10100')
  await order()
  await wait(6000)

  now = await complaints()
  check('a number that does not add up is refused', !now.url.includes('stripe.com'), now.url.slice(0, 60))
  check(
    "  and the server's answer lands under the same box",
    now.marked.includes('idCard'),
    now.marked || '(nothing marked)',
  )

  /* ---------------- and a company still works ---------------- */

  await openCheckout(false)
  await wantInvoice('corporate')
  await fill('company', 'บริษัท ทดสอบ จำกัด')
  await fill('taxId', COMPANY_TAX_ID)
  await fill('address', '1 ถนนทดสอบ กรุงเทพฯ 10100')
  await order()
  await wait(6000)

  now = await complaints()
  check(
    'a company with a valid tax ID reaches the payment page',
    now.url.startsWith('https://checkout.stripe.com/'),
    now.cta || now.url.slice(0, 70),
  )

  check('nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
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
    console.log(`\n  !! could not delete ${buyer.email}`, String(err).slice(0, 200))
  }
}

console.log(failures ? `\n${failures} failed` : '\n  all good')
process.exit(failures ? 1 : 0)
