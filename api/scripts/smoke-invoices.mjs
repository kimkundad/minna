/**
 * Exercises the full tax invoice: asked for at checkout, numbered when the
 * order is paid, read back from the admin.
 *
 *   node scripts/smoke-invoices.mjs [baseUrl]
 *
 * Needs SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD. It buys with a 100% coupon
 * so the order completes without Stripe, and removes everything it made —
 * including, through the database, the orders it cannot delete over HTTP.
 */
import { execFileSync } from 'node:child_process'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD first.')
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

let token = null
async function call(method, path, body, asToken = token) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'
  if (asToken) headers.Authorization = `Bearer ${asToken}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, body: json }
}

/* Real thirteen-digit numbers, in the sense that the check digit adds up. */
const GOOD_TAX_ID = '0105536091238'
const GOOD_ID_CARD = '1101700207021'
// The same number with the check digit one out, which is exactly the typo
// this is meant to catch.
const BAD_TAX_ID = '0105536091239'

const CODE = 'SMOKE-INV-100'
const STUDENT = 'smoke.invoice@example.com'
const PASSWORD = 'SmokeInv!2026'

async function main() {
  const login = await call('POST', '/api/v1/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  if (login.status !== 200) {
    console.error('admin login failed:', login.status)
    process.exit(2)
  }
  token = login.body.accessToken

  const courses = await call('GET', '/api/v1/courses?perPage=1')
  const course = courses.body?.data?.[0]
  check('a course exists to buy', Boolean(course))
  if (!course) return

  const coupon = await call('POST', '/api/v1/coupons', {
    code: CODE,
    scope: 'order',
    discountType: 'percent',
    value: 100,
    active: true,
  })
  check('a 100% coupon to pay with', coupon.status === 201, JSON.stringify(coupon.body))

  const reg = await call('POST', '/api/v1/auth/register', {
    email: STUDENT,
    password: PASSWORD,
    firstName: 'Smoke',
    lastName: 'Invoice',
    birthdate: '1990-01-01',
    locale: 'th',
    acceptedTerms: true,
  })
  let buyer = reg.body?.accessToken
  if (!buyer) {
    const again = await call('POST', '/api/v1/auth/login', { email: STUDENT, password: PASSWORD })
    buyer = again.body?.accessToken
  }
  check('a buyer to buy as', Boolean(buyer))
  if (!buyer) return

  /* ---- the details are checked before anything is created ---- */

  const badDigit = await call(
    'POST',
    '/api/v1/checkout',
    {
      lines: [{ kind: 'course', id: course.id }],
      couponCode: CODE,
      method: 'card',
      invoice: {
        type: 'corporate',
        name: 'บริษัท ตัวอย่าง จำกัด',
        taxId: BAD_TAX_ID,
        branchType: 'head',
        address: '1 ถนนตัวอย่าง กรุงเทพฯ 10110',
      },
    },
    buyer,
  )
  check('a tax ID whose check digit is wrong is refused', badDigit.status === 422, String(badDigit.status))
  check(
    'and the message lands on the tax ID field',
    Boolean(badDigit.body?.error?.fields?.taxId),
    JSON.stringify(badDigit.body?.error?.fields),
  )

  const headWithBranch = await call(
    'POST',
    '/api/v1/checkout',
    {
      lines: [{ kind: 'course', id: course.id }],
      couponCode: CODE,
      method: 'card',
      invoice: {
        type: 'corporate',
        name: 'บริษัท ตัวอย่าง จำกัด',
        taxId: GOOD_TAX_ID,
        branchType: 'branch',
        branchCode: '00000',
        address: '1 ถนนตัวอย่าง',
      },
    },
    buyer,
  )
  check('a branch calling itself 00000 is refused', headWithBranch.status === 422, String(headWithBranch.status))

  const noBranchType = await call(
    'POST',
    '/api/v1/checkout',
    {
      lines: [{ kind: 'course', id: course.id }],
      couponCode: CODE,
      method: 'card',
      invoice: {
        type: 'corporate',
        name: 'บริษัท ตัวอย่าง จำกัด',
        taxId: GOOD_TAX_ID,
        address: '1 ถนนตัวอย่าง',
      },
    },
    buyer,
  )
  check('a company with no branch type is refused', noBranchType.status === 422, String(noBranchType.status))

  const orders0 = await call('GET', `/api/v1/orders?q=${encodeURIComponent(STUDENT)}`)
  check(
    'none of those refusals left an order behind',
    orders0.body?.meta?.total === 0,
    `total=${orders0.body?.meta?.total}`,
  )

  /* ---- the good one ---- */

  const bought = await call(
    'POST',
    '/api/v1/checkout',
    {
      lines: [{ kind: 'course', id: course.id }],
      couponCode: CODE,
      method: 'card',
      invoice: {
        type: 'corporate',
        name: 'บริษัท ตัวอย่าง จำกัด',
        // Spaced and dashed, the way it is printed on a company's letterhead.
        taxId: '0-1055-36091-23-8',
        branchType: 'head',
        address: '1 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10110',
      },
    },
    buyer,
  )
  check('buying with a tax invoice asked for', bought.status === 201, JSON.stringify(bought.body))
  const orderNo = bought.body?.data?.order?.orderNo

  const list = await call('GET', `/api/v1/invoices?q=${encodeURIComponent(orderNo ?? 'none')}`)
  const invoice = list.body?.data?.[0]
  check('the invoice is on the admin list', Boolean(invoice), JSON.stringify(list.body?.meta))
  if (!invoice) return

  check('the tax ID was stored as digits only', invoice.taxId === GOOD_TAX_ID, invoice.taxId)
  check('a head office was filled in as 00000', invoice.branchCode === '00000', invoice.branchCode)
  check(
    'paying allocated a document number',
    /^INV-\d{6}-\d{4}$/.test(invoice.documentNo ?? ''),
    String(invoice.documentNo),
  )
  check('and stamped when it was issued', Boolean(invoice.issuedAt), String(invoice.issuedAt))

  const issuedAgain = await call('POST', `/api/v1/invoices/${invoice.id}/issue`)
  check('it cannot be issued a second time', issuedAgain.status === 409, String(issuedAgain.status))

  const amend = await call('PATCH', `/api/v1/invoices/${invoice.id}`, {
    type: 'corporate',
    name: 'บริษัท เปลี่ยนชื่อ จำกัด',
    taxId: GOOD_TAX_ID,
    branchType: 'head',
    address: '2 ถนนอื่น',
  })
  check('an issued invoice cannot be amended', amend.status === 409, String(amend.status))

  const byStatus = await call('GET', '/api/v1/invoices?status=issued&perPage=100')
  check(
    'it shows under issued',
    (byStatus.body?.data ?? []).some((i) => i.id === invoice.id),
  )
  const requested = await call('GET', '/api/v1/invoices?status=requested&perPage=100')
  check(
    'and not under requested',
    !(requested.body?.data ?? []).some((i) => i.id === invoice.id),
  )

  /* ---- an individual, and buying without asking for one ---- */

  const second = await call(
    'POST',
    '/api/v1/auth/register',
    {
      email: `smoke.invoice.2.${Date.now()}@example.com`,
      password: PASSWORD,
      firstName: 'Smoke',
      lastName: 'Receipt',
      birthdate: '1990-01-01',
      locale: 'th',
      acceptedTerms: true,
    },
  )
  const plainBuyer = second.body?.accessToken
  if (plainBuyer) {
    const plain = await call(
      'POST',
      '/api/v1/checkout',
      { lines: [{ kind: 'course', id: course.id }], couponCode: CODE, method: 'card' },
      plainBuyer,
    )
    check('buying without asking for a tax invoice still works', plain.status === 201, String(plain.status))

    const after = await call('GET', `/api/v1/invoices?q=${plain.body?.data?.order?.orderNo}`)
    check('and makes no invoice row', after.body?.meta?.total === 0, JSON.stringify(after.body?.meta))
  }

  const missing = await call('POST', '/api/v1/invoices/999999/issue')
  check('an invoice that does not exist is a 404', missing.status === 404, String(missing.status))

  // An individual, by national ID rather than a company tax ID.
  const third = await call('POST', '/api/v1/auth/register', {
    email: 'smoke.invoice.3.' + Date.now() + '@example.com',
    password: PASSWORD,
    firstName: 'Smoke',
    lastName: 'Person',
    birthdate: '1990-01-01',
    locale: 'th',
    acceptedTerms: true,
  })
  const person = third.body?.accessToken
  const personBuy = await call('POST', '/api/v1/checkout', {
    lines: [{ kind: 'course', id: course.id }],
    couponCode: CODE,
    method: 'card',
    invoice: {
      type: 'individual',
      name: 'สมชาย ใจดี',
      taxId: GOOD_ID_CARD,
      address: '9 ซอยตัวอย่าง กรุงเทพฯ 10220',
    },
  }, person)
  check('an individual can ask for one too', personBuy.status === 201, JSON.stringify(personBuy.body))

  const personList = await call('GET', '/api/v1/invoices?q=' + personBuy.body?.data?.order?.orderNo)
  const personInvoice = personList.body?.data?.[0]
  check('a person gets no branch', personInvoice?.branchType === null && personInvoice?.branchCode === null, JSON.stringify({ t: personInvoice?.branchType, c: personInvoice?.branchCode }))
  check('and their own document number, one on from the first', personInvoice?.documentNo !== invoice.documentNo, String(personInvoice?.documentNo))
}

async function cleanup() {
  // The orders have to go before the coupon can: a redemption points at it.
  try {
    execFileSync('npx', ['tsx', 'scripts/smoke-invoices-down.mts'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
  } catch {
    console.log('  NOTE  teardown failed — run scripts/smoke-invoices-down.mts by hand')
  }
}

main()
  .catch((err) => {
    failed++
    console.log(`  FAIL  threw — ${err}`)
  })
  .then(cleanup)
  .then(() => {
    console.log(`\n  ${passed} passed, ${failed} failed`)
    process.exit(failed ? 1 : 0)
  })
