/**
 * Puts two real tax invoices in the database so the admin screen can be looked
 * at: one issued, one still waiting on payment.
 *
 *   node scripts/demo-invoices.mjs
 *
 * Remove them with `npx tsx scripts/smoke-invoices-down.mts`, which matches the
 * same `smoke.invoice` accounts.
 *
 * Needs SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD.
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD first.')
  process.exit(2)
}

const CODE = 'SMOKE-INV-100'
const PASSWORD = 'SmokeInv!2026'

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
  try {
    return { status: res.status, body: text ? JSON.parse(text) : null }
  } catch {
    return { status: res.status, body: { raw: text } }
  }
}

async function buyer(label) {
  const email = `smoke.invoice.${label}.${Date.now()}@example.com`
  const res = await call('POST', '/api/v1/auth/register', {
    email,
    password: PASSWORD,
    firstName: 'Demo',
    lastName: label,
    birthdate: '1990-01-01',
    locale: 'th',
    acceptedTerms: true,
  })
  if (!res.body?.accessToken) throw new Error(`register ${label}: ${JSON.stringify(res.body)}`)
  return res.body.accessToken
}

const admin = await call('POST', '/api/v1/auth/login', {
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
})
if (admin.status !== 200) throw new Error(`admin login ${admin.status}`)
token = admin.body.accessToken

const courses = await call('GET', '/api/v1/courses?perPage=1')
const course = courses.body?.data?.[0]
if (!course) throw new Error('no course to buy')

const coupon = await call('POST', '/api/v1/coupons', {
  code: CODE,
  scope: 'order',
  discountType: 'percent',
  value: 100,
  active: true,
})
if (coupon.status !== 201 && coupon.status !== 409) {
  throw new Error(`coupon ${coupon.status}: ${JSON.stringify(coupon.body)}`)
}

/* One that is paid, so it carries a document number. */
const company = await buyer('company')
const paid = await call(
  'POST',
  '/api/v1/checkout',
  {
    lines: [{ kind: 'course', id: course.id }],
    couponCode: CODE,
    method: 'card',
    invoice: {
      type: 'corporate',
      name: 'บริษัท ไอเดียวิวัฒน์ จำกัด',
      taxId: '0105536091238',
      branchType: 'head',
      address: 'เลขที่ 88 อาคารตัวอย่าง ชั้น 12 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
    },
  },
  company,
)
console.log('paid company order:', paid.status, paid.body?.data?.order?.orderNo ?? paid.body)

/* One that stays pending, so the screen shows something not yet issued.
   `markFailed` is what a cancelled Stripe session does, so this is the state a
   real abandoned basket leaves behind. */
const person = await buyer('person')
const pending = await call(
  'POST',
  '/api/v1/checkout',
  {
    lines: [{ kind: 'course', id: course.id }],
    method: 'card',
    invoice: {
      type: 'individual',
      name: 'สมหญิง เรียนดี',
      taxId: '1101700207021',
      address: 'เลขที่ 9/1 ซอยลาดพร้าว 25 แขวงจันทรเกษม เขตจตุจักร กรุงเทพฯ 10900',
    },
  },
  person,
)
console.log('pending personal order:', pending.status, pending.body?.data?.order?.orderNo ?? JSON.stringify(pending.body).slice(0, 200))

console.log('\nOpen /invoices in the admin.')
console.log('Clear up with: npx tsx scripts/smoke-invoices-down.mts')
