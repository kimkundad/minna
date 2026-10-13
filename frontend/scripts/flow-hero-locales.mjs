/**
 * The home slideshow, in all four languages.
 *
 *   node scripts/flow-hero-locales.mjs [baseUrl]
 *
 * The slideshow is stored per language, so a language with none opens on an
 * empty hero — which is what `/en`, `/jp` and `/vn` did. The checks are that
 * every language has slides, that each is in its own language rather than
 * falling back to Thai, and that the buttons on them stay inside that
 * language instead of dropping somebody into a different one.
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

/**
 * A script a language is written in, for telling a real translation from a
 * fallback.
 *
 * Both Chinese entries are Han, so this cannot tell \u7b80\u4f53 from \u7e41\u9ad4 \u2014 the API
 * check above does that by returning each language's own rows. Indonesian is
 * Latin like English, for the same reason.
 */
const SCRIPT = {
  th: /[\u0E00-\u0E7F]/,
  jp: /[\u3040-\u30ff\u4e00-\u9fff]/,
  vn: /[\u0102\u0103\u01a0\u01a1\u01af\u01b0\u1ea0-\u1ef9]/,
  en: /^[\x20-\x7e]+$/,
  id: /^[\x20-\x7e]+$/,
  zh: /[\u4e00-\u9fff]/,
  ko: /[\uac00-\ud7af]/,
  tw: /[\u4e00-\u9fff]/,
}

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

try {
  for (const locale of ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw']) {
    const api = await (await fetch(`${API}/hero-slides/public?locale=${locale}`)).json()
    check(`${locale}: the API has slides`, api.data.length > 0, `${api.data.length}`)

    const written = api.data.every((s) => SCRIPT[locale].test(s.titleA))
    check(`  written in ${locale}, not left in another language`, written, api.data[0]?.titleA)

    // A button that leaves the language is how somebody ends up reading Thai
    // after clicking an English slide.
    const strays = api.data
      .flatMap((s) => [s.ctaHref, s.cta2Href])
      .filter(Boolean)
      .filter((href) => href.startsWith('/') && !href.startsWith(`/${locale}/`))
    check('  and its buttons stay in it', strays.length === 0, strays.join(' '))

    const page = await browser.newPage()
    await page.setViewport({ width: 1366, height: 820 })
    await page.goto(`${BASE}/${locale}`, { waitUntil: 'networkidle2' })
    await wait(2200)

    const onScreen = await page.evaluate(() => {
      const hero = document.querySelector('.hero, [class*="hero"]')
      return {
        found: Boolean(hero),
        text: hero?.innerText.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '',
      }
    })
    check('  and the page draws it', onScreen.found && onScreen.text.length > 0, onScreen.text)
    check(
      '    with the first slide on it',
      onScreen.text.includes(api.data[0].titleA.slice(0, 12)),
      onScreen.text.slice(0, 70),
    )

    await page.screenshot({ path: `${SHOTS}/hero-${locale}.png` })
    await page.close()
  }
} finally {
  await browser.close()
}

console.log(failures ? `\n  ${failures} failing\n` : '\n  all good\n')
process.exit(failures ? 1 : 0)
