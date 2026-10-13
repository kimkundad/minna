/**
 * The home slideshow, in every language but Thai.
 *
 *   npx tsx scripts/seed-hero-locales.mts
 *
 * The slideshow is stored per language and only Thai had any, so every other
 * language opened on an empty hero — the first thing a visitor saw was a gap.
 * It happened twice: once when English, Japanese and Vietnamese went in, and
 * again when Indonesian, Chinese, Korean and Taiwanese did.
 *
 * These mirror the Thai three rather than inventing different ones: the same
 * promise in eight languages is one site, and eight sites that happen to share
 * a logo is what you get by writing each separately. The pictures are the ones
 * already uploaded, reused by path — the same photograph in every language is
 * correct, and uploading it four times would be four files to replace the next
 * time somebody changes it.
 *
 * Safe to run twice: a language that already has slides is left alone, because
 * running this again must not quietly undo an edit somebody made in the admin.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { heroSlides } from '../src/db/schema/index'

type Locale = 'en' | 'jp' | 'vn' | 'id' | 'zh' | 'ko' | 'tw'

interface Slide {
  eyebrow: string | null
  titleA: string
  titleB: string | null
  subtitle: string
  imageAlt: string
  ctaLabel: string
  /** Without the locale: it is added per language below. */
  ctaPath: string
  cta2Label: string | null
  cta2Path: string | null
}

/**
 * The pictures, taken from the Thai slides rather than named here.
 *
 * Read at run time so a changed photograph reaches every language at once; a
 * list of paths copied into this file would be right on the day it was written
 * and wrong after the first replacement.
 */
async function picturesInOrder(): Promise<(string | null)[]> {
  const rows = await db
    .select({ sortOrder: heroSlides.sortOrder, imagePath: heroSlides.imagePath })
    .from(heroSlides)
    .where(eq(heroSlides.locale, 'th'))
  return rows.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.imagePath)
}

