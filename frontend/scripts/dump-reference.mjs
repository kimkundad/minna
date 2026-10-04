/**
 * Dumps the rendered DOM of every reference page.
 *
 * The prototype builds its markup in JavaScript at runtime: the .html files are
 * 33-65 line shells and the real structure comes out of ui.js and pages/*.js,
 * about 6,900 lines of it. Reading that source to work out what the DOM ends up
 * as is slow and easy to get wrong — so don't. Run the page and take the DOM it
 * actually produced.
 *
 * Needs the reference served somewhere (default http://localhost:5180) and a
 * Chromium-family browser on the machine.
 *
 *   node scripts/dump-reference.mjs [baseUrl]
 *
 * Writes one file per page into .reference-dom/, plus a trimmed <main> for each,
 * which is the part worth porting.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] ?? 'http://localhost:5180'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '.reference-dom')

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

const browser = BROWSERS.find((p) => existsSync(p))
if (!browser) {
  console.error('No Chromium-family browser found. Install Edge or Chrome.')
  process.exit(1)
}

/**
 * Each page, with the query the prototype needs to show something real and,
 * where a signed-out visitor would only see a gate, the session to seed first.
 */
const PAGES = [
  ['index', 'index.html'],
  ['courses', 'courses.html'],
  ['course', 'course.html?id=COURSE-001'],
  ['cart', 'cart.html'],
  ['about', 'about.html'],
  ['privacy', 'privacy.html'],
  ['terms', 'terms.html'],
  ['purchase-terms', 'purchase-terms.html'],
  ['design-system', 'design-system.html'],

  // Signed in. Without a session these render a sign-in gate and nothing of
  // what we have to build.
  ['checkout', 'checkout.html?items=COURSE-006', 'paid'],
  ['checkout-success', 'checkout-success.html', 'paid'],
  ['learn', 'learn.html?id=COURSE-001', 'paid'],
  ['quiz', 'quiz.html?id=COURSE-008', 'paid'],
  ['result', 'result.html?id=COURSE-003', 'paid'],
  ['account', 'account.html', 'paid'],
  ['account-learning', 'account-learning.html', 'paid'],
  ['account-orders', 'account-orders.html', 'paid'],
  ['account-package', 'account-package.html', 'paid'],
  ['account-profile', 'account-profile.html', 'paid'],

  // A free member, where the empty states live.
  ['account-free', 'account.html', 'free'],
  ['account-learning-free', 'account-learning.html', 'free'],
]

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

/** Pull out <main>, which is all that differs between pages — the header and
 *  footer are already ported components. */
function extractMain(html) {
  const start = html.indexOf('<main')
  if (start < 0) return null
  const end = html.indexOf('</main>', start)
  return end < 0 ? null : html.slice(start, end + 7)
}

let ok = 0
for (const [name, path, state] of PAGES) {
  // Seeding runs on the reference's own origin, which is the only place allowed
  // to write its localStorage, then forwards to the page itself.
  const url = state
    ? `${BASE}/__seed?state=${state}&to=${encodeURIComponent(path)}`
    : `${BASE}/${path}`
  try {
    const html = execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--force-prefers-reduced-motion',
        '--virtual-time-budget=9000',
        '--dump-dom',
        url,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    )

    writeFileSync(join(OUT, `${name}.html`), html, 'utf8')
    const main = extractMain(html)
    if (main) writeFileSync(join(OUT, `${name}.main.html`), main, 'utf8')

    const size = Math.round((main ?? html).length / 1024)
    console.log(`  ${name.padEnd(18)} ${String(size).padStart(4)} KB${main ? '' : '   (no <main>)'}`)
    ok++
  } catch (err) {
    console.log(`  ${name.padEnd(18)} failed — ${(err?.message ?? '').split('\n')[0]}`)
  }
}

console.log(`\n${ok}/${PAGES.length} pages dumped into .reference-dom/`)
console.log('Port from the .main.html files; the full dumps are there for context.')
