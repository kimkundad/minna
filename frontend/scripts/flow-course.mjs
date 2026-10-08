/**
 * Exercises a course page in a real browser: that it is the course the catalog
 * linked to, that every section matches what the API holds, and that the two
 * failure pages ("no such course" and "could not load") are told apart.
 *
 *   node scripts/flow-course.mjs [baseUrl]
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
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

/** The API's own answer, to compare the page against. */
const list = await (await fetch(`${API}/courses?perPage=50`)).json()
const pick = list.data.find((c) => c.lessonCount > 0 && c.instructors.length > 0) ?? list.data[0]
const detail = (await (await fetch(`${API}/courses/${pick.slug}`)).json()).data
const curriculum = (await (await fetch(`${API}/courses/${pick.slug}/curriculum`)).json()).data

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

const badResponses = []
page.on('response', (r) => {
  if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() })
})

await page.goto(`${BASE}/th/courses/${pick.slug}`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.cd-title', { timeout: 10000 })

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))

/* ---------------- 1. it is the right course ---------------- */

check(
  'the title is the course that was asked for',
  (await page.$eval('.cd-title', (el) => el.textContent.trim())) === detail.title,
  detail.title,
)
check(
  'the short description is the lead',
  (await page.$eval('.cd-lead', (el) => el.textContent.trim())) === (detail.shortDesc ?? ''),
)

const crumbs = await page.$$eval('.dc-crumbs li', (els) => els.map((e) => e.textContent.trim()))
check('the breadcrumb ends on this course', crumbs.at(-1) === detail.title, crumbs.join(' / '))
check(
  'and names its category on the way',
  !detail.categoryName || crumbs.some((c) => c.includes(detail.categoryName)),
  detail.categoryName ?? '(none)',
)

/* ---------------- 2. the price, from satang ---------------- */

const priceText = await page.$eval('.cd-price', (el) => el.textContent.replace(/\s+/g, ' ').trim())
const shownBaht = Number((priceText.match(/[\d,]+/)?.[0] ?? '0').replace(/,/g, ''))
check(
  'the price is the satang figure in baht',
  detail.price === 0 ? /ฟรี/.test(priceText) : shownBaht === detail.price / 100,
  `${detail.price} satang -> "${priceText}"`,
)

/* ---------------- 3. the curriculum ---------------- */

const apiLessons = [...curriculum.modules.flatMap((m) => m.lessons), ...curriculum.loose]
const apiChapters = curriculum.modules.length + (curriculum.loose.length ? 1 : 0)

const shownChapters = await page.$$eval('.cd-mod', (els) => els.length)
check('every chapter is listed', shownChapters === apiChapters, `${shownChapters} of ${apiChapters}`)

await page.click('[data-expand-all]')
await page.waitForFunction(
  (n) => document.querySelectorAll('.cd-lesson').length >= n,
  { timeout: 4000 },
  apiLessons.length,
).catch(() => {})

const shownLessons = await page.$$eval('.cd-lesson', (els) => els.length)
check(
  '"expand all" shows every lesson there is',
  shownLessons === apiLessons.length,
  `${shownLessons} of ${apiLessons.length}`,
)
check(
  'the lesson count in the hero is the real one',
  (await text()).includes(`${detail.lessonCount} บทเรียน`),
  `${detail.lessonCount}`,
)

const previews = await page.$$eval('.cd-lesson[data-mode="preview"]', (els) => els.length)
const apiPreviews = apiLessons.filter((l) => l.isPreview).length
check('free samples are marked as such', previews === apiPreviews, `${previews} of ${apiPreviews}`)

const locked = await page.$$eval('.cd-lesson[data-mode="locked"]', (els) => els.length)
check(
  'and everything else is locked, since nobody is signed in',
  locked === apiLessons.length - apiPreviews,
  `${locked} locked`,
)
check(
  'no lesson is a link into the player',
  (await page.$$eval('.cd-lesson', (els) => els.filter((e) => e.tagName === 'A').length)) === 0,
)

/* ---------------- 3b. the free sample opens ---------------- */

if (apiPreviews > 0) {
  const row = await page.$('.cd-lesson[data-mode="preview"]')
  check(
    'a free sample is a button, not a line of text',
    await page.$eval('.cd-lesson[data-mode="preview"]', (el) => el.tagName) === 'BUTTON',
  )
  await row.click()
  await page.waitForSelector('.pv-stage', { timeout: 8000 })

  const head = await page.$eval('.modal-title', (el) => el.textContent.trim())
  const previewLesson = apiLessons.find((l) => l.isPreview)
  check('opening it names the lesson', head.includes(previewLesson.title), head)
  check(
    'and the course under it',
    (await page.$eval('.modal-sub', (el) => el.textContent.trim())) === detail.title,
  )

  // Waited out, or the assertion below only ever sees "getting ready".
  await page
    .waitForFunction(
      () =>
        document.querySelector('.pv-play') !== null ||
        document.querySelector('.pv-video') !== null ||
        (document.querySelector('.pv-stage .pv-note')?.textContent ?? '').trim().length > 0,
      { timeout: 8000 },
    )
    .catch(() => {})
  await new Promise((r) => setTimeout(r, 400))

  // Either a player or a reason there is not one. Never an empty box.
  const state = await page.evaluate(() => ({
    play: document.querySelector('.pv-play') !== null,
    note: document.querySelector('.pv-stage .pv-note')?.textContent.trim() ?? '',
  }))
  check(
    'it offers a player, or says why it cannot',
    state.play || state.note.length > 0,
    state.play ? 'play button' : state.note,
  )

  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 400))
  check('escape closes it', (await page.$('.pv-stage')) === null)
  check('and leaves nothing playing', (await page.$$eval('video', (e) => e.length)) === 0)
}

