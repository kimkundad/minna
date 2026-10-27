/**
 * Every message, for every language a reader might have chosen.
 *
 *   npx tsx scripts/smoke-mail-locales.mts
 *
 * The school sends in one language or in eight, and `ENGLISH_ONLY` in
 * `email-templates` decides which. This works out which it is from what comes
 * back rather than being told, so it is right either way and says which rule
 * it is holding the mail to.
 *
 * **English for everybody**: every message reads the same whoever it is for,
 * and that same is English — which is the whole point, since a Thai letter to
 * somebody who does not read Thai is a letter that was not sent.
 *
 * **Each reader's own language**: every message differs from the English one,
 * which is the check that catches a missing `COPY` entry. No type error can:
 * the fallback is a runtime decision, so a Korean learner would simply have
 * received a Thai receipt with nothing looking broken from in here.
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

/**
 * Which rule is in force, read off a message rather than assumed.
 *
 * Thai and English are the furthest apart of the eight — they share no
 * letters — so if those two come out identical, every message is being sent
 * in one language.
 */
const probeTh = verifyEmailMail('Somchai', 'https://example.test/v', 'th')
const probeEn = verifyEmailMail('Somchai', 'https://example.test/v', 'en')
const englishOnly = probeTh.html === probeEn.html

console.log(
  englishOnly
    ? '  rule: one language for everybody\n'
    : "  rule: each reader's own language\n",
)

for (const message of MESSAGES) {
  const english = message.build('en')

  for (const locale of LOCALES) {
    const mail = message.build(locale)
    const label = `${message.name} · ${locale}`

    check(`${label} has a subject`, Boolean(mail.subject?.trim()), mail.subject)
    if (message.hasLink !== false) {
      check(`${label} keeps the link`, mail.html.includes('example.test'))
    }

    if (englishOnly) {
      check(
        `${label} is sent in English`,
        mail.subject === english.subject && mail.html === english.html,
        mail.html === english.html ? '' : 'differs from the English one',
      )
      check(
        `${label} says so in lang="en"`,
        mail.html.includes('lang="en"'),
        mail.html.match(/lang="[^"]*"/)?.[0] ?? 'no lang attribute',
      )
    } else {
      check(
        `${label} carries lang="${LANG[locale]}"`,
        mail.html.includes(`lang="${LANG[locale]}"`),
        mail.html.match(/lang="[^"]*"/)?.[0] ?? 'no lang attribute',
      )
      if (locale !== 'en') {
        check(
          `${label} is not the English fallback`,
          mail.subject !== english.subject || mail.html !== english.html,
          'identical to en — COPY has no entry for this locale',
        )
      }
    }
  }
}

// A language nobody recognises, and none at all, must still produce something.
const unknown = verifyEmailMail('Somchai', 'https://example.test/v', 'xx')
const noLocale = verifyEmailMail('Somchai', 'https://example.test/v', null)
const fallback = englishOnly ? probeEn : probeTh
const named = englishOnly ? 'English' : 'Thai'
check(`an unknown language falls back to ${named}`, unknown.subject === fallback.subject)
check(`no language at all falls back to ${named}`, noLocale.subject === fallback.subject)

console.log(failed ? `\n${failed} failed` : '\nAll good.')
process.exit(failed ? 1 : 0)
