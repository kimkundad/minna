/**
 * Merges a batch of translations into the locale files.
 *
 *   node scripts/add-locale.mjs batches/01-chrome.json
 *
 * Four new languages went in at once, and writing four whole 2,071-key files
 * by hand is how keys go missing from one of them without anybody noticing.
 * So translations arrive in batches shaped like `{ locale: { ...keys } }`, and
 * this merges each into its file, deep, leaving everything already there
 * alone.
 *
 * Anything not translated yet is simply absent, and vue-i18n falls back to
 * English for it. That is deliberate: a missing key shows English, which a
 * reader can act on, while a key copied from English into a Korean file looks
 * translated to everybody including us.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = resolve(here, '../src/locales')

const batchPath = process.argv[2]
if (!batchPath) {
  console.error('Usage: node scripts/add-locale.mjs <batch.json>')
  process.exit(1)
}

/** Deep merge, with the incoming value winning only where it is given. */
function merge(into, from) {
  for (const [key, value] of Object.entries(from)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      into[key] = merge(into[key] && typeof into[key] === 'object' ? into[key] : {}, value)
    } else {
      into[key] = value
    }
  }
  return into
}

function count(o) {
  return Object.values(o).reduce((n, v) => n + (v && typeof v === 'object' ? count(v) : 1), 0)
}

const batch = JSON.parse(readFileSync(resolve(process.cwd(), batchPath), 'utf8'))
const english = JSON.parse(readFileSync(resolve(localesDir, 'en.json'), 'utf8'))
const total = count(english)

for (const [locale, messages] of Object.entries(batch)) {
  const file = resolve(localesDir, `${locale}.json`)
  const current = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const merged = merge(current, messages)
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`)
  const have = count(merged)
  console.log(
    `  ${locale}.json  ${have}/${total} keys  (${Math.round((have / total) * 100)}%)`,
  )
}
