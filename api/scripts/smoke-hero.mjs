/**
 * Exercises the home slideshow: the rules on a slide, the order, what the
 * public route will and will not show, and that a slide's picture is removed
 * from the store with it.
 *
 *   node scripts/smoke-hero.mjs [baseUrl]
 *
 * Needs SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD. Removes everything it makes.
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
  try {
    return { status: res.status, body: text ? JSON.parse(text) : null }
  } catch {
    return { status: res.status, body: { raw: text } }
  }
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function uploadPicture(name) {
  const ticket = (await call('POST', '/api/v1/uploads/ticket', { purpose: 'content-image' })).body
    .data
  const headers = { 'X-Upload-Ticket': ticket.ticket }
  const started = await fetch(`${ticket.baseUrl}/api/v1/uploads`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: ticket.folder, filename: name, size: PNG.length }),
  })
  const { uploadId } = await started.json()
  await fetch(`${ticket.baseUrl}/api/v1/uploads/${uploadId}/chunks/0`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    body: PNG,
  })
  const done = await fetch(`${ticket.baseUrl}/api/v1/uploads/${uploadId}/complete`, {
    method: 'POST',
    headers,
  })
  const result = await done.json()
  return result.path ?? result.data?.path ?? result.file?.path
}

/** Follows the redirect, because the media route signs and redirects whether or
 *  not the bytes are there. */
async function pictureStatus(path) {
  const res = await fetch(`${BASE}/api/v1/media/${path}`, { redirect: 'follow' })
  return res.status
}

const made = []
/** The order of whatever was already published, so it can be restored. */
let orderBefore = []

