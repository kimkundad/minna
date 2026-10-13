import type { Mail } from './mailer'

/**
 * The transactional messages Minna sends, in each language the school serves.
 *
 * Written as inline-styled tables, which is not how anyone would build a web
 * page and is exactly how mail still has to be built: Outlook ignores most of a
 * stylesheet, and Gmail strips <style> from forwarded copies. Every message
 * carries a plain-text part as well — some clients show only that, and it is
 * what a screen reader reaches first.
 *
 * Copy used to be English for everybody, on the reasoning that the school's
 * learners read four languages between them and English is the one they have
 * most in common. That reads as sound and is wrong in practice: somebody who
 * chose Thai, browsed in Thai and bought a course with a Thai title does not
 * want their receipt in English. The language is theirs, and it is recorded on
 * their account already.
 *
 * The markup is written once and the words four times, rather than the other
 * way around — a layout translated four times is a layout that drifts four
 * ways, and none of the differences would be deliberate.
 *
 * Course titles pass through untranslated, because a title is a name. A course
 * written in Thai is called what it is called in a Vietnamese receipt too.
 */

export type MailLocale = 'th' | 'en' | 'jp' | 'vn' | 'id' | 'zh' | 'ko' | 'tw'

const BRAND = '#00C2D6'
const INK = '#18272A'
const MUTED = '#465255'

/** `lang` on the document, which is what a screen reader reads it with. */
const HTML_LANG: Record<MailLocale, string> = {
  th: 'th',
  en: 'en',
  jp: 'ja',
  vn: 'vi',
  id: 'id',
  // Chinese by script, not by country: `zh` writes 简体 and `tw` writes 繁體,
  // and a reader's software picks fonts and line breaking from this.
  zh: 'zh-Hans',
  ko: 'ko',
  tw: 'zh-Hant',
}

/**
 * Everything these messages say.
 *
 * Functions rather than strings with placeholders: a name in the middle of a
 * sentence sits in a different place in each of these languages, and a
 * template that assumes English word order produces something that reads as
 * machine output in the other three.
 */
interface Copy {
  layout: { linkFallback: string; automatic: string; tagline: string }
  verify: { heading: string; hello: (n: string) => string; why: string; expiry: string; cta: string }
  reset: {
    heading: string
    hello: (n: string) => string
    asked: string
    once: string
    notYou: string
    cta: string
  }
  verified: { heading: string; hello: (n: string) => string; done: string }
  teacher: {
    heading: string
    hello: (n: string) => string
    approved: string
    whatYouCanDo: string
    cta: string
  }
  paid: {
    heading: string
    hello: (n: string) => string
    received: (orderNo: string) => string
    total: (money: string) => string
    cta: string
  }
  essayWaiting: {
    heading: string
    hello: (n: string) => string
    sent: (learner: string, course: string) => string
    more: (n: number) => string
    cta: string
  }
  essayReviewed: {
    passedHeading: string
    changesHeading: string
    hello: (n: string) => string
    passed: (course: string) => string
    changes: (course: string) => string
    passedCta: string
    changesCta: string
  }
}

