/**
 * The three slides the home page opens with, in Thai.
 *
 *   npx tsx scripts/seed-hero.mts
 *
 * Content, not demo data: it is the slideshow the site ships with, written for
 * a language school and following the shape the design was built around — a
 * small line, a two-part headline, a sentence, and up to two buttons.
 *
 * The pictures come from Unsplash, which licenses them for commercial use
 * without attribution. They are fetched once and uploaded into the school's own
 * store, so the home page never depends on somebody else's CDN staying up.
 *
 * Running it twice does nothing: it checks for Thai slides first. Replace them
 * by deleting them in the admin and running it again.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { heroSlides } from '../src/db/schema/index'
import { isStorageConfigured, uploadFile } from '../src/lib/storage'

interface SlideSeed {
  /** The Unsplash photo, and what it actually shows. */
  photoId: string
  imageAlt: string
  /** Percentages. The hero keeps the right-hand side on a desktop, so the
   *  subject of each of these sits right of centre. */
  focalX: number
  focalY: number
  eyebrow: string
  titleA: string
  titleB: string | null
  subtitle: string
  ctaLabel: string
  ctaHref: string
  cta2Label: string | null
  cta2Href: string | null
}

const SLIDES: SlideSeed[] = [
  {
    photoId: 'photo-1522202176988-66273c2fd55f',
    imageAlt: 'กลุ่มผู้เรียนคุยกันอย่างสนุกสนานรอบโต๊ะพร้อมโน้ตบุ๊ก',
    focalX: 66,
    focalY: 42,
    eyebrow: 'Minna No Nihongo',
    titleA: 'เรียนภาษาญี่ปุ่นจากศูนย์',
    titleB: 'จนพูดได้จริง',
    subtitle:
      'คอร์สออนไลน์ตั้งแต่ฮิรางานะไปจนถึงบทสนทนาในชีวิตประจำวัน สอนโดยครูเจ้าของภาษา เรียนซ้ำได้ไม่จำกัด พร้อมแบบฝึกหัดและเรียงความที่ครูตรวจให้ทุกบท',
    ctaLabel: 'ดูคอร์สเรียน',
    ctaHref: '/th/courses',
    cta2Label: 'เกี่ยวกับเรา',
    cta2Href: '/th/about',
  },
  {
    photoId: 'photo-1515378791036-0648a3ef77b2',
    imageAlt: 'ผู้เรียนนั่งเรียนออนไลน์ผ่านโน้ตบุ๊กที่โต๊ะไม้',
    focalX: 60,
    focalY: 52,
    eyebrow: 'เรียนได้ทุกที่',
    titleA: 'เรียนต่อจากบทล่าสุด',
    titleB: 'ได้ทุกเวลา',
    subtitle:
      'ระบบจำความคืบหน้าให้ทุกบทเรียน กลับมาเรียนต่อจากจุดที่ค้างไว้ได้ทันที ทั้งบนคอมพิวเตอร์ แท็บเล็ต และมือถือ',
    ctaLabel: 'คอร์สของฉัน',
    ctaHref: '/th/learning',
    cta2Label: null,
    cta2Href: null,
  },
  {
    photoId: 'photo-1456513080510-7bf3a84b82f8',
    imageAlt: 'พจนานุกรมเปิดอยู่ข้างสมุดจดที่เขียนด้วยลายมือ มีชั้นหนังสืออยู่ด้านหลัง',
    focalX: 55,
    focalY: 58,
    eyebrow: 'เตรียมสอบ JLPT',
    titleA: 'ติวสอบ N5 ถึง N3',
    titleB: 'อย่างมีแผน',
    subtitle:
      'ติวตามโครงสร้างข้อสอบจริง ครบทั้งคำศัพท์ ไวยากรณ์ การอ่าน และการฟัง พร้อมแบบทดสอบจับเวลาและสรุปจุดที่ผู้สอบมักพลาด',
    ctaLabel: 'ดูคอร์สเตรียมสอบ',
    ctaHref: '/th/courses',
    cta2Label: null,
    cta2Href: null,
  },
]

/** The size the hero actually wants: it fills the right 56% of a band at least
 *  560px tall, and a 16:10 strip on a phone. */
const WIDTH = 1600
const HEIGHT = 1000

async function main() {
  if (!isStorageConfigured()) {
    console.error('File storage is not configured, so the pictures cannot be uploaded.')
    process.exit(1)
  }

  const existing = await db
    .select({ id: heroSlides.id })
    .from(heroSlides)
    .where(eq(heroSlides.locale, 'th'))
  if (existing.length) {
    console.log(`  ${existing.length} Thai slide(s) already exist — nothing to do.`)
    console.log('  Delete them in the admin and run this again to replace them.\n')
    process.exit(0)
  }

  let order = 0
  for (const slide of SLIDES) {
    order += 1

    const url = `https://images.unsplash.com/${slide.photoId}?auto=format&fit=crop&w=${WIDTH}&h=${HEIGHT}&q=75`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`could not fetch ${slide.photoId}: ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())

    // Into `content/`, the one folder served without a signature — a home page
    // picture has to load for a visitor who is not signed in.
    const stored = await uploadFile({
      folder: `content/hero`,
      filename: `${slide.photoId}.jpg`,
      body: bytes,
      contentType: 'image/jpeg',
    })

    await db.insert(heroSlides).values({
      locale: 'th',
      eyebrow: slide.eyebrow,
      titleA: slide.titleA,
      titleB: slide.titleB,
      subtitle: slide.subtitle,
      imagePath: stored.path,
      imageAlt: slide.imageAlt,
      focalX: slide.focalX,
      focalY: slide.focalY,
      ctaLabel: slide.ctaLabel,
      ctaHref: slide.ctaHref,
      cta2Label: slide.cta2Label,
      cta2Href: slide.cta2Href,
      status: 'published',
      sortOrder: order,
    })

    console.log(`  ${order}. ${slide.titleA} ${slide.titleB ?? ''}`)
    console.log(`     ${stored.path} (${Math.round(bytes.length / 1024)} KB)`)
  }

  console.log(`\n  ${SLIDES.length} slides published. See them under Site → Home slideshow.\n`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
