/**
 * Makes one real paid order so the admin's Orders screen can be looked at, and
 * removes it again.
 *
 *   node scripts/demo-order.mjs up    — registers a throwaway student, creates a
 *                                       100%-off coupon, buys a course with it
 *   node scripts/demo-order.mjs down  — deletes all of it
 *
 * It goes through the real endpoints rather than writing rows, so what the
 * screen shows is what a customer would actually produce. A 100% coupon takes
 * the total to zero, which is the one path that completes a purchase without
 * Stripe — and it exercises coupon redemption counting at the same time.
 *
 * Needs SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD.
 */
const BASE = process.argv[3] ?? 'http://127.0.0.1:3000'
const MODE = process.argv[2] ?? 'up'
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD first.')
  process.exit(2)
}

/** Fixed, so `down` can find what `up` made without a state file. */
const CODE = 'DEMO-ORDER-100'
const STUDENT_EMAIL = 'demo.order@example.com'
const STUDENT_PASSWORD = 'DemoOrder!2026'

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

async function signInAdmin() {
  const res = await call('POST', '/api/v1/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  if (res.status !== 200) throw new Error(`admin login ${res.status}: ${JSON.stringify(res.body)}`)
  token = res.body.accessToken
}

async function up() {
  await signInAdmin()

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
  // 409 means a previous run left it behind, which is fine — it is the same
  // coupon either way, and this has to be safe to repeat.
  if (coupon.status === 201) console.log(`coupon ${CODE} created`)
  else if (coupon.status === 409) console.log(`coupon ${CODE} already existed`)
  else throw new Error(`coupon ${coupon.status}: ${JSON.stringify(coupon.body)}`)

  // Register, or sign in if a previous run left the account behind.
  let studentToken = null
  const reg = await call('POST', '/api/v1/auth/register', {
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
    firstName: 'Demo',
    lastName: 'Order',
    birthdate: '1995-06-15',
    locale: 'th',
    memberType: 'student',
    acceptedTerms: true,
  })
  if (reg.status === 201 || reg.status === 200) {
    studentToken = reg.body.accessToken
    console.log(`student ${STUDENT_EMAIL} registered`)
  } else {
    const login = await call('POST', '/api/v1/auth/login', {
      email: STUDENT_EMAIL,
      password: STUDENT_PASSWORD,
    })
    if (login.status !== 200) {
      throw new Error(`student ${reg.status}/${login.status}: ${JSON.stringify(reg.body)}`)
    }
    studentToken = login.body.accessToken
    console.log(`student ${STUDENT_EMAIL} already existed`)
  }

  const checkout = await call(
    'POST',
    '/api/v1/checkout',
    { lines: [{ kind: 'course', id: course.id }], couponCode: CODE, method: 'card' },
    studentToken,
  )
  if (checkout.status !== 201) {
    throw new Error(`checkout ${checkout.status}: ${JSON.stringify(checkout.body)}`)
  }
  const order = checkout.body.data.order
  console.log(`order ${order.orderNo} — ${order.status}, total ${order.total} satang`)
  console.log(`\nSign in to the admin and open /orders — search for ${order.orderNo}`)
}

if (MODE !== 'up') {
  // There is deliberately no API route that deletes an order: a paid order is a
  // record, and nothing a request can reach should be able to erase one.
  // Tearing the demo down is a database job — see scripts/demo-order-down.mts.
  console.error('Only "up" lives here. Use: npx tsx scripts/demo-order-down.mts')
  process.exit(2)
}

up().catch((err) => {
  console.error(String(err))
  process.exit(1)
})
