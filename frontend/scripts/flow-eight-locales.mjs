/**
 * The public site in all eight languages.
 *
 *   node scripts/flow-eight-locales.mjs [baseUrl]
 *
 * Four languages were added after everything else was written, and the ways
 * that goes wrong are not ways a type checker or a coverage count can see:
 *
 *  - a key translated in the file but spelled differently in the page, which
 *    vue-i18n reports as a missing key and then quietly shows in English;
 *  - a page that throws on a locale the router accepts but some map does not,
 *    which is what a missing `LOCALE_META` entry did;
 *  - text that is still English because the file has no entry at all.
 *
 * So each language is opened in a real browser and the console is read. A
 * missing key is a warning there, and nothing else in this project turns one
 * into a failure.
 *
 * `legal` is left in English on purpose — those are legal texts and machine
 * translation is the wrong tool for them — so the legal pages are not visited.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'

const LOCALES = ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw']

/** The pages a visitor walks before they have an account. */
const PAGES = ['', '/courses', '/blog', '/about', '/cart']

/** The script each language is written in, for telling a real translation from
 *  an English fallback. Thai and English share no letters with the rest. */
/** The BCP-47 tag each one should put in `<html lang>`, which is not always
 *  the key in the address: `jp` is `ja`, and the two Chinese entries differ by
 *  script rather than by country. */
const HTML_LANG = {
  th: 'th',
  en: 'en',
  jp: 'ja',
  vn: 'vi',
  id: 'id',
  zh: 'zh-Hans',
  ko: 'ko',
  tw: 'zh-Hant',
}

const SCRIPT = {
  th: /[฀-๿]/,
  en: /[A-Za-z]/,
  jp: /[぀-ヿ]/,
  vn: /[ĂăƠơƯưẠ-ỹ]/,
  id: /[A-Za-z]/,
  zh: /[一-鿿]/,
  ko: /[가-힯]/,
  tw: /[一-鿿]/,
}

/** The Thai page, kept so every other language can be compared against it: a
 *  page that silently failed to switch reads as Thai and passes every other
 *  check here. */
let thaiBody = ''

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })

try {
  for (const locale of LOCALES) {
    const missing = new Set()
    const errors = []

    const page = await browser.newPage()
    page.on('console', (m) => {
      const text = m.text()
      // vue-i18n's wording for a key it could not find, before it falls back.
      const key = text.match(/Not found '([^']+)' key/)
      if (key) missing.add(key[1])
      // A 401 is the signed-out answer from /me, which every one of these
      // pages asks for and none of them needs.
      // 429 is this script's own doing: eight languages in a row trip the rate
      // limit, which says nothing about the page.
      const noise = text.includes('favicon') || text.includes('401') || text.includes('429')
      if (m.type() === 'error' && !noise) errors.push(text)
    })
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)))

    // The gate asks for a language on a first visit; the address already says
    // which, so answer it before anything renders and it stays answered.
    await page.evaluateOnNewDocument((l) => {
      try {
        localStorage.setItem('minna:locale', l)
      } catch {
        /* a private window still renders, just without the memory */
      }
    }, locale)

    for (const path of PAGES) {
      await page.goto(`${BASE}/${locale}${path}`, {
        waitUntil: 'networkidle2',
        timeout: 45000,
      })
      await wait(400)
    }

    // The API rate-limits, and eight languages back to back is enough to trip
    // it. A pause here keeps a 429 out of the next language's checks.
    await wait(1200)

    // Back to the home page for the text checks, which is where the most copy
    // from the most sections sits at once.
    await page.goto(`${BASE}/${locale}`, { waitUntil: 'networkidle2', timeout: 45000 })
    await wait(600)

    const body = await page.evaluate(() => document.body.innerText)
    const htmlLang = await page.evaluate(() => document.documentElement.lang)

    if (locale === 'th') thaiBody = body

    check(`${locale}: the page has content`, body.trim().length > 400, `${body.length} chars`)
    if (locale !== 'th') {
      check(
        `${locale}: not the Thai page`,
        body !== thaiBody,
        body === thaiBody ? 'identical to /th — the language did not change' : '',
      )
    }
    check(`${locale}: written in its own script`, SCRIPT[locale].test(body))
    check(
      `${locale}: html lang says ${HTML_LANG[locale]}`,
      htmlLang === HTML_LANG[locale],
      htmlLang || '(unset)',
    )
    check(`${locale}: nothing threw`, errors.length === 0, errors.slice(0, 2).join(' | '))
    check(
      `${locale}: every key on these pages is translated`,
      missing.size === 0,
      missing.size ? `${missing.size} missing: ${[...missing].slice(0, 6).join(', ')}` : '',
    )

    await page.close()
  }
} finally {
  await browser.close()
}

console.log(failures ? `\n${failures} failed` : '\nAll good.')
process.exit(failures ? 1 : 0)
