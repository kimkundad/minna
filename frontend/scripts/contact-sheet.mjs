/**
 * Renders a folder of pictures into one grid and screenshots it.
 *
 *   node scripts/contact-sheet.mjs <folder> <out.png>
 *
 * For looking at a dozen candidates at once rather than opening each — the
 * point being to actually see what is going into the site rather than trusting
 * a filename.
 */
import { readdirSync, writeFileSync } from 'node:fs'
import { launchBrowser } from './browser.mjs'

const [dir, out] = process.argv.slice(2)
if (!dir || !out) {
  console.error('usage: node scripts/contact-sheet.mjs <folder> <out.png>')
  process.exit(1)
}


const files = readdirSync(dir)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))

// Cropped 16:9 the way a course card shows them, so what is judged here is
// what a visitor would see rather than the whole frame.
const cells = files
  .map(
    (f) =>
      `<figure><img src="${f}"><figcaption>${(f.split('-')[0] ?? '').padStart(2, '0')}</figcaption></figure>`,
  )
  .join('')

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; background:#111; font:13px system-ui;
         display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:6px; }
  figure { margin:0; position:relative; }
  img { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; }
  figcaption { position:absolute; top:4px; left:4px; background:#000c; color:#fff;
               padding:2px 8px; border-radius:4px; font-weight:700; }
</style>${cells}`

const page = `${dir.replace(/\\/g, '/')}/_sheet.html`
writeFileSync(page, html)

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
})
const tab = await browser.newPage()
await tab.setViewport({ width: 1200, height: 700 })
await tab.goto(`file:///${page}`, { waitUntil: 'networkidle0' })
await tab.screenshot({ path: out, fullPage: true })
await browser.close()

console.log(`${files.length} pictures -> ${out}`)
