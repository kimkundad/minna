/**
 * What a teacher keeps of a sale, and who decides it.
 *
 *   npx tsx scripts/smoke-revenue-share.mts
 *
 * The figure used to live on every course row, which made one person's rate
 * into a list of rates: agreeing a new deal meant finding every course they
 * had ever written, and any one missed went on paying the old rate quietly and
 * for ever. It is now agreed with the person.
 *
 * What matters is who may set it and what moves when it changes:
 *
 *   - only an administrator, and not through the route a teacher saves on
 *   - the teacher sees it, because being paid a share you cannot read is not
 *     a deal
 *   - a teacher with nothing agreed is on the school-wide figure
 *   - every course of theirs follows it, with nothing to keep in step
 *   - earnings already recorded do not move, ever
 *
 * Makes its own accounts and courses, and removes them again.
 */
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  courses,
  orders,
  siteSettings,
  teacherEarnings,
  teacherPayoutDetails,
  users,
} from '../src/db/schema/index'
import { clearSettingsCache } from '../src/lib/settings'
import * as earnings from '../src/modules/commerce/earnings.service'

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
const stamp = Date.now()

async function account(kind: string, ...roles: string[]) {
  const email = `smoke-share-${kind}-${stamp}@example.com`
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
  for (const role of roles) {
    await db.execute(sql`
      INSERT INTO user_roles (user_id, role_id) SELECT ${id}, id FROM roles WHERE name = ${role}
    `)
  }
  const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  return { id, email, token: login.body.accessToken as string }
}

/** The school-wide figure, set the way an administrator sets it. */
async function setHouseShare(value: string, token: string) {
  const res = await call(
    '/settings',
    { method: 'PUT', body: JSON.stringify({ revenue_share_pct: value }) },
    token,
  )
  if (res.status !== 200) throw new Error(`could not set the house share: ${res.status}`)
  clearSettingsCache()
}

const admin = await account('admin', 'admin', 'superadmin')
const teacher = await account('teacher', 'teacher')
const other = await account('other', 'teacher')

const [settingBefore] = await db
  .select({ value: siteSettings.value })
  .from(siteSettings)
  .where(eq(siteSettings.key, 'revenue_share_pct'))
  .limit(1)

const made: number[] = []
let orderId = 0

