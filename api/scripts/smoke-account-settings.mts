/**
 * What "ตั้งค่าบัญชี" is allowed to change.
 *
 *   npx tsx scripts/smoke-account-settings.mts
 *
 * Every box on that page has to be one the API will actually accept, and every
 * field the API refuses has to stay off it. So this walks the same calls the
 * page makes — profile, photo ticket, password, sessions, tax details — and,
 * just as importantly, checks the ones that must stay shut: an email cannot be
 * changed here, roles cannot be granted here, and nobody can touch anybody
 * else's account.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

async function call(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
}

const stamp = Date.now()
const email = `smoke-settings-${stamp}@example.com`
const otherEmail = `smoke-settings-x${stamp}@example.com`
const password = 'Str0ng-Pass!2026'

async function register(address: string) {
  const made = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: address,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '2000-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  return { token: made.body.accessToken as string, id: made.body.user.id as number }
}

const me = await register(email)
const other = await register(otherEmail)
console.log(`  member: ${email}\n`)

try {
  /* ---------------- the name, the phone, the language ---------------- */

  const saved = await call(
    '/me/profile',
    {
      method: 'PATCH',
      body: JSON.stringify({
        firstName: 'สมหญิง',
        lastName: 'ใจดี',
        phoneCountryCode: '+66',
        phoneNational: '811234567',
        locale: 'en',
      }),
    },
    me.token,
  )
  check('the name, phone and language save', saved.status === 200, String(saved.status))
  check('  and come back as they were sent',
    saved.body?.data?.firstName === 'สมหญิง' && saved.body?.data?.locale === 'en',
    JSON.stringify({ n: saved.body?.data?.firstName, l: saved.body?.data?.locale }))

  const blank = await call(
    '/me/profile',
    { method: 'PATCH', body: JSON.stringify({ firstName: '', lastName: 'ใจดี', locale: 'th' }) },
    me.token,
  )
  check('an empty name is refused', blank.status === 422, String(blank.status))

  const badLocale = await call(
    '/me/profile',
    { method: 'PATCH', body: JSON.stringify({ firstName: 'ก', lastName: 'ข', locale: 'de' }) },
    me.token,
  )
  check('a language we do not have is refused', badLocale.status === 422, String(badLocale.status))

  /* ---------------- what the page must not offer ---------------- */

  const sneaky = await call(
    '/me/profile',
    {
      method: 'PATCH',
      body: JSON.stringify({
        firstName: 'สมหญิง',
        lastName: 'ใจดี',
        locale: 'th',
        email: 'someone.else@example.com',
        roles: ['admin'],
        status: 'active',
      }),
    },
    me.token,
  )
  const after = await call('/me/profile', {}, me.token)
  check('an email sent with the profile changes nothing', after.body?.data?.email === email, String(after.body?.data?.email))
  check('  nor does a role', !(after.body?.data?.roles ?? []).includes('admin'), JSON.stringify(after.body?.data?.roles))
  check('  and the request itself still succeeds', sneaky.status === 200, String(sneaky.status))

  /* ---------------- the photo ---------------- */

  const ticket = await call(
    '/uploads/ticket',
    { method: 'POST', body: JSON.stringify({ purpose: 'avatar' }) },
    me.token,
  )
  const configured = ticket.status !== 503
  if (!configured) {
    console.log('  (storage is not configured here; the photo checks are skipped)')
  } else {
    check('a member may ask to upload their own photo', ticket.status === 201, String(ticket.status))
    const folder = String(ticket.body?.data?.folder ?? ticket.body?.data?.path ?? '')
    check(
      '  into their own folder',
      folder.includes(`avatars/${me.id}`),
      folder,
    )
    check(
      '  which is a folder the site can actually serve',
      folder.includes('/content/') || folder.startsWith('content/'),
      folder,
    )
    const forOther = await call(
      '/uploads/ticket',
      { method: 'POST', body: JSON.stringify({ purpose: 'avatar', userId: other.id }) },
      me.token,
    )
    check('but not somebody else\'s', forOther.status === 403, String(forOther.status))
    const aCourse = await call(
      '/uploads/ticket',
      { method: 'POST', body: JSON.stringify({ purpose: 'course-video', courseId: 1 }) },
      me.token,
    )
    check('and not a course file', aCourse.status === 403, String(aCourse.status))
  }

  /* ---------------- where the tax invoice goes ---------------- */

  const empty = await call('/me/billing', {}, me.token)
  check('billing starts empty rather than missing', empty.status === 200 && empty.body?.data === null)

  const billing = {
    type: 'individual',
    name: 'สมหญิง ใจดี',
    // A real Thai ID, checksum and all: the API checks the check digit, which
    // is the right thing for it to do and the wrong thing to find out by hand.
    taxId: '1101700207129',
    address: 'กรุงเทพมหานคร 10110',
  }
  const put = await call('/me/billing', { method: 'PUT', body: JSON.stringify(billing) }, me.token)
  check('the tax details save', put.status === 200, String(put.status))
  const read = await call('/me/billing', {}, me.token)
  check('  and read back', read.body?.data?.taxId === billing.taxId, String(read.body?.data?.taxId))
  const short = await call(
    '/me/billing',
    { method: 'PUT', body: JSON.stringify({ ...billing, taxId: '123' }) },
    me.token,
  )
  check('  a short tax ID is refused', short.status === 422, String(short.status))
  check('  nobody else can read them', (await call('/me/billing', {}, other.token)).body?.data === null)
  check('  and they can be removed', (await call('/me/billing', { method: 'DELETE' }, me.token)).status === 204)

  /* ---------------- signed-in devices ---------------- */

  const sessions = await call('/auth/sessions', {}, me.token)
  check('the signed-in devices are listed', sessions.status === 200 && Array.isArray(sessions.body?.data))
  const mine = sessions.body?.data ?? []
  check('  with at least this one on it', mine.length >= 1, `${mine.length} sessions`)
  const theirs = (await call('/auth/sessions', {}, other.token)).body?.data ?? []
  const ids = new Set(mine.map((s: { id: number }) => s.id))
  check(
    "  and none of anybody else's",
    theirs.every((s: { id: number }) => !ids.has(s.id)),
  )
  if (mine[0]) {
    // 204 either way, on purpose: answering differently would say whether a
    // session id exists. What matters is the effect, so that is what is
    // checked — the session has to still be there afterwards.
    await call(`/auth/sessions/${mine[0].id}`, { method: 'DELETE' }, other.token)
    const still = (await call('/auth/sessions', {}, me.token)).body?.data ?? []
    check(
      "  one member cannot sign another's device out",
      still.some((s: { id: number }) => s.id === mine[0].id),
      `${still.length} left`,
    )
  }

  /* ---------------- what may be sent to them ---------------- */

  const fresh = await call('/me/consents', {}, me.token)
  check('consents answer even before anybody has set them', fresh.status === 200, String(fresh.status))
  check(
    '  with marketing off and the expiry warning on',
    fresh.body?.data?.news === false &&
      fresh.body?.data?.newCourses === false &&
      fresh.body?.data?.expiryAlert === true,
    JSON.stringify(fresh.body?.data),
  )
  check('  and nothing recorded as agreed', fresh.body?.data?.updatedAt === null)

  const optIn = await call(
    '/me/consents',
    { method: 'PUT', body: JSON.stringify({ news: true }) },
    me.token,
  )
  check('one switch can be turned on', optIn.body?.data?.news === true, JSON.stringify(optIn.body?.data))
  check(
    '  without disturbing the others',
    optIn.body?.data?.newCourses === false && optIn.body?.data?.expiryAlert === true,
  )
  check('  and the moment is recorded', typeof optIn.body?.data?.updatedAt === 'string', String(optIn.body?.data?.updatedAt))

  const optOut = await call(
    '/me/consents',
    { method: 'PUT', body: JSON.stringify({ expiryAlert: false }) },
    me.token,
  )
  check(
    'and withdrawing one leaves the rest alone',
    optOut.body?.data?.expiryAlert === false && optOut.body?.data?.news === true,
    JSON.stringify(optOut.body?.data),
  )

  const nothing = await call('/me/consents', { method: 'PUT', body: JSON.stringify({}) }, me.token)
  check('an empty change is refused', nothing.status === 422, String(nothing.status))

  const notABool = await call(
    '/me/consents',
    { method: 'PUT', body: JSON.stringify({ news: 'yes please' }) },
    me.token,
  )
  check('and so is something that is not a yes or a no', notABool.status === 422, String(notABool.status))

  check(
    "nobody inherits anybody else's answers",
    (await call('/me/consents', {}, other.token)).body?.data?.news === false,
  )

  /* ---------------- the password ---------------- */

  const wrong = await call(
    '/auth/change-password',
    { method: 'POST', body: JSON.stringify({ currentPassword: 'nope-not-it', newPassword: 'An0ther-Pass!2026' }) },
    me.token,
  )
  check('changing the password needs the old one', wrong.status >= 400, String(wrong.status))

  const same = await call(
    '/auth/change-password',
    { method: 'POST', body: JSON.stringify({ currentPassword: password, newPassword: password }) },
    me.token,
  )
  check('  and the new one has to be new', same.status >= 400, String(same.status))

  const changed = await call(
    '/auth/change-password',
    { method: 'POST', body: JSON.stringify({ currentPassword: password, newPassword: 'An0ther-Pass!2026' }) },
    me.token,
  )
  check('with the old one, it changes', changed.status === 200, String(changed.status))
  const relogin = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'An0ther-Pass!2026' }),
  })
  check('  and the new password signs in', relogin.status === 200, String(relogin.status))
} finally {
  for (const address of [email, otherEmail]) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, address)).limit(1)
    if (row) await db.delete(users).where(eq(users.id, row.id))
  }
  console.log(`\n  cleaned up ${email} and ${otherEmail}`)
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