const COPY: Record<Locale, Slide[]> = {
  en: [
    {
      eyebrow: 'MINNA NO NIHONGO',
      titleA: 'Learn Japanese from nothing',
      titleB: 'until you can really speak it',
      subtitle:
        'Online courses from hiragana to conversation, taught by native speakers. Rewatch as often as you like, with every exercise marked.',
      imageAlt: 'A student at a laptop, taking a Japanese lesson',
      ctaLabel: 'Browse the courses',
      ctaPath: '/courses',
      cta2Label: 'About the school',
      cta2Path: '/about',
    },
    {
      eyebrow: 'LEARN AT YOUR OWN PACE',
      titleA: 'Pick up where you left off',
      titleB: 'whenever you have a moment',
      subtitle:
        'Your progress is saved lesson by lesson, so ten minutes on the train is ten minutes of real study.',
      imageAlt: 'Someone studying on a phone',
      ctaLabel: 'My courses',
      ctaPath: '/account/learning',
      cta2Label: null,
      cta2Path: null,
    },
    {
      eyebrow: 'JLPT PREPARATION',
      titleA: 'From N5 to N3',
      titleB: 'with a plan behind it',
      subtitle:
        'Past-paper drills, mock tests and written answers marked by a teacher — so you know what to fix before the day.',
      imageAlt: 'Notes and practice papers on a desk',
      ctaLabel: 'See the exam courses',
      ctaPath: '/courses',
      cta2Label: null,
      cta2Path: null,
    },
  ],
  jp: [
    {
      eyebrow: 'MINNA NO NIHONGO',
      titleA: 'ゼロから始める日本語',
      titleB: '話せるようになるまで',
      subtitle:
        'ひらがなから会話まで、ネイティブ講師によるオンライン講座。何度でも見直せて、練習問題はすべて添削します。',
      imageAlt: 'ノートパソコンで日本語を学ぶ受講生',
      ctaLabel: '講座を見る',
      ctaPath: '/courses',
      cta2Label: 'スクールについて',
      cta2Path: '/about',
    },
    {
      eyebrow: '自分のペースで',
      titleA: '前回の続きから',
      titleB: 'いつでも再開',
      subtitle: '進捗はレッスンごとに保存されます。通勤中の10分も、きちんとした学習時間に。',
      imageAlt: 'スマートフォンで学習する様子',
      ctaLabel: 'マイコース',
      ctaPath: '/account/learning',
      cta2Label: null,
      cta2Path: null,
    },
    {
      eyebrow: 'JLPT 対策',
      titleA: 'N5 から N3 まで',
      titleB: '計画的に',
      subtitle: '過去問演習と模擬試験、記述は講師が添削。本番前に直すべき点がはっきりします。',
      imageAlt: '机の上のノートと問題集',
      ctaLabel: '対策講座を見る',
      ctaPath: '/courses',
      cta2Label: null,
      cta2Path: null,
    },
  ],
  vn: [
    {
      eyebrow: 'MINNA NO NIHONGO',
      titleA: 'Học tiếng Nhật từ con số không',
      titleB: 'đến khi nói được thật sự',
      subtitle:
        'Khoá học trực tuyến từ hiragana đến giao tiếp, do giáo viên bản ngữ giảng dạy. Xem lại bao nhiêu lần tuỳ bạn, mọi bài tập đều được chấm.',
      imageAlt: 'Học viên đang học tiếng Nhật trên máy tính',
      ctaLabel: 'Xem các khoá học',
      ctaPath: '/courses',
      cta2Label: 'Về nhà trường',
      cta2Path: '/about',
    },
    {
      eyebrow: 'HỌC THEO NHỊP CỦA BẠN',
      titleA: 'Tiếp tục từ chỗ đang dở',
      titleB: 'bất cứ lúc nào rảnh',
      subtitle:
        'Tiến độ được lưu theo từng bài, nên mười phút trên xe buýt cũng là mười phút học thật.',
      imageAlt: 'Học trên điện thoại',
      ctaLabel: 'Khoá học của tôi',
      ctaPath: '/account/learning',
      cta2Label: null,
      cta2Path: null,
    },
    {
      eyebrow: 'LUYỆN THI JLPT',
      titleA: 'Từ N5 đến N3',
      titleB: 'có lộ trình rõ ràng',
      subtitle:
        'Luyện đề, thi thử và bài viết được giáo viên chấm — bạn biết phải sửa gì trước ngày thi.',
      imageAlt: 'Vở ghi và đề luyện thi trên bàn',
      ctaLabel: 'Xem khoá luyện thi',
      ctaPath: '/courses',
      cta2Label: null,
      cta2Path: null,
    },
  ],
  id: [
    {
      eyebrow: 'MINNA NO NIHONGO',
      titleA: 'Belajar bahasa Jepang dari nol',
      titleB: 'sampai benar-benar bisa bicara',
      subtitle:
        'Kursus daring dari hiragana sampai percakapan, diajar oleh penutur asli. Tonton ulang sesuka Anda, dan setiap latihan dinilai.',
      imageAlt: 'Seorang pelajar belajar bahasa Jepang di laptop',
      ctaLabel: 'Lihat kursusnya',
      ctaPath: '/courses',
      cta2Label: 'Tentang sekolah',
      cta2Path: '/about',
    },
    {
      eyebrow: 'BELAJAR SESUAI NIAT ANDA',
      titleA: 'Lanjutkan dari tempat Anda berhenti',
      titleB: 'kapan pun ada waktu',
      subtitle:
        'Kemajuan Anda tersimpan per pelajaran, jadi sepuluh menit di perjalanan tetap sepuluh menit belajar sungguhan.',
      imageAlt: 'Belajar dari ponsel',
      ctaLabel: 'Kursus saya',
      ctaPath: '/account/learning',
      cta2Label: null,
      cta2Path: null,
    },
    {
      eyebrow: 'PERSIAPAN JLPT',
      titleA: 'Dari N5 sampai N3',
      titleB: 'dengan rencana di belakangnya',
      subtitle:
        'Latihan soal tahun lalu, uji coba, dan jawaban tulis yang dinilai pengajar — Anda tahu apa yang harus dibenahi sebelum harinya.',
      imageAlt: 'Catatan dan soal latihan di atas meja',
      ctaLabel: 'Lihat kursus persiapan ujian',
      ctaPath: '/courses',
      cta2Label: null,
      cta2Path: null,
    },
  ],
  zh: [
    {
      eyebrow: 'MINNA NO NIHONGO',
      titleA: '从零开始学日语',
      titleB: '一路学到真的能开口',
      subtitle:
        '从平假名到日常会话的在线课程，由母语讲师授课。想看几遍都可以，每道练习都有批改。',
      imageAlt: '一位学员用笔记本电脑上日语课',
      ctaLabel: '浏览课程',
      ctaPath: '/courses',
      cta2Label: '关于本校',
      cta2Path: '/about',
    },
    {
      eyebrow: '按自己的节奏学',
      titleA: '从上次停下的地方',
      titleB: '随时接着学',
      subtitle: '进度按课节保存，通勤路上的十分钟也是实实在在的十分钟。',
      imageAlt: '用手机学习的样子',
      ctaLabel: '我的课程',
      ctaPath: '/account/learning',
      cta2Label: null,
      cta2Path: null,
    },
    {
      eyebrow: 'JLPT 备考',
      titleA: '从 N5 到 N3',
      titleB: '有计划地准备',
      subtitle: '历年真题演练、模拟考，写作由老师批改 — 考前就知道该补哪里。',
      imageAlt: '桌上的笔记与模拟试题',
      ctaLabel: '查看备考课程',
      ctaPath: '/courses',
      cta2Label: null,
      cta2Path: null,
    },
  ],
  ko: [
    {
      eyebrow: 'MINNA NO NIHONGO',
      titleA: '일본어를 처음부터',
      titleB: '정말 말할 수 있을 때까지',
      subtitle:
        '히라가나부터 회화까지, 원어민 강사가 가르치는 온라인 강의. 몇 번이든 다시 보실 수 있고, 모든 연습 문제를 채점해 드립니다.',
      imageAlt: '노트북으로 일본어 수업을 듣는 학습자',
      ctaLabel: '강의 둘러보기',
      ctaPath: '/courses',
      cta2Label: '학원 소개',
      cta2Path: '/about',
    },
    {
      eyebrow: '내 속도로',
      titleA: '멈춘 자리에서',
      titleB: '언제든 이어서',
      subtitle:
        '진도는 수업 단위로 저장됩니다. 출퇴근길 10분도 제대로 공부한 10분이 됩니다.',
      imageAlt: '휴대전화로 공부하는 모습',
      ctaLabel: '내 강의',
      ctaPath: '/account/learning',
      cta2Label: null,
      cta2Path: null,
    },
    {
      eyebrow: 'JLPT 대비',
      titleA: 'N5에서 N3까지',
      titleB: '계획을 세워',
      subtitle:
        '기출 문제 연습과 모의시험, 작문은 선생님이 채점합니다 — 시험 전에 무엇을 고쳐야 할지 알 수 있습니다.',
      imageAlt: '책상 위의 노트와 기출 문제집',
      ctaLabel: '시험 대비 강의 보기',
      ctaPath: '/courses',
      cta2Label: null,
      cta2Path: null,
    },
  ],
  tw: [
    {
      eyebrow: 'MINNA NO NIHONGO',
      titleA: '從零開始學日語',
      titleB: '一路學到真的能開口',
      subtitle:
        '從平假名到日常會話的線上課程，由母語講師授課。想看幾遍都可以，每道練習都有批改。',
      imageAlt: '一位學員用筆電上日語課',
      ctaLabel: '瀏覽課程',
      ctaPath: '/courses',
      cta2Label: '關於本校',
      cta2Path: '/about',
    },
    {
      eyebrow: '依自己的步調學',
      titleA: '從上次停下的地方',
      titleB: '隨時接著學',
      subtitle: '進度依課節儲存，通勤路上的十分鐘也是扎扎實實的十分鐘。',
      imageAlt: '用手機學習的樣子',
      ctaLabel: '我的課程',
      ctaPath: '/account/learning',
      cta2Label: null,
      cta2Path: null,
    },
    {
      eyebrow: 'JLPT 備考',
      titleA: '從 N5 到 N3',
      titleB: '有計畫地準備',
      subtitle: '歷年考題演練、模擬考，寫作由老師批改 — 考前就知道該補哪裡。',
      imageAlt: '桌上的筆記與模擬試題',
      ctaLabel: '查看備考課程',
      ctaPath: '/courses',
      cta2Label: null,
      cta2Path: null,
    },
  ],
}

