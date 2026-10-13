/**
 * Fills in translations, one batch at a time.
 *
 *   node scripts/apply-translations.mjs <batch.json>
 *
 * The batch is `{ "jp": { "a.b.c": "…" }, "vn": { … } }`, keyed by the dotted
 * path the app reads.
 *
 * Only writes a key whose value still matches the English one. Anything
 * already translated — by hand, or by an earlier batch — wins, so running a
 * batch twice cannot undo somebody's correction. Keys that no longer exist are
 * reported rather than created: a path that has drifted is a mistake in the
 * batch, not a new string.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const batchPath = process.argv[2]
if (!batchPath) {
  console.error('usage: node scripts/apply-translations.mjs <batch.json>')
  process.exit(1)
}

const batch = JSON.parse(readFileSync(batchPath, 'utf8'))
const english = JSON.parse(readFileSync('src/locales/en.json', 'utf8'))

const at = (tree, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), tree)

function set(tree, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  let node = tree
  for (const k of keys) {
    if (node[k] === undefined || typeof node[k] !== 'object') return false
    node = node[k]
  }
  if (node[last] === undefined) return false
  node[last] = value
  return true
}

for (const [lang, entries] of Object.entries(batch)) {
  const file = `src/locales/${lang}.json`
  const raw = readFileSync(file, 'utf8')
  const crlf = raw.includes('\r\n')
  const tree = JSON.parse(raw)

  let written = 0
  const missing = []
  const kept = []

  for (const [path, value] of Object.entries(entries)) {
    const current = at(tree, path)
    if (current === undefined) {
      missing.push(path)
      continue
    }
    // Already somebody's work. Leave it.
    if (current !== at(english, path)) {
      kept.push(path)
      continue
    }
    if (set(tree, path, value)) written += 1
  }

  const text = JSON.stringify(tree, null, 2) + '\n'
  writeFileSync(file, crlf ? text.split('\n').join('\r\n') : text)

  console.log(`${lang}: ${written} written${kept.length ? `, ${kept.length} already done` : ''}`)
  if (missing.length) {
    console.log(`  ${missing.length} not in the file: ${missing.slice(0, 5).join(', ')}`)
  }
}
