/**
 * Exercises the whole auth contract against a running server and prints a
 * pass/fail line per step. Nothing here is a unit test; it is the quickest way
 * to confirm a deployment answers the way the clients expect.
 *
 *   node scripts/smoke-auth.mjs [baseUrl]
 *
 * It registers a throwaway account each run, so it is safe to repeat.
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:3000'
const stamp = Date.now()
const EMAIL = `smoke-${stamp}@example.com`
const PASSWORD = 'minna2026'

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

async function call(method, path, { body, token, cookie } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json; charset=utf-8'
  if (token) headers.Authorization = `Bearer ${token}`
  if (cookie) headers.Cookie = cookie

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // Leave json null; the caller reports on status alone.
  }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') }
}

console.log(`Auth smoke test against ${BASE}\n`)

// --- health -----------------------------------------------------------------
{
  const r = await call('GET', '/health')
  check('health returns ok', r.status === 200 && r.json?.status === 'ok', `status ${r.status}`)
}

// --- register ---------------------------------------------------------------
let accessToken = ''
let refreshToken = ''
{
  const r = await call('POST', '/api/v1/auth/register', {
    body: {
      email: EMAIL,
      password: PASSWORD,
      firstName: 'มาลี',
      lastName: 'ศรีสุข',
      birthdate: '1995-03-15',
      // Consent is a literal true, so it has to be sent: a registration without
      // it is refused, which is the point of the field.
      acceptedTerms: true,
      locale: 'th',
    },
  })
  check('register creates an account', r.status === 201, `status ${r.status}`)
  check('register assigns the student role', r.json?.user?.roles?.includes('student'))
  check('register keeps Thai names intact', r.json?.user?.firstName === 'มาลี', r.json?.user?.firstName)
  check('register sets an httpOnly refresh cookie', /HttpOnly/i.test(r.setCookie ?? ''))
  accessToken = r.json?.accessToken ?? ''
  refreshToken = r.json?.refreshToken ?? ''
}

{
  const r = await call('POST', '/api/v1/auth/register', {
    body: {
      email: EMAIL,
      password: PASSWORD,
      firstName: 'a',
      lastName: 'b',
      birthdate: '1995-03-15',
      acceptedTerms: true,
    },
  })
  check('duplicate email is rejected', r.status === 409 && r.json?.error?.code === 'conflict')
}

{
  const r = await call('POST', '/api/v1/auth/register', {
    body: {
      email: `weak-${stamp}@example.com`,
      password: 'abc',
      firstName: 'a',
      lastName: 'b',
      birthdate: '1995-03-15',
      // Consent is a literal true, so it has to be sent: a registration without
      // it is refused, which is the point of the field.
      acceptedTerms: true,
    },
  })
  check(
    'weak password is rejected with field errors',
    r.status === 422 && Boolean(r.json?.error?.fields?.password),
  )
}

// --- login ------------------------------------------------------------------
{
  const r = await call('POST', '/api/v1/auth/login', {
    body: { email: EMAIL, password: PASSWORD, deviceLabel: 'Smoke test' },
  })
  check('login succeeds', r.status === 200 && Boolean(r.json?.accessToken))
  accessToken = r.json?.accessToken ?? accessToken
  refreshToken = r.json?.refreshToken ?? refreshToken
}

{
  const r = await call('POST', '/api/v1/auth/login', {
    body: { email: EMAIL, password: 'wrong-password-1' },
  })
  check(
    'wrong password is rejected',
    r.status === 401 && r.json?.error?.code === 'invalid_credentials',
  )
}

{
  const r = await call('POST', '/api/v1/auth/login', {
    body: { email: `nobody-${stamp}@example.com`, password: 'wrong-password-1' },
  })
  check(
    'unknown email answers exactly like a wrong password',
    r.status === 401 && r.json?.error?.code === 'invalid_credentials',
  )
}

// --- protected routes -------------------------------------------------------
{
  const r = await call('GET', '/api/v1/auth/me', { token: accessToken })
  check('me returns the signed-in user', r.status === 200 && r.json?.user?.email === EMAIL)
}

{
  const r = await call('GET', '/api/v1/auth/me')
  check('me without a token is rejected', r.status === 401)
}

{
  const r = await call('GET', '/api/v1/auth/me', { token: `${accessToken}tampered` })
  check('me with a tampered token is rejected', r.status === 401)
}

{
  const r = await call('GET', '/api/v1/auth/sessions', { token: accessToken })
  check('sessions lists active devices', r.status === 200 && Array.isArray(r.json?.data))
}

// --- refresh rotation -------------------------------------------------------
let rotated = ''
{
  const r = await call('POST', '/api/v1/auth/refresh', { body: { refreshToken } })
  rotated = r.json?.refreshToken ?? ''
  check('refresh returns a new access token', r.status === 200 && Boolean(r.json?.accessToken))
  check('refresh rotates the refresh token', Boolean(rotated) && rotated !== refreshToken)
}

{
  const r = await call('POST', '/api/v1/auth/refresh', { body: { refreshToken } })
  check('replaying the old refresh token is rejected', r.status === 401, `status ${r.status}`)
}

{
  // Replay revokes every session for that user, not only the replayed token.
  const r = await call('POST', '/api/v1/auth/refresh', { body: { refreshToken: rotated } })
  check('replay also kills the rotated token', r.status === 401, `status ${r.status}`)
}

// --- password change --------------------------------------------------------
{
  const login = await call('POST', '/api/v1/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  })
  const token = login.json?.accessToken

  const same = await call('POST', '/api/v1/auth/change-password', {
    token,
    body: { currentPassword: PASSWORD, newPassword: PASSWORD },
  })
  check('reusing the same password is refused', same.status === 400)

  const wrong = await call('POST', '/api/v1/auth/change-password', {
    token,
    body: { currentPassword: 'not-my-password-1', newPassword: 'minna2027x' },
  })
  check('a wrong current password is refused', wrong.status === 401)

  const ok = await call('POST', '/api/v1/auth/change-password', {
    token,
    body: { currentPassword: PASSWORD, newPassword: 'minna2027x' },
  })
  check('password change succeeds', ok.status === 200)

  const old = await call('POST', '/api/v1/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  })
  check('the old password stops working', old.status === 401)

  const fresh = await call('POST', '/api/v1/auth/login', {
    body: { email: EMAIL, password: 'minna2027x' },
  })
  check('the new password works', fresh.status === 200)
}

// --- forgot password --------------------------------------------------------
{
  const known = await call('POST', '/api/v1/auth/forgot-password', { body: { email: EMAIL } })
  const unknown = await call('POST', '/api/v1/auth/forgot-password', {
    body: { email: `nobody-${stamp}@example.com` },
  })
  check(
    'forgot-password answers the same for known and unknown addresses',
    known.status === 200 && unknown.status === 200 && known.json?.message === unknown.json?.message,
  )
}

// --- unknown route ----------------------------------------------------------
{
  const r = await call('GET', '/api/v1/nope')
  check('unknown route returns the standard error shape', r.status === 404 && r.json?.error?.code === 'not_found')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