async function main() {
  const login = await call('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD })
  if (login.status !== 200) {
    console.error('admin login failed:', login.status)
    process.exit(2)
  }
  token = login.body.accessToken

  orderBefore = (await call('GET', '/api/v1/hero-slides?locale=th')).body.data.map((s) => s.id)

  const base = {
    locale: 'th',
    titleA: 'สมอกทดสอบ',
    status: 'published',
  }

  /* ---- the rules ---- */

  const noWords = await call('POST', '/api/v1/hero-slides', { ...base, ctaHref: '/th/courses' })
  check('a button with a link but no words is refused', noWords.status === 422, String(noWords.status))

  const noAlt = await call('POST', '/api/v1/hero-slides', {
    ...base,
    imagePath: 'minna/content/nope.jpg',
  })
  check(
    'a picture with nothing describing it is refused',
    noAlt.status === 422 && Boolean(noAlt.body?.error?.fields?.imageAlt),
    JSON.stringify(noAlt.body?.error?.fields),
  )

  const backwards = await call('POST', '/api/v1/hero-slides', {
    ...base,
    startsAt: '2027-01-01T00:00:00.000Z',
    endsAt: '2026-01-01T00:00:00.000Z',
  })
  check('finishing before it starts is refused', backwards.status === 422, String(backwards.status))

  const noTitle = await call('POST', '/api/v1/hero-slides', { locale: 'th', titleA: '' })
  check('a slide with no headline is refused', noTitle.status === 422, String(noTitle.status))

  /* ---- three slides, with a picture on the first ---- */

  const picture = await uploadPicture('smoke-hero.png')
  check('uploaded a picture for it', Boolean(picture), String(picture))

  const one = await call('POST', '/api/v1/hero-slides', {
    ...base,
    titleA: 'สไลด์หนึ่ง',
    titleB: 'บรรทัดสอง',
    subtitle: 'คำอธิบายใต้หัวข้อ',
    imagePath: picture,
    imageAlt: 'ห้องเรียนภาษาญี่ปุ่น',
    focalX: 70,
    focalY: 40,
    ctaLabel: 'ดูคอร์สเรียน',
    ctaHref: '/th/courses',
    sortOrder: 1,
  })
  check('created one with a picture and a button', one.status === 201, JSON.stringify(one.body).slice(0, 140))
  if (one.body?.data?.id) made.push(one.body.data.id)
  check('the focal point is kept', one.body?.data?.focalX === 70 && one.body?.data?.focalY === 40)
  check('it reads as live', one.body?.data?.state === 'live', one.body?.data?.state)

  const two = await call('POST', '/api/v1/hero-slides', { ...base, titleA: 'สไลด์สอง', sortOrder: 2 })
  if (two.body?.data?.id) made.push(two.body.data.id)

  const draft = await call('POST', '/api/v1/hero-slides', {
    ...base,
    titleA: 'ยังไม่เผยแพร่',
    status: 'draft',
    sortOrder: 3,
  })
  if (draft.body?.data?.id) made.push(draft.body.data.id)
  check('a draft reads as a draft', draft.body?.data?.state === 'draft', draft.body?.data?.state)

  const later = await call('POST', '/api/v1/hero-slides', {
    ...base,
    titleA: 'โปรโมชันเดือนหน้า',
    startsAt: '2030-01-01T00:00:00.000Z',
    sortOrder: 4,
  })
  if (later.body?.data?.id) made.push(later.body.data.id)
  check(
    'one whose dates have not come round reads as scheduled',
    later.body?.data?.state === 'scheduled',
    later.body?.data?.state,
  )

  /* ---- what the home page would show ---- */

  const shown = await call('GET', '/api/v1/hero-slides/public?locale=th')
  const titles = (shown.body?.data ?? []).map((s) => s.titleA)
  check('the public route answers without a token', shown.status === 200)
  check(
    'it shows the published ones and nothing else',
    titles.includes('สไลด์หนึ่ง') &&
      titles.includes('สไลด์สอง') &&
      !titles.includes('ยังไม่เผยแพร่') &&
      !titles.includes('โปรโมชันเดือนหน้า'),
    titles.join(' | '),
  )
  const mine = (shown.body?.data ?? []).find((s) => s.id === one.body.data.id)
  check(
    'it carries the focal point, so the page can crop',
    mine?.focalX === 70,
    String(mine?.focalX),
  )

  const otherLanguage = await call('GET', '/api/v1/hero-slides/public?locale=en')
  check(
    'another language gets its own slides, not these',
    (otherLanguage.body?.data ?? []).length === 0,
    String((otherLanguage.body?.data ?? []).length),
  )

  /* ---- a slide written for every language ---- */

  const everywhere = await call('POST', '/api/v1/hero-slides', {
    locale: 'all',
    titleA: 'ทุกภาษา',
    status: 'published',
    sortOrder: 99,
  })
  if (everywhere.body?.data?.id) made.push(everywhere.body.data.id)
  check('a slide can be written for every language', everywhere.status === 201, String(everywhere.status))

  const everyLocale = await Promise.all(
    ['th', 'en', 'jp', 'vn'].map(async (l) => {
      const r = await call('GET', `/api/v1/hero-slides/public?locale=${l}`)
      return (r.body?.data ?? []).some((x) => x.id === everywhere.body.data.id)
    }),
  )
  check('and it appears on all four home pages', everyLocale.every(Boolean), JSON.stringify(everyLocale))

  const visitorAll = await call('GET', '/api/v1/hero-slides/public?locale=all')
  check(
    'a visitor cannot ask for "all" as if it were a language',
    visitorAll.status === 422,
    String(visitorAll.status),
  )

  const bucket = await call('GET', '/api/v1/hero-slides?locale=all')
  check(
    'the admin lists them in their own bucket',
    (bucket.body?.data ?? []).every((x) => x.locale === 'all'),
  )

  /* ---- order ---- */

  // Reorder the way the admin does — the whole list, not a fragment, which
  // would renumber these on top of whatever else is there. The order before is
  // kept and put back afterwards: a test that leaves the school's slideshow in
  // a different order than it found it has broken something it was only meant
  // to look at.
  const before = (await call('GET', '/api/v1/hero-slides?locale=th')).body.data.map((s) => s.id)
  const swapped = before.filter((id) => id !== one.body.data.id && id !== two.body.data.id)
  swapped.push(two.body.data.id, one.body.data.id)
  const reordered = await call('PUT', '/api/v1/hero-slides/order', { locale: 'th', ids: swapped })
  check('reordering answers', reordered.status === 200)

  const afterOrder = await call('GET', '/api/v1/hero-slides/public?locale=th')
  const order = (afterOrder.body?.data ?? []).map((s) => s.titleA)
  // Only the relative order of the two that were swapped. Anything else in the
  // list sits where its own sortOrder puts it, which is not this test's
  // business.
  check(
    'and the home page order follows it',
    order.indexOf('สไลด์สอง') < order.indexOf('สไลด์หนึ่ง'),
    order.join(' | '),
  )

  /* ---- the picture goes with the slide ---- */

  check('the picture is there while the slide is', (await pictureStatus(picture)) === 200)

  await call('DELETE', `/api/v1/hero-slides/${one.body.data.id}`)
  made.splice(made.indexOf(one.body.data.id), 1)

  check(
    'deleting the slide removes its picture too',
    (await pictureStatus(picture)) === 404,
    String(await pictureStatus(picture)),
  )
}

async function cleanup() {
  // Put the order back before removing anything, so whatever was here already
  // is left exactly as it was found.
  if (orderBefore.length) {
    await call('PUT', '/api/v1/hero-slides/order', { locale: 'th', ids: orderBefore })
  }
  for (const id of made.filter(Boolean)) {
    const res = await call('DELETE', `/api/v1/hero-slides/${id}`)
    if (res.status !== 204) console.log(`  NOTE  slide ${id} left behind (${res.status})`)
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
