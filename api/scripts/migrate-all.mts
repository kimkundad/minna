/**
 * Runs every schema script, in order, against whatever DATABASE_URL points at.
 *
 *   npx tsx scripts/migrate-all.mts              # the .env database
 *   npx tsx scripts/migrate-all.mts --dry-run    # just say what would run
 *
 * Against production, from a developer's machine:
 *
 *   DATABASE_URL="mysql://...@db-....ondigitalocean.com:25060/minna" \
 *   DATABASE_SSL=true DATABASE_SSL_CA=./certs/ca-certificate.crt \
 *   npx tsx scripts/migrate-all.mts
 *
 * `drizzle-kit push` cannot run against this database at all — DigitalOcean's
 * MySQL sets `sql_require_primary_key = ON` and refuses the tables it
 * generates — so each change is a hand-written script instead. Every one of
 * them checks before it acts, so running the whole set is safe whether the
 * database is empty, half-built or already current. That is the point: there
 * is no record anywhere of which have run, and this way none is needed.
 *
 * Order matters only where one script's table references another's. They are
 * listed oldest first, which is that order.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Listed by hand rather than globbed. A glob would run in whatever order the
 * filesystem answers in, and would silently pick up a half-finished script
 * somebody left in the folder.
 */
const SCRIPTS = [
  'add-post-category.mts',
  'add-post-locale-all.mts',
  'add-ads-table.mts',
  'add-notifications-table.mts',
  'add-consents-table.mts',
  'add-earnings-table.mts',
  'add-chat-tables.mts',
  'add-student-chat.mts',
  'add-category-translations.mts',
  'add-course-review.mts',
  'add-og-tags.mts',
]

const dryRun = process.argv.includes('--dry-run')

// Where this is pointed, without the password. Running the whole set against
// the wrong database is the mistake worth making hard to make by accident.
const url = process.env.DATABASE_URL ?? ''
const target = url.replace(/\/\/[^@]*@/, '//') || '(from .env)'
console.log(`Database: ${target}`)
console.log(`${SCRIPTS.length} scripts, each safe to run again\n`)

let ran = 0
for (const name of SCRIPTS) {
  const path = join(here, name)
  if (!existsSync(path)) {
    console.log(`  skip  ${name} — not in this checkout`)
    continue
  }
  if (dryRun) {
    console.log(`  would run  ${name}`)
    continue
  }

  process.stdout.write(`  ${name} ... `)
  try {
    const out = execFileSync('npx', ['tsx', path], {
      cwd: join(here, '..'),
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    // Each script says what it did on its last line; that is the useful part.
    const said = out.trim().split('\n').filter((l) => !l.includes('DATABASE_SSL')).pop()
    console.log(said || 'done')
    ran += 1
  } catch (err) {
    console.log('FAILED')
    const e = err as { stdout?: string; stderr?: string }
    console.error(`\n${e.stderr || e.stdout || String(err)}`)
    console.error(`\nStopped at ${name}. Nothing after it ran.`)
    process.exit(1)
  }
}

console.log(dryRun ? '\nDry run — nothing was changed.' : `\n${ran} scripts ran, all clean.`)
