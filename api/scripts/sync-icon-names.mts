/**
 * Copies the names of the site's icons into the API.
 *
 *   npx tsx scripts/sync-icon-names.mts
 *
 * `icon` columns hold a name from one fixed set, which lives in the public
 * site (`frontend/src/vendor/icons.js`) because that is the only thing that
 * draws them. A name outside it is not an error anywhere — it renders as an
 * empty circle, which is how categories ended up with blank glyphs for months.
 *
 * Now that an administrator picks icons rather than a script setting them, the
 * API has to be able to refuse a name the site cannot draw. It has no access
 * to the front end's source at run time, so the names are copied here and this
 * keeps the copy honest. Run it whenever the icon set changes; it writes
 * `src/lib/icon-names.ts` and says what moved.
 *
 * Names only. The paths stay where they are drawn.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '../../frontend/src/vendor/icons.js')
const target = resolve(here, '../src/lib/icon-names.ts')
/** The admin draws the icons in its picker, so it needs the paths as well as
 *  the names — from the same read of the same file, so the two cannot drift. */
const adminTarget = resolve(here, '../../backend/src/lib/icon-paths.ts')

if (!existsSync(source)) {
  console.error(`cannot find the icon set at ${source}`)
  process.exit(1)
}

const raw = readFileSync(source, 'utf8')

/**
 * Name → the markup inside the `<svg>`.
 *
 * The paths are single-quoted strings in the source and contain no quotes of
 * their own, so the lazy match to the next quote is exact rather than lucky.
 */
const paths = new Map<string, string>()
for (const m of raw.matchAll(/'([a-z0-9-]+)':\s*'([^']*)'/g)) paths.set(m[1], m[2])

const names = [...paths.keys()].sort()

if (names.length < 20) {
  console.error(`only found ${names.length} icons — the file's shape has probably changed`)
  process.exit(1)
}

/**
 * What the last run wrote, read from the list itself rather than from the
 * whole file — the type annotations below it are quoted words too, and
 * counting those made the report claim `string` had been removed.
 */
const before = existsSync(target)
  ? [
      ...(readFileSync(target, 'utf8').match(/ICON_NAMES = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(
        /'([a-z0-9-]+)'/g,
      ),
    ].map((m) => m[1])
  : []
const added = names.filter((n) => !before.includes(n))
const gone = before.filter((n) => !names.includes(n))

writeFileSync(
  target,
  `/**
 * Every icon the public site can draw, by name.
 *
 * Generated from \`frontend/src/vendor/icons.js\` — do not edit by hand, run
 * \`npx tsx scripts/sync-icon-names.mts\` instead.
 *
 * It is here so the API can refuse an icon name nothing will render: a name
 * outside this set is not an error on the page, it is a blank circle, and a
 * blank circle looks like a bug in the design rather than a typo in a form.
 */
export const ICON_NAMES = [
${names.map((n) => `  '${n}',`).join('\n')}
] as const

export type IconName = (typeof ICON_NAMES)[number]

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && (ICON_NAMES as readonly string[]).includes(value)
}
`,
)

/**
 * And the drawings, for the admin's icon picker.
 *
 * A picker that lists names tells somebody choosing an icon almost nothing —
 * "compass" and "route" and "signal" are all plausible for a step about
 * finding a course, and the only way to tell was to save and look at the site.
 * The admin cannot import the public site's source, so the paths are copied
 * here from the same read, which is why this writes both files at once.
 */
writeFileSync(
  adminTarget,
  `/**
 * Every icon the public site can draw, as the markup inside its \`<svg>\`.
 *
 * Generated from \`frontend/src/vendor/icons.js\` — do not edit by hand, run
 * \`npx tsx scripts/sync-icon-names.mts\` in the api package instead.
 *
 * The admin needs these to show what an icon looks like while somebody is
 * choosing one. The names alone were no help: half a dozen of them are
 * plausible for any given step, and the only way to tell them apart was to
 * save and go and look at the site.
 */
export const ICON_PATHS: Record<string, string> = {
${names.map((n) => `  '${n}': '${paths.get(n)}',`).join('\n')}
}

export const ICON_NAMES = Object.keys(ICON_PATHS)
`,
)

console.log(`${names.length} icon names written to src/lib/icon-names.ts`)
console.log(`${names.length} icon drawings written to backend/src/lib/icon-paths.ts`)
if (added.length) console.log(`  added: ${added.join(', ')}`)
if (gone.length) console.log(`  gone:  ${gone.join(', ')}`)
if (!added.length && !gone.length && before.length) console.log('  unchanged')
process.exit(0)
