/**
 * The site-wide share card, in each of the four languages.
 *
 *   npx tsx scripts/seed-og-defaults.mts
 *
 * What a link shows when it points at a page that is neither a course nor an
 * article — the home page, the catalog, about — and the fallback for any
 * course or article that has said nothing of its own.
 *
 * Fills in blanks only. A value somebody has edited in the admin is theirs,
 * and running this again leaves it alone; the point is to arrive with
 * something sensible rather than with twelve empty fields and a grey box in
 * every chat window.
 *
 * The unsuffixed key is Thai — the canonical one, the same arrangement as a
 * category's name — and `og_title_en` and friends sit on top of it. A
 * language with nothing of its own falls back to Thai rather than going
 * blank, so these can be filled in one language at a time.
 *
 * Course and article cards are deliberately not translated: each is written
 * in one language, and a translated share card would promise a translated
 * page that does not exist.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { siteSettings } from '../src/db/schema/index'
import { env } from '../src/config/env'

/**
 * The pictures are files shipped with the front end, addressed as plain URLs
 * rather than pushed through storage: they belong to the build, they are the
 * same for everybody, and a signed link would expire while a shared message
 * does not. `frontend/scripts/build-og-image.mjs` draws them.
 */
const COPY: Record<string, { title: string; description: string }> = {
  th: {
    title: 'Minna No Nihongo — เรียนภาษาออนไลน์กับครูเจ้าของภาษา',
    description:
      'คอร์สภาษาญี่ปุ่น อังกฤษ จีน เวียดนามและเยอรมัน เรียนออนไลน์ได้ทุกเวลา มีแบบฝึกหัดและครูตรวจให้ทุกบท',
  },
  en: {
    title: 'Minna No Nihongo — learn a language online with native teachers',
    description:
      'Japanese, English, Chinese, Vietnamese and German courses. Study whenever you like, with exercises a teacher marks in every lesson.',
  },
  jp: {
    title: 'Minna No Nihongo — ネイティブ講師と学ぶオンライン語学',
    description:
      '日本語・英語・中国語・ベトナム語・ドイツ語のオンライン講座。好きな時間に学べて、各レッスンの課題は講師が添削します。',
  },
  vn: {
    title: 'Minna No Nihongo — học ngoại ngữ trực tuyến cùng giáo viên bản ngữ',
    description:
      'Các khoá tiếng Nhật, Anh, Trung, Việt và Đức. Học bất cứ lúc nào, mỗi bài đều có bài tập được giáo viên chấm.',
  },
}

/** key → value, with Thai unsuffixed. */
const DEFAULTS: Record<string, string> = {}
for (const [locale, copy] of Object.entries(COPY)) {
  const suffix = locale === 'th' ? '' : `_${locale}`
  DEFAULTS[`og_title${suffix}`] = copy.title
  DEFAULTS[`og_description${suffix}`] = copy.description
  DEFAULTS[`og_image_path${suffix}`] = `${env.APP_URL}/og-default-${locale}.png`
}

let written = 0
let kept = 0

for (const [key, value] of Object.entries(DEFAULTS)) {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1)

  if (row && String(row.value ?? '').trim()) {
    kept += 1
    continue
  }

  await db.execute(sql`
    INSERT INTO site_settings (\`key\`, value, \`group\`) VALUES (${key}, ${value}, 'sharing')
    ON DUPLICATE KEY UPDATE value = ${value}, \`group\` = 'sharing'
  `)
  written += 1
  console.log(`  set  ${key.padEnd(24)} ${value.slice(0, 54)}`)
}

console.log(`\n${written} set, ${kept} already filled in and left alone`)

if (env.APP_URL.includes('localhost')) {
  console.log(
    `\n  !! the pictures point at ${env.APP_URL}, which a crawler cannot reach.\n` +
      `     Run this again on the server, or set them in the admin.`,
  )
}

process.exit(0)
