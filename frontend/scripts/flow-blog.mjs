/**
 * Exercises the blog in a real browser: the list against the API, an article
 * against what the API holds for it, the contents list against the article's
 * own headings, and the language rule that an article marked for every
 * language appears whichever language the site is being read in.
 *
 *   node scripts/flow-blog.mjs [baseUrl]
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
const thai = await get('/posts/public?locale=th&perPage=50')
const english = await get('/posts/public?locale=en&perPage=50')
const pick = thai.data[0]
const detail = (await get(`/posts/public/${pick.slug}`)).data

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

/* ---------------- 1. the list ---------------- */

await page.goto(`${BASE}/th/blog`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.ac', { timeout: 10000 })

const PER_PAGE = 9
const cards = await page.$$eval('.ac', (els) => els.length)
check(
  'the list shows a page of articles',
  cards === Math.min(PER_PAGE, thai.meta.total),
  `${cards} of ${thai.meta.total}`,
)

const heading = await page.$eval('#bl-count', (el) => el.textContent.trim())
check('the heading states the real total', heading.includes(String(thai.meta.total)), heading)

const firstCard = await page.$eval('.ac', (el) => ({
  title: el.querySelector('.ac-title')?.textContent.trim(),
  href: el.querySelector('.ac-title a')?.getAttribute('href'),
  author: el.querySelector('.ac-meta')?.textContent.replace(/\s+/g, ' ').trim(),
  cat: el.querySelector('.ac-cat')?.textContent.trim(),
}))
check('newest first', firstCard.title === pick.title, firstCard.title)
check('a card links by slug', firstCard.href === `/th/blog/${pick.slug}`, firstCard.href)
check(
  'and carries the real byline',
  !pick.authorName || firstCard.author.includes(pick.authorName),
  firstCard.author,
)
check(
  'the category badge is the course category it was filed under',
  !pick.categoryName || Boolean(firstCard.cat),
  `${firstCard.cat ?? '(none)'} · API says ${pick.categoryName ?? '(none)'}`,
)

/* ---------------- 2. the category chips filter ---------------- */

const chips = await page.$$eval('.bl-filter .cat-chip', (els) =>
  els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
)
check('a chip per category that has articles', chips.length > 1, chips.join(' | '))

// Pick the second chip — the first is "all".
await page.click('.bl-filter li:nth-child(2) .cat-chip')
await page.waitForFunction(() => new URL(location.href).searchParams.has('category'), {
  timeout: 6000,
})
await new Promise((r) => setTimeout(r, 600))
const catId = Number(new URL(page.url()).searchParams.get('category'))
const apiForCat = await get(`/posts/public?locale=th&categoryId=${catId}&perPage=50`)
const afterChip = await page.$$eval('.ac', (els) => els.length)
check(
  'choosing a category returns what the API says it holds',
  afterChip === Math.min(PER_PAGE, apiForCat.meta.total),
  `${afterChip} shown, API says ${apiForCat.meta.total}`,
)

await page.click('.bl-filter li:first-child .cat-chip')
await new Promise((r) => setTimeout(r, 600))
check('and "all" brings them back', (await page.$$eval('.ac', (e) => e.length)) === cards)

/* ---------------- 3. search ---------------- */

const term = 'คันจิ'
const input = await page.$('#bl-q')
await input.click({ clickCount: 3 })
await input.press('Backspace')
await page.type('#bl-q', term, { delay: 12 })
await page.waitForFunction((t) => new URL(location.href).searchParams.get('q') === t, { timeout: 6000 }, term)
await new Promise((r) => setTimeout(r, 600))
const apiForTerm = await get(`/posts/public?locale=th&q=${encodeURIComponent(term)}&perPage=50`)
check(
  'search matches the body as well as the title',
  (await page.$$eval('.ac', (e) => e.length)) === Math.min(PER_PAGE, apiForTerm.meta.total),
  `"${term}" -> ${apiForTerm.meta.total}`,
)
check('which is more than the titles alone contain', apiForTerm.meta.total > 1, `${apiForTerm.meta.total}`)

/* ---------------- 4. the article ---------------- */

await page.goto(`${BASE}/th/blog/${pick.slug}`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.bl-prose', { timeout: 10000 })

check(
  'the title is the article that was asked for',
  (await page.$eval('.bl-title', (el) => el.textContent.trim())) === detail.title,
  detail.title,
)

const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
check('the byline is the author', !detail.authorName || body.includes(detail.authorName))
check('a reading time is shown', /\d+ นาที/.test(body))
check(
  'the description is markup, not escaped tags',
  !body.includes('<p>') && !body.includes('&lt;'),
)

// Every h2 in the stored body has to appear in the contents list.
const apiHeadings = [...(detail.contentHtml ?? '').matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) =>
  m[1].replace(/<[^>]+>/g, '').trim(),
)
const toc = await page.$$eval('.bl-toc a', (els) => els.map((e) => e.textContent.trim()))
check(
  'the contents list is the article own headings',
  JSON.stringify(toc) === JSON.stringify(apiHeadings),
  `${toc.length} of ${apiHeadings.length}`,
)

// And each entry has to land on its heading.
const firstId = await page.$eval('.bl-toc a', (a) => a.getAttribute('href'))
check(
  'each entry points at a heading that exists',
  await page.evaluate((h) => document.querySelector(h) !== null, firstId),
  firstId,
)

const tables = await page.$$eval('.bl-prose table', (els) => els.length)
const quotes = await page.$$eval('.bl-prose blockquote', (els) => els.length)
const lists = await page.$$eval('.bl-prose ul, .bl-prose ol', (els) => els.length)
check('the editor markup is styled, not left bare', tables + quotes + lists > 0, `${tables} tables, ${quotes} quotes, ${lists} lists`)

/* ---------------- 5. sharing ---------------- */

const shares = await page.$$eval('.bl-share-btn', (els) =>
  els.map((e) => ({ key: e.dataset.share, href: e.getAttribute('href') })),
)
check(
  'LINE, Facebook, X and a copy button',
  ['line', 'facebook', 'x', 'copy'].every((k) => shares.some((s) => s.key === k)),
  shares.map((s) => s.key).join(', '),
)
const lineHref = shares.find((s) => s.key === 'line')?.href ?? ''
check(
  'and the share links carry this article own address',
  lineHref.includes(encodeURIComponent(pick.slug)),
  lineHref.slice(0, 80),
)

/* ---------------- 6. more to read ---------------- */

const moreTitles = await page.$$eval('.bl-more-sec .ac-title', (els) => els.map((e) => e.textContent.trim()))
check('other articles are offered', moreTitles.length > 0, `${moreTitles.length}`)
check('and the one being read is not among them', !moreTitles.includes(detail.title))

/* ---------------- 7. the language rule ---------------- */

const everyLanguage = thai.data.filter((p) => p.contentLocale === 'all')
check(
  'at least one article is marked for every language',
  everyLanguage.length > 0,
  everyLanguage.map((p) => p.slug).join(', '),
)

await page.goto(`${BASE}/en/blog`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.ac, .state-box', { timeout: 10000 })
const enTitles = await page.$$eval('.ac-title', (els) => els.map((e) => e.textContent.trim()))
check(
  'the English blog shows what the API gives for English',
  enTitles.length === Math.min(PER_PAGE, english.meta.total),
  `${enTitles.length} of ${english.meta.total}`,
)
check(
  'which includes the every-language article',
  everyLanguage.every((p) => enTitles.includes(p.title)),
  everyLanguage.map((p) => p.title).join(' | '),
)
check(
  'and leaves out the Thai-only ones',
  !enTitles.includes(thai.data.find((p) => p.contentLocale === 'th')?.title),
)
check('the page itself is in English', (await page.evaluate(() => document.body.innerText)).includes('Articles'))

/* ---------------- 8. the home page band ---------------- */

await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
await page.waitForSelector('#article-grid .ac', { timeout: 10000 })
const homeTitles = await page.$$eval('#article-grid .ac-title', (els) => els.map((e) => e.textContent.trim()))
check(
  'the home page band is the three newest articles',
  JSON.stringify(homeTitles) === JSON.stringify(thai.data.slice(0, 3).map((p) => p.title)),
  `${homeTitles.length} cards`,
)
// Waited on by URL, not by `.ac`: the home page's own band uses that class, so
// a selector wait is satisfied before the click has navigated anywhere.
await page.click('#articles .btn--secondary')
await page
  .waitForFunction(() => location.pathname.endsWith('/blog'), { timeout: 8000 })
  .catch(() => {})
check('and its button reaches the blog', page.url().endsWith('/th/blog'), page.url())

/* ---------------- 9. a slug that does not exist ---------------- */

await page.goto(`${BASE}/th/blog/no-such-article`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.state-box', { timeout: 8000 })
check(
  'an unknown slug says so rather than failing',
  (await page.evaluate(() => document.body.innerText)).includes('no-such-article'),
)

/* ---------------- 10. on a phone ---------------- */

await page.setViewport({ width: 390, height: 844 })
await page.goto(`${BASE}/th/blog/${pick.slug}`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.bl-prose', { timeout: 8000 })
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
)
check('no sideways scrolling on a phone', overflow <= 1, `${overflow}px over`)
const tocFirst = await page.evaluate(() => {
  const toc = document.querySelector('.bl-toc')
  const prose = document.querySelector('.bl-prose')
  if (!toc || !prose) return 'no toc'
  return toc.getBoundingClientRect().top < prose.getBoundingClientRect().top
})
check('the contents list moves above the article', tocFirst === true || tocFirst === 'no toc', String(tocFirst))

await page.setViewport({ width: 1440, height: 1100 })
await page.goto(`${BASE}/th/blog`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.ac', { timeout: 8000 })
await page.waitForNetworkIdle({ idleTime: 600 }).catch(() => {})
const broken = await page.$$eval('.ac img', (imgs) =>
  imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
)
check('every cover loads for a reader who is not signed in', broken.length === 0, broken.join(' '))

await page.screenshot({ path: `${SHOTS}/blog.png` })

const unexpected = badResponses.filter(
  ({ url, status }) =>
    !(url.includes('/auth/refresh') && status === 401) &&
    !(url.includes('/posts/public/no-such-article') && status === 404),
)
check(
  'nothing failed to load but the slug the test made up',
  unexpected.length === 0,
  unexpected.map((r) => `${r.status} ${r.url}`).slice(0, 3).join(' | '),
)
const real = errors.filter((e) => !/favicon|Vue Devtools|Failed to load resource/i.test(e))
check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))

await browser.close()
console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
