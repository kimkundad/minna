/**
 * Fills the four content screens so they can be looked at, and empties them
 * again.
 *
 *   npx tsx scripts/demo-content.mts up
 *   npx tsx scripts/demo-content.mts down
 *
 * Enquiries and subscribers have no public end yet, so nothing but this puts a
 * row in those two tables. Everything it makes is marked `smoke` or
 * `@example.com` and `down` removes exactly that.
 */
import { like, or } from 'drizzle-orm'
import { db } from '../src/db/client'
import { contactMessages, posts, subscribers, testimonials } from '../src/db/schema/index'

const MODE = process.argv[2] ?? 'up'

if (MODE === 'down') {
  await db.delete(posts).where(like(posts.slug, 'smoke-%'))
  await db.delete(testimonials).where(like(testimonials.name, 'Smoke %'))
  await db.delete(contactMessages).where(like(contactMessages.email, '%@example.com'))
  await db.delete(subscribers).where(like(subscribers.email, '%@example.com'))
  console.log('cleared the demo content')
  process.exit(0)
}

const existing = await db
  .select({ slug: posts.slug })
  .from(posts)
  .where(or(like(posts.slug, 'smoke-%')))
if (existing.length) {
  console.log('demo content is already there — run `down` first to replace it')
  process.exit(0)
}

await db.insert(posts).values([
  {
    title: 'เริ่มเรียนภาษาญี่ปุ่นด้วยตัวเองต้องรู้อะไรบ้าง',
    slug: 'smoke-start-japanese',
    excerpt: 'ฮิรางานะ คาตาคานะ และลำดับที่ควรเรียนก่อนหลัง สำหรับคนที่ไม่เคยเรียนมาก่อน',
    contentHtml: '<p>ก่อนจะไปถึงคันจิ สิ่งที่ต้องแน่นก่อนคือฮิรางานะกับคาตาคานะ…</p>',
    contentLocale: 'th',
    status: 'published',
    publishedAt: new Date(),
    authorId: 1,
  },
  {
    title: 'JLPT N5 สอบอะไรบ้าง',
    slug: 'smoke-jlpt-n5',
    excerpt: 'โครงสร้างข้อสอบ เวลาที่ใช้ และเกณฑ์ผ่าน',
    contentHtml: '<p>N5 แบ่งเป็นสามส่วน…</p>',
    contentLocale: 'th',
    status: 'published',
    publishedAt: new Date(Date.now() - 86400000 * 9),
    authorId: 1,
  },
  {
    title: 'How long does it take to reach conversational Japanese?',
    slug: 'smoke-how-long',
    excerpt: 'An honest answer, with the assumptions written down.',
    contentHtml: '<p>It depends on what you mean by conversational…</p>',
    contentLocale: 'en',
    status: 'draft',
    authorId: 1,
  },
])

await db.insert(testimonials).values([
  {
    name: 'Smoke ปวีณา ส.',
    designation: 'นักศึกษาปี 3',
    content: 'เริ่มจากศูนย์จริง ๆ ตอนนี้อ่านเมนูร้านอาหารญี่ปุ่นได้แล้ว อาจารย์อธิบายละเอียดมาก',
    rating: 5,
    status: 'published',
    sortOrder: 1,
  },
  {
    name: 'Smoke Thanakrit P.',
    designation: 'วิศวกร',
    content: 'เรียนตอนกลางคืนหลังเลิกงานได้ ย้อนดูซ้ำได้เรื่อย ๆ คุ้มกว่าที่คิดไว้',
    rating: 5,
    status: 'published',
    sortOrder: 2,
  },
  {
    name: 'Smoke Hidden Example',
    designation: null,
    content: 'A quote kept back while it is checked.',
    rating: 4,
    status: 'draft',
    sortOrder: 3,
  },
])

await db.insert(contactMessages).values([
  {
    name: 'สมชาย ใจดี',
    email: 'somchai@example.com',
    subject: 'คอร์ส N4 เปิดเมื่อไหร่',
    message: 'เรียน N5 จบแล้วครับ อยากทราบว่าคอร์ส N4 จะเปิดช่วงไหน และราคาเท่าไหร่',
    readAt: null,
  },
  {
    name: 'Jane Cooper',
    email: 'jane@example.com',
    subject: 'Corporate training for 12 staff',
    message: 'We would like a quote for twelve people, starting in January.',
    readAt: null,
  },
  {
    name: 'มานี รักเรียน',
    email: 'manee@example.com',
    subject: 'ขอใบกำกับภาษี',
    message: 'ซื้อคอร์สไปเมื่อเดือนที่แล้ว ขอใบกำกับภาษีเต็มรูปแบบย้อนหลังได้ไหมคะ',
    readAt: new Date(Date.now() - 86400000 * 2),
  },
])

await db.insert(subscribers).values([
  { email: 'confirmed.one@example.com', confirmedAt: new Date(Date.now() - 86400000 * 30) },
  { email: 'confirmed.two@example.com', confirmedAt: new Date(Date.now() - 86400000 * 12) },
  { email: 'never.confirmed@example.com' },
  {
    email: 'left.us@example.com',
    confirmedAt: new Date(Date.now() - 86400000 * 90),
    unsubscribedAt: new Date(Date.now() - 86400000 * 3),
  },
])

console.log('added 3 articles, 3 testimonials, 3 enquiries, 4 subscribers')
process.exit(0)
