/**
 * Coming back from the payment page.
 *
 *   node scripts/flow-paid-return.mjs [baseUrl]
 *
 * Stripe sends the buyer to our own success URL once they have paid. This walks
 * that landing: a PromptPay order is placed, the page is opened at exactly the
 * address Stripe would send them to, and it should say the payment is still
 * being waited for — then, the moment the money is recorded, flip by itself to
 * "paid" with a way through to the course.
 *
 * The money is recorded through the superadmin mark-paid route rather than by
 * really paying, because a test cannot scan a QR code. Everything after that
 * point — the polling, the wording, the buttons, the access — is the real path.
 *
 * Deletes its accounts at the end, pass or fail.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const SHOTS = process.env.SHOT_DIR ?? '.'


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const password = 'Str0ng-Pass!2026'
async function register(tag) {
  const email = `flow-${tag}-${Date.now()}@example.com`
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '2000-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  if (!res.ok) {
    console.error('could not register:', res.status, await res.text())
    process.exit(1)
  }
  const body = await res.json()
  return { email, password, id: body.user.id, token: body.accessToken }
}

const buyer = await register('return')
const superadmin = await register('return-super')
console.log(`  buyer: ${buyer.email}\n`)

// Somebody has to be able to say the money arrived. Promoting an account is an
// admin screen's job; this needs one for the length of the run, and the script
// it calls refuses any address that is not a test one.
const { execFileSync } = await import('node:child_process')
const promoted = execFileSync(
  'npx',
  ['tsx', 'scripts/grant-role.mts', superadmin.email, 'superadmin'],
  { cwd: '../api', encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
).trim()
console.log('  ' + promoted.split('\n').pop())

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
  for (const who of [buyer, superadmin]) {
    try {
      const out = execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', who.email], {
        cwd: '../api',
        encoding: 'utf8',
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      console.log('\n  ' + out.trim().split('\n')[0])
    } catch {
      console.log(`\n  !! could not delete ${who.email} — remove it by hand`)
    }
  }
}

const body = () => page.evaluate(() => document.body.innerText)

try {
  /* ---------------- 1. a PromptPay order, unpaid ---------------- */

  /**
   * A course priced in baht, because this orders by PromptPay.
   *
   * PromptPay is a Thai bank transfer and Stripe only offers it for THB, so
   * the API refuses it for anything else. Taking the first sellable course
   * started failing the moment one was priced in dollars — the refusal was
   * right and this test's pick was wrong.
   */
  const sellable = (await (await fetch(`${API}/courses?perPage=50`)).json()).data.filter(
    (c) => c.price > 0 && c.sellable,
  )
  const paid = sellable.find((c) => (c.currency ?? 'THB') === 'THB')
  if (!paid) throw new Error('needs a sellable course priced in THB for a PromptPay order')
  const placed = await (
    await fetch(`${API}/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${buyer.token}`,
      },
      body: JSON.stringify({ lines: [{ kind: 'course', id: paid.id }], method: 'promptpay' }),
    })
  ).json()
  const order = placed.data.order
  check('a PromptPay order starts unpaid', order.status === 'pending', order.status)
  check(
    'and Stripe is given somewhere of ours to send them back to',
    String(placed.data.url ?? '').includes('stripe.com'),
    String(placed.data.url ?? '').slice(0, 48),
  )

  /* ---------------- 2. the address Stripe sends them to ---------------- */

  // Exactly what Stripe was told to send them to, read back off the session
  // rather than written out again here — a test that builds its own address
  // proves nothing about the one the buyer actually follows.
  const stripeSession = await (
    await fetch(`${API}/orders/by-no/${order.orderNo}`, {
      headers: { Authorization: `Bearer ${buyer.token}` },
    })
  ).json()
  check(
    'the order knows which Stripe session is paying for it',
    Boolean(stripeSession.data.providerRef),
    String(stripeSession.data.providerRef),
  )

  const landing = `${BASE}/th/checkout/success?order=${order.orderNo}&session=${order.providerRef}`

  // Signed in through the real dialog first — the success page asks the API
  // about an order, and an order belongs to somebody.
  await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.hdr-auth button', { timeout: 10000 })
  await page.click('.hdr-auth button')
  await page.waitForSelector('input[type="password"]', { timeout: 10000 })
  await page.type('input[type="email"]', buyer.email, { delay: 8 })
  await page.type('input[type="password"]', buyer.password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), {
    timeout: 15000,
  })

  await page.goto(landing, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.cs-ref', { timeout: 12000 })
  check('the landing page knows the order', (await body()).includes(order.orderNo), order.orderNo)

  // And the same address without a language in front of it — which is what the
  // API used to build, and what any session already issued still carries.
  await page.goto(
    `${BASE}/checkout/success?order=${order.orderNo}&session=${order.providerRef}`,
    { waitUntil: 'networkidle2' },
  )
  await page.waitForSelector('.cs-ref', { timeout: 12000 }).catch(() => {})
  check(
    'a link with no language still reaches the order',
    page.url().includes('/checkout/success') && (await body()).includes(order.orderNo),
    page.url().replace(BASE, ''),
  )
  check(
    'and says the money has not arrived yet',
    (await body()).includes('รอ') || (await body()).includes('กำลัง'),
    (await page.$eval('h1', (el) => el.textContent.trim())).slice(0, 60),
  )

  /* ---------------- 3. the money arrives ---------------- */

  const superLogin = await (
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ email: superadmin.email, password }),
    })
  ).json()
  const marked = await fetch(`${API}/orders/${order.id}/mark-paid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${superLogin.accessToken}`,
    },
    body: JSON.stringify({ reason: 'flow test: standing in for a real PromptPay payment' }),
  })
  check('the payment is recorded', marked.ok, String(marked.status))

  // No reload: the page polls while an order is pending, which is the whole
  // point — somebody who paid on their phone should not have to refresh.
  // The heading, not the whole page: "สำเร็จ" appears in the steps strip too,
  // and a check that passes before anything happened is worse than no check.
  const flipped = await page
    .waitForFunction(() => document.querySelector('h1')?.textContent?.includes('สำเร็จ'), {
      timeout: 20000,
    })
    .then(() => true)
    .catch(() => false)
  check('the page notices by itself, without a refresh', flipped)
  check(
    'and says the payment succeeded',
    (await page.$eval('h1', (el) => el.textContent.trim())).includes('สำเร็จ'),
    await page.$eval('h1', (el) => el.textContent.trim()),
  )

  /* ---------------- 4. and offers the way on ---------------- */

  const ctas = await page.$$eval('.cs-ctas a', (els) =>
    els.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
  )
  check(
    'there is a "my courses" button',
    ctas.some((c) => c.href === '/th/account/learning'),
    ctas.map((c) => `${c.text} → ${c.href}`).join(' | ') || '(none)',
  )
  check(
    'and one that opens the course just bought',
    // The learning room, not the sales page: somebody who has just paid wants
    // the first lesson, not the page that asked them to buy it.
    ctas.some((c) => c.href?.includes(paid.slug)),
    ctas.map((c) => c.href).join(' | '),
  )
  await new Promise((r) => setTimeout(r, 1200))
  await page.screenshot({ path: `${SHOTS}/paid-return.png` })

  const toCourses = ctas.find((c) => c.href === '/th/account/learning')
  if (toCourses) {
    await page.goto(`${BASE}${toCourses.href}`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('[data-mc]', { timeout: 12000 })
    check(
      'which leads to the shelf with the course on it',
      (await page.$eval('[data-mc] h3', (el) => el.textContent.trim())) === paid.title,
      await page.$eval('[data-mc] h3', (el) => el.textContent.trim()),
    )
  } else {
    check('which leads to the shelf with the course on it', false, 'no button to follow')
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
