import { sql } from 'drizzle-orm'
import { db } from '../db/client'
import { ads, courses, heroSlides, posts } from '../db/schema/index'
import { deleteFile, isStorageConfigured, scopedPath } from './storage'

/**
 * Clearing up pictures nothing points at any more.
 *
 * A picture dropped into an article is uploaded the moment it is inserted, so
 * the store fills up with files whether or not the writing is ever saved —
 * someone who adds a photograph, changes their mind and deletes the paragraph
 * leaves it behind, and so does deleting the article.
 *
 * Run after writing, never before: the question is "does anything still point
 * at this", and the answer has to be taken from what is now stored.
 *
 * Nothing here throws. A file left in the store costs a few kilobytes; a save
 * that fails because a cleanup did is a lost article.
 */

/**
 * Everywhere a picture can be referenced from.
 *
 * Add a column here when something new starts pointing at `content/`. Forget
 * to, and that thing's pictures get deleted the next time anything else is
 * saved — the sweep asks "does anything still point at this", and a column it
 * does not know about answers no.
 *
 * It works for prose columns holding `<img src>` and for plain columns holding
 * a bare path, because the test is the same either way: does the stored text
 * contain this path.
 */
const REFERENCING_COLUMNS = [
  { table: 'posts', column: 'content_html' },
  { table: 'courses', column: 'description' },
  // A cover picture and a free sample live in `content/` too, because they
  // have to load for somebody who has not signed in. Leave them out and the
  // next article saved takes them with it.
  { table: 'courses', column: 'thumbnail_path' },
  { table: 'courses', column: 'sample_video_path' },
  { table: 'hero_slides', column: 'image_path' },
  { table: 'ads', column: 'image_desktop_path' },
  { table: 'ads', column: 'image_mobile_path' },
] as const

/** `/api/v1/media/minna/content/2026/10/x.png`, absolute or relative. */
const MEDIA_SRC = /\/api\/v1\/media\/([^\s"'<>)]+)/g

/**
 * The store paths a piece of HTML points at.
 *
 * Only the ones served through the media route. A picture referenced by any
 * other address is not ours to delete.
 */
export function mediaPathsIn(html: string | null | undefined): Set<string> {
  const found = new Set<string>()
  if (!html) return found

  for (const match of html.matchAll(MEDIA_SRC)) {
    const raw = match[1]
    if (!raw) continue
    try {
      // The editor writes it plain, but a path pasted from a browser's address
      // bar arrives percent-encoded.
      const path = decodeURIComponent(raw.split('?')[0] ?? raw)
      if (path.includes('..')) continue
      found.add(scopedPath(path))
    } catch {
      // A malformed escape is not a path worth chasing.
    }
  }
  return found
}

/**
 * MySQL's LIKE treats `_` and `%` as wildcards, and these filenames are full of
 * underscores. Without this a path matches more rows than it should — which
 * only ever reads as "still in use", so it fails safe, but it would leave
 * orphans behind for no reason.
 *
 * No `ESCAPE` clause: backslash is already what LIKE escapes with, and spelling
 * it out means getting a backslash through two layers of quoting to say what
 * MySQL assumes anyway.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Whether anything currently stored still points at this picture. */
async function stillReferenced(path: string): Promise<boolean> {
  const needle = `%${escapeLike(path)}%`

  // A map rather than a ternary chain: a chain ends in a default, so a table
  // added to the list above but forgotten here would quietly query the last
  // one instead — which is a sweep that never finds anything.
  const TABLES = { posts, courses, hero_slides: heroSlides, ads } as const

  for (const { table, column } of REFERENCING_COLUMNS) {
    const source = TABLES[table]
    const [row] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(source)
      .where(sql`${sql.raw(`\`${table}\`.\`${column}\``)} LIKE ${needle}`)
    if (Number(row?.n ?? 0) > 0) return true
  }
  return false
}

/**
 * Deletes the pictures that were in `before` and are in neither `after` nor
 * anywhere else.
 *
 * `after` is null when the thing holding them was deleted outright.
 *
 * The check is made against everything stored, not just against `after`,
 * because the same picture can sit in two articles — somebody copying a
 * paragraph from one to another copies its `<img>` with it, and deleting the
 * first article must not blank the second.
 */
export async function removeOrphanedMedia(
  before: string | null | undefined,
  after: string | null | undefined,
): Promise<string[]> {
  return sweep(mediaPathsIn(before), mediaPathsIn(after))
}

/**
 * The same, for a column that holds one bare store path rather than prose.
 *
 * A hero slide keeps its picture in `image_path`, so replacing the picture
 * orphans the old one exactly as editing an article does — but there is no HTML
 * to read it out of.
 */
export async function removeOrphanedPath(
  before: string | null | undefined,
  after: string | null | undefined,
): Promise<string[]> {
  const was = new Set(before ? [scopedPath(before)] : [])
  const now = new Set(after ? [scopedPath(after)] : [])
  return sweep(was, now)
}

async function sweep(was: Set<string>, now: Set<string>): Promise<string[]> {
  if (!isStorageConfigured()) return []
  if (!was.size) return []

  const candidates = [...was].filter((p) => !now.has(p))
  if (!candidates.length) return []

  const removed: string[] = []
  for (const path of candidates) {
    try {
      if (await stillReferenced(path)) continue
      await deleteFile(path)
      removed.push(path)
    } catch (err) {
      // Logged rather than thrown: the write this follows has already
      // succeeded, and failing now would report it as having failed.
      console.warn(`could not remove orphaned media ${path}:`, err)
    }
  }
  return removed
}
