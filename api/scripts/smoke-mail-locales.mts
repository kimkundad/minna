/**
 * Every message, in every language the site speaks.
 *
 *   npx tsx scripts/smoke-mail-locales.mts
 *
 * Four languages were added to the site after these templates were written.
 * `copyFor` falls back to Thai for anything it does not know, which is the
 * right fallback and also a silent one: a Korean learner would have received a
 * Thai receipt and nothing would have looked broken from in here.
 *
 * So this renders all seven messages in all eight languages and insists each
 * one actually differs from the Thai — that is the check that catches a
 * missing `COPY` entry, which no type error can, since the fallback is a
 * runtime decision.
 *
 * Sends nothing. It only builds the HTML, so it is safe to run anywhere.
 */
import {
  verifyEmailMail,
  passwordResetMail,
  emailVerifiedMail,
  teacherApprovedMail,
  orderPaidMail,
  essayWaitingMail,
  essayReviewedMail,
} from '../src/lib/email-templates'

const LOCALES = ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw'] as const

/** The `lang` each one should carry, so a screen reader reads it correctly. */
const LANG: Record<string, string> = {
  th: 'th',
  en: 'en',
  jp: 'ja',
  vn: 'vi',
  id: 'id',
  zh: 'zh-Hans',
  ko: 'ko',
  tw: 'zh-Hant',
}

/** `hasLink` is false for the one message that is purely informational. */
const MESSAGES: {
  name: string
  hasLink?: boolean
  build: (l: string) => { subject: string; html: string }
}[] = [
  { name: 'verifyEmail', build: (l) => verifyEmailMail('Somchai', 'https://example.test/v', l) },
  { name: 'passwordReset', build: (l) => passwordResetMail('Somchai', 'https://example.test/r', l) },
  { name: 'emailVerified', hasLink: false, build: (l) => emailVerifiedMail('Somchai', l) },
  {
    name: 'teacherApproved',
    build: (l) => teacherApprovedMail('Somchai', 'https://example.test/admin', l),
  },
  {
    name: 'orderPaid',
    build: (l) =>
      orderPaidMail({
        name: 'Somchai',
        orderNo: 'MN-2026-0001',
        total: '฿1,200',
        courses: ['Japanese N5'],
        receiptUrl: 'https://example.test/o/1',
        locale: l,
      }),
  },
  {
    name: 'essayWaiting',
    build: (l) =>
      essayWaitingMail({
        teacherName: 'Teacher',
        learnerName: 'Somchai',
        courseTitle: 'Japanese N5',
        waiting: 3,
        url: 'https://example.test/queue',
        locale: l,
      }),
  },
  {
    name: 'essayReviewed(passed)',
    build: (l) =>
      essayReviewedMail({
        learnerName: 'Somchai',
        courseTitle: 'Japanese N5',
        passed: true,
        comment: 'Well argued.',
        url: 'https://example.test/result',
        locale: l,
      }),
  },
  {
    name: 'essayReviewed(changes)',
    build: (l) =>
      essayReviewedMail({
        learnerName: 'Somchai',
        courseTitle: 'Japanese N5',
        passed: false,
        comment: 'Please develop the second point.',
        url: 'https://example.test/result',
        locale: l,
      }),
  },
]

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

for (const message of MESSAGES) {
  const thai = message.build('th')

  for (const locale of LOCALES) {
    const mail = message.build(locale)
    const label = `${message.name} · ${locale}`

    check(`${label} has a subject`, Boolean(mail.subject?.trim()), mail.subject)
    check(
      `${label} carries lang="${LANG[locale]}"`,
      mail.html.includes(`lang="${LANG[locale]}"`),
      mail.html.match(/lang="[^"]*"/)?.[0] ?? 'no lang attribute',
    )
    if (message.hasLink !== false) {
      check(`${label} keeps the link`, mail.html.includes('example.test'))
    }

    if (locale !== 'th') {
      check(
        `${label} is not the Thai fallback`,
        mail.subject !== thai.subject || mail.html !== thai.html,
        'identical to th — COPY has no entry for this locale',
      )
    }
  }
}

// An unknown locale must still produce something, and that something is Thai.
const unknown = verifyEmailMail('Somchai', 'https://example.test/v', 'xx')
const thaiVerify = verifyEmailMail('Somchai', 'https://example.test/v', 'th')
check('an unknown locale falls back to Thai', unknown.subject === thaiVerify.subject)
const noLocale = verifyEmailMail('Somchai', 'https://example.test/v', null)
check('no locale at all falls back to Thai', noLocale.subject === thaiVerify.subject)

console.log(failed ? `\n${failed} failed` : '\nAll good.')
process.exit(failed ? 1 : 0)