const pictures = await picturesInOrder()
if (!pictures.length) {
  console.log('no Thai slides to mirror — seed those first')
  process.exit(1)
}

for (const [locale, slides] of Object.entries(COPY) as [Locale, Slide[]][]) {
  const existing = await db
    .select({ id: heroSlides.id })
    .from(heroSlides)
    .where(eq(heroSlides.locale, locale))
  if (existing.length) {
    console.log(`${locale}: ${existing.length} already there — left alone`)
    continue
  }

  for (const [n, slide] of slides.entries()) {
    await db.insert(heroSlides).values({
      locale,
      eyebrow: slide.eyebrow,
      titleA: slide.titleA,
      titleB: slide.titleB,
      subtitle: slide.subtitle,
      // The same photograph as the Thai slide in this position.
      imagePath: pictures[n] ?? pictures[0],
      imageAlt: slide.imageAlt,
      ctaLabel: slide.ctaLabel,
      ctaHref: `/${locale}${slide.ctaPath}`,
      cta2Label: slide.cta2Label,
      cta2Href: slide.cta2Path ? `/${locale}${slide.cta2Path}` : null,
      status: 'published',
      sortOrder: n + 1,
    })
  }
  console.log(`${locale}: ${slides.length} slides added`)
}

process.exit(0)
