/**
 * The search box in the header, against the real catalogue.
 *
 *   node scripts/flow-search.mjs [baseUrl]
 *
 * It used to be the vet prototype's fixtures — Cardiology, Feline Medicine,
 * courses about dogs — on a site that teaches languages. So the checks are not
 * "does something appear" but "is it the same something the API has": the
 * categories the menu shows, the courses the catalogue holds, and a search
 * that agrees with the catalogue page because both ask the same endpoint.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const SHOTS = process.env.SHOT_DIR ?? 'C:/Users/brack/AppData/Local/Temp/shots'


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

/* ---------------- what the API actually has ---------------- */

const categories = (await (await fetch(`${API}/categories`)).json()).data
const roots = categories
  .filter((c) => c.parentId === null && c.totalCourseCount > 0)
  .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
const newest = (await (await fetch(`${API}/courses?perPage=3&sort=newest`)).json()).data

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 950 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('response', (r) => {
  if (r.status() === 401 && r.url().endsWith('/auth/refresh')) return
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
})

/** The box, open, with whatever is in it right now. */
const inside = () =>
  page.evaluate(() => {
    const box = document.querySelector('.search-box')
    if (!box) return null
    return {
      chips: [...box.querySelectorAll('.chip')].map((c) => c.innerText.trim()),
      items: [...box.querySelectorAll('.sr-item b')].map((b) => b.innerText.trim()),
      text: box.innerText,
    }
  })

try {
  await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.hdr-tools button, .icon-btn', { timeout: 15000 })

  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) =>
      (b.getAttribute('aria-label') ?? '').match(/ค้นหา|search/i),
    )
    if (!button) return false
    button.click()
    return true
  })
  check('the magnifier opens the box', opened)
  await wait(1500)

  const resting = await inside()
  check('  with categories to start from', (resting?.chips.length ?? 0) > 0, String(resting?.chips.length))
  check(
    '  which are the catalogue’s own, not a fixture',
    resting.chips.every((name) => categories.some((c) => c.name === name)),
    resting.chips.join(' | '),
  )
  check(
    '    in the order the menus use',
    resting.chips[0] === roots[0]?.name,
    `${resting.chips[0]} vs ${roots[0]?.name}`,
  )
  check(
    '  and the newest courses, as the API has them',
    newest.every((c) => resting.items.includes(c.title)),
    resting.items.join(' | '),
  )

  // The prototype's world, which must be gone.
  const vet = ['Feline Medicine', 'Cardiology', 'Emergency Medicine', 'Imaging Diagnosis']
  check(
    '  with nothing left of the veterinary prototype',
    !vet.some((word) => resting.text.includes(word)),
    vet.filter((w) => resting.text.includes(w)).join(', '),
  )

  await page.screenshot({ path: `${SHOTS}/search-resting.png` })

  /* ---------------- typing ---------------- */

  // A word from a real category, so both halves of the box have something.
  const term = roots[0].name.slice(0, 4)
  await page.type('#gsearch', term, { delay: 20 })
  await wait(1200)

  const typed = await inside()
  const fromApi = (
    // The same parameters the box sends, sort included: a different sort is
    // a different top six for the same word.
    // `locales` too: the box shows a reader the courses taught in their own
    // language plus the ones marked for every language, so a request without
    // it answers a wider question than the box asked.
    await (
      await fetch(
        `${API}/courses?perPage=6&sort=recommended&locales=th&q=${encodeURIComponent(term)}`,
      )
    ).json()
  ).data

  check(`searching "${term}" answers from the API`, typed.items.length > 0, typed.items.join(' | '))
  check(
    '  the same courses the catalogue page would list',
    fromApi.every((c) => typed.items.includes(c.title)),
    `api ${fromApi.length} vs box ${typed.items.length}`,
  )
  check(
    '  and matching categories alongside them',
    typed.chips.length > 0 && typed.chips.every((n) => categories.some((c) => c.name === n)),
    typed.chips.join(' | '),
  )
  await page.screenshot({ path: `${SHOTS}/search-typed.png` })

  /* ---------------- nothing to find ---------------- */

  await page.evaluate(() => {
    const input = document.querySelector('#gsearch')
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.type('#gsearch', 'zzzqqqwww', { delay: 20 })
  await wait(1200)
  const empty = await inside()
  check('a word nothing matches says so', Boolean(empty.text.match(/ไม่พบ|No results|zzzqqqwww/)))

  check('nothing threw', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
}

console.log(failures ? `\n  ${failures} failing\n` : '\n  all good\n')
process.exit(failures ? 1 : 0)
