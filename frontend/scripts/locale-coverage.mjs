/**
 * Reports, per top-level section, how many keys each locale has against en.json,
 * and names any key a locale has that English does not — which is how a typo in
 * a batch file shows up as a key nobody will ever read.
 *
 *   node scripts/locale-coverage.mjs            all sections
 *   node scripts/locale-coverage.mjs auth       one section
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/locales')
const load = (l) => JSON.parse(readFileSync(resolve(dir, `${l}.json`), 'utf8'))

function flatten(o, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(o)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, path, out)
    else out.add(path)
  }
  return out
}

const only = process.argv[2]
const en = flatten(load('en'))
const sections = [...new Set([...en].map((k) => k.split('.')[0]))].sort()
const locales = ['th', 'jp', 'vn', 'id', 'zh', 'ko', 'tw']

const keep = (k) => (only ? k.split('.')[0] === only : true)
const enKeep = [...en].filter(keep)

for (const locale of locales) {
  const have = flatten(load(locale))
  const mine = [...have].filter(keep)
  const extra = mine.filter((k) => !en.has(k))
  const pct = Math.round((mine.filter((k) => en.has(k)).length / enKeep.length) * 100)
  console.log(`\n${locale}.json  ${mine.length}/${enKeep.length}  (${pct}%)`)
  if (extra.length) console.log(`  NOT IN ENGLISH: ${extra.join(', ')}`)
  if (!only) {
    for (const s of sections) {
      const a = enKeep.filter((k) => k.split('.')[0] === s).length
      const b = mine.filter((k) => k.split('.')[0] === s && en.has(k)).length
      if (b < a) console.log(`  ${s.padEnd(10)} ${b}/${a}`)
    }
  } else {
    const missing = enKeep.filter((k) => !have.has(k))
    if (missing.length) console.log(`  missing: ${missing.join(', ')}`)
  }
}
