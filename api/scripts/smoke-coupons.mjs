/**
 * Exercises the coupon admin endpoints, and then spends one at checkout to
 * prove the two halves agree about what a coupon is worth.
 *
 *   node scripts/smoke-coupons.mjs [baseUrl]
 *
 * Needs a superadmin to sign in as — pass its credentials through the
 * environment, SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD. Every coupon it
 * creates is deleted again at the end, including after a failure.
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const EMAIL = process.env.SMOKE_ADMIN_EMAIL
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD

if (!EMAIL || !PASSWORD) {
  console.error('Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD first.')
  process.exit(2)
}

let passed = 0
let failed = 0
/** Everything to tidy up, newest first. */
const made = []

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

async function call(method, path, body) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'
  if (token) headers.Authorization = `Bearer ${token}`

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

const stamp = Date.now().toString(36).toUpperCase()

async function main() {
  const login = await call('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD })
  if (login.status !== 200) {
    console.error('Could not sign in:', login.status, JSON.stringify(login.body))
    process.exit(2)
  }
  token = login.body.accessToken
  check('sign in as admin', true)

  const courses = await call('GET', '/api/v1/courses?perPage=1')
  const course = courses.body?.data?.[0]
  check('a course exists to attach a coupon to', Boolean(course))
  if (!course) return

  /* ---- create ---- */

  const orderCoupon = await call('POST', '/api/v1/coupons', {
    code: `smoke-order-${stamp}`,
    scope: 'order',
    discountType: 'percent',
    value: 10,
    maxDiscount: 50000,
    minSubtotal: 100000,
    active: true,
  })
  check('create an order coupon', orderCoupon.status === 201, JSON.stringify(orderCoupon.body))
  if (orderCoupon.body?.data?.id) made.push(orderCoupon.body.data.id)

  check(
    'the code is stored upper-case',
    orderCoupon.body?.data?.code === `SMOKE-ORDER-${stamp}`,
    orderCoupon.body?.data?.code,
  )
  check('a live coupon reads as live', orderCoupon.body?.data?.status === 'live', orderCoupon.body?.data?.status)

  const courseCoupon = await call('POST', '/api/v1/coupons', {
    code: `smoke-course-${stamp}`,
    scope: 'course',
    courseId: course.id,
    discountType: 'fixed',
    value: 20000,
    active: true,
  })
  check('create a course coupon', courseCoupon.status === 201, JSON.stringify(courseCoupon.body))
  if (courseCoupon.body?.data?.id) made.push(courseCoupon.body.data.id)

  /* ---- the checks that are not about shape ---- */

  const noCourse = await call('POST', '/api/v1/coupons', {
    code: `smoke-bad-1-${stamp}`,
    scope: 'course',
    discountType: 'percent',
    value: 10,
  })
  check('a course coupon with no course is refused', noCourse.status === 409, String(noCourse.status))

  const tooMuch = await call('POST', '/api/v1/coupons', {
    code: `smoke-bad-2-${stamp}`,
    scope: 'order',
    discountType: 'percent',
    value: 150,
  })
  check('150% is refused', tooMuch.status === 409, String(tooMuch.status))

  const backwards = await call('POST', '/api/v1/coupons', {
    code: `smoke-bad-3-${stamp}`,
    scope: 'order',
    discountType: 'percent',
    value: 10,
    startsAt: '2027-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T00:00:00.000Z',
  })
  check('expiring before it starts is refused', backwards.status === 409, String(backwards.status))

  const duplicate = await call('POST', '/api/v1/coupons', {
    code: `SMOKE-ORDER-${stamp}`,
    scope: 'order',
    discountType: 'percent',
    value: 5,
  })
  check('a duplicate code is refused', duplicate.status === 409, String(duplicate.status))

  const spaced = await call('POST', '/api/v1/coupons', {
    code: `smoke bad ${stamp}`,
    scope: 'order',
    discountType: 'percent',
    value: 5,
  })
  check('a code with spaces is refused', spaced.status === 422, String(spaced.status))

  const ceiling = await call('POST', '/api/v1/coupons', {
    code: `smoke-bad-4-${stamp}`,
    scope: 'order',
    discountType: 'fixed',
    value: 10000,
    maxDiscount: 5000,
  })
  check('a ceiling on a fixed amount is refused', ceiling.status === 409, String(ceiling.status))

  /* ---- read ---- */

  const list = await call('GET', `/api/v1/coupons?q=smoke-order-${stamp}`)
  check('the list finds it by code, case-insensitively', list.body?.meta?.total === 1, JSON.stringify(list.body?.meta))

  const byStatus = await call('GET', '/api/v1/coupons?status=off&perPage=100')
  check(
    'filtering by status excludes the live one',
    !(byStatus.body?.data ?? []).some((c) => c.id === orderCoupon.body.data.id),
  )

  /* ---- scheduled and expired read as such ---- */

  const future = await call('POST', '/api/v1/coupons', {
    code: `smoke-future-${stamp}`,
    scope: 'order',
    discountType: 'percent',
    value: 10,
    startsAt: '2030-01-01T00:00:00.000Z',
  })
  if (future.body?.data?.id) made.push(future.body.data.id)
  check('a coupon that starts later reads as scheduled', future.body?.data?.status === 'scheduled', future.body?.data?.status)

  const past = await call('POST', '/api/v1/coupons', {
    code: `smoke-past-${stamp}`,
    scope: 'order',
    discountType: 'percent',
    value: 10,
    expiresAt: '2020-01-01T00:00:00.000Z',
  })
  if (past.body?.data?.id) made.push(past.body.data.id)
  check('a coupon that has expired reads as expired', past.body?.data?.status === 'expired', past.body?.data?.status)

  /* ---- update ---- */

  const edited = await call('PATCH', `/api/v1/coupons/${orderCoupon.body.data.id}`, {
    code: `SMOKE-ORDER-${stamp}`,
    scope: 'order',
    discountType: 'percent',
    value: 15,
    maxDiscount: 50000,
    minSubtotal: 100000,
    active: false,
  })
  check('edit it', edited.status === 200, JSON.stringify(edited.body))
  check('switching it off shows as off', edited.body?.data?.status === 'off', edited.body?.data?.status)

  /* ---- what checkout makes of it ---- */

  const plain = await call('POST', '/api/v1/checkout/quote', {
    lines: [{ kind: 'course', id: course.id }],
  })
  check('quote without a coupon', plain.status === 200, JSON.stringify(plain.body))

  const withCoupon = await call('POST', '/api/v1/checkout/quote', {
    lines: [{ kind: 'course', id: course.id, couponCode: `smoke-course-${stamp}` }],
  })
  check('quote with the course coupon', withCoupon.status === 200, JSON.stringify(withCoupon.body))
  check(
    'the fixed discount came off, exactly once',
    withCoupon.body?.data?.courseDiscount === Math.min(20000, plain.body?.data?.subtotal ?? 0),
    `courseDiscount=${withCoupon.body?.data?.courseDiscount}`,
  )

  const offCoupon = await call('POST', '/api/v1/checkout/quote', {
    lines: [{ kind: 'course', id: course.id }],
    couponCode: `SMOKE-ORDER-${stamp}`,
  })
  check(
    'a coupon switched off in the admin stops discounting',
    offCoupon.body?.data?.orderDiscount === 0,
    `orderDiscount=${offCoupon.body?.data?.orderDiscount}`,
  )

  const expiredQuote = await call('POST', '/api/v1/checkout/quote', {
    lines: [{ kind: 'course', id: course.id }],
    couponCode: `SMOKE-PAST-${stamp}`,
  })
  check(
    'an expired coupon discounts nothing',
    expiredQuote.body?.data?.orderDiscount === 0,
    `orderDiscount=${expiredQuote.body?.data?.orderDiscount}`,
  )

  /* ---- redemptions ---- */

  const reds = await call('GET', `/api/v1/coupons/${courseCoupon.body.data.id}/redemptions`)
  check('the redemption list answers, and is empty', reds.body?.meta?.total === 0, JSON.stringify(reds.body?.meta))
}

async function cleanup() {
  for (const id of made.reverse()) {
    const res = await call('DELETE', `/api/v1/coupons/${id}`)
    if (res.status !== 204) {
      console.log(`  NOTE  coupon ${id} not deleted (${res.status}) — remove it by hand`)
    }
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
