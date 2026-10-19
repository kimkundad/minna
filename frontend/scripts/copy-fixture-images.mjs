/**
 * Copies the reference project's course and instructor photos into public/, so
 * the fixture data's literal `assets/img/...` paths resolve while we are still
 * rendering from it.
 *
 * They are not committed: 11MB of another project's photography does not belong
 * in this repository, and all of it goes away once courses come from the API.
 * Run this after cloning, or whenever the pages show generated art instead of
 * photos.
 *
 *   npm run fixtures:images
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, '..', '_design-ref', 'assets', 'img')
const to = join(root, 'public', 'assets', 'img')

if (!existsSync(from)) {
  console.error(`Reference images not found at ${from}.`)
  console.error('Clone them from https://github.com/ideavivat/Frontend-Readvpn.git into _design-ref/.')
  process.exit(1)
}

mkdirSync(to, { recursive: true })

/**
 * The portraits are not copied.
 *
 * They are photographs of veterinary surgeons, and one of them reached a
 * student: the learning room drew `data.memberPhoto` in place of the signed-in
 * member's own avatar, so everybody studying Japanese was shown the same
 * stranger's face. The fixture data no longer carries a path to any of them,
 * and copying them back would only wait for somebody to use one again.
 */
const PORTRAITS = /^doctor-(female|male)-\d+-square\.(png|jpe?g|webp)$/i

let copied = 0
let skipped = 0
for (const name of readdirSync(from)) {
  if (!/\.(png|jpe?g|svg|webp)$/i.test(name)) continue
  if (PORTRAITS.test(name)) {
    skipped++
    continue
  }
  cpSync(join(from, name), join(to, name))
  copied++
}

console.log(
  `Copied ${copied} fixture images into public/assets/img` +
    (skipped ? `, leaving ${skipped} portraits behind.` : '.'),
)
