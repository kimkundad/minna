/**
 * Exercises the catalog in a real browser: results, facet counts that agree
 * with the results, search, sort, the chips and the URL.
 *
 *   node flow-catalog.mjs [baseUrl]
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const SHOTS = process.env.SHOT_DIR ?? '.'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const browser = await puppeteer.launch({
  executablePath: BROWSERS.find((p) => existsSync(p)),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

async function settle() {
  await page.waitForFunction(
    () => document.querySelector('#cat-list')?.getAttribute('aria-busy') === 'false',
    { timeout: 10000 },
  )
}

const cardCount = () => page.$$eval('#cat-list .cc', (els) => els.length)
const heading = () => page.$eval('#cat-count', (el) => el.textContent.trim())

/** Every facet option with its printed count. */
async function facets() {
  return page.$$eval('.cat-side .flt-item', (items) =>
    items.map((li) => ({
      group: li.closest('[data-group]')?.dataset.group,
      value: li.querySelector('input')?.value,
      label: li.querySelector('.flt-text')?.textContent.trim(),
      count: Number(li.querySelector('[data-count]')?.textContent.replace(/\D/g, '') || 0),
      hidden: li.hasAttribute('hidden'),
    })),
  )
}

/* ---------------- 1. first load ---------------- */

await page.goto(`${BASE}/th/courses`, { waitUntil: 'networkidle2' })
await settle()

const first = await cardCount()
check('catalog renders courses', first > 0, `${first} cards`)
check('heading states a total', /\d/.test(await heading()), await heading())

const f = await facets()
check('facet counts are present', f.some((x) => x.count > 0), `${f.length} options`)

const groups = [...new Set(f.map((x) => x.group))]
check(
  'five facet groups besides category, and no CE group',
  groups.length === 6 && !groups.includes('ce'),
  groups.join(','),
)

const spoken = f.filter((x) => x.group === 'locale')
check('language of instruction is a facet', spoken.length === 4, spoken.map((x) => `${x.label}:${x.count}`).join(' '))

/* ---------------- 2. a facet count is a promise ---------------- */
// Tick the option and the result count must equal the number that was beside it.

const beginner = f.find((x) => x.group === 'level' && x.value === 'beginner')
await page.click('#sf-level-beginner')
await settle()
const afterTick = await cardCount()
const headingNow = await heading()
const statedTotal = Number((headingNow.match(/[\d,]+/)?.[0] ?? '0').replace(/,/g, ''))
check(
  'ticking a facet gives exactly the count it advertised',
  statedTotal === beginner.count,
  `facet said ${beginner.count}, heading says ${statedTotal}, ${afterTick} cards drawn`,
)
check('url carries the filter', page.url().includes('level=beginner'), page.url())

// The other options in the same group keep their own counts, because each is
// measured as if it alone were ticked.
const f2 = await facets()
const intermediate = f2.find((x) => x.group === 'level' && x.value === 'intermediate')
const was = f.find((x) => x.group === 'level' && x.value === 'intermediate')
check(
  'a sibling option keeps its count when one is ticked',
  intermediate.count === was.count && was.count > 0,
  `${was.count} -> ${intermediate.count}`,
)

/* ---------------- 3. a chip removes it again ---------------- */

const chips = await page.$$eval('.cat-chips .cat-chip', (els) => els.map((e) => e.textContent.trim()))
check('a chip shows the active filter', chips.length === 1, chips.join(' | '))

await page.click('.cat-chips .cat-chip')
await settle()
check('removing the chip restores every course', (await cardCount()) === first, `${await cardCount()}`)
check('url is clean again', !page.url().includes('level='), page.url())

/* ---------------- 4. search ---------------- */

async function search(term) {
  const input = await page.$('#cat-q')
  await input.click({ clickCount: 3 })
  await input.press('Backspace')
  await page.type('#cat-q', term, { delay: 12 })
  await page.waitForFunction(
    (t) => new URL(location.href).searchParams.get('q') === t,
    { timeout: 6000 },
    term,
  )
  await settle()
  return cardCount()
}

const n5 = await search('N5')
check('searching a course title finds it', n5 > 0, `"N5" -> ${n5}`)

const nonsense = await search('zzzznotacourse')
check('a search with no match shows the empty state', nonsense === 0 && (await page.$('.state-box')) !== null)

await page.click('[data-action="cat-show-all"]')
await settle()
check('"show all" clears the search', (await cardCount()) === first, `${await cardCount()}`)

/* ---------------- 5. sort ---------------- */

