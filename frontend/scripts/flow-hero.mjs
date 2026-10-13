/**
 * Checks the home slideshow against whatever the admin has published.
 *
 *   node scripts/flow-hero.mjs
 *
 * Reads the API itself first, then the page, and compares the two — a carousel
 * that renders something is not proof it rendered the right thing.
 */
import { launchBrowser } from './browser.mjs'

const SITE = process.env.SITE_URL ?? 'http://localhost:5174'
const API = process.env.API_URL ?? 'http://127.0.0.1:3000'
const SHOTS = 'C:/Users/brack/AppData/Local/Temp/shots'

let passed = 0
let failed = 0
function check(label, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const expected = (await (await fetch(`${API}/api/v1/hero-slides/public?locale=th`)).json()).data
console.log(`  the admin has published ${expected.length} Thai slide(s)\n`)

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })

const problems = []
page.on('pageerror', (e) => problems.push(String(e)))

/** Everything the rendered carousel is showing. */
const readSlides = () =>
  page.evaluate(() => {
    const hero = document.querySelector('.hero')
    if (!hero) return null
    return [...hero.querySelectorAll('.hero-slide')].map((el) => {
      const img = el.querySelector('.hero-media img')
      return {
        eyebrow: el.querySelector('.eyebrow')?.textContent?.trim() ?? null,
        title: el.querySelector('h1, .h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        subtitle: el.querySelector('.hero-copy p:not(.eyebrow)')?.textContent?.trim() ?? null,
        src: img?.getAttribute('src') ?? null,
        alt: img?.getAttribute('alt') ?? null,
        objectPosition: img ? getComputedStyle(img).objectPosition : null,
        loaded: img ? img.complete && img.naturalWidth > 0 : false,
        buttons: [...el.querySelectorAll('.hero-ctas a')].map((a) => ({
          label: a.textContent.trim(),
          href: a.getAttribute('href'),
        })),
      }
    })
  })

await page.goto(`${SITE}/th`, { waitUntil: 'networkidle2' })
await page.waitForSelector('.hero-slide', { timeout: 15000 }).catch(() => {})
await new Promise((r) => setTimeout(r, 1200))

const rendered = await readSlides()
check('the carousel rendered', Array.isArray(rendered), String(rendered))
check(
  'it shows exactly what the admin published',
  rendered?.length === expected.length,
  `page ${rendered?.length} vs api ${expected.length}`,
)

for (const [i, want] of expected.entries()) {
  const got = rendered?.[i]
  if (!got) {
    check(`slide ${i + 1} is there`, false)
    continue
  }
  const title = `${want.titleA} ${want.titleB ?? ''}`.replace(/\s+/g, ' ').trim()
  check(`slide ${i + 1} shows its headline`, got.title === title, `${got.title} vs ${title}`)
  check(`slide ${i + 1} shows its sentence`, got.subtitle === want.subtitle)
  check(
    `slide ${i + 1} points its picture at the API, not the store`,
    got.src?.startsWith('/api/v1/media/'),
    String(got.src),
  )
  check(`slide ${i + 1} actually loaded its picture`, got.loaded === true)
  check(`slide ${i + 1} describes its picture`, got.alt === want.imageAlt, String(got.alt))
  check(
    `slide ${i + 1} crops to the focal point the admin set`,
    got.objectPosition === `${want.focalX}% ${want.focalY}%`,
    `${got.objectPosition} vs ${want.focalX}% ${want.focalY}%`,
  )

  const wantButtons = [
    want.ctaLabel ? { label: want.ctaLabel, href: want.ctaHref } : null,
    want.cta2Label ? { label: want.cta2Label, href: want.cta2Href } : null,
  ].filter(Boolean)
  check(
    `slide ${i + 1} has ${wantButtons.length} button(s), pointing where it says`,
    got.buttons.length === wantButtons.length &&
      got.buttons.every((b, n) => b.label === wantButtons[n].label && b.href === wantButtons[n].href),
    JSON.stringify(got.buttons),
  )
}

await page.screenshot({ path: `${SHOTS}/fe-hero-first.png` })

/* ---- the controls ---- */

const dots = await page.evaluate(() => document.querySelectorAll('.hero-dot').length)
check('there is a dot per slide', dots === expected.length, String(dots))

await page.evaluate(() => document.querySelectorAll('.hero-dot')[2]?.click())
await new Promise((r) => setTimeout(r, 900))
const third = await page.evaluate(() =>
  document.querySelector('.hero-slide.is-active h1, .hero-slide.is-active .h1')?.textContent?.replace(/\s+/g, ' ').trim(),
)
check(
  'clicking the third dot moves to the third slide',
  third === `${expected[2]?.titleA} ${expected[2]?.titleB ?? ''}`.replace(/\s+/g, ' ').trim(),
  String(third),
)
await page.screenshot({ path: `${SHOTS}/fe-hero-third.png` })

/* ---- the carousel follows what each language actually has ---- */

/**
 * A band with nothing in it is the failure worth catching, and the test used
 * to catch it by assuming English had no slides. English has had its own
 * slides since they were translated, so the assumption went stale and the
 * check failed on correct behaviour. Asked of the API per language instead:
 * slides means a carousel, none means none, whichever language that is.
 */
for (const locale of ['en', 'jp', 'vn']) {
  const slides = (await (await fetch(`${API}/api/v1/hero-slides/public?locale=${locale}`)).json())
    .data
  await page.goto(`${SITE}/${locale}`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 1800))
  const drawn = await page.evaluate(() => document.querySelectorAll('.hero-slide').length)
  check(
    `${locale}: the carousel shows the ${slides.length} slide(s) published for it`,
    drawn === slides.length,
    `api ${slides.length}, page ${drawn}`,
  )
}
await page.screenshot({ path: `${SHOTS}/fe-hero-en.png` })

if (problems.length) console.log('\nproblems:', problems)
await browser.close()

console.log(`\n  ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
