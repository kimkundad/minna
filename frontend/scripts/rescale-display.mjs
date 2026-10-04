/**
 * Second type pass: display sizes.
 *
 * rescale-type.mjs matched `font-size: <n>px` and so missed every size written
 * inside clamp() / min() / max(), which is where the design puts its fluid
 * headings. Those are still at the values DB Heavent was set at.
 *
 * It also used one divisor for everything, and one is not enough. DB Heavent is
 * both shorter and narrower than Noto Sans Thai, so matching apparent height
 * and matching line length ask for different numbers:
 *
 *   body text    matching height is what matters; it wraps on its own, and a
 *                width-matched size would be too small to read comfortably.
 *   display text line breaks are part of the composition. A headline the design
 *                sets on one line has to stay on one line, so these match width.
 *
 * Measured, not guessed: Noto Sans Thai sets Thai consonants at 0.570em against
 * DB Heavent's 0.420em, and the reference's one-line hero headline needs 44px
 * of Noto to occupy the width 72px of DB Heavent did.
 *
 *   node scripts/rescale-display.mjs [--dry]
 *
 * Idempotent: writes a marker and skips files that already carry it.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CSS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'css')
const MARKER = '/* display sizes rescaled for Noto Sans Thai */'
const DRY = process.argv.includes('--dry')

/** Total reduction from the original DB Heavent scale for display text. */
const DISPLAY_DIVISOR = 1.6
/** What the first pass already took off a plain px value. */
const PASS_ONE_DIVISOR = 1.3
/** Remainder still owed on values the first pass already touched. */
const REMAINDER = DISPLAY_DIVISOR / PASS_ONE_DIVISOR
/** Below this, a size is body text and the first pass got it right. */
const DISPLAY_FLOOR_PX = 28

const half = (n) => Math.round(n * 2) / 2

let filesChanged = 0
let fluidChanged = 0
let plainChanged = 0

for (const file of readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'))) {
  const path = join(CSS_DIR, file)
  const original = readFileSync(path, 'utf8')

  if (original.includes(MARKER)) {
    console.log(`  skip  ${file} (already rescaled)`)
    continue
  }

  // Sizes inside clamp() / min() / max(), which the first pass never saw. Both
  // the px bounds and the viewport coefficient have to come down together, or
  // the text would simply hit its new ceiling at a different window width.
  let out = original.replace(
    /font-size:\s*(clamp|min|max)\(([^)]*)\)/g,
    (match, fn, args) => {
      if (!/\d(px|vw|cqw|vh|cqi)/.test(args)) return match
      const next = args
        .replace(/(\d+(?:\.\d+)?)px/g, (_, n) => `${half(Number(n) / DISPLAY_DIVISOR)}px`)
        .replace(
          /(\d+(?:\.\d+)?)(vw|cqw|vh|cqi)/g,
          (_, n, unit) => `${(Number(n) / DISPLAY_DIVISOR).toFixed(2)}${unit}`,
        )
      if (next === args) return match
      fluidChanged++
      return `font-size: ${fn}(${next})`
    },
  )

  // Plain px sizes the first pass already divided by 1.3, where that was the
  // right call for body copy but left headings too wide.
  out = out.replace(
    /(font-size|--fs-h[1-6]):\s*(\d+(?:\.\d+)?)px/g,
    (match, prop, raw) => {
      const px = Number(raw)
      if (px < DISPLAY_FLOOR_PX) return match
      const next = half(px / REMAINDER)
      if (next === px) return match
      plainChanged++
      return `${prop}: ${next}px`
    },
  )

  if (out === original) continue

  filesChanged++
  if (!DRY) writeFileSync(path, `${MARKER}\n${out}`, 'utf8')
  console.log(`  ${DRY ? 'would edit' : 'edited'}  ${file}`)
}

console.log(`\n${filesChanged} files, ${fluidChanged} fluid sizes, ${plainChanged} display sizes`)
if (DRY) console.log('(dry run, nothing written)')
