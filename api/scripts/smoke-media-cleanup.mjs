/**
 * Checks that a picture nothing points at is removed from the store, and that
 * one something still points at is not.
 *
 *   node scripts/smoke-media-cleanup.mjs [baseUrl]
 *
 * Needs SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD. It uploads real files and
 * removes whatever it leaves behind.
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

/** A real 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Uploads one picture the way the editor does, and returns its store path. */
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

/**
 * Whether the store still holds it.
 *
 * Follows the redirect: the media route signs and redirects whether or not the
 * bytes are there, so only the store at the other end can answer.
 */
async function exists(path) {
  if (!path) { console.log('    (no path to check — the upload did not return one)'); return 0 }
  const res = await fetch(`${BASE}/api/v1/media/${path}`, { redirect: 'follow' })
  return res.status
}

const made = []

async function main() {
  const login = await call('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD })
  if (login.status !== 200) {
    console.error('admin login failed:', login.status)
    process.exit(2)
  }
  token = login.body.accessToken

  const stamp = Date.now().toString(36)

  /* ---- a picture used by one article, then taken out of it ---- */

  const lonely = await uploadPicture(`smoke-lonely-${stamp}.png`)
  check('uploaded a picture', Boolean(lonely), String(lonely))
  if (!lonely) return

  const a = await call('POST', '/api/v1/posts', {
    title: `Smoke cleanup A ${stamp}`,
    slug: `smoke-cleanup-a-${stamp}`,
    contentHtml: `<p>Before</p><img src="/api/v1/media/${lonely}"><p>After</p>`,
    contentLocale: 'en',
    status: 'draft',
  })
  check('wrote an article using it', a.status === 201, JSON.stringify(a.body).slice(0, 120))
  made.push(a.body?.data?.id)

  const stillThere = await exists(lonely)
  check('the picture is reachable while in use', stillThere === 200, String(stillThere))

  // Take it out of the article.
  await call('PUT', `/api/v1/posts/${a.body.data.id}`, {
    title: `Smoke cleanup A ${stamp}`,
    slug: `smoke-cleanup-a-${stamp}`,
    contentHtml: '<p>The picture is gone now.</p>',
    contentLocale: 'en',
    status: 'draft',
  })

  const gone = await exists(lonely)
  check(
    'once nothing points at it, the file is gone from the store',
    gone === 404,
    `status ${gone}`,
  )

  /* ---- a picture used by two articles ---- */

  const shared = await uploadPicture(`smoke-shared-${stamp}.png`)
  const tag = `<img src="/api/v1/media/${shared}">`

  const b = await call('POST', '/api/v1/posts', {
    title: `Smoke cleanup B ${stamp}`,
    slug: `smoke-cleanup-b-${stamp}`,
    contentHtml: `<p>One</p>${tag}`,
    contentLocale: 'en',
    status: 'draft',
  })
  made.push(b.body?.data?.id)

  const c = await call('POST', '/api/v1/posts', {
    title: `Smoke cleanup C ${stamp}`,
    slug: `smoke-cleanup-c-${stamp}`,
    contentHtml: `<p>Two, same picture</p>${tag}`,
    contentLocale: 'en',
    status: 'draft',
  })
  made.push(c.body?.data?.id)
  check('two articles share one picture', b.status === 201 && c.status === 201)

  // Delete the first. The second still points at it.
  await call('DELETE', `/api/v1/posts/${b.body.data.id}`)
  made.splice(made.indexOf(b.body.data.id), 1)

  const survived = await exists(shared)
  check(
    'deleting one of them leaves the picture alone',
    survived === 200,
    `status ${survived}`,
  )

  // Delete the second too. Now nothing points at it.
  await call('DELETE', `/api/v1/posts/${c.body.data.id}`)
  made.splice(made.indexOf(c.body.data.id), 1)

  const finallyGone = await exists(shared)
  check(
    'deleting the last one removes it',
    finallyGone === 404,
    `status ${finallyGone}`,
  )

  /* ---- a picture referenced from a course description ---- */

  const courseShot = await uploadPicture(`smoke-course-${stamp}.png`)
  const courseTag = `<img src="/api/v1/media/${courseShot}">`

  const d = await call('POST', '/api/v1/posts', {
    title: `Smoke cleanup D ${stamp}`,
    slug: `smoke-cleanup-d-${stamp}`,
    contentHtml: `<p>Article</p>${courseTag}`,
    contentLocale: 'en',
    status: 'draft',
  })
  made.push(d.body?.data?.id)

  const course = (await call('GET', '/api/v1/courses?perPage=1')).body?.data?.[0]
  if (course) {
    const original = (await call('GET', `/api/v1/courses/${course.id}`)).body.data.description
    await call('PATCH', `/api/v1/courses/${course.id}`, {
      description: `${original ?? ''}${courseTag}`,
    })

    await call('DELETE', `/api/v1/posts/${d.body.data.id}`)
    made.splice(made.indexOf(d.body.data.id), 1)

    const heldByCourse = await exists(courseShot)
    check(
      'a course description counts as a reference too',
      heldByCourse === 200,
      `status ${heldByCourse}`,
    )

    // Put the course back, which should now remove it.
    await call('PATCH', `/api/v1/courses/${course.id}`, { description: original })
    const afterCourse = await exists(courseShot)
    check(
      'and taking it out of the course removes it',
      afterCourse === 404,
      `status ${afterCourse}`,
    )
  }
}

async function cleanup() {
  for (const id of made.filter(Boolean)) {
    const res = await call('DELETE', `/api/v1/posts/${id}`)
    if (res.status !== 204) console.log(`  NOTE  article ${id} left behind (${res.status})`)
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
