/**
 * Category names in four languages, as a reader sees them.
 *
 *   node scripts/flow-category-names.mjs [baseUrl]
 *
 * The API side is covered by `api/scripts/smoke-category-names.mts`; this is
 * the half that keeps being the actual bug. Every name on the site used to be
 * drawn from one column, so an English page showed Thai category names on the
 * home cards, in the header menu, in the catalog's filter list and in the
 * course breadcrumb — four places, each reading the same field, none of them
 * aware there was a translation to use.
 *
 * So each of those four is checked in two languages, and then the language is
 * switched without a reload: the menu is built from a cached list, and a cached
 * list is exactly the kind that keeps the previous language's words.
 *
 * Read-only. It opens pages and reads text; it changes nothing.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const cats = (await (await fetch(API + '/categories?all=1')).json()).data
const byId = new Map(cats.map((c) => [c.id, c]))

/** What a category should read as in one language, falling back as the site does. */
const nameIn = (c, locale) => c.names?.[locale] || c.name

/** Parent · child, the label the site builds for a sub-category. */
const labelIn = (c, locale) => {
  const own = nameIn(c, locale)
  if (!c.parentId) return own
  const parent = byId.get(c.parentId)
  return parent ? `${nameIn(parent, locale)} · ${own}` : own
}

/**
 * A category with a name that differs between Thai and the language under
 * test, and that is translated in both. Picked from the data rather than
 * hard-coded, so renaming a category in the admin does not break the test —
 * and so the test fails loudly if nothing is translated at all, which is the
 * state it exists to catch.
 */
function distinctive(locale) {
  return (
    cats.find(
      (c) =>
        !c.parentId &&
        c.totalCourseCount > 0 &&
        c.names?.[locale] &&
        c.names[locale] !== nameIn(c, 'th'),
    ) ?? null
  )
}

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

// The gate asks for a language on a first visit and covers the page until it
// is answered. The locale is in the path here, so answering it up front is
// just getting it out of the way.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('minna.locale', 'en')
  } catch {
    // A private window has no storage. The gate then shows, and the first
    // check below will say so rather than timing out silently.
  }
})

