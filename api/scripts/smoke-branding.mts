/**
 * The logo setting: who may change it, and what it will accept.
 *
 *   npx tsx scripts/smoke-branding.mts
 *
 * The interesting part is the validation. An image setting holds a path into
 * the store, and `content/` is the one folder served without a signature — so a
 * logo pointed at a lesson video would publish that video. The check for the
 * prefix is doing real work, not tidying input.
 *
 * Whatever logo the site already has is put back at the end.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { siteSettings, users } from '../src/db/schema/index'

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
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

const password = 'Str0ng-Pass!2026'

/** A throwaway account with one role, so the allowed and refused halves are
 *  both proven without anybody's real password. */
async function staff(role: 'admin' | 'superadmin') {
  const email = `smoke-logo-${role}-${Date.now()}@example.com`
  const made = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '1990-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const id = made.body.user.id as number
  await db.execute(sql`
    INSERT INTO user_roles (user_id, role_id)
    SELECT ${id}, id FROM roles WHERE name = ${role}
  `)
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return { id, token: login.body.accessToken as string }
}

const [before] = await db
  .select({ value: siteSettings.value })
  .from(siteSettings)
  .where(eq(siteSettings.key, 'logo_path'))
  .limit(1)
const original = before?.value ?? ''

const admin = await staff('admin')
const superadmin = await staff('superadmin')

try {
  /* ---------------- reading it needs nobody ---------------- */

  const open = await call('/settings/branding')
  check('anyone can read the logo', open.status === 200, String(open.status))
  check(
    'and it says what is stored',
    'logoPath' in open.body.data && 'logoIconPath' in open.body.data,
    JSON.stringify(open.body.data),
  )

  /* ---------------- changing it does not ---------------- */

  const asNobody = await call('/settings', {
    method: 'PUT',
    body: JSON.stringify({ logo_path: 'content/site/x.png' }),
  })
  check('a stranger cannot change it', asNobody.status === 401, String(asNobody.status))

  const asAdmin = await call(
    '/settings',
    { method: 'PUT', body: JSON.stringify({ logo_path: 'content/site/x.png' }) },
    admin.token,
  )
  check('nor an ordinary administrator', asAdmin.status === 403, String(asAdmin.status))
  check(
    '  though they can see the field',
    (await call('/settings', {}, admin.token)).body.data.some(
      (r: { key: string }) => r.key === 'logo_path',
    ),
  )

  /* ---------------- what it refuses ---------------- */

  const outside = await call(
    '/settings',
    { method: 'PUT', body: JSON.stringify({ logo_path: 'courses/12/video/lesson.mp4' }) },
    superadmin.token,
  )
  check(
    'a path outside the public folder is refused',
    outside.status === 422,
    String(outside.status),
  )

  const notAnImage = await call(
    '/settings',
    { method: 'PUT', body: JSON.stringify({ logo_path: 'content/site/notes.pdf' }) },
    superadmin.token,
  )
  check('and so is a file that is not a picture', notAnImage.status === 422, String(notAnImage.status))

  /* ---------------- and what it takes ---------------- */

  const ok = await call(
    '/settings',
    { method: 'PUT', body: JSON.stringify({ logo_path: 'content/site/logo-smoke.png' }) },
    superadmin.token,
  )
  check('a superadmin can set it', ok.status === 200, String(ok.status))

  const after = await call('/settings/branding')
  check(
    'the public site is told the new one',
    String(after.body.data.logoPath).endsWith('content/site/logo-smoke.png'),
    String(after.body.data.logoPath),
  )

  // What the uploader actually sends: the store's own path, storage root and
  // all. Refusing this was the bug that made the admin's Save say "upload a
  // picture rather than typing a path" on a picture that had just been uploaded.
  const asUploaded = await call(
    '/settings',
    { method: 'PUT', body: JSON.stringify({ logo_path: 'minna/content/site/logo-smoke2.png' }) },
    superadmin.token,
  )
  check('the path the uploader returns is accepted', asUploaded.status === 200, String(asUploaded.status))
  check(
    '  and is stored once, not twice over',
    String((await call('/settings/branding')).body.data.logoPath) ===
      'minna/content/site/logo-smoke2.png',
    String((await call('/settings/branding')).body.data.logoPath),
  )

  const traversal = await call(
    '/settings',
    { method: 'PUT', body: JSON.stringify({ logo_path: 'content/../courses/12/video/x.png' }) },
    superadmin.token,
  )
  check('a path that climbs out is refused', traversal.status === 422, String(traversal.status))

  const cleared = await call(
    '/settings',
    { method: 'PUT', body: JSON.stringify({ logo_path: '' }) },
    superadmin.token,
  )
  check('and can go back to the built-in one', cleared.status === 200, String(cleared.status))
  check(
    'which reads as nothing stored',
    (await call('/settings/branding')).body.data.logoPath === null,
  )

  /* ---------------- the upload ticket ---------------- */

  const ticket = await call(
    '/uploads/ticket',
    { method: 'POST', body: JSON.stringify({ purpose: 'site-logo' }) },
    admin.token,
  )
  check(
    'an administrator can upload a logo',
    ticket.status === 201 || ticket.status === 503,
    ticket.status === 503 ? 'storage not configured here' : String(ticket.status),
  )
  if (ticket.status === 201) {
    check(
      'into the public folder, nowhere else',
      String(ticket.body.data.folder).includes('content/site'),
      ticket.body.data.folder,
    )
  }
} finally {
  // Whatever was there before, back as it was.
  await call(
    '/settings',
    { method: 'PUT', body: JSON.stringify({ logo_path: original }) },
    superadmin.token,
  )
  await db.delete(users).where(eq(users.id, admin.id))
  await db.delete(users).where(eq(users.id, superadmin.id))
  console.log(`\n  logo_path restored to ${original ? original : '(built-in)'}`)
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