const COPY: Record<MailLocale, Copy> = {
  th: {
    layout: {
      linkFallback: 'ถ้าปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์',
      automatic: 'อีเมลนี้ส่งโดยระบบอัตโนมัติ ตอบกลับมาได้ถ้ามีข้อสงสัย',
      tagline: 'Minna No Nihongo · โรงเรียนสอนภาษาออนไลน์',
    },
    verify: {
      heading: 'ยืนยันอีเมลของคุณ',
      hello: (n) => `สวัสดีคุณ${n}`,
      why: 'กดปุ่มด้านล่างเพื่อยืนยันว่าอีเมลนี้เป็นของคุณ เราใช้ส่งใบเสร็จ และลิงก์ตั้งรหัสผ่านใหม่เวลาจำเป็น',
      expiry: 'ลิงก์ใช้ได้ภายใน 24 ชั่วโมง',
      cta: 'ยืนยันอีเมล',
    },
    reset: {
      heading: 'ตั้งรหัสผ่านใหม่',
      hello: (n) => `สวัสดีคุณ${n}`,
      asked: 'มีคนขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ กดปุ่มด้านล่างเพื่อตั้งรหัสใหม่',
      once: 'ลิงก์ใช้ได้ 1 ชั่วโมง และใช้ได้ครั้งเดียว',
      notYou: 'ถ้าไม่ใช่คุณ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
      cta: 'ตั้งรหัสผ่านใหม่',
    },
    verified: {
      heading: 'ยืนยันอีเมลเรียบร้อย',
      hello: (n) => `สวัสดีคุณ${n}`,
      done: 'อีเมลนี้ยืนยันแล้ว ซื้อคอร์สและรับใบเสร็จทางอีเมลได้เลย',
    },
    teacher: {
      heading: 'คุณเป็นผู้สอนบน Minna ได้แล้ว',
      hello: (n) => `สวัสดีคุณ${n}`,
      approved: 'ใบสมัครเป็นผู้สอนของคุณผ่านการอนุมัติแล้ว เข้าสู่ระบบด้วยอีเมลและรหัสผ่านเดิมที่หน้าหลังบ้าน',
      whatYouCanDo:
        'ที่นั่นคุณสร้างคอร์สของตัวเอง เขียนบทเรียนและแบบทดสอบ ตรวจงานเขียน และตอบคำถามผู้เรียนได้',
      cta: 'เข้าหน้าหลังบ้าน',
    },
    paid: {
      heading: 'ชำระเงินเรียบร้อย เริ่มเรียนได้เลย',
      hello: (n) => `สวัสดีคุณ${n}`,
      received: (o) => `เราได้รับชำระเงินสำหรับคำสั่งซื้อ <b>${o}</b> แล้ว เปิดสิทธิ์เรียนให้เรียบร้อย`,
      total: (m) => `ยอดชำระ <b>${m}</b> ดูใบเสร็จได้ที่ลิงก์ด้านล่าง`,
      cta: 'ดูใบเสร็จและเริ่มเรียน',
    },
    essayWaiting: {
      heading: 'มีงานเขียนรอตรวจ',
      hello: (n) => `สวัสดีคุณ${n}`,
      sent: (l, c) => `<b>${l}</b> ส่งงานเขียนในคอร์ส <b>${c}</b> มาให้ตรวจ`,
      more: (n) => `มีงานรอตรวจทั้งหมด <b>${n}</b> ชิ้น`,
      cta: 'เปิดคิวตรวจงาน',
    },
    essayReviewed: {
      passedHeading: 'งานเขียนของคุณผ่านแล้ว',
      changesHeading: 'ผู้สอนขอให้แก้ไขงานเขียน',
      hello: (n) => `สวัสดีคุณ${n}`,
      passed: (c) => `งานเขียนของคุณในคอร์ส <b>${c}</b> ผ่านแล้ว`,
      changes: (c) => `ผู้สอนอ่านงานเขียนของคุณในคอร์ส <b>${c}</b> แล้ว และอยากให้ส่งฉบับแก้ไขอีกครั้ง`,
      passedCta: 'ดูผลการเรียน',
      changesCta: 'เขียนฉบับใหม่',
    },
  },

  en: {
    layout: {
      linkFallback: 'If the button does not work, copy this link into your browser',
      automatic: 'This message was sent automatically. You can reply to it if you have a question.',
      tagline: 'Minna No Nihongo · online language school',
    },
    verify: {
      heading: 'Confirm your email address',
      hello: (n) => `Hello ${n},`,
      why: 'Press the button below to confirm this address is yours. We use it to send your receipts and, if you ever need one, a link to set a new password.',
      expiry: 'The link works for 24 hours.',
      cta: 'Confirm my email',
    },
    reset: {
      heading: 'Set a new password',
      hello: (n) => `Hello ${n},`,
      asked: 'Somebody asked to set a new password for this account. Press the button below to choose one.',
      once: 'The link works for one hour, and can be used once.',
      notYou: '<b>If this was not you</b>, there is nothing to do — your current password still works.',
      cta: 'Set a new password',
    },
    verified: {
      heading: 'Your email is confirmed',
      hello: (n) => `Hello ${n},`,
      done: 'This address is confirmed. You can now buy courses and receive your receipts by email.',
    },
    teacher: {
      heading: 'You can now teach on Minna',
      hello: (n) => `Hello ${n},`,
      approved:
        'Your application to teach has been approved. Sign in with the same email and password at the teaching admin.',
      whatYouCanDo:
        "There you can build your own courses, write lessons and tests, mark written answers, and answer your learners' questions.",
      cta: 'Open the teaching admin',
    },
    paid: {
      heading: 'Payment received — you can start learning',
      hello: (n) => `Hello ${n},`,
      received: (o) => `We have received payment for order <b>${o}</b>. Your access is open.`,
      total: (m) => `Total paid: <b>${m}</b>. Your receipt is at the link below.`,
      cta: 'View receipt and start learning',
    },
    essayWaiting: {
      heading: 'A written answer is waiting',
      hello: (n) => `Hello ${n},`,
      sent: (l, c) => `<b>${l}</b> has sent a written answer on <b>${c}</b> for you to mark.`,
      more: (n) => `There are <b>${n}</b> waiting for you in all.`,
      cta: 'Open the marking queue',
    },
    essayReviewed: {
      passedHeading: 'Your written answer has passed',
      changesHeading: 'Your instructor has asked for changes',
      hello: (n) => `Hello ${n},`,
      passed: (c) => `Your written answer on <b>${c}</b> has passed.`,
      changes: (c) =>
        `Your instructor has looked at your written answer on <b>${c}</b> and would like another draft.`,
      passedCta: 'See your result',
      changesCta: 'Write another draft',
    },
  },

  jp: {
    layout: {
      linkFallback: 'ボタンが使えない場合は、このリンクをブラウザに貼り付けてください',
      automatic: 'このメールは自動送信です。ご質問があれば返信してください。',
      tagline: 'Minna No Nihongo · オンライン語学スクール',
    },
    verify: {
      heading: 'メールアドレスの確認',
      hello: (n) => `${n} 様`,
      why: '下のボタンを押して、このアドレスがご本人のものであることをご確認ください。領収書の送付と、パスワード再設定のリンクに使用します。',
      expiry: 'リンクの有効期限は24時間です。',
      cta: 'メールアドレスを確認する',
    },
    reset: {
      heading: 'パスワードの再設定',
      hello: (n) => `${n} 様`,
      asked: 'このアカウントのパスワード再設定の依頼がありました。下のボタンから新しいパスワードを設定してください。',
      once: 'リンクの有効期限は1時間で、1回だけ使用できます。',
      notYou: '<b>お心当たりがない場合</b>は何もする必要はありません。現在のパスワードはそのまま使えます。',
      cta: 'パスワードを設定する',
    },
    verified: {
      heading: 'メールアドレスを確認しました',
      hello: (n) => `${n} 様`,
      done: 'このアドレスは確認済みです。講座のご購入と、メールでの領収書の受け取りができます。',
    },
    teacher: {
      heading: 'Minna で講師として登録されました',
      hello: (n) => `${n} 様`,
      approved:
        '講師のお申し込みが承認されました。同じメールアドレスとパスワードで管理画面にログインしてください。',
      whatYouCanDo:
        '管理画面では、ご自身の講座の作成、レッスンとテストの作成、記述答案の添削、受講者の質問への回答ができます。',
      cta: '管理画面を開く',
    },
    paid: {
      heading: 'お支払いを受け取りました — 学習を始められます',
      hello: (n) => `${n} 様`,
      received: (o) => `注文 <b>${o}</b> のお支払いを確認しました。受講できる状態になっています。`,
      total: (m) => `お支払い金額：<b>${m}</b>　領収書は下のリンクからご覧いただけます。`,
      cta: '領収書を見て学習を始める',
    },
    essayWaiting: {
      heading: '添削待ちの記述答案があります',
      hello: (n) => `${n} 様`,
      sent: (l, c) => `<b>${l}</b> さんが <b>${c}</b> の記述答案を提出しました。`,
      more: (n) => `添削待ちは全部で <b>${n}</b> 件です。`,
      cta: '添削キューを開く',
    },
    essayReviewed: {
      passedHeading: '記述答案が合格しました',
      changesHeading: '講師から修正の依頼があります',
      hello: (n) => `${n} 様`,
      passed: (c) => `<b>${c}</b> の記述答案が合格しました。`,
      changes: (c) => `講師が <b>${c}</b> の記述答案を確認し、もう一度書き直すようお願いしています。`,
      passedCta: '結果を見る',
      changesCta: 'もう一度書く',
    },
  },

  vn: {
    layout: {
      linkFallback: 'Nếu nút không hoạt động, hãy sao chép liên kết này vào trình duyệt',
      automatic: 'Thư này được gửi tự động. Bạn có thể trả lời nếu có thắc mắc.',
      tagline: 'Minna No Nihongo · trường ngoại ngữ trực tuyến',
    },
    verify: {
      heading: 'Xác nhận địa chỉ email',
      hello: (n) => `Chào ${n},`,
      why: 'Nhấn nút bên dưới để xác nhận đây là địa chỉ của bạn. Chúng tôi dùng nó để gửi biên lai và liên kết đặt lại mật khẩu khi cần.',
      expiry: 'Liên kết có hiệu lực trong 24 giờ.',
      cta: 'Xác nhận email',
    },
    reset: {
      heading: 'Đặt mật khẩu mới',
      hello: (n) => `Chào ${n},`,
      asked: 'Có người yêu cầu đặt mật khẩu mới cho tài khoản này. Nhấn nút bên dưới để chọn mật khẩu.',
      once: 'Liên kết có hiệu lực trong một giờ và chỉ dùng được một lần.',
      notYou: '<b>Nếu không phải bạn</b>, không cần làm gì — mật khẩu hiện tại vẫn dùng được.',
      cta: 'Đặt mật khẩu mới',
    },
    verified: {
      heading: 'Email của bạn đã được xác nhận',
      hello: (n) => `Chào ${n},`,
      done: 'Địa chỉ này đã được xác nhận. Bạn có thể mua khoá học và nhận biên lai qua email.',
    },
    teacher: {
      heading: 'Bạn đã có thể giảng dạy trên Minna',
      hello: (n) => `Chào ${n},`,
      approved:
        'Đơn đăng ký giảng dạy của bạn đã được duyệt. Đăng nhập bằng email và mật khẩu cũ tại trang quản trị.',
      whatYouCanDo:
        'Tại đó bạn có thể tạo khoá học của mình, viết bài học và bài kiểm tra, chấm bài viết và trả lời câu hỏi của học viên.',
      cta: 'Mở trang quản trị',
    },
    paid: {
      heading: 'Đã nhận thanh toán — bạn có thể bắt đầu học',
      hello: (n) => `Chào ${n},`,
      received: (o) => `Chúng tôi đã nhận thanh toán cho đơn <b>${o}</b>. Quyền học đã được mở.`,
      total: (m) => `Tổng thanh toán: <b>${m}</b>. Biên lai ở liên kết bên dưới.`,
      cta: 'Xem biên lai và bắt đầu học',
    },
    essayWaiting: {
      heading: 'Có bài viết đang chờ chấm',
      hello: (n) => `Chào ${n},`,
      sent: (l, c) => `<b>${l}</b> đã nộp một bài viết trong <b>${c}</b> để bạn chấm.`,
      more: (n) => `Tổng cộng có <b>${n}</b> bài đang chờ.`,
      cta: 'Mở hàng chờ chấm bài',
    },
    essayReviewed: {
      passedHeading: 'Bài viết của bạn đã đạt',
      changesHeading: 'Giảng viên yêu cầu sửa lại',
      hello: (n) => `Chào ${n},`,
      passed: (c) => `Bài viết của bạn trong <b>${c}</b> đã đạt.`,
      changes: (c) => `Giảng viên đã đọc bài viết của bạn trong <b>${c}</b> và muốn bạn viết lại một bản khác.`,
      passedCta: 'Xem kết quả',
      changesCta: 'Viết bản mới',
    },
  },

  id: {
    layout: {
      linkFallback: 'Kalau tombolnya tidak bekerja, salin tautan ini ke peramban Anda',
      automatic: 'Pesan ini dikirim otomatis. Anda boleh membalasnya kalau ada pertanyaan.',
      tagline: 'Minna No Nihongo · sekolah bahasa daring',
    },
    verify: {
      heading: 'Konfirmasi alamat email Anda',
      hello: (n) => `Halo ${n},`,
      why: 'Tekan tombol di bawah untuk memastikan alamat ini milik Anda. Alamat itu kami pakai untuk mengirim kuitansi dan, kalau suatu saat perlu, tautan untuk membuat kata sandi baru.',
      expiry: 'Tautannya berlaku 24 jam.',
      cta: 'Konfirmasi email saya',
    },
    reset: {
      heading: 'Buat kata sandi baru',
      hello: (n) => `Halo ${n},`,
      asked: 'Ada yang meminta kata sandi baru untuk akun ini. Tekan tombol di bawah untuk memilihnya.',
      once: 'Tautannya berlaku satu jam dan sekali pakai.',
      notYou: '<b>Kalau itu bukan Anda</b>, tidak ada yang perlu dilakukan — kata sandi Anda yang sekarang tetap berlaku.',
      cta: 'Buat kata sandi baru',
    },
    verified: {
      heading: 'Email Anda sudah terkonfirmasi',
      hello: (n) => `Halo ${n},`,
      done: 'Alamat ini sudah terkonfirmasi. Sekarang Anda bisa membeli kursus dan menerima kuitansi lewat email.',
    },
    teacher: {
      heading: 'Anda sudah bisa mengajar di Minna',
      hello: (n) => `Halo ${n},`,
      approved:
        'Lamaran Anda untuk mengajar disetujui. Masuk dengan email dan kata sandi yang sama di admin pengajar.',
      whatYouCanDo:
        'Di sana Anda bisa menyusun kursus sendiri, menulis pelajaran dan soal, menilai jawaban tulis, serta menjawab pertanyaan pelajar Anda.',
      cta: 'Buka admin pengajar',
    },
    paid: {
      heading: 'Pembayaran diterima — Anda bisa mulai belajar',
      hello: (n) => `Halo ${n},`,
      received: (o) => `Kami sudah menerima pembayaran untuk pesanan <b>${o}</b>. Akses Anda terbuka.`,
      total: (m) => `Jumlah dibayar: <b>${m}</b>. Kuitansi Anda ada di tautan di bawah.`,
      cta: 'Lihat kuitansi dan mulai belajar',
    },
    essayWaiting: {
      heading: 'Ada jawaban tulis yang menunggu',
      hello: (n) => `Halo ${n},`,
      sent: (l, c) => `<b>${l}</b> mengirim jawaban tulis pada <b>${c}</b> untuk Anda nilai.`,
      more: (n) => `Seluruhnya ada <b>${n}</b> yang menunggu Anda.`,
      cta: 'Buka daftar penilaian',
    },
    essayReviewed: {
      passedHeading: 'Jawaban tulis Anda lulus',
      changesHeading: 'Pengajar Anda minta perbaikan',
      hello: (n) => `Halo ${n},`,
      passed: (c) => `Jawaban tulis Anda pada <b>${c}</b> lulus.`,
      changes: (c) =>
        `Pengajar Anda sudah membaca jawaban tulis Anda pada <b>${c}</b> dan ingin satu versi lagi.`,
      passedCta: 'Lihat hasil Anda',
      changesCta: 'Tulis versi baru',
    },
  },

  zh: {
    layout: {
      linkFallback: '如果按钮无法使用，请把这个链接复制到浏览器',
      automatic: '这封邮件由系统自动寄出。若有疑问，直接回覆即可。',
      tagline: 'Minna No Nihongo · 在线语言学校',
    },
    verify: {
      heading: '确认你的电子邮箱',
      hello: (n) => `${n} 你好，`,
      why: '请按下方按钮确认这个邮箱属于你。我们会用它寄送收据，以及在你需要时寄送重设密码的链接。',
      expiry: '这个链接 24 小时内有效。',
      cta: '确认我的邮箱',
    },
    reset: {
      heading: '设置新密码',
      hello: (n) => `${n} 你好，`,
      asked: '有人为这个账户申请了新密码。请按下方按钮设置。',
      once: '这个链接一小时内有效，且只能使用一次。',
      notYou: '<b>如果这不是你本人操作</b>，无须理会 — 你目前的密码仍然有效。',
      cta: '设置新密码',
    },
    verified: {
      heading: '你的邮箱已确认',
      hello: (n) => `${n} 你好，`,
      done: '这个邮箱已确认。你现在可以购买课程，并以邮件接收收据。',
    },
    teacher: {
      heading: '你现在可以在 Minna 授课了',
      hello: (n) => `${n} 你好，`,
      approved: '你的授课申请已通过。请用同一组邮箱与密码登录教学管理后台。',
      whatYouCanDo: '在那里你可以建立自己的课程、撰写课节与测验、批改写作答案，并回答学员的问题。',
      cta: '开启教学管理后台',
    },
    paid: {
      heading: '已收到付款 — 可以开始学习了',
      hello: (n) => `${n} 你好，`,
      received: (o) => `我们已收到订单 <b>${o}</b> 的付款，你的课程已开通。`,
      total: (m) => `已付金额：<b>${m}</b>。收据在下方链接。`,
      cta: '查看收据并开始学习',
    },
    essayWaiting: {
      heading: '有一份写作答案待批改',
      hello: (n) => `${n} 你好，`,
      sent: (l, c) => `<b>${l}</b> 在 <b>${c}</b> 送出了一份写作答案，等你批改。`,
      more: (n) => `总共有 <b>${n}</b> 份在等你。`,
      cta: '开启批改清单',
    },
    essayReviewed: {
      passedHeading: '你的写作答案已通过',
      changesHeading: '讲师希望你再改一版',
      hello: (n) => `${n} 你好，`,
      passed: (c) => `你在 <b>${c}</b> 的写作答案已通过。`,
      changes: (c) => `讲师已读过你在 <b>${c}</b> 的写作答案，希望你再写一版。`,
      passedCta: '查看结果',
      changesCta: '再写一版',
    },
  },

  ko: {
    layout: {
      linkFallback: '버튼이 동작하지 않으면 이 링크를 브라우저에 붙여 넣으세요',
      automatic: '이 메일은 자동으로 발송되었습니다. 궁금한 점이 있으면 답장해 주세요.',
      tagline: 'Minna No Nihongo · 온라인 어학원',
    },
    verify: {
      heading: '이메일 주소를 확인해 주세요',
      hello: (n) => `${n}님, 안녕하세요.`,
      why: '아래 버튼을 눌러 이 주소가 회원님의 것임을 확인해 주세요. 영수증을 보내고, 필요할 때 비밀번호 재설정 링크를 보내는 데 사용합니다.',
      expiry: '링크는 24시간 동안 유효합니다.',
      cta: '내 이메일 확인하기',
    },
    reset: {
      heading: '새 비밀번호 설정',
      hello: (n) => `${n}님, 안녕하세요.`,
      asked: '이 계정의 새 비밀번호를 설정하겠다는 요청이 있었습니다. 아래 버튼을 눌러 정해 주세요.',
      once: '링크는 한 시간 동안 유효하며 한 번만 쓸 수 있습니다.',
      notYou: '<b>회원님이 요청한 것이 아니라면</b> 아무것도 하지 않으셔도 됩니다 — 지금 비밀번호가 그대로 유지됩니다.',
      cta: '새 비밀번호 설정',
    },
    verified: {
      heading: '이메일이 확인되었습니다',
      hello: (n) => `${n}님, 안녕하세요.`,
      done: '이 주소가 확인되었습니다. 이제 강의를 구매하고 영수증을 이메일로 받으실 수 있습니다.',
    },
    teacher: {
      heading: '이제 Minna에서 강의하실 수 있습니다',
      hello: (n) => `${n}님, 안녕하세요.`,
      approved:
        '강사 지원이 승인되었습니다. 같은 이메일과 비밀번호로 강의 관리 화면에 로그인하세요.',
      whatYouCanDo:
        '거기에서 직접 강의를 만들고, 수업과 시험을 쓰고, 작문 답안을 채점하고, 수강생의 질문에 답하실 수 있습니다.',
      cta: '강의 관리 화면 열기',
    },
    paid: {
      heading: '결제가 확인되었습니다 — 바로 시작하세요',
      hello: (n) => `${n}님, 안녕하세요.`,
      received: (o) => `<b>${o}</b> 주문의 결제를 확인했습니다. 수강이 열렸습니다.`,
      total: (m) => `결제 금액: <b>${m}</b>. 영수증은 아래 링크에 있습니다.`,
      cta: '영수증 보고 학습 시작',
    },
    essayWaiting: {
      heading: '채점할 작문이 기다리고 있습니다',
      hello: (n) => `${n}님, 안녕하세요.`,
      sent: (l, c) => `<b>${l}</b>님이 <b>${c}</b>에 작문을 제출해 채점을 기다립니다.`,
      more: (n) => `모두 <b>${n}</b>건이 기다리고 있습니다.`,
      cta: '채점 목록 열기',
    },
    essayReviewed: {
      passedHeading: '작문이 합격했습니다',
      changesHeading: '강사가 수정을 요청했습니다',
      hello: (n) => `${n}님, 안녕하세요.`,
      passed: (c) => `<b>${c}</b>에 제출한 작문이 합격했습니다.`,
      changes: (c) => `강사가 <b>${c}</b>에 제출한 작문을 읽고 한 번 더 고쳐 주기를 바랍니다.`,
      passedCta: '결과 보기',
      changesCta: '다시 써 보기',
    },
  },

  tw: {
    layout: {
      linkFallback: '如果按鈕無法使用，請把這個連結複製到瀏覽器',
      automatic: '這封信由系統自動寄出。若有疑問，直接回覆即可。',
      tagline: 'Minna No Nihongo · 線上語言學校',
    },
    verify: {
      heading: '確認你的電子郵件',
      hello: (n) => `${n} 你好，`,
      why: '請按下方按鈕確認這個信箱屬於你。我們會用它寄送收據，以及在你需要時寄送重設密碼的連結。',
      expiry: '這個連結 24 小時內有效。',
      cta: '確認我的信箱',
    },
    reset: {
      heading: '設定新密碼',
      hello: (n) => `${n} 你好，`,
      asked: '有人為這個帳戶申請了新密碼。請按下方按鈕設定。',
      once: '這個連結一小時內有效，且只能使用一次。',
      notYou: '<b>如果這不是你本人操作</b>，無須理會 — 你目前的密碼仍然有效。',
      cta: '設定新密碼',
    },
    verified: {
      heading: '你的信箱已確認',
      hello: (n) => `${n} 你好，`,
      done: '這個信箱已確認。你現在可以購買課程，並以電子郵件接收收據。',
    },
    teacher: {
      heading: '你現在可以在 Minna 授課了',
      hello: (n) => `${n} 你好，`,
      approved: '你的授課申請已通過。請用同一組信箱與密碼登入教學管理後台。',
      whatYouCanDo: '在那裡你可以建立自己的課程、撰寫課節與測驗、批改寫作答案，並回答學員的問題。',
      cta: '開啟教學管理後台',
    },
    paid: {
      heading: '已收到付款 — 可以開始學習了',
      hello: (n) => `${n} 你好，`,
      received: (o) => `我們已收到訂單 <b>${o}</b> 的付款，你的課程已開通。`,
      total: (m) => `已付金額：<b>${m}</b>。收據在下方連結。`,
      cta: '查看收據並開始學習',
    },
    essayWaiting: {
      heading: '有一份寫作答案待批改',
      hello: (n) => `${n} 你好，`,
      sent: (l, c) => `<b>${l}</b> 在 <b>${c}</b> 送出了一份寫作答案，等你批改。`,
      more: (n) => `總共有 <b>${n}</b> 份在等你。`,
      cta: '開啟批改清單',
    },
    essayReviewed: {
      passedHeading: '你的寫作答案已通過',
      changesHeading: '講師希望你再改一版',
      hello: (n) => `${n} 你好，`,
      passed: (c) => `你在 <b>${c}</b> 的寫作答案已通過。`,
      changes: (c) => `講師已讀過你在 <b>${c}</b> 的寫作答案，希望你再寫一版。`,
      passedCta: '查看結果',
      changesCta: '再寫一版',
    },
  },
}

