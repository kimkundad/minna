/**
 * The member's own tax-invoice details, kept between orders.
 *
 *   npx tsx scripts/smoke-my-billing.mts
 *
 * Checkout asks for a name, a tax ID and an address every time somebody wants a
 * full tax invoice. This is the part that remembers them — so what matters is
 * that it holds only the signed-in account's own details, and that it refuses
 * the same numbers a checkout would refuse.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { memberBillingProfiles, users } from '../src/db/schema/index'

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
async function member(tag: string) {
  const email = `smoke-bill-${tag}-${Date.now()}@example.com`
  const made = await call('/auth/register', {
    method: 'POST',
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
  return { email, id: made.body.user.id as number, token: made.body.accessToken as string }
}

const me = await member('a')
const other = await member('b')
console.log(`  member: ${me.email}\n`)

// A real Thai corporate tax ID: thirteen digits whose last one checks out.
const TAX_ID = '0105536000020'

try {
  const empty = await call('/me/billing', {}, me.token)
  check('nothing saved reads as nothing, not an error', empty.status === 200, String(empty.status))
  check('  and says so plainly', empty.body.data === null, JSON.stringify(empty.body.data))

  check(
    'a stranger cannot read it',
    (await call('/me/billing')).status === 401,
  )

  const bad = await call(
    '/me/billing',
    {
      method: 'PUT',
      body: JSON.stringify({
        type: 'corporate',
        name: 'บริษัท ทดสอบ จำกัด',
        taxId: '1234567890123', // one digit out, on purpose
        branchType: 'head',
        branchCode: '00000',
        address: '1 ถนนทดสอบ กรุงเทพฯ 10100',
      }),
    },
    me.token,
  )
  check('a tax ID that does not add up is refused', bad.status === 422, String(bad.status))

  const saved = await call(
    '/me/billing',
    {
      method: 'PUT',
      body: JSON.stringify({
        type: 'corporate',
        name: 'บริษัท ทดสอบ จำกัด',
        taxId: TAX_ID,
        branchType: 'head',
        branchCode: '00000',
        address: '1 ถนนทดสอบ กรุงเทพฯ 10100',
      }),
    },
    me.token,
  )
  check('a good one is kept', saved.status === 200, String(saved.status))
  check('  and comes back next time', (await call('/me/billing', {}, me.token)).body.data?.taxId === TAX_ID)

  // The point of the whole thing: the next order does not have to ask again.
  const again = (await call('/me/billing', {}, me.token)).body.data
  check(
    '  with everything the checkout form needs',
    Boolean(again.name && again.address && again.type && again.branchCode),
    JSON.stringify(again),
  )

  /* ---------------- and nobody else's ---------------- */

  check(
    "another member sees their own, which is nothing",
    (await call('/me/billing', {}, other.token)).body.data === null,
  )

  const changed = await call(
    '/me/billing',
    {
      method: 'PUT',
      body: JSON.stringify({
        type: 'individual',
        name: 'ทด สอบ',
        taxId: '1101700207978',
        address: '2 ถนนอื่น กรุงเทพฯ 10100',
      }),
    },
    me.token,
  )
  check('changing it replaces rather than adds', changed.status === 200, String(changed.status))
  const rows = await db
    .select()
    .from(memberBillingProfiles)
    .where(eq(memberBillingProfiles.userId, me.id))
  check('  one row per member, still', rows.length === 1, String(rows.length))
  check('  now the individual one', rows[0]?.type === 'individual', rows[0]?.type)

  const gone = await call('/me/billing', { method: 'DELETE' }, me.token)
  check('and it can be forgotten', gone.status === 204, String(gone.status))
  check('  leaving nothing behind', (await call('/me/billing', {}, me.token)).body.data === null)
} finally {
  await db.delete(users).where(eq(users.id, me.id))
  await db.delete(users).where(eq(users.id, other.id))
  console.log(`\n  cleaned up ${me.email}`)
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
