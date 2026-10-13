/**
 * The language question, asked once.
 *
 *   node scripts/flow-locale-gate.mjs [baseUrl]
 *
 * This stands between every first-time visitor and the site, so the checks are
 * about the ways it could go wrong rather than the way it looks: that it
 * cannot be escaped past, that it does not interrupt a shared link that
 * already names a language, that picking one takes them to that language's
 * copy of where they were going, and above all that it never appears twice.
 *
 * A gate that reappears is worse than no gate.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const SHOTS = process.env.SHOT_DIR ?? 'C:/Users/brack/AppData/Local/Temp/shots'


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

/** A browser that has never been here: its own context, so nothing is stored. */
async function firstVisit(path = '/') {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' })
  await wait(1800)
  return { context, page, errors }
}

const gate = (page) => page.evaluate(() => Boolean(document.querySelector('.lg-gate')))

try {
  /* ---------------- a first visit ---------------- */

  const fresh = await firstVisit('/')
  check('a first visit is asked which language', await gate(fresh.page))

  const shown = await fresh.page.evaluate(() => ({
    tiles: [...document.querySelectorAll('.lg-tile')].map((t) =>
      t.innerText.replace(/\s+/g, ' ').trim(),
    ),
    flags: document.querySelectorAll('.lg-tile .flag-icon').length,
    // Nothing to close it with: no cross, no cancel, no way round.
    closers: [...document.querySelectorAll('.lg-gate button')].filter(
      (b) => !b.classList.contains('lg-tile'),
    ).length,
  }))
  check('  with all four languages', shown.tiles.length === 4, shown.tiles.join(' | '))
  check('    each with its flag drawn', shown.flags === 4, String(shown.flags))
  check('    and its own name in its own script', shown.tiles.some((t) => t.includes('ไทย')))
  check('  and nothing to dismiss it with', shown.closers === 0, String(shown.closers))

  await fresh.page.keyboard.press('Escape')
  await wait(400)
  check('  Escape does not get past it', await gate(fresh.page))

  // The page behind it defaults to English until the question is answered.
  check(
    '  the page behind it is in English',
    await fresh.page.evaluate(() => document.documentElement.lang === 'en'),
    await fresh.page.evaluate(() => document.documentElement.lang),
  )

  await fresh.page.screenshot({ path: `${SHOTS}/locale-gate.png` })

  /* ---------------- picking one ---------------- */

  await fresh.page.evaluate(() => {
    const tile = [...document.querySelectorAll('.lg-tile')].find((t) => t.innerText.includes('Thai'))
    tile?.click()
  })
  await wait(1500)

  check('picking a language closes it', !(await gate(fresh.page)))
  check(
    '  and goes to that language',
    fresh.page.url().includes('/th'),
    fresh.page.url().replace(BASE, ''),
  )
  check(
    '  with the document saying so',
    (await fresh.page.evaluate(() => document.documentElement.lang)) === 'th',
  )

  // The one that matters: it must never ask twice.
  await fresh.page.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
  await wait(1500)
  check('coming back is not asked again', !(await gate(fresh.page)))
  check(
    '  and lands in the language they chose',
    fresh.page.url().includes('/th'),
    fresh.page.url().replace(BASE, ''),
  )
  check('nothing threw', fresh.errors.length === 0, fresh.errors.join(' | '))
  await fresh.context.close()

  /* ---------------- leaving without answering ---------------- */

  /**
   * The one that was wrong before the gate existed in this shape.
   *
   * Arriving at `/` redirects to a language before the gate can ask, and
   * navigation used to write whatever language was in the path down as the
   * visitor's choice. So somebody who looked at the question and closed the
   * tab came back to a site in English, with the gate never asking again.
   */
  const left = await firstVisit('/')
  check('somebody who has not answered yet is asked', await gate(left.page))
  // Round the site without touching the gate, as a redirect or a stray link
  // would, then come back.
  await left.page.goto(`${BASE}/en/courses`, { waitUntil: 'networkidle2' })
  await wait(1200)
  const stored = await left.page.evaluate(() => {
    try {
      return localStorage.getItem('minna:locale')
    } catch {
      return 'unreadable'
    }
  })
  check('  and nothing is written down for them', stored === null, String(stored))

  await left.page.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
  await wait(1500)
  check('  so coming back still asks', await gate(left.page))
  await left.context.close()

  /* ---------------- a link that already says which ---------------- */

  const shared = await firstVisit('/jp/courses')
  check('a shared link naming a language is not interrupted', !(await gate(shared.page)))
  check(
    '  and renders in it',
    (await shared.page.evaluate(() => document.documentElement.lang)) === 'ja',
    await shared.page.evaluate(() => document.documentElement.lang),
  )
  await shared.context.close()

  /* ---------------- picking from a deep link ---------------- */

  const deep = await firstVisit('/courses')
  check('a link without a language is asked', await gate(deep.page))
  await deep.page.evaluate(() => {
    const tile = [...document.querySelectorAll('.lg-tile')].find((t) =>
      t.innerText.includes('Vietnamese'),
    )
    tile?.click()
  })
  await wait(1500)
  check(
    '  and picking one keeps where they were going',
    deep.page.url().endsWith('/vn/courses'),
    deep.page.url().replace(BASE, ''),
  )
  await deep.context.close()
} finally {
  await browser.close()
}

console.log(failures ? `\n  ${failures} failing\n` : '\n  all good\n')
process.exit(failures ? 1 : 0)
