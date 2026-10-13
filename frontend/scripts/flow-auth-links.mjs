/**
 * Walks the two pages an emailed link lands on, with real tokens.
 *
 *   node scripts/flow-auth-links.mjs <resetToken> <verifyToken>
 *
 * The tokens come from api/scripts/make-auth-links.mts, which creates a
 * throwaway account and prints them. Nothing here is faked: the reset actually
 * changes a password and the verification actually marks an address verified,
 * which is the only way to know the links work.
 */
import { launchBrowser } from './browser.mjs'

const SITE = process.env.SITE_URL ?? 'http://localhost:5174'
const SHOTS = 'C:/Users/brack/AppData/Local/Temp/shots'

const [resetToken, verifyToken] = process.argv.slice(2)
if (!resetToken || !verifyToken) {
  console.error('usage: node scripts/flow-auth-links.mjs <resetToken> <verifyToken>')
  process.exit(2)
}

let passed = 0
let failed = 0
function check(label, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1100, height: 900 })

const problems = []
page.on('pageerror', (e) => problems.push(String(e)))

const text = () => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').trim())

/**
 * Replaces what is in a field.
 *
 * Clearing it by assigning to `value` does not tell Vue, and its next render
 * writes the model straight back over it — so the box filled up instead of
 * emptying, and the form was submitted with three attempts concatenated.
 */
async function fill(selector, value) {
  const el = await page.$(selector)
  await el.click({ clickCount: 3 })
  await el.press('Backspace')
  await el.type(value)
}
const here = () => page.evaluate(() => location.pathname + location.search)

/* ---- the address the email actually contains: no locale ---- */

await page.goto(`${SITE}/reset-password?token=${resetToken}`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 900))

check(
  'a link with no locale keeps its token instead of being thrown away',
  (await here()).includes(`token=${resetToken}`),
  await here(),
)
check('and lands on the reset page', (await here()).includes('/reset-password'), await here())
check(
  'which shows the form rather than an error',
  Boolean(await page.$('#rp-new')),
  (await text()).slice(0, 80),
)
await page.screenshot({ path: `${SHOTS}/auth-reset-form.png` })

/* ---- the two boxes have to agree ---- */

await fill('#rp-new', 'NewPass!2026x')
await fill('#rp-again', 'DifferentOne!99')
await page.click('button[type="submit"]')
await new Promise((r) => setTimeout(r, 600))
check(
  'two different passwords are refused without asking the server',
  (await text()).includes('ไม่ตรงกัน'),
  (await text()).slice(-120),
)

/* ---- a password the API itself refuses ---- */

await fill('#rp-new', 'abcdefgh')
await fill('#rp-again', 'abcdefgh')
await page.click('button[type="submit"]')
await new Promise((r) => setTimeout(r, 1400))
const weak = await text()
check(
  'a password with no number is refused, and the reason is shown',
  weak.includes('ตัวเลข') || weak.toLowerCase().includes('number'),
  weak.slice(-160),
)
await page.screenshot({ path: `${SHOTS}/auth-reset-weak.png` })

/* ---- and a good one goes through ---- */

await fill('#rp-new', 'NewPass!2026x')
await fill('#rp-again', 'NewPass!2026x')
await page.click('button[type="submit"]')
await new Promise((r) => setTimeout(r, 1800))
const after = await text()
check('a good password is accepted', after.includes('ตั้งรหัสผ่านใหม่แล้ว'), after.slice(0, 160))
check('and it points at signing in again', Boolean(await page.$('a[href*="auth=login"]')))
await page.screenshot({ path: `${SHOTS}/auth-reset-done.png` })

/* ---- the same token a second time ---- */

await page.goto(`${SITE}/reset-password?token=${resetToken}`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 700))
await fill('#rp-new', 'Another!2026x')
await fill('#rp-again', 'Another!2026x')
await page.click('button[type="submit"]')
await new Promise((r) => setTimeout(r, 1500))
check(
  'a token that has been used once is refused the second time',
  (await text()).includes('ใช้ไม่ได้แล้ว'),
  (await text()).slice(0, 160),
)
await page.screenshot({ path: `${SHOTS}/auth-reset-used.png` })

/* ---- no token at all ---- */

await page.goto(`${SITE}/th/reset-password`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 700))
check(
  'arriving with no token says so rather than showing an unusable form',
  (await text()).includes('ไม่สมบูรณ์') && !(await page.$('#rp-new')),
  (await text()).slice(0, 120),
)

/* ---- verifying an address ---- */

await page.goto(`${SITE}/verify-email?token=${verifyToken}`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1800))
check(
  'the verification link verifies without asking for anything',
  (await text()).includes('ยืนยันอีเมลเรียบร้อย'),
  (await text()).slice(0, 160),
)
await page.screenshot({ path: `${SHOTS}/auth-verify-done.png` })

await page.goto(`${SITE}/verify-email?token=${verifyToken}`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1800))
check(
  'and the same link a second time fails rather than claiming success',
  (await text()).includes('ยืนยันไม่สำเร็จ'),
  (await text()).slice(0, 160),
)
await page.screenshot({ path: `${SHOTS}/auth-verify-used.png` })

await page.goto(`${SITE}/th/verify-email`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 900))
check('arriving with no token says so', (await text()).includes('ไม่สมบูรณ์'), (await text()).slice(0, 120))

if (problems.length) console.log('\nproblems:', problems)
await browser.close()

console.log(`\n  ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