try {
  await setHouseShare('30', admin.token)

  /* ---------------- the teacher sees it, and it is the school's ---------------- */

  const asTeacher = await call('/me/payout-details', {}, teacher.token)
  check('a teacher can read their own share', asTeacher.status === 200, String(asTeacher.status))
  check(
    '  nothing agreed yet, so none of their own',
    asTeacher.body?.data?.revenueSharePct === null,
    String(asTeacher.body?.data?.revenueSharePct),
  )
  check(
    "  and is told the school's figure, so the screen can name it",
    asTeacher.body?.data?.houseSharePct === 30,
    String(asTeacher.body?.data?.houseSharePct),
  )

  /* ---------------- only an administrator sets it ---------------- */

  const selfRaise = await call(
    '/me/payout-details',
    { method: 'PUT', body: JSON.stringify({ revenueSharePct: 95, bankName: 'กสิกรไทย' }) },
    teacher.token,
  )
  check('a teacher saving their own details is not refused', selfRaise.status === 200, String(selfRaise.status))
  check(
    '  but the share they sent is ignored, not obeyed',
    selfRaise.body?.data?.revenueSharePct === null,
    String(selfRaise.body?.data?.revenueSharePct),
  )

  const byTeacher = await call(
    `/members/${teacher.id}/payout-details`,
    { method: 'PUT', body: JSON.stringify({ revenueSharePct: 95 }) },
    teacher.token,
  )
  check('  and the admin route refuses them outright', byTeacher.status === 403, String(byTeacher.status))

  const byAdmin = await call(
    `/members/${teacher.id}/payout-details`,
    { method: 'PUT', body: JSON.stringify({ revenueSharePct: 55 }) },
    admin.token,
  )
  check('an administrator can agree a share', byAdmin.status === 200, String(byAdmin.status))

  const silly = await call(
    `/members/${teacher.id}/payout-details`,
    { method: 'PUT', body: JSON.stringify({ revenueSharePct: 140 }) },
    admin.token,
  )
  check('over a hundred percent is refused', silly.status === 422, String(silly.status))

  const nowSees = await call('/me/payout-details', {}, teacher.token)
  check('the teacher sees what was agreed', nowSees.body?.data?.revenueSharePct === 55, String(nowSees.body?.data?.revenueSharePct))

  /* ---------------- every course of theirs follows it ---------------- */

  const two: number[] = []
  for (const n of [1, 2]) {
    const res = await call(
      '/courses',
      {
        method: 'POST',
        body: JSON.stringify({
          title: `Smoke share course ${n}`,
          slug: `smoke-share-${n}-${stamp}`,
          price: 100000,
          instructorIds: [teacher.id],
        }),
      },
      admin.token,
    )
    const id = res.body?.data?.id as number
    two.push(id)
    made.push(id)
    await db.update(courses).set({ status: 'approved' }).where(eq(courses.id, id))
  }
  check('two courses are created for them', two.length === 2 && two.every(Boolean), two.join(', '))

  // A course no longer carries a share of its own, so there is nothing on it
  // that could disagree with the person's.
  const courseShown = await call(`/courses/${two[0]}`, {}, admin.token)
  check(
    'a course no longer carries a share of its own',
    courseShown.body?.data?.revenueSharePct === undefined ||
      courseShown.body?.data?.revenueSharePct === null,
    JSON.stringify(courseShown.body?.data?.revenueSharePct),
  )

  const ignored = await call(
    `/courses/${two[0]}`,
    { method: 'PATCH', body: JSON.stringify({ revenueSharePct: 90 }) },
    admin.token,
  )
  check(
    '  and sending one to a course changes nothing',
    ignored.status === 200 &&
      (await call(`/members/${teacher.id}/payout-details`, {}, admin.token)).body?.data
        ?.revenueSharePct === 55,
    String(ignored.status),
  )

  /* ---------------- what a sale actually pays ---------------- */

  await db.insert(orders).values({
    orderNo: `SMOKE-${stamp}`,
    userId: other.id,
    subtotal: 200000,
    total: 200000,
    totalThb: 200000,
    status: 'paid',
  })
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.orderNo, `SMOKE-${stamp}`))
    .limit(1)
  orderId = order!.id

  for (const courseId of two) {
    await db.execute(sql`
      INSERT INTO order_items (order_id, course_id, title_snapshot, unit_price, discount, access_type)
      VALUES (${orderId}, ${courseId}, 'Smoke', 100000, 0, 'lifetime')
    `)
  }

  const owed = await earnings.linesFor(orderId)
  check('both lines owe the teacher something', owed.length === 2, String(owed.length))
  check(
    '  each at the share agreed with the person',
    owed.every((l) => l.sharePct === 55),
    owed.map((l) => `${l.sharePct}%`).join(', '),
  )
  check(
    '  which is 55% of each line, not the house rate',
    owed.every((l) => l.amount === 55000),
    owed.map((l) => l.amount).join(', '),
  )

  /* ---------------- a teacher with nothing agreed ---------------- */

  const bare = await call(
    `/members/${teacher.id}/payout-details`,
    { method: 'PUT', body: JSON.stringify({ revenueSharePct: null }) },
    admin.token,
  )
  check('a share can be taken away again', bare.status === 200, String(bare.status))
  const onHouse = await earnings.linesFor(orderId)
  check(
    '  and they fall back to the school figure',
    onHouse.every((l) => l.sharePct === 30),
    onHouse.map((l) => `${l.sharePct}%`).join(', '),
  )

  /* ---------------- earnings already recorded never move ---------------- */

  await db.insert(teacherEarnings).values({
    userId: teacher.id,
    orderId,
    courseId: two[0]!,
    gross: 100000,
    vat: 0,
    base: 100000,
    sharePct: 55,
    amount: 55000,
    maturesAt: new Date(),
  })

  await call(
    `/members/${teacher.id}/payout-details`,
    { method: 'PUT', body: JSON.stringify({ revenueSharePct: 5 }) },
    admin.token,
  )

  const [earned] = await db
    .select({ pct: teacherEarnings.sharePct, amount: teacherEarnings.amount })
    .from(teacherEarnings)
    .where(eq(teacherEarnings.orderId, orderId))
  check(
    'cutting the share does not rewrite what was already earned',
    earned?.pct === 55 && earned?.amount === 55000,
    `${earned?.pct}% / ${earned?.amount}`,
  )
} finally {
  if (orderId) {
    await db.delete(teacherEarnings).where(eq(teacherEarnings.orderId, orderId))
    await db.execute(sql`DELETE FROM order_items WHERE order_id = ${orderId}`)
    await db.delete(orders).where(eq(orders.id, orderId))
  }
  if (made.length) {
    await db.update(courses).set({ status: 'draft', publishedAt: null }).where(inArray(courses.id, made))
    await db.delete(courses).where(inArray(courses.id, made))
  }
  for (const u of [admin, teacher, other]) {
    await db.delete(teacherPayoutDetails).where(eq(teacherPayoutDetails.userId, u.id))
    await db.delete(users).where(eq(users.id, u.id))
  }

  // A live setting: whatever it was before this ran is what the site expects.
  await setHouseShare(settingBefore?.value ?? '25', admin.token).catch(() => {})
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
