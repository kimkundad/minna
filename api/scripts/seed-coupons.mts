/**
 * A handful of coupons to test checkout with.
 *
 *   npx tsx scripts/seed-coupons.mts
 *
 * Written through the service rather than straight into the table, so these are
 * exactly as valid as one typed into the admin — a seed that can create a
 * coupon the admin would refuse is a seed that hides a bug.
 *
 * Idempotent: a code that already exists is left alone, so running this twice
 * does not fail and does not reset a usage count mid-test.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { coupons, courses } from '../src/db/schema/index'
import * as service from '../src/modules/commerce/coupons.service'

const baht = (n: number) => n * 100

/** A paid, published course for the course-scoped one to discount. */
const [course] = await db
  .select({ id: courses.id, title: courses.title, slug: courses.slug, price: courses.price })
  .from(courses)
  .where(eq(courses.status, 'approved'))
  .limit(50)
  .then((rows) => rows.filter((r) => r.price > 0 && r.sellable !== false))

if (!course) {
  console.error('no paid published course to attach a course coupon to')
  process.exit(1)
}

const WANTED = [
  {
    code: 'TEST10',
    note: '10% off the whole basket. The simplest one — no minimum, no ceiling, no end date.',
    input: {
      code: 'TEST10',
      scope: 'order' as const,
      courseId: null,
      discountType: 'percent' as const,
      value: 10,
      maxDiscount: null,
      minSubtotal: null,
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      active: true,
    },
  },
  {
    code: 'WELCOME300',
    note: `฿300 off a basket of ฿1,000 or more. Tests the minimum: it should be refused below that.`,
    input: {
      code: 'WELCOME300',
      scope: 'order' as const,
      courseId: null,
      discountType: 'fixed' as const,
      value: baht(300),
      maxDiscount: null,
      minSubtotal: baht(1000),
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      active: true,
    },
  },
  {
    code: 'COURSE25',
    note: `25% off "${course.title}" only, capped at ฿300. Tests both the per-course scope and the ceiling.`,
    input: {
      code: 'COURSE25',
      scope: 'course' as const,
      courseId: course.id,
      discountType: 'percent' as const,
      value: 25,
      maxDiscount: baht(300),
      minSubtotal: null,
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      active: true,
    },
  },
  {
    code: 'LASTYEAR',
    note: 'Expired yesterday. Here on purpose, so the refusal can be tested too.',
    input: {
      code: 'LASTYEAR',
      scope: 'order' as const,
      courseId: null,
      discountType: 'percent' as const,
      value: 50,
      maxDiscount: null,
      minSubtotal: null,
      startsAt: new Date(Date.now() - 30 * 86_400_000),
      expiresAt: new Date(Date.now() - 86_400_000),
      usageLimit: null,
      active: true,
    },
  },
]

for (const wanted of WANTED) {
  const [existing] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.code, wanted.code))
    .limit(1)

  if (existing) {
    console.log(`  ${wanted.code.padEnd(12)} already there, left alone`)
    continue
  }

  await service.create(wanted.input)
  console.log(`  ${wanted.code.padEnd(12)} created — ${wanted.note}`)
}

console.log('')
const all = await db.select().from(coupons)
for (const c of all) {
  const amount =
    c.discountType === 'percent'
      ? `${c.value}%${c.maxDiscount ? ` (max ฿${c.maxDiscount / 100})` : ''}`
      : `฿${c.value / 100}`
  const limits = [
    c.scope === 'course' ? `course #${c.courseId}` : 'whole basket',
    c.minSubtotal ? `min ฿${c.minSubtotal / 100}` : null,
    c.expiresAt ? `until ${new Date(c.expiresAt).toISOString().slice(0, 10)}` : null,
    c.usageLimit ? `${c.usedCount}/${c.usageLimit} used` : null,
    c.active ? null : 'switched off',
  ]
    .filter(Boolean)
    .join(', ')
  console.log(`  ${c.code.padEnd(12)} ${amount.padEnd(18)} ${limits}`)
}

process.exit(0)
