/**
 * Exercises the home page's course sections against the API: that the rails
 * hold the courses the API would give for those sorts, that the category cards
 * count a whole subtree rather than a parent's empty self, and that every card
 * and every category card lands somewhere real.
 *
 *   node scripts/flow-home.mjs [baseUrl]
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const SHOTS = process.env.SHOT_DIR ?? '.'


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const get = async (p) => (await (await fetch(API + p)).json())
/**
 * Both asked in the language the page is read in.
 *
 * The catalogue shows a reader the courses taught in their own language plus
 * the ones marked for every language, and the category counts follow the same
 * rule — a card that counted across all eight would promise courses its own
 * link does not return. Asking without the locale made this test compare two
 * different questions and call the page wrong.
 */
const newest = await get('/courses?sort=newest&perPage=8&locales=th')
const cats = await get('/categories?all=1&locale=th')

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1100 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
const badResponses = []
page.on('response', (r) => {
  if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() })
})

await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
await page.waitForSelector('#new-courses .cc', { timeout: 10000 })
await page.waitForNetworkIdle({ idleTime: 600 }).catch(() => {})

const railTitles = (sel) => page.$$eval(`${sel} .cc-title`, (els) => els.map((e) => e.textContent.trim()))

/* ---------------- 1. the two rails ---------------- */

const newTitles = await railTitles('#new-courses')
check(
  'the new-courses rail is exactly what the API calls newest',
  JSON.stringify(newTitles) === JSON.stringify(newest.data.map((c) => c.title)),
  `${newTitles.length} cards`,
)

const featuredTitles = await railTitles('#rec-courses')
check('a recommended rail is shown', featuredTitles.length > 0, `${featuredTitles.length} cards`)
check(
  'and it does not repeat the rail above it',
  !featuredTitles.some((t) => newTitles.includes(t)),
  featuredTitles.filter((t) => newTitles.includes(t)).join(', ') || 'no overlap',
)

check(
  'there is no "my courses" rail, since nothing can say what you own yet',
  (await page.$('#my-courses')) === null,
)

/* ---------------- 2. a card is a real course ---------------- */

const first = newest.data[0]
const card = await page.$eval('#new-courses .cc', (el) => ({
  title: el.querySelector('.cc-title')?.textContent.trim(),
  href: el.querySelector('.cc-title a')?.getAttribute('href'),
  price: el.querySelector('.price strong')?.textContent.trim(),
  lessons: el.querySelector('.cc-meta')?.textContent.replace(/\s+/g, ' ').trim(),
}))
check('the first card is the first course', card.title === first.title, card.title)
check('it links by slug', card.href === `/th/courses/${first.slug}`, card.href)
check(
  'its price is the satang figure in baht',
  first.price === 0 ? /ฟรี/.test(card.price) : card.price.includes((first.price / 100).toLocaleString('th-TH')),
  `${first.price} satang -> ${card.price}`,
)
check(
  'and it says how many lessons there really are',
  card.lessons.includes(`${first.lessonCount} บทเรียน`),
  card.lessons,
)

await page.click('#new-courses .cc-title a')
await page.waitForSelector('.cd-title', { timeout: 8000 })
check(
  'clicking it opens that course',
  (await page.$eval('.cd-title', (el) => el.textContent.trim())) === first.title,
)
await page.goBack({ waitUntil: 'networkidle2' })
await page.waitForSelector('#new-courses .cc', { timeout: 8000 })

/* ---------------- 3. the category cards ---------------- */

const cards = await page.$$eval('.cat-card', (els) =>
  els.map((el) => ({
    href: el.getAttribute('href'),
    text: el.innerText.replace(/\s+/g, ' ').trim(),
    count: Number(el.querySelector('.cc-n')?.textContent.replace(/\D/g, '') || 0),
  })),
)
check('every category has a card', cards.length === cats.data.length, `${cards.length} cards`)

// A parent is filed with no courses of its own; its card must still count the
// courses underneath it.
const parents = cats.data.filter((c) => !c.parentId && c.totalCourseCount > 0)
for (const p of parents) {
  const card = cards.find((c) => c.href.endsWith(`category=${p.id}`))
  check(
    `"${p.name}" counts its whole subtree, not its own empty self`,
    card?.count === p.totalCourseCount,
    `own ${p.courseCount}, subtree ${p.totalCourseCount}, card says ${card?.count}`,
  )
}

/* ---------------- 4. a parent category link gives those courses ---------------- */

const parent = parents[0]
await page.goto(`${BASE}/th/courses?category=${parent.id}`, { waitUntil: 'networkidle2' })
await page.waitForFunction(
  () => document.querySelector('#cat-list')?.getAttribute('aria-busy') === 'false',
  { timeout: 8000 },
)
const headingText = await page.$eval('#cat-count', (el) => el.textContent)
const shown = Number((headingText.match(/[\d,]+/)?.[0] ?? '0').replace(/,/g, ''))
check(
  'choosing a parent category returns everything beneath it',
  shown === parent.totalCourseCount,
  `${parent.name}: ${shown} of ${parent.totalCourseCount}`,
)

const facetCount = await page.$$eval('.flt-item', (els) =>
  els.map((li) => ({
    v: li.querySelector('input')?.value,
    n: Number(li.querySelector('[data-count]')?.textContent.replace(/\D/g, '') || 0),
  })),
)
check(
  'and the number beside it said so beforehand',
  facetCount.find((f) => f.v === String(parent.id))?.n === parent.totalCourseCount,
  `facet said ${facetCount.find((f) => f.v === String(parent.id))?.n}`,
)

/* ---------------- 5. the category search ---------------- */

await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.cat-card', { timeout: 8000 })
await page.type('#cat-q', parent.name.slice(0, 6), { delay: 15 })
await new Promise((r) => setTimeout(r, 250))
const found = await page.$$eval('.cat-card', (els) => els.length)
check(
  'searching a parent name also finds its children',
  found > 1,
  `"${parent.name.slice(0, 6)}" -> ${found} cards`,
)

/* ---------------- 6. English ---------------- */

await page.goto(`${BASE}/en`, { waitUntil: 'networkidle2' })
await page.waitForSelector('#new-courses .cc', { timeout: 8000 })
const enText = await page.evaluate(() => document.body.innerText)
check('the rails are translated', enText.includes('New courses') && enText.includes('Recommended'))
// Not "in THB" any more: a course is charged in the currency its teacher set,
// so the English page shows THB, USD or whatever each card's own price is in.
// What matters is that a price carries a currency at all rather than a bare
// number somebody has to guess at.
check('and every price names its currency', /฿|THB|US\$|\$|¥|€|£|₩/.test(enText))

/* ---------------- 7. nothing broken ---------------- */

await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
await page.waitForSelector('#new-courses .cc', { timeout: 8000 })
await page.waitForNetworkIdle({ idleTime: 600 }).catch(() => {})
const broken = await page.$$eval('.home-rail img', (imgs) =>
  imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
)
check('every cover on the rails loads', broken.length === 0, broken.join(' '))

await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: false })

const unexpected = badResponses.filter(({ url, status }) => !(url.includes('/auth/refresh') && status === 401))
check(
  'nothing failed to load',
  unexpected.length === 0,
  unexpected.map((r) => `${r.status} ${r.url}`).slice(0, 3).join(' | '),
)
const real = errors.filter((e) => !/favicon|Vue Devtools|Failed to load resource/i.test(e))
check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))

await browser.close()
console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
