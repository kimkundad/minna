/**
 * Category names in every language the site is translated into.
 *
 *   npx tsx scripts/seed-category-translations.mts
 *
 * Keyed by slug rather than by id, because a slug is the thing that means
 * something: ids differ between the development database and production, and a
 * list of numbers would quietly translate the wrong rows there.
 *
 * Safe to run twice, and it never overwrites. A name an admin has edited is
 * theirs; this only fills in what is still missing, so running it again after
 * adding a category or a language translates the new one and leaves the rest
 * alone.
 *
 * Thai is not here. That is the canonical name, it lives on the category
 * itself, and a second copy of it in this table could only ever disagree.
 *
 * Chinese is two languages in this table as everywhere else: `zh` is 简体 and
 * `tw` is 繁體, which is a different script rather than a different accent.
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/client'
import { categories, categoryTranslations } from '../src/db/schema/index'

/** The locales a category name is expected in — every UI language but Thai. */
const LOCALES = ['en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw'] as const
type Locale = (typeof LOCALES)[number]

/** slug → one name per locale */
const NAMES: Record<string, Record<Locale, string>> = {
  japanese: {
    en: 'Japanese',
    jp: '日本語',
    vn: 'Tiếng Nhật',
    id: 'Bahasa Jepang',
    zh: '日语',
    ko: '일본어',
    tw: '日語',
  },
  'japanese-conversation': {
    en: 'Conversation',
    jp: '会話',
    vn: 'Giao tiếp',
    id: 'Percakapan',
    zh: '会话',
    ko: '회화',
    tw: '會話',
  },
  'japanese-grammar': {
    en: 'Grammar',
    jp: '文法',
    vn: 'Ngữ pháp',
    id: 'Tata bahasa',
    zh: '语法',
    ko: '문법',
    tw: '文法',
  },
  'japanese-jlpt': {
    en: 'JLPT preparation',
    jp: 'JLPT 対策',
    vn: 'Luyện thi JLPT',
    id: 'Persiapan JLPT',
    zh: 'JLPT 备考',
    ko: 'JLPT 대비',
    tw: 'JLPT 備考',
  },
  'japanese-kanji': {
    en: 'Kanji',
    jp: '漢字',
    vn: 'Kanji',
    id: 'Kanji',
    zh: '汉字',
    ko: '한자',
    tw: '漢字',
  },
  'japanese-business': {
    en: 'Business Japanese',
    jp: 'ビジネス日本語',
    vn: 'Tiếng Nhật thương mại',
    id: 'Bahasa Jepang bisnis',
    zh: '商务日语',
    ko: '비즈니스 일본어',
    tw: '商務日語',
  },

  english: {
    en: 'English',
    jp: '英語',
    vn: 'Tiếng Anh',
    id: 'Bahasa Inggris',
    zh: '英语',
    ko: '영어',
    tw: '英語',
  },
  'english-conversation': {
    en: 'Conversation',
    jp: '会話',
    vn: 'Giao tiếp',
    id: 'Percakapan',
    zh: '会话',
    ko: '회화',
    tw: '會話',
  },
  'english-business': {
    en: 'Business English',
    jp: 'ビジネス英語',
    vn: 'Tiếng Anh thương mại',
    id: 'Bahasa Inggris bisnis',
    zh: '商务英语',
    ko: '비즈니스 영어',
    tw: '商務英語',
  },
  'english-exam': {
    en: 'Exam preparation',
    jp: '試験対策',
    vn: 'Luyện thi',
    id: 'Persiapan ujian',
    zh: '考试备考',
    ko: '시험 대비',
    tw: '考試備考',
  },

  chinese: {
    en: 'Chinese',
    jp: '中国語',
    vn: 'Tiếng Trung',
    id: 'Bahasa Mandarin',
    zh: '中文',
    ko: '중국어',
    tw: '中文',
  },
  'chinese-conversation': {
    en: 'Conversation',
    jp: '会話',
    vn: 'Giao tiếp',
    id: 'Percakapan',
    zh: '会话',
    ko: '회화',
    tw: '會話',
  },
  'chinese-hsk': {
    en: 'HSK preparation',
    jp: 'HSK 対策',
    vn: 'Luyện thi HSK',
    id: 'Persiapan HSK',
    zh: 'HSK 备考',
    ko: 'HSK 대비',
    tw: 'HSK 備考',
  },

  vietnamese: {
    en: 'Vietnamese',
    jp: 'ベトナム語',
    vn: 'Tiếng Việt',
    id: 'Bahasa Vietnam',
    zh: '越南语',
    ko: '베트남어',
    tw: '越南語',
  },
  'vietnamese-conversation': {
    en: 'Conversation',
    jp: '会話',
    vn: 'Giao tiếp',
    id: 'Percakapan',
    zh: '会话',
    ko: '회화',
    tw: '會話',
  },

  german: {
    en: 'German',
    jp: 'ドイツ語',
    vn: 'Tiếng Đức',
    id: 'Bahasa Jerman',
    zh: '德语',
    ko: '독일어',
    tw: '德語',
  },
  'german-beginner': {
    en: 'Foundations',
    jp: '入門',
    vn: 'Nền tảng',
    id: 'Dasar',
    zh: '入门',
    ko: '입문',
    tw: '入門',
  },
  'german-grammar': {
    en: 'Grammar',
    jp: '文法',
    vn: 'Ngữ pháp',
    id: 'Tata bahasa',
    zh: '语法',
    ko: '문법',
    tw: '文法',
  },
}

const slugs = Object.keys(NAMES)
const rows = await db
  .select({ id: categories.id, slug: categories.slug, name: categories.name })
  .from(categories)
  .where(inArray(categories.slug, slugs))

const found = new Set(rows.map((r) => r.slug))
const missing = slugs.filter((s) => !found.has(s))
if (missing.length) {
  console.log(`not in this database, skipped: ${missing.join(', ')}`)
}

let written = 0
let kept = 0

for (const row of rows) {
  const names = NAMES[row.slug]
  const already = await db
    .select({ locale: categoryTranslations.locale })
    .from(categoryTranslations)
    .where(eq(categoryTranslations.categoryId, row.id))
  const have = new Set(already.map((a) => a.locale))

  for (const [locale, name] of Object.entries(names)) {
    if (have.has(locale)) {
      kept += 1
      continue
    }
    await db.insert(categoryTranslations).values({ categoryId: row.id, locale, name })
    written += 1
  }
}

console.log(`${written} names added${kept ? `, ${kept} already there and left alone` : ''}`)

// What is still untranslated, which is the question somebody asks next.
const all = await db.select({ id: categories.id, name: categories.name }).from(categories)
const done = await db
  .select({ categoryId: categoryTranslations.categoryId, locale: categoryTranslations.locale })
  .from(categoryTranslations)
const byCategory = new Map<number, Set<string>>()
for (const d of done) {
  byCategory.set(d.categoryId, (byCategory.get(d.categoryId) ?? new Set()).add(d.locale))
}
const gaps = all
  .map((c) => ({
    name: c.name,
    short: LOCALES.filter((l) => !byCategory.get(c.id)?.has(l)),
  }))
  .filter((g) => g.short.length)
if (gaps.length) {
  console.log('\n  still untranslated:')
  for (const g of gaps) console.log(`    ${g.name} — missing ${g.short.join(', ')}`)
}

process.exit(0)
