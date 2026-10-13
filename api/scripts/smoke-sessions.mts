/**
 * Signed-in devices: that the list is real, and that signing one out works.
 *
 *   npx tsx scripts/smoke-sessions.mts
 *
 * Two things are checked that nothing else covers.
 *
 * One: renewing a token twice at once must not leave two live sessions. A page
 * that fires several requests at once gets several 401s at once, and each one
 * tries to renew with the same cookie; before the rotation claimed its row
 * first, both won and one browser came away listed on the settings screen
 * several times over.
 *
 * Two: signing a device out has to actually end it. A list that removes a row
 * while the token behind it still works is worse than no list at all.
 */
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../src/db/client'
import { refreshTokens, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const email = `smoke-sessions-${Date.now()}@example.com`
const password = 'Str0ng-Pass!2026'

async function signIn(label: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ email, password, deviceLabel: label }),
  })
  const body = await res.json()
  return { accessToken: body.accessToken as string, refreshToken: body.refreshToken as string }
}

const made = await fetch(`${API}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    email,
    password,
    firstName: 'ทด',
    lastName: 'สอบ',
    birthdate: '2000-01-15',
    acceptedTerms: true,
    locale: 'th',
    memberType: 'student',
  }),
})
const first = await made.json()
const userId = first.user.id as number
console.log(`  member: ${email}\n`)

/** Live rows straight from the database, not from the endpoint being tested. */
async function liveRows(): Promise<number> {
  const rows = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
  return rows.length
}

try {
  /* ---------------- the list is the truth ---------------- */

  const laptop = await signIn('Laptop')
  const phone = await signIn('Phone')

  const listed = await (
    await fetch(`${API}/auth/sessions`, { headers: { Authorization: `Bearer ${laptop.accessToken}` } })
  ).json()
  const labels = (listed.data as { deviceLabel: string | null }[]).map((s) => s.deviceLabel)
  check('every sign-in appears', listed.data.length === (await liveRows()), `${listed.data.length}`)
  check('  under the name the device gave', labels.includes('Laptop') && labels.includes('Phone'), labels.join(', '))

  /* ---------------- renewing twice at once ---------------- */

  const before = await liveRows()
  const renewals = await Promise.all(
    [1, 2, 3].map(() =>
      fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ refreshToken: phone.refreshToken }),
      }).then((r) => r.status),
    ),
  )
  const after = await liveRows()
  check(
    'three renewals at once with one token',
    renewals.filter((s) => s === 200).length === 1,
    `statuses ${renewals.join(',')}`,
  )
  check('  leave the session count where it was', after === before, `${before} -> ${after}`)

  /* ---------------- signing a device out ---------------- */

  const mine = (await (
    await fetch(`${API}/auth/sessions`, { headers: { Authorization: `Bearer ${laptop.accessToken}` } })
  ).json()).data as { id: number; deviceLabel: string | null }[]
  const victim = mine.find((s) => s.deviceLabel === 'Laptop')
  if (!victim) throw new Error('the laptop session went missing')

  const out = await fetch(`${API}/auth/sessions/${victim.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${laptop.accessToken}` },
  })
  check('signing a device out is accepted', out.status === 204, String(out.status))

  const stillThere = (await (
    await fetch(`${API}/auth/sessions`, { headers: { Authorization: `Bearer ${laptop.accessToken}` } })
  ).json()).data as { id: number }[]
  check('  and it leaves the list', !stillThere.some((s) => s.id === victim.id), `${stillThere.length} left`)

  const replay = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ refreshToken: laptop.refreshToken }),
  })
  check('  and its token stops working', replay.status === 401, String(replay.status))

  /* ---------------- signing out everywhere ---------------- */

  const last = await signIn('Tablet')
  check('a fresh sign-in works again', (await liveRows()) >= 1)
  const all = await fetch(`${API}/auth/logout-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${last.accessToken}` },
  })
  check('signing out everywhere is accepted', all.status === 204, String(all.status))
  check('  and nothing is left alive', (await liveRows()) === 0, String(await liveRows()))
} finally {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (row) await db.delete(users).where(eq(users.id, row.id))
  console.log(`\n  cleaned up ${email}`)
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