async function titlesNow() {
  return page.$$eval('#cat-list .cc-title', (els) => els.map((e) => e.textContent.trim()))
}
/** The `strong` only: `.price` also holds the struck-through usual price, and
 *  reading the whole element glues two numbers into one. */
async function pricesNow() {
  return page.$$eval('#cat-list .cc .price strong', (els) =>
    els.map((el) => Number(el.textContent.replace(/[^\d]/g, '') || 0)),
  )
}

await page.select('#cat-sort', 'price-asc')
await settle()
const prices = await pricesNow()
const ascending = prices.every((p, i) => i === 0 || prices[i - 1] <= p)
check('cheapest first actually sorts by price', ascending, prices.join(' '))
check('sort is in the url', page.url().includes('sort=price-asc'), page.url())

await page.select('#cat-sort', 'price-desc')
await settle()
const desc = await pricesNow()
check(
  'dearest first is the reverse',
  desc.every((p, i) => i === 0 || desc[i - 1] >= p),
  desc.join(' '),
)

/* ---------------- 6. a link into a filtered catalog ---------------- */
// Filter changes `replace` the history entry rather than pushing one, so back
// does not step through them. What has to work is the other direction: a URL
// someone was sent opening on exactly that state.

await page.goto(`${BASE}/th/courses?level=advanced&sort=price-desc`, { waitUntil: 'networkidle2' })
await settle()
const restored = await page.$$eval('.cat-chips .cat-chip', (els) => els.length)
const sortSel = await page.$eval('#cat-sort', (el) => el.value)
check(
  'a shared link opens on its own filter and sort',
  restored === 1 && sortSel === 'price-desc',
  `${restored} chip, sort=${sortSel}`,
)
check('and shows only those courses', (await cardCount()) < first, `${await cardCount()} of ${first}`)

/* ---------------- 7. the list view, and a card's link ---------------- */

await page.goto(`${BASE}/th/courses?view=list`, { waitUntil: 'networkidle2' })
await settle()
const listCls = await page.$eval('.cat-grid', (el) => el.className)
check('list view is applied from the url', listCls.includes('is-list'), listCls)
const listMeta = await page.$eval('#cat-list .cc', (el) => el.textContent.replace(/\s+/g, ' ').trim())
check('a list card names the language of instruction', /ไทย|English|日本語|Tiếng Việt/.test(listMeta))

const [href, cardTitle] = await page.$eval('#cat-list .cc-title a', (a) => [
  a.getAttribute('href'),
  a.textContent.trim(),
])
check('a card links by slug, not by number', /\/th\/courses\/[a-z0-9-]*[a-z]/.test(href), href)

await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle2' })
const landed = await page.evaluate(() => document.querySelector('h1')?.textContent.trim() ?? '')
check('that link opens the same course', landed === cardTitle, `card "${cardTitle}" -> page "${landed}"`)

/* ---------------- 7b. the card's own button ---------------- */
// It is the card that acts, not the page, so it has to work wherever a card is
// drawn — this checks the catalog and the home page, which listened to nothing
// at all until it did.

for (const [where, path] of [
  ['the catalog', '/th/courses'],
  ['the home page', '/th'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.cc [data-action]', { timeout: 10000 })
  const before = page.url()
  const action = await page.$eval('.cc [data-action]', (el) => el.dataset.action)
  await page.click('.cc [data-action]')
  await page
    .waitForFunction(() => location.pathname.includes('/checkout'), { timeout: 6000 })
    .catch(() => {})
  check(
    `a card's "${action}" button works on ${where}`,
    page.url().includes('/checkout?items='),
    before === page.url() ? 'nothing happened' : page.url(),
  )
}

/* ---------------- 8. images, and a clean console ---------------- */

await page.goto(`${BASE}/th/courses`, { waitUntil: 'networkidle2' })
await settle()

await page.goto(`${BASE}/th/courses`, { waitUntil: 'networkidle2' })
await settle()
await page.waitForNetworkIdle({ idleTime: 600 }).catch(() => {})
const broken = await page.$$eval('#cat-list img', (imgs) =>
  imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
)
check('every cover loads for a visitor who is not signed in', broken.length === 0, broken.join(' '))

await page.screenshot({ path: `${SHOTS}/catalog.png`, fullPage: false })

// The boot refresh 401s for a visitor with no session. That is the normal case,
// `refresh()` returns false for it, and only the browser calls it an error.
const real = errors.filter(
  (e) => !/favicon|Vue Devtools|auth\/refresh/i.test(e) && !/401 \(Unauthorized\)/.test(e),
)
check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))

await browser.close()
console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
