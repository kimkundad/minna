/**
 * A starting point for the closing call to action, in all eight languages.
 *
 *   npx tsx scripts/seed-home-cta.mts
 *
 * The band at the foot of the home page — logo, a line, a heading, four chips
 * and a button — was written into the page in Thai, so the seven other
 * languages read it in Thai and the school could not change a word of it.
 *
 * It shares its tables and its screen with the journey band above it: the same
 * shape, told apart by `band`. The only difference is that a chip here is a
 * title with an icon and no sentence under it.
 *
 * These mirror what the page already said, which is true of the school:
 * courses are bought one at a time, with the videos, the notes, the questions
 * and the end-of-course test included rather than sold again on top.
 *
 * Safe to run twice. A language that already has chips is left alone.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { journeySections, journeySteps } from '../src/db/schema/index'
import { LOCALES } from '../src/db/schema/auth'

type Locale = (typeof LOCALES)[number]

interface Band {
  eyebrow: string
  heading: string
  intro: string
  ctaLabel: string
  /** Four chips: an icon and a few words. No sentence under them. */
  chips: { icon: string; title: string }[]
}

/** Every icon here is in the site's own set — see `lib/icon-names.ts`. */
const COPY: Record<Locale, Band> = {
  th: {
    eyebrow: 'Start Learning',
    heading: 'เลือกคอร์สที่ใช่ แล้วเริ่มเรียนได้เลยวันนี้',
    intro: 'ซื้อเป็นรายคอร์ส จ่ายเฉพาะที่เรียน ไม่มีค่าสมาชิกรายเดือน เปิดเรียนทันทีหลังชำระเงิน',
    ctaLabel: 'เริ่มต้นเลือกคอร์ส',
    chips: [
      { icon: 'play-circle', title: 'วิดีโอบทเรียนเต็มคอร์ส' },
      { icon: 'file-text', title: 'เอกสารประกอบดาวน์โหลดได้' },
      { icon: 'message', title: 'ถาม–ตอบกับผู้สอน' },
      { icon: 'clipboard-check', title: 'แบบทดสอบท้ายคอร์ส' },
    ],
  },

  en: {
    eyebrow: 'Start Learning',
    heading: 'Pick the course that fits, and start today',
    intro:
      'Bought one course at a time. You pay for what you study, there is no monthly membership, and it opens the moment the payment clears.',
    ctaLabel: 'Browse the courses',
    chips: [
      { icon: 'play-circle', title: 'Every lesson on video' },
      { icon: 'file-text', title: 'Notes to download' },
      { icon: 'message', title: 'Questions answered by your teacher' },
      { icon: 'clipboard-check', title: 'An end-of-course test' },
    ],
  },

  jp: {
    eyebrow: 'Start Learning',
    heading: '自分に合う講座を選んで、今日から始める',
    intro:
      '講座ごとのご購入です。学ぶ分だけのお支払いで、月額会員費はありません。決済後すぐに受講できます。',
    ctaLabel: '講座を見る',
    chips: [
      { icon: 'play-circle', title: '全レッスンの動画' },
      { icon: 'file-text', title: 'ダウンロードできる資料' },
      { icon: 'message', title: '講師への質問' },
      { icon: 'clipboard-check', title: '修了テスト' },
    ],
  },

  vn: {
    eyebrow: 'Start Learning',
    heading: 'Chọn khoá phù hợp và bắt đầu ngay hôm nay',
    intro:
      'Mua theo từng khoá. Bạn chỉ trả cho phần mình học, không có phí thành viên hằng tháng, và khoá mở ngay khi thanh toán xong.',
    ctaLabel: 'Xem các khoá học',
    chips: [
      { icon: 'play-circle', title: 'Video đầy đủ các bài' },
      { icon: 'file-text', title: 'Tài liệu tải về' },
      { icon: 'message', title: 'Hỏi đáp với giáo viên' },
      { icon: 'clipboard-check', title: 'Bài kiểm tra cuối khoá' },
    ],
  },

  id: {
    eyebrow: 'Start Learning',
    heading: 'Pilih kursus yang pas, dan mulai hari ini',
    intro:
      'Dibeli per kursus. Anda membayar apa yang Anda pelajari, tidak ada iuran bulanan, dan kursusnya terbuka begitu pembayaran masuk.',
    ctaLabel: 'Lihat kursusnya',
    chips: [
      { icon: 'play-circle', title: 'Semua pelajaran dalam video' },
      { icon: 'file-text', title: 'Materi yang bisa diunduh' },
      { icon: 'message', title: 'Tanya jawab dengan pengajar' },
      { icon: 'clipboard-check', title: 'Tes akhir kursus' },
    ],
  },

  zh: {
    eyebrow: 'Start Learning',
    heading: '挑一门合适的课程，今天就开始',
    intro: '按课程购买。学多少付多少，没有月费会员，付款完成即可开始上课。',
    ctaLabel: '浏览课程',
    chips: [
      { icon: 'play-circle', title: '全部课节影片' },
      { icon: 'file-text', title: '可下载的讲义' },
      { icon: 'message', title: '向讲师提问' },
      { icon: 'clipboard-check', title: '结课测验' },
    ],
  },

  ko: {
    eyebrow: 'Start Learning',
    heading: '맞는 강의를 골라 오늘 시작하세요',
    intro:
      '강의 단위로 구매합니다. 배우는 만큼만 내시고, 월 회비는 없으며, 결제가 끝나는 즉시 열립니다.',
    ctaLabel: '강의 둘러보기',
    chips: [
      { icon: 'play-circle', title: '모든 수업 영상' },
      { icon: 'file-text', title: '내려받는 자료' },
      { icon: 'message', title: '강사에게 질문' },
      { icon: 'clipboard-check', title: '강의 마무리 시험' },
    ],
  },

  tw: {
    eyebrow: 'Start Learning',
    heading: '挑一門合適的課程，今天就開始',
    intro: '按課程購買。學多少付多少，沒有月費會員，付款完成即可開始上課。',
    ctaLabel: '瀏覽課程',
    chips: [
      { icon: 'play-circle', title: '全部課節影片' },
      { icon: 'file-text', title: '可下載的講義' },
      { icon: 'message', title: '向講師提問' },
      { icon: 'clipboard-check', title: '結業測驗' },
    ],
  },
}

let written = 0

for (const locale of LOCALES) {
  const copy = COPY[locale]

  const already = await db
    .select({ id: journeySteps.id })
    .from(journeySteps)
    .where(and(eq(journeySteps.band, 'cta'), eq(journeySteps.locale, locale)))

  if (already.length) {
    console.log(`  ${locale}: ${already.length} chips already there — left alone`)
    continue
  }

  await db
    .insert(journeySections)
    .values({
      band: 'cta',
      locale,
      eyebrow: copy.eyebrow,
      heading: copy.heading,
      intro: copy.intro,
      ctaLabel: copy.ctaLabel,
      // With the language in it: a link without one lands a reader on whatever
      // language their browser last stored.
      ctaHref: `/${locale}/courses`,
      status: 'published',
    })
    .onDuplicateKeyUpdate({ set: { status: 'published' } })

  for (const [n, chip] of copy.chips.entries()) {
    await db
      .insert(journeySteps)
      .values({ band: 'cta', locale, ...chip, text: null, sortOrder: n + 1 })
  }

  console.log(`  ${locale}: a heading and ${copy.chips.length} chips added`)
  written += 1
}

console.log(written ? `\n${written} language(s) filled in.` : '\nNothing to do.')
process.exit(0)
