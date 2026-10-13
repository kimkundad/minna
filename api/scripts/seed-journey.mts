/**
 * A starting point for the "how learning works here" band, in all eight
 * languages.
 *
 *   npx tsx scripts/seed-journey.mts
 *
 * The band used to be four steps written into the page, and they were the
 * reference project's: "filter by CE points", "collect your CE and download
 * your certificate". Minna is a language school. It awards no CE and issues no
 * certificate — `vendor-view.ts` already drops the certificate link for that
 * reason — so the home page was promising two things that do not exist, in
 * Thai, to readers of seven other languages.
 *
 * These describe what the site actually does: find a course, study it
 * anywhere, have your written work marked by a teacher, and use the language.
 * They are a first draft for the school to edit, which is the whole point of
 * moving them into the admin.
 *
 * Safe to run twice. A language that already has steps is left alone, so
 * running it again after an edit does not undo the edit.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { journeySections, journeySteps } from '../src/db/schema/index'
import { LOCALES } from '../src/db/schema/auth'

type Locale = (typeof LOCALES)[number]

interface Section {
  eyebrow: string
  heading: string
  intro: string
  ctaLabel: string
}

interface Step {
  icon: string
  title: string
  text: string
}

/** Every icon here is in the site's own set — see `lib/icon-names.ts`. */
const COPY: Record<Locale, { section: Section; steps: Step[] }> = {
  th: {
    section: {
      eyebrow: 'ทำไมต้อง Minna',
      heading: 'เส้นทางการเรียนที่ออกแบบให้ใช้ได้จริง',
      intro:
        'ตั้งแต่เลือกคอร์สจนถึงงานเขียนที่ครูตรวจ ทุกขั้นตอนอยู่ในระบบเดียว ติดตามความคืบหน้าได้ตลอดเวลาจากทุกอุปกรณ์',
      ctaLabel: 'เริ่มต้นเลือกคอร์ส',
    },
    steps: [
      {
        icon: 'compass',
        title: 'เลือกคอร์สที่ใช่',
        text: 'กรองตามภาษา ระดับ และความยาว เจอคอร์สที่ตรงกับเวลาที่คุณมีจริง',
      },
      {
        icon: 'play-circle',
        title: 'เรียนได้ทุกที่',
        text: 'วิดีโอพร้อมเอกสารประกอบ ระบบจำว่าคุณหยุดไว้ตรงไหนในทุกบทเรียน',
      },
      {
        icon: 'clipboard-check',
        title: 'ฝึกและให้ครูตรวจ',
        text: 'ข้อเลือกตอบทำซ้ำได้ไม่จำกัด ส่วนงานเขียนครูตรวจและให้คำแนะนำกลับ',
      },
      {
        icon: 'message',
        title: 'พูดได้จริง',
        text: 'ทุกบทจบด้วยประโยคที่ใช้ได้จริงในที่ทำงานและชีวิตประจำวัน',
      },
    ],
  },

  en: {
    section: {
      eyebrow: 'Why Minna',
      heading: 'A path through the language, built to be used',
      intro:
        'From choosing a course to the written work your teacher marks, every step is in one place — and your progress follows you to any device.',
      ctaLabel: 'Browse the courses',
    },
    steps: [
      {
        icon: 'compass',
        title: 'Find the course that fits',
        text: 'Filter by language, level and length, and find one that fits the time you actually have.',
      },
      {
        icon: 'play-circle',
        title: 'Study it anywhere',
        text: 'Video with notes to download, and we remember where you stopped in every lesson.',
      },
      {
        icon: 'clipboard-check',
        title: 'Practise, and be marked',
        text: 'Retake the choice questions as often as you like; your written answers come back with a teacher’s comments.',
      },
      {
        icon: 'message',
        title: 'Say it for real',
        text: 'Every lesson ends on sentences you would use at work and in the rest of your day.',
      },
    ],
  },

  jp: {
    section: {
      eyebrow: 'Minna を選ぶ理由',
      heading: '実際に使えるようになるための学習の道すじ',
      intro:
        '講座選びから講師が添削する記述問題まで、すべてが一つの場所に。進捗はどの端末からでも引き継がれます。',
      ctaLabel: '講座を見る',
    },
    steps: [
      {
        icon: 'compass',
        title: '自分に合う講座を見つける',
        text: '言語・レベル・長さで絞り込み、確保できる時間に合う講座を選べます。',
      },
      {
        icon: 'play-circle',
        title: 'どこでも学べる',
        text: '動画と資料、そしてどのレッスンでも中断した場所を覚えています。',
      },
      {
        icon: 'clipboard-check',
        title: '練習し、添削を受ける',
        text: '選択問題は何度でも、記述は講師がコメントを添えて返します。',
      },
      {
        icon: 'message',
        title: '実際に話せるように',
        text: '各レッスンは、仕事や日常でそのまま使える文で締めくくります。',
      },
    ],
  },

  vn: {
    section: {
      eyebrow: 'Vì sao chọn Minna',
      heading: 'Lộ trình học được thiết kế để dùng được thật',
      intro:
        'Từ lúc chọn khoá đến bài viết được giáo viên chấm, mọi bước đều ở một nơi — và tiến độ đi theo bạn trên mọi thiết bị.',
      ctaLabel: 'Xem các khoá học',
    },
    steps: [
      {
        icon: 'compass',
        title: 'Tìm khoá học hợp với bạn',
        text: 'Lọc theo ngôn ngữ, trình độ và thời lượng để tìm khoá vừa với quỹ thời gian bạn có.',
      },
      {
        icon: 'play-circle',
        title: 'Học ở bất cứ đâu',
        text: 'Video kèm tài liệu tải về, và hệ thống nhớ bạn đã dừng ở đâu trong mỗi bài.',
      },
      {
        icon: 'clipboard-check',
        title: 'Luyện tập và được chấm',
        text: 'Làm lại câu trắc nghiệm bao nhiêu lần tuỳ bạn; bài viết được giáo viên nhận xét.',
      },
      {
        icon: 'message',
        title: 'Nói được thật sự',
        text: 'Mỗi bài khép lại bằng những câu bạn dùng được ngay ở nơi làm việc và trong ngày thường.',
      },
    ],
  },

  id: {
    section: {
      eyebrow: 'Mengapa Minna',
      heading: 'Jalur belajar yang dirancang untuk benar-benar dipakai',
      intro:
        'Dari memilih kursus sampai tugas tulis yang dinilai pengajar, semuanya di satu tempat — dan kemajuan Anda ikut ke perangkat mana pun.',
      ctaLabel: 'Lihat kursusnya',
    },
    steps: [
      {
        icon: 'compass',
        title: 'Temukan kursus yang pas',
        text: 'Saring menurut bahasa, tingkat, dan durasi, lalu pilih yang cocok dengan waktu yang Anda punya.',
      },
      {
        icon: 'play-circle',
        title: 'Belajar di mana saja',
        text: 'Video dengan catatan yang bisa diunduh, dan kami ingat di mana Anda berhenti pada setiap pelajaran.',
      },
      {
        icon: 'clipboard-check',
        title: 'Berlatih, lalu dinilai',
        text: 'Ulangi pertanyaan pilihan sesuka Anda; jawaban tulis kembali dengan komentar pengajar.',
      },
      {
        icon: 'message',
        title: 'Memakainya sungguhan',
        text: 'Setiap pelajaran berakhir pada kalimat yang Anda pakai di tempat kerja dan sehari-hari.',
      },
    ],
  },

  zh: {
    section: {
      eyebrow: '为什么选 Minna',
      heading: '一条真正用得上的学习路径',
      intro: '从挑课程到老师批改的写作，每一步都在同一个地方 — 进度也跟着你换到任何设备。',
      ctaLabel: '浏览课程',
    },
    steps: [
      {
        icon: 'compass',
        title: '找到合适的课程',
        text: '按语言、程度与时长筛选，挑一门配得上你实际时间的课。',
      },
      {
        icon: 'play-circle',
        title: '随处都能学',
        text: '影片配可下载的讲义，每一节课都记得你停在哪里。',
      },
      {
        icon: 'clipboard-check',
        title: '练习，并得到批改',
        text: '选择题想重做几次都行；写作由老师批改并给评语。',
      },
      {
        icon: 'message',
        title: '真的说得出口',
        text: '每节课都以你在工作与日常里真的会说的句子收尾。',
      },
    ],
  },

  ko: {
    section: {
      eyebrow: 'Minna를 고르는 이유',
      heading: '실제로 쓰게 되는 학습의 길',
      intro:
        '강의를 고르는 일부터 선생님이 채점하는 작문까지 모두 한곳에 있고, 진도는 어떤 기기로 옮겨도 따라옵니다.',
      ctaLabel: '강의 둘러보기',
    },
    steps: [
      {
        icon: 'compass',
        title: '나에게 맞는 강의 찾기',
        text: '언어와 수준, 길이로 추려 지금 낼 수 있는 시간에 맞는 강의를 고르세요.',
      },
      {
        icon: 'play-circle',
        title: '어디서든 학습',
        text: '내려받을 수 있는 자료가 딸린 영상, 그리고 모든 수업에서 멈춘 자리를 기억합니다.',
      },
      {
        icon: 'clipboard-check',
        title: '연습하고, 평가받기',
        text: '객관식은 얼마든지 다시 풀고, 작문은 선생님의 평과 함께 돌아옵니다.',
      },
      {
        icon: 'message',
        title: '진짜로 말하기',
        text: '모든 수업은 일터와 일상에서 그대로 쓸 문장으로 끝납니다.',
      },
    ],
  },

  tw: {
    section: {
      eyebrow: '為什麼選 Minna',
      heading: '一條真正用得上的學習路徑',
      intro: '從挑課程到老師批改的寫作，每一步都在同一個地方 — 進度也跟著你換到任何裝置。',
      ctaLabel: '瀏覽課程',
    },
    steps: [
      {
        icon: 'compass',
        title: '找到合適的課程',
        text: '依語言、程度與時長篩選，挑一門配得上你實際時間的課。',
      },
      {
        icon: 'play-circle',
        title: '隨處都能學',
        text: '影片配可下載的講義，每一堂課都記得你停在哪裡。',
      },
      {
        icon: 'clipboard-check',
        title: '練習，並得到批改',
        text: '選擇題想重做幾次都行；寫作由老師批改並給評語。',
      },
      {
        icon: 'message',
        title: '真的說得出口',
        text: '每堂課都以你在工作與日常裡真的會說的句子收尾。',
      },
    ],
  },
}

let written = 0

for (const locale of LOCALES) {
  const copy = COPY[locale]

  const already = await db
    .select({ id: journeySteps.id })
    .from(journeySteps)
    .where(eq(journeySteps.locale, locale))

  if (already.length) {
    console.log(`  ${locale}: ${already.length} steps already there — left alone`)
    continue
  }

  await db
    .insert(journeySections)
    .values({ locale, ...copy.section, ctaHref: `/${locale}/courses`, status: 'published' })
    .onDuplicateKeyUpdate({ set: { status: 'published' } })

  for (const [n, step] of copy.steps.entries()) {
    await db.insert(journeySteps).values({ locale, ...step, sortOrder: n + 1 })
  }

  console.log(`  ${locale}: a heading and ${copy.steps.length} steps added`)
  written += 1
}

console.log(written ? `\n${written} language(s) filled in.` : '\nNothing to do.')
process.exit(0)
