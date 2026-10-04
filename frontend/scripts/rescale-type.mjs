/**
 * Rescales the prototype's type for Noto Sans Thai.
 *
 * Every font-size in the READ VPN CSS was set for DB Heavent, whose Thai
 * consonants are only 0.42em tall — the design doc records sizes being pushed
 * up by 1.3x to 1.375x to compensate, and line-heights pulled down to 0.85x to
 * close the gaps that opened up. Noto Sans Thai is a normally proportioned
 * face, so both compensations have to come back off or every block of text
 * overflows its box.
 *
 *   node scripts/rescale-type.mjs [--dry]
 *
 * Idempotent: it writes a marker comment into each file and skips any file that
 * already carries it.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CSS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'css')
const MARKER = '/* type rescaled for Noto Sans Thai */'
const DRY = process.argv.includes('--dry')

/**
 * The prototype used a sliding factor: 1.375x for small text, easing to 1.3x
 * at display sizes. Undoing it uses the same split, keyed on the result so the
 * boundary lands in the same place.
 */
function rescale(px) {
  const divisor = px / 1.3 >= 30 ? 1.3 : 1.375
  // Round to the nearest half pixel, as the original scale did.
  return Math.round((px / divisor) * 2) / 2
}

/** Line-heights were multiplied by 0.85, floored at 1.15. Undo and give Thai
 *  tone marks room: they stack above and below the baseline. */
function rescaleLineHeight(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0 || n > 3) return null
  return Math.round(Math.min(n / 0.85, 2) * 100) / 100
}

let filesChanged = 0
let sizesChanged = 0
let heightsChanged = 0

for (const file of readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'))) {
  const path = join(CSS_DIR, file)
  const original = readFileSync(path, 'utf8')

  if (original.includes(MARKER)) {
    console.log(`  skip  ${file} (already rescaled)`)
    continue
  }

  // `font-size: 22px` in rules, and `--fs-body: 22px` in tokens.css, which
  // holds the whole scale and would otherwise be missed.
  let out = original.replace(/(font-size|--fs-[\w-]+):\s*([0-9.]+)px/g, (match, prop, raw) => {
    const px = Number(raw)
    if (!Number.isFinite(px)) return match
    const next = rescale(px)
    if (next === px) return match
    sizesChanged++
    return `${prop}: ${next}px`
  })

  out = out.replace(/(line-height|--lh-[\w-]+):\s*([0-9.]+)\s*(;|})/g, (match, prop, raw, tail) => {
    const next = rescaleLineHeight(raw)
    if (next === null || next === Number(raw)) return match
    heightsChanged++
    return `${prop}: ${next}${tail}`
  })

  if (out === original) continue

  filesChanged++
  if (!DRY) writeFileSync(path, `${MARKER}\n${out}`, 'utf8')
  console.log(`  ${DRY ? 'would edit' : 'edited'}  ${file}`)
}

console.log(
  `\n${filesChanged} files, ${sizesChanged} font-size values, ${heightsChanged} line-height values`,
)
if (DRY) console.log('(dry run, nothing written)')