/** Anything unknown reads as Thai, which is what most of this school reads. */
function copyFor(locale: string | null | undefined): { c: Copy; lang: MailLocale } {
  const key = (locale ?? 'th') as MailLocale
  return key in COPY ? { c: COPY[key], lang: key } : { c: COPY.th, lang: 'th' }
}

function layout(
  lang: MailLocale,
  c: Copy,
  opts: { heading: string; body: string; cta?: { label: string; href: string } },
) {
  return `<!doctype html>
<html lang="${HTML_LANG[lang]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escape(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
  <tr><td style="padding:28px 32px 8px">
    <span style="font-size:20px;font-weight:800;color:${BRAND};letter-spacing:-0.2px">Minna No Nihongo</span>
  </td></tr>
  <tr><td style="padding:8px 32px 0">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.5;font-weight:700;color:${INK}">${escape(opts.heading)}</h1>
  </td></tr>
  <tr><td style="padding:0 32px;font-size:16px;line-height:1.7;color:${MUTED}">${opts.body}</td></tr>
  ${
    opts.cta
      ? `<tr><td style="padding:24px 32px 8px">
    <a href="${escape(opts.cta.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px">${escape(opts.cta.label)}</a>
  </td></tr>
  <tr><td style="padding:12px 32px 0;font-size:13px;line-height:1.7;color:${MUTED}">
    ${escape(c.layout.linkFallback)}:<br>
    <span style="word-break:break-all;color:${BRAND}">${escape(opts.cta.href)}</span>
  </td></tr>`
      : ''
  }
  <tr><td style="padding:28px 32px 32px">
    <hr style="border:0;border-top:1px solid #e4e7e9;margin:0 0 16px">
    <p style="margin:0;font-size:13px;line-height:1.7;color:${MUTED}">
      ${escape(c.layout.automatic)}<br>
      ${escape(c.layout.tagline)}
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

function escape(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  )
}

/**
 * The plain-text twin of a sentence that carries markup.
 *
 * The copy above puts `<b>` around the thing a sentence is about, because
 * that is where the emphasis belongs in every one of these languages. The
 * text part wants the same sentence without it.
 */
function plain(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

export function verifyEmailMail(name: string, url: string, locale?: string | null): Mail {
  const { c, lang } = copyFor(locale)
  return {
    to: '',
    subject: `${c.verify.heading} — Minna No Nihongo`,
    html: layout(lang, c, {
      heading: c.verify.heading,
      body: `<p style="margin:0 0 12px">${escape(c.verify.hello(name))}</p>
<p style="margin:0 0 12px">${c.verify.why}</p>
<p style="margin:0">${c.verify.expiry}</p>`,
      cta: { label: c.verify.cta, href: url },
    }),
    text: `${c.verify.hello(name)}

${plain(c.verify.why)}

${url}

${c.verify.expiry}

Minna No Nihongo`,
  }
}

export function passwordResetMail(name: string, url: string, locale?: string | null): Mail {
  const { c, lang } = copyFor(locale)
  return {
    to: '',
    subject: `${c.reset.heading} — Minna No Nihongo`,
    html: layout(lang, c, {
      heading: c.reset.heading,
      body: `<p style="margin:0 0 12px">${escape(c.reset.hello(name))}</p>
<p style="margin:0 0 12px">${c.reset.asked}</p>
<p style="margin:0 0 12px">${c.reset.once}</p>
<p style="margin:0">${c.reset.notYou}</p>`,
      cta: { label: c.reset.cta, href: url },
    }),
    text: `${c.reset.hello(name)}

${plain(c.reset.asked)}

${url}

${plain(c.reset.once)}
${plain(c.reset.notYou)}

Minna No Nihongo`,
  }
}

export function emailVerifiedMail(name: string, locale?: string | null): Mail {
  const { c, lang } = copyFor(locale)
  return {
    to: '',
    subject: `${c.verified.heading} — Minna No Nihongo`,
    html: layout(lang, c, {
      heading: c.verified.heading,
      body: `<p style="margin:0 0 12px">${escape(c.verified.hello(name))}</p>
<p style="margin:0">${c.verified.done}</p>`,
    }),
    text: `${c.verified.hello(name)}

${plain(c.verified.done)}

Minna No Nihongo`,
  }
}

/**
 * A teaching application that has been approved.
 *
 * It carries the admin's address, which is the whole point of it: the account
 * has just gained a role that unlocks a different app on a different host, and
 * nothing on the public site points there. Without the link the message says
 * "you will find your courses in the admin" to somebody who has never seen it.
 */
export function teacherApprovedMail(name: string, url: string, locale?: string | null): Mail {
  const { c, lang } = copyFor(locale)
  return {
    to: '',
    subject: `${c.teacher.heading} — Minna No Nihongo`,
    html: layout(lang, c, {
      heading: c.teacher.heading,
      body: `<p style="margin:0 0 12px">${escape(c.teacher.hello(name))}</p>
<p style="margin:0 0 12px">${c.teacher.approved}</p>
<p style="margin:0">${c.teacher.whatYouCanDo}</p>`,
      cta: { label: c.teacher.cta, href: url },
    }),
    text: `${c.teacher.hello(name)}

${plain(c.teacher.approved)}

${url}

${plain(c.teacher.whatYouCanDo)}

Minna No Nihongo`,
  }
}

/**
 * The receipt somebody expects the moment they pay.
 *
 * A shop that takes money and says nothing fails an expectation so basic that
 * the silence reads as a failed payment — people buy again, or write in asking
 * whether it went through.
 */
export function orderPaidMail(opts: {
  name: string
  orderNo: string
  total: string
  courses: string[]
  receiptUrl: string
  locale?: string | null
}): Mail {
  const { c, lang } = copyFor(opts.locale)
  const list = opts.courses.map((t) => `<li style="margin:0 0 6px">${escape(t)}</li>`).join('')
  return {
    to: '',
    subject: `${c.paid.heading} — ${opts.orderNo}`,
    html: layout(lang, c, {
      heading: c.paid.heading,
      body: `<p style="margin:0 0 12px">${escape(c.paid.hello(opts.name))}</p>
<p style="margin:0 0 12px">${c.paid.received(escape(opts.orderNo))}</p>
<ul style="margin:0 0 12px;padding-left:20px">${list}</ul>
<p style="margin:0">${c.paid.total(escape(opts.total))}</p>`,
      cta: { label: c.paid.cta, href: opts.receiptUrl },
    }),
    text: `${c.paid.hello(opts.name)}

${plain(c.paid.received(opts.orderNo))}

${opts.courses.map((t) => `- ${t}`).join('\n')}

${plain(c.paid.total(opts.total))}

${opts.receiptUrl}

Minna No Nihongo`,
  }
}

/**
 * A written answer is waiting for the teacher who set the question.
 *
 * Sent as well as shown in the admin, because the whole point is that it
 * reaches somebody who is not currently looking at the admin.
 */
export function essayWaitingMail(opts: {
  teacherName: string
  learnerName: string
  courseTitle: string
  url: string
  waiting: number
  locale?: string | null
}): Mail {
  const { c, lang } = copyFor(opts.locale)
  const sent = c.essayWaiting.sent(escape(opts.learnerName), escape(opts.courseTitle))
  const more =
    opts.waiting > 1
      ? `<p style="margin:0 0 12px">${c.essayWaiting.more(opts.waiting)}</p>`
      : ''
  return {
    to: '',
    subject: `${c.essayWaiting.heading} — ${opts.courseTitle}`,
    html: layout(lang, c, {
      heading: c.essayWaiting.heading,
      body: `<p style="margin:0 0 12px">${escape(c.essayWaiting.hello(opts.teacherName))}</p>
<p style="margin:0 0 12px">${sent}</p>
${more}`,
      cta: { label: c.essayWaiting.cta, href: opts.url },
    }),
    text: `${c.essayWaiting.hello(opts.teacherName)}

${plain(c.essayWaiting.sent(opts.learnerName, opts.courseTitle))}
${opts.waiting > 1 ? `${plain(c.essayWaiting.more(opts.waiting))}\n` : ''}
${opts.url}

Minna No Nihongo`,
  }
}

/**
 * The verdict on a written answer.
 *
 * The teacher's comment is the point of the message, so it is quoted in full —
 * and escaped, because it is somebody's free text landing in an HTML document.
 */
export function essayReviewedMail(opts: {
  learnerName: string
  courseTitle: string
  passed: boolean
  comment: string
  url: string
  locale?: string | null
}): Mail {
  const { c, lang } = copyFor(opts.locale)
  const heading = opts.passed ? c.essayReviewed.passedHeading : c.essayReviewed.changesHeading
  const verdict = opts.passed
    ? c.essayReviewed.passed(escape(opts.courseTitle))
    : c.essayReviewed.changes(escape(opts.courseTitle))
  return {
    to: '',
    subject: `${heading} — ${opts.courseTitle}`,
    html: layout(lang, c, {
      heading,
      body: `<p style="margin:0 0 12px">${escape(c.essayReviewed.hello(opts.learnerName))}</p>
<p style="margin:0 0 12px">${verdict}</p>
<blockquote style="margin:0 0 12px;padding:12px 16px;border-left:3px solid ${BRAND};background:#f4f6f7;white-space:pre-line">${escape(opts.comment)}</blockquote>`,
      cta: {
        label: opts.passed ? c.essayReviewed.passedCta : c.essayReviewed.changesCta,
        href: opts.url,
      },
    }),
    text: `${c.essayReviewed.hello(opts.learnerName)}

${plain(
  opts.passed
    ? c.essayReviewed.passed(opts.courseTitle)
    : c.essayReviewed.changes(opts.courseTitle),
)}

${opts.comment}

${opts.url}

Minna No Nihongo`,
  }
}
