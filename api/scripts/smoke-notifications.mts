/**
 * Telling people what happened.
 *
 *   npx tsx scripts/smoke-notifications.mts
 *
 * Two events to begin with, chosen because each closes a hole somebody falls
 * into: a buyer who paid and was told nothing, and a teacher who had work
 * waiting and no way of knowing.
 *
 * What this watches hardest is the things that go wrong quietly: a webhook
 * delivered twice telling somebody twice, a learner's notification linking
 * into the admin, and one person reading another's.
 */
import { and, desc, eq, inArray, like } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  courseInstructors,
  entitlements,
  notifications,
  orderItems,
  orders,
  roles,
  userRoles,
  users,
} from '../src/db/schema/index'
import { markPaid } from '../src/modules/commerce/commerce.service'
import { submitEssay } from '../src/modules/learning/quiz.service'
import { notify } from '../src/modules/people/notify.service'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const stamp = Date.now()
const buyerEmail = `smoke-notif-b${stamp}@example.com`
const nosyEmail = `smoke-notif-n${stamp}@example.com`
const password = 'Str0ng-Pass!2026'
const madeOrders: number[] = []
/** Cleaned in `finally`, so a failure halfway still leaves the table as it was. */
let teacherToClean: number | null = null

async function account(email: string) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'ผู้',
      lastName: 'ซื้อ',
      birthdate: '2000-01-01',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const body = await res.json()
  return { id: body.user.id as number, token: body.accessToken as string }
}

const call = (path: string, token: string, init: RequestInit = {}) =>
  fetch(API + path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      Authorization: `Bearer ${token}`,
    },
  })

const buyer = await account(buyerEmail)
const nosy = await account(nosyEmail)

