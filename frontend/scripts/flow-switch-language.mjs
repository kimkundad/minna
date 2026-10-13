/**
 * Switching language without reloading the page.
 *
 *   node scripts/flow-switch-language.mjs [baseUrl]
 *
 * A language switch is a route change — `/th` to `/ko` — and Vue answers it by
 * keeping the component it already has, so `onMounted` does not run again.
 * Anything fetched there keeps the old language's answer.
 *
 * It did not matter while the API answered the same in every language. It does
 * now: the catalogue returns the reader's language, the category counts count
 * that language's courses, the articles are that language's articles, and the
 * two bands at the foot of the home page are written per language. The
 * translated labels changed on their own and none of that did, so the page read
 * half in one language and half in another until somebody pressed reload.
 *
 * So this switches the way a visitor does — the flag, then the language — and
 * insists that what came from the API changed too.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

/** The script each language is written in, for telling one from the other. */
const HANGUL = /[가-힯]/
const THAI = /[฀-๿]/

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('minna:locale', 'th')
    } catch {
      /* a private window still renders */
    }
  })

  const read = () =>
    page.evaluate(() => {
      const text = (sel) =>
        document.querySelector(sel)?.innerText?.replace(/\n+/g, ' | ').trim() ?? ''
      return {
        url: location.pathname,
        journey: text('#journey'),
        closing: text('#start-cta'),
        category: text('#categories .cat-card'),
      }
    })

  await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2', timeout: 45000 })
  await wait(1500)
  const before = await read()

  check('the Thai page has the journey band', before.journey.length > 20, before.journey.slice(0, 50))
  check('and the closing band', before.closing.length > 20, before.closing.slice(0, 50))

  // The switcher a visitor uses, not an address typed in: loading the address
  // builds the page from scratch and would pass however broken the switch is.
  await page.click('.locale-btn')
  await wait(500)
  const picked = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.menu--locale .menu-item')].find((b) =>
      /Korean/i.test(b.innerText),
    )
    if (!item) return null
    item.click()
    return item.innerText.trim()
  })
  check('the switcher offers Korean', Boolean(picked), picked ?? 'not in the menu')
  await wait(2500)

  const after = await read()
  check('the address followed', after.url === '/ko', after.url)

  check(
    'the journey band is in the new language',
    HANGUL.test(after.journey) && !THAI.test(after.journey),
    after.journey.slice(0, 60),
  )
  check(
    'and so is the closing band',
    HANGUL.test(after.closing) && !THAI.test(after.closing),
    after.closing.slice(0, 60),
  )
  check(
    'and the categories, which are counted per language',
    after.category.length > 0 && !THAI.test(after.category),
    after.category.slice(0, 50),
  )

  check('nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
}

console.log(failures ? `\n${failures} failed` : '\n  all good')
process.exit(failures ? 1 : 0)