try {
  for (const locale of ['en', 'jp', 'vn']) {
    const subject = distinctive(locale)
    console.log(`\n--- ${locale} ---`)
    if (!subject) {
      check(`${locale}: a translated category exists to test with`, false, 'none translated')
      continue
    }
    const expected = nameIn(subject, locale)

    /* ---------------- 1. the home page's category cards ---------------- */

    await page.goto(`${BASE}/${locale}`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('.cat-card', { timeout: 8000 })

    const cards = await page.$$eval('.cat-card', (els) =>
      els.map((el) => ({
        href: el.getAttribute('href') ?? '',
        text: el.innerText.replace(/\s+/g, ' ').trim(),
      })),
    )
    const card = cards.find((c) => c.href.endsWith(`category=${subject.id}`))
    check(
      `the home card reads "${expected}", not the Thai name`,
      card !== undefined && card.text.includes(expected),
      card ? card.text : 'no card',
    )
    check(
      '  and the Thai name is nowhere on it',
      card !== undefined && !card.text.includes(nameIn(subject, 'th')),
      card?.text,
    )

    /* ---------------- 2. the header's category menu ---------------- */

    await page.click('[aria-controls="mega-cat"]').catch(() => {})
    const tiles = await page
      .$$eval('#mega-cat .cat-tile', (els) =>
        els.map((el) => ({
          href: el.getAttribute('href') ?? '',
          text: el.innerText.replace(/\s+/g, ' ').trim(),
        })),
      )
      .catch(() => [])
    const tile = tiles.find((t) => t.href.endsWith(`category=${subject.id}`))
    check(
      `the header menu reads "${expected}"`,
      tile !== undefined && tile.text.includes(expected),
      tile ? tile.text : `${tiles.length} tiles`,
    )

    /* ---------------- 3. the catalog's filter list ---------------- */

    await page.goto(`${BASE}/${locale}/courses`, { waitUntil: 'networkidle2' })
    const filterText = await page
      .$eval('body', (el) => el.innerText.replace(/\s+/g, ' '))
      .catch(() => '')
    check(
      `the catalog filter offers "${expected}"`,
      filterText.includes(expected),
      expected,
    )

    /* ---------------- 4. a course page's category line ---------------- */

    const inside = cats.find((c) => c.parentId === subject.id && c.courseCount > 0) ?? subject
    const course = (
      await (await fetch(`${API}/courses?categoryId=${inside.id}&perPage=1`)).json()
    ).data?.[0]
    if (!course) {
      check(`${locale}: a course under "${expected}" exists to test with`, false, 'none published')
    } else {
      await page.goto(`${BASE}/${locale}/courses/${course.slug}`, { waitUntil: 'networkidle2' })
      const body = await page.$eval('body', (el) => el.innerText.replace(/\s+/g, ' '))
      const wanted = labelIn(inside, locale)
      check(
        `the course page names its category "${wanted}"`,
        // Each half separately: the page may wrap the two around a separator
        // of its own, and a test that insists on the exact " · " is testing
        // the punctuation rather than the translation.
        wanted.split(' · ').every((part) => body.includes(part)),
        wanted,
      )
    }
  }

  /* ---------------- 5. switching language relabels what is cached ---------------- */

  console.log('\n--- switching ---')
  const subject = distinctive('en')
  if (subject) {
    await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('.cat-card', { timeout: 8000 })
    const thaiFirst = await page.$$eval('.cat-card', (els) =>
      els.map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    )
    check(
      'the Thai page starts in Thai',
      thaiFirst.some((t) => t.includes(nameIn(subject, 'th'))),
      nameIn(subject, 'th'),
    )

    // In-app navigation, not a reload: the category list is already fetched
    // and the labels have to be worked out again rather than kept.
    await page.evaluate(() => {
      const link = document.querySelector('a[href^="/en"]')
      if (link) link.click()
      else history.pushState({}, '', '/en')
    })
    await page.goto(`${BASE}/en`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cat-card', { timeout: 8000 })
    const afterSwitch = await page.$$eval('.cat-card', (els) =>
      els.map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    )
    check(
      'and the cards are in English afterwards',
      afterSwitch.some((t) => t.includes(nameIn(subject, 'en'))),
      nameIn(subject, 'en'),
    )
    check(
      '  with no Thai name left among them',
      !afterSwitch.some((t) => t.includes(nameIn(subject, 'th'))),
      nameIn(subject, 'th'),
    )
  }

  /* ---------------- 6. search knows every language ---------------- */

  const searchFor = distinctive('en')
  if (searchFor) {
    const term = nameIn(searchFor, 'en')
    await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('.cat-card', { timeout: 8000 })
    const typed = await page.evaluate((text) => {
      const box = document.querySelector('input[type="search"], .cat-search input')
      if (!box) return false
      box.focus()
      box.value = text
      box.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }, term)
    if (!typed) {
      console.log(`skip  no category search box on the Thai home page`)
    } else {
      await new Promise((r) => setTimeout(r, 400))
      const left = await page.$$eval('.cat-card', (els) =>
        els.map((el) => el.getAttribute('href') ?? ''),
      )
      check(
        `searching the Thai page for "${term}" still finds that category`,
        left.some((h) => h.endsWith(`category=${searchFor.id}`)),
        `${left.length} cards left`,
      )
    }
  }

  // The boot refresh 401s for a visitor with no session, which the browser
  // reports as a failed resource. Filtered the same way the other flows do, so
  // that a genuine script error is still what this reports.
  const real = errors.filter((e) => !/favicon|Vue Devtools|Failed to load resource/i.test(e))
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}

console.log(failures ? `\n  ${failures} failing\n` : '\n  all good\n')
process.exit(failures ? 1 : 0)