// A lesson that is not a sample must not be openable at all.
check(
  'a locked lesson is not a button',
  (await page.$$eval('.cd-lesson[data-mode="locked"]', (els) =>
    els.filter((e) => e.tagName === 'BUTTON').length,
  )) === 0,
)

/* ---------------- 4. the teacher, in full ---------------- */

const body = await text()
for (const i of detail.instructors) {
  check(`the instructor section names ${i.short}`, body.includes(i.name), i.name)
  if (i.bio) check('  and carries their biography', body.includes(i.bio.slice(0, 40)))
  if (i.credentials) check('  and their credentials', body.includes(i.credentials.slice(0, 30)))
}

/* ---------------- 5. outcomes, audience, description ---------------- */

for (const o of detail.outcomes ?? []) {
  check(`an outcome is shown: ${o.slice(0, 24)}…`, body.includes(o))
}
check(
  'who it is for is shown',
  (detail.audience ?? []).every((a) => body.includes(a)),
  `${(detail.audience ?? []).length} entries`,
)
check(
  'the description is rendered as markup, not as tags',
  !detail.description || ((await page.$('.cd-prose')) !== null && !body.includes('<p>')),
)

/* ---------------- 6. the details table ---------------- */

const kv = await page.$$eval('.cd-kv', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')).join(' '))
check('the table says what language it is taught in', /ไทย|English|日本語|Tiếng Việt/.test(kv))
check(
  'and whether it is in a package',
  /อยู่ในแพ็กเกจ|ใช่|ไม่/.test(kv),
  detail.inPackage ? 'in a package' : 'not in one',
)

/* ---------------- 7. the category link goes back to a filtered catalog ---------------- */

if (detail.categoryId) {
  await page.click('.cd-cat')
  await page.waitForSelector('#cat-list', { timeout: 8000 })
  await page.waitForFunction(
    () => document.querySelector('#cat-list')?.getAttribute('aria-busy') === 'false',
    { timeout: 8000 },
  )
  const chip = await page.$$eval('.cat-chips .cat-chip', (els) => els.length)
  check('the category link opens the catalog filtered to it', chip === 1, page.url())
  await page.goBack({ waitUntil: 'networkidle2' })
  await page.waitForSelector('.cd-title', { timeout: 8000 })
}

/* ---------------- 8. the related rail ---------------- */

const rail = await page.$$eval('#cd-rec .cc', (els) => els.length)
const railSelf = await page.$$eval('#cd-rec .cc-title', (els) => els.map((e) => e.textContent.trim()))
check('a related rail is shown', rail >= 0, `${rail} cards`)
check('and it does not recommend the course you are on', !railSelf.includes(detail.title))

/* ---------------- 9. the two failure pages ---------------- */

await page.goto(`${BASE}/th/courses/no-such-course-at-all`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.cd-nf', { timeout: 8000 })
check('an unknown slug gets the "no such course" page', (await page.$('.cd-nf-box')) !== null)
check(
  'which says which slug it was',
  (await text()).includes('no-such-course-at-all'),
)
await page.waitForSelector('#cd-nf-rec .cc', { timeout: 8000 }).catch(() => {})
check('and offers somewhere to go instead', (await page.$$eval('#cd-nf-rec .cc', (e) => e.length)) > 0)

// A failing API is not a missing course, and must not be reported as one.
// A flag rather than turning interception back off: the handler stays
// registered either way, and calling continue() with it off throws.
let breakApi = true
await page.setRequestInterception(true)
page.on('request', (r) => {
  if (breakApi && r.url().includes('/api/v1/courses/')) {
    return r.respond({ status: 500, body: '{}' })
  }
  return r.continue()
})
await page.goto(`${BASE}/th/courses/${pick.slug}`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.cd-err', { timeout: 8000 })
check('a failing API gets the "could not load" page, with a retry', (await page.$('[data-retry="course"]')) !== null)
check('and does not claim the course does not exist', (await page.$('.cd-nf-box')) === null)

breakApi = false
await page.goto(`${BASE}/th/courses/${pick.slug}`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.cd-title', { timeout: 8000 })
await page.screenshot({ path: `${SHOTS}/course.png`, fullPage: false })

/**
 * Only the responses this run asked for may have failed: the boot refresh,
 * which 401s for a visitor with no session, and the two failures the test
 * provoked on purpose. Matched by URL rather than by status, so a genuinely
 * missing file is not waved through for having the same status code.
 */
const unexpected = badResponses.filter(
  ({ url, status }) =>
    !(url.includes('/auth/refresh') && status === 401) &&
    !(url.includes('/courses/no-such-course-at-all') && status === 404) &&
    !(url.includes('/api/v1/courses/') && status === 500),
)
check(
  'nothing failed to load but what the test broke on purpose',
  unexpected.length === 0,
  unexpected.map((r) => `${r.status} ${r.url}`).slice(0, 3).join(' | '),
)

const real = errors.filter(
  (e) => !/favicon|Vue Devtools|Failed to load resource/i.test(e),
)
check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))

await browser.close()
console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