try {
  /* ---------------- a sale tells the buyer ---------------- */

  const catalog = await (await fetch(`${API}/courses?perPage=60`)).json()
  const paid = catalog.data.find((c: { price: number }) => c.price > 0)

  await call('/checkout', buyer.token, {
    method: 'POST',
    body: JSON.stringify({ lines: [{ kind: 'course', id: paid.id }], method: 'promptpay' }),
  })
  const [order] = await db.select().from(orders).where(eq(orders.userId, buyer.id)).limit(1)
  madeOrders.push(order!.id)

  check('nothing is said before the money arrives', (await inbox(buyer.token)).data.length === 0)

  await markPaid(order!.id, { providerRef: 'notif-test' })

  const after = await inbox(buyer.token)
  check('paying tells the buyer', after.data.length === 1, String(after.data.length))
  const note = after.data[0]
  check('  by name, not by code', /ชำระเงิน|เริ่มเรียน/.test(note?.title ?? ''), note?.title)
  check('  it names what they bought', (note?.body ?? '').includes('฿'), note?.body)
  check(
    '  and links to the receipt on the public site',
    (note?.link ?? '').includes(`/account/orders/${order!.orderNo}/receipt`),
    note?.link,
  )
  check('  which is a path, not a URL', !(note?.link ?? '').startsWith('http'), note?.link)
  check('  and it is unread', note?.readAt === null)
  check('  the badge agrees', after.meta.unread === 1, String(after.meta.unread))

  /* ---------------- a second webhook says nothing more ---------------- */

  await markPaid(order!.id, { providerRef: 'notif-test' })
  check('a webhook delivered twice tells them once', (await inbox(buyer.token)).data.length === 1)

  /* ---------------- and nobody else ---------------- */

  check("somebody else's inbox is empty", (await inbox(nosy.token)).data.length === 0)
  const stolen = await call(`/me/notifications/${note!.id}/read`, nosy.token, { method: 'POST' })
  check('  and reading by id marks nothing of yours', stolen.status === 204, String(stolen.status))
  check(
    '  it really is untouched',
    (await inbox(buyer.token)).data[0]?.readAt === null,
  )

  /* ---------------- the two apps stay apart ---------------- */

  const asAdminSurface = await (await call('/me/notifications?surface=admin', buyer.token)).json()
  check("a learner's notification is not in the admin list", asAdminSurface.data.length === 0)

  await notify({
    userId: buyer.id,
    type: 'test.admin',
    surface: 'admin',
    title: 'ของฝั่งหลังบ้าน',
    link: '/essay-review',
    subject: { type: 'test', id: stamp },
  })
  const site = await inbox(buyer.token)
  const admin = await (await call('/me/notifications?surface=admin', buyer.token)).json()
  check('one written for the admin appears there', admin.data.length === 1)
  check('  and not on the public site', site.data.length === 1, String(site.data.length))
  check('  each badge counts only its own', site.meta.unread === 1 && admin.meta.unread === 1)

  /* ---------------- reading them ---------------- */

  await call(`/me/notifications/${note!.id}/read`, buyer.token, { method: 'POST' })
  const read = await inbox(buyer.token)
  check('marking one read marks it read', read.data[0]?.readAt !== null)
  check('  and the badge drops', read.meta.unread === 0, String(read.meta.unread))

  const all = await (
    await call('/me/notifications/read-all', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ surface: 'admin' }),
    })
  ).json()
  check('read-all clears the other app', all.data.read === 1, String(all.data.read))
  check(
    '  leaving nothing unread anywhere',
    (await (await call('/me/notifications?surface=admin', buyer.token)).json()).meta.unread === 0,
  )

  /* ---------------- a written answer tells its teacher ---------------- */

  // The German course has an essay question and a teacher with an account.
  const [germanTeacher] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'lehrer.de@minna.local'))
    .limit(1)

  teacherToClean = germanTeacher?.id ?? null
  if (!germanTeacher) {
    console.log('  (no seeded German teacher; skipping the essay half)')
  } else {
    const essay = await db.execute(
      // The first essay question on a course that teacher teaches.
      // Written as raw SQL because it reaches across four tables for one id.
      // eslint-disable-next-line
      (await import('drizzle-orm')).sql`
        SELECT qq.id AS questionId, q.course_id AS courseId
        FROM quiz_questions qq
        JOIN quizzes q ON q.id = qq.quiz_id
        JOIN course_instructors ci ON ci.course_id = q.course_id
        WHERE qq.type = 'essay' AND ci.user_id = ${germanTeacher.id}
        LIMIT 1
      `,
    )
    const found = (essay as unknown as { questionId: number; courseId: number }[][])[0]?.[0]
    if (!found) {
      console.log('  (that teacher has no essay question; skipping)')
    } else {
      await db.insert(entitlements).values({
        userId: buyer.id,
        courseId: found.courseId,
        source: 'free',
        status: 'active',
      })
      await submitEssay(buyer.id, found.questionId, { body: 'Ich heiße Test. Ich komme aus Thailand.' })

      const teacherInbox = await db
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.userId, germanTeacher.id), eq(notifications.type, 'essay.submitted')),
        )
      check('submitting a written answer tells the teacher', teacherInbox.length === 1, String(teacherInbox.length))
      check('  in the admin, where they would mark it', teacherInbox[0]?.surface === 'admin')
      check('  linking to the review queue', teacherInbox[0]?.ctaUrl === '/essay-review')
      check('  and naming who wrote it', (teacherInbox[0]?.body ?? '').includes('ผู้ ซื้อ'), teacherInbox[0]?.body)

      // A redraft is work arriving again, and has to be announced again — but
      // a learner cannot resubmit while the teacher still has it, so the round
      // trip has to go through the teacher first.
      const { review } = await import('../src/modules/learning/essay.service')
      await review(teacherInbox[0]!.subjectId! / 1000 | 0, { result: 'revision', comment: 'ลองใหม่อีกครั้ง' }, germanTeacher.id)
      await submitEssay(buyer.id, found.questionId, { body: 'Zweiter Versuch, besser geschrieben.' })
      const afterRedraft = await db
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.userId, germanTeacher.id), eq(notifications.type, 'essay.submitted')),
        )
      check('a redraft is announced again', afterRedraft.length === 2, String(afterRedraft.length))

    }
  }
  /* ---------------- an application reaches every admin ---------------- */

  const admins = await db
    .select({ id: users.id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(inArray(roles.name, ['admin', 'superadmin']), eq(users.status, 'active')))
  const adminIds = [...new Set(admins.map((a) => a.id))]

  const applicant = `smoke-notif-t${stamp}@example.com`
  await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email: applicant,
      password,
      firstName: 'ผู้',
      lastName: 'สมัคร',
      birthdate: '1990-05-05',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'teacher',
      phoneCountryCode: '+66',
      phoneNational: '811234567',
      teacher: { subject: 'ภาษาเยอรมัน', experience: 'สอนมา 5 ปี' },
    }),
  })

  const told = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.type, 'teacher.applied'), inArray(notifications.userId, adminIds)))
    // Newest first: a run that crashed before its cleanup leaves rows behind,
    // and reading row zero out of an unordered select then reports on somebody
    // else's application instead of this one.
    .orderBy(desc(notifications.id))
  check(
    'an application tells every admin',
    told.length === adminIds.length,
    `${told.length} of ${adminIds.length}`,
  )
  check('  in the admin, where the review screen is', told.every((t) => t.surface === 'admin'))
  check('  linking to the applications queue', told.every((t) => t.ctaUrl === '/teacher-applications'))
  check('  naming who applied', (told[0]?.body ?? '').includes('ภาษาเยอรมัน'), told[0]?.body ?? '')

  await db.delete(notifications).where(inArray(notifications.userId, adminIds))
  await db.delete(users).where(eq(users.email, applicant))

} finally {
  if (teacherToClean) {
    await db.delete(notifications).where(eq(notifications.userId, teacherToClean))
  }
  await db.delete(entitlements).where(eq(entitlements.userId, buyer.id))
  if (madeOrders.length) {
    const items = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(inArray(orderItems.orderId, madeOrders))
    if (items.length) {
      await db.delete(entitlements).where(inArray(entitlements.orderItemId, items.map((i) => i.id)))
    }
    await db.execute(
      (await import('drizzle-orm')).sql`DELETE FROM teacher_earnings WHERE order_id IN (${madeOrders.join(',')})`,
    )
    await db.delete(orderItems).where(inArray(orderItems.orderId, madeOrders))
    await db.delete(orders).where(inArray(orders.id, madeOrders))
  }
  await db.delete(users).where(like(users.email, `smoke-notif-%${stamp}@example.com`))
  console.log('\n  cleaned up')
}

async function inbox(token: string) {
  return (await call('/me/notifications?surface=site', token)).json()
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
