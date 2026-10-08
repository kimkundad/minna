/**
 * Loads the Learnsbuy campaigns and their artwork.
 *
 *   npx tsx scripts/seed-ads.mts         write them
 *   npx tsx scripts/seed-ads.mts down    take them away again
 *
 * The artwork is built by `frontend/scripts/build-ads.mjs` into
 * `frontend/public/ads/out/`. This uploads those files to the store and files
 * the campaigns against them.
 *
 * Into `content/`, the one folder served without a signature: an advertisement
 * has to load for a visitor who has never signed in.
 */
import { eq, like } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '../src/db/client'
import { ads } from '../src/db/schema/index'
import { deleteFile, isStorageConfigured, uploadFile } from '../src/lib/storage'
import type { AdPlacement } from '../src/modules/content/ads.service'

const ART = resolve(import.meta.dirname, '../../frontend/public/ads/out')
const HREF = 'https://learnsbuy.com'

interface Seed {
  key: string
  name: string
  placement: AdPlacement
  alt: string
  sortOrder: number
}

/**
 * Four campaigns across four placements, each with its own photograph — the
 * same advertiser twice on one page with the same picture reads as a bug.
 */
const SEEDS: Seed[] = [
  {
    key: 'home-pat',
    name: 'Learnsbuy · ครูพี่โฮม PAT 300 เต็ม',
    placement: 'home-top',
    alt: 'Learnsbuy — ครูพี่โฮม PAT ภาษาญี่ปุ่น 300 คะแนนเต็ม เกียรตินิยมอันดับ 1 เหรียญทอง อักษรศาสตร์ จุฬาฯ',
    sortOrder: 0,
  },
  {
    key: 'classroom-24y',
    name: 'Learnsbuy · ห้องเรียนจริง 24 ปี',
    placement: 'catalog-inline',
    alt: 'Learnsbuy — ห้องเรียนจริงของ ZA-SHI ครูพี่โฮม สอนมากว่า 24 ปี',
    sortOrder: 0,
  },
  {
    key: 'online-lesson',
    name: 'Learnsbuy · เรียนออนไลน์ ดูย้อนหลังได้',
    placement: 'article',
    alt: 'Learnsbuy — ติว A-Level ภาษาญี่ปุ่นออนไลน์ ดูย้อนหลังได้',
    sortOrder: 0,
  },
  {
    key: 'intensive',
    name: 'Learnsbuy · รอบติวเข้มก่อนสอบ',
    placement: 'blog',
    alt: 'Learnsbuy — รอบติวเข้มก่อนสอบ A-Level และ PAT ภาษาญี่ปุ่น',
    sortOrder: 0,
  },
]

const down = process.argv[2] === 'down'

if (down) {
  const rows = await db.select().from(ads).where(like(ads.name, 'Learnsbuy · %'))
  for (const row of rows) {
    for (const path of [row.imageDesktopPath, row.imageMobilePath]) {
      if (!path || !isStorageConfigured()) continue
      try {
        await deleteFile(path)
      } catch {
        // Artwork already gone is not a reason to leave the campaign behind.
      }
    }
    await db.delete(ads).where(eq(ads.id, row.id))
  }
  console.log(`\n  removed ${rows.length} campaigns\n`)
  process.exit(0)
}

if (!isStorageConfigured()) {
  console.error('storage is not configured — the artwork cannot be uploaded')
  process.exit(1)
}

let made = 0
for (const seed of SEEDS) {
  const [exists] = await db.select({ id: ads.id }).from(ads).where(eq(ads.name, seed.name)).limit(1)
  if (exists) {
    console.log(`  — ${seed.name} is already there`)
    continue
  }

  const [res] = await db.insert(ads).values({
    name: seed.name,
    placement: seed.placement,
    advertiser: 'learnsbuy.com',
    href: HREF,
    imageAlt: seed.alt,
    locale: 'all',
    status: 'published',
    startsAt: null,
    endsAt: null,
    sortOrder: seed.sortOrder,
  })
  const id = Number(res.insertId)

  const paths: Record<string, string> = {}
  for (const [field, file] of [
    ['imageDesktopPath', `${seed.key}-desktop.png`],
    ['imageMobilePath', `${seed.key}-mobile.png`],
  ] as const) {
    const stored = await uploadFile({
      folder: `content/ads/${id}`,
      filename: file,
      body: new Uint8Array(readFileSync(`${ART}/${file}`)),
      contentType: 'image/png',
    })
    paths[field] = stored.path
  }

  await db
    .update(ads)
    .set({ imageDesktopPath: paths.imageDesktopPath, imageMobilePath: paths.imageMobilePath })
    .where(eq(ads.id, id))

  made += 1
  console.log(`  ${made}. ${seed.name}  →  ${seed.placement}`)
}

console.log(`\n  ${made} campaigns live. See them under Advertising in the admin.\n`)
process.exit(0)
