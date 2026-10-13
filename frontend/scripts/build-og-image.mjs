/**
 * The picture a shared link shows when nothing more specific exists.
 *
 *   node scripts/build-og-image.mjs
 *
 * Writes public/og-default-{th,en,jp,vn}.png at 1200×630, the size every one
 * of these services crops to. Drawn here rather than exported from a design
 * tool so that changing the wording is an edit to this file and a re-run, and
 * so the colours come from the same palette as the site.
 *
 * One per language, because the home page, the catalog and the about page do
 * render in all four — a link to /en that previews in Thai shows the wrong
 * page to the person deciding whether to open it.
 *
 * Course and article cards are not translated and should not be: each is
 * written in one language, and a translated share card would promise a
 * translated page that does not exist.
 *
 * These are static assets, not uploads: they belong to the build, they are
 * the same for everybody, and addressing them as plain URLs saves the share
 * card depending on a signature that expires.
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './browser.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../public')

const CARDS = {
  th: {
    lang: 'th',
    headline: 'เรียนภาษาออนไลน์<br>กับครูเจ้าของภาษา',
    sub: 'ญี่ปุ่น · อังกฤษ · จีน · เวียดนาม · เยอรมัน',
  },
  en: {
    lang: 'en',
    headline: 'Learn a language online,<br>with native teachers',
    sub: 'Japanese · English · Chinese · Vietnamese · German',
  },
  jp: {
    lang: 'ja',
    headline: 'ネイティブ講師と<br>学ぶオンライン語学',
    sub: '日本語 · 英語 · 中国語 · ベトナム語 · ドイツ語',
  },
  vn: {
    lang: 'vi',
    headline: 'Học ngoại ngữ trực tuyến<br>cùng giáo viên bản ngữ',
    sub: 'Tiếng Nhật · Anh · Trung · Việt · Đức',
  },
}

const html = (card) => `<!doctype html>
<html lang="${card.lang}">
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    font-family: 'IBM Plex Sans Thai', 'Noto Sans JP', system-ui, sans-serif;
    background: linear-gradient(135deg, #00C2D6 0%, #0B8FA6 55%, #18272A 100%);
    color: #fff;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 86px;
    position: relative; overflow: hidden;
  }
  /* A hint of depth, so the card does not read as a flat block of colour in
     a feed full of photographs. */
  .glow {
    position: absolute; width: 760px; height: 760px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 68%);
    top: -280px; right: -200px;
  }
  .mark {
    font-size: 21px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase;
    opacity: .88; margin-bottom: 26px;
  }
  h1 { font-size: 64px; font-weight: 700; line-height: 1.24; max-width: 17ch; }
  p { margin-top: 26px; font-size: 28px; line-height: 1.5; opacity: .93; max-width: 36ch; }
  .rule { margin-top: 38px; width: 108px; height: 7px; border-radius: 99px; background: #FFD68A; }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="mark">Minna No Nihongo</div>
  <h1>${card.headline}</h1>
  <p>${card.sub}</p>
  <div class="rule"></div>
</body>
</html>`

const browser = await launchBrowser()
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
  mkdirSync(outDir, { recursive: true })

  for (const [locale, card] of Object.entries(CARDS)) {
    // 'domcontentloaded', not 'networkidle0': the stylesheet is the same on
    // every card, so after the first one there is no network to go idle and
    // the wait simply runs out. The fonts are waited for directly instead,
    // which is the thing that actually has to finish.
    await page.setContent(html(card), { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => document.fonts.ready)
    await new Promise((r) => setTimeout(r, 250))
    const out = resolve(outDir, `og-default-${locale}.png`)
    await page.screenshot({ path: out })
    console.log(`wrote ${out}`)
  }
} finally {
  await browser.close()
}
