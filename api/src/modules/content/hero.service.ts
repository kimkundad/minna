import { and, asc, eq, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { heroSlides } from '../../db/schema/index'
import { notFound } from '../../lib/errors'
import { removeOrphanedPath } from '../../lib/media'

/**
 * The slides on the home page.
 *
 * Small enough that there is no paging: a carousel with more than half a dozen
 * slides is one nobody reaches the end of, and a list the admin can see whole
 * is a list they can order by eye.
 */

/** A site language, or every one of them. */
export type HeroLocale = 'th' | 'en' | 'jp' | 'vn' | 'all'
export type SiteLocale = 'th' | 'en' | 'jp' | 'vn'

export interface HeroSlideInput {
  locale: HeroLocale
  eyebrow: string | null
  titleA: string
  titleB: string | null
  subtitle: string | null
  imagePath: string | null
  imageAlt: string | null
  focalX: number
  focalY: number
  ctaLabel: string | null
  ctaHref: string | null
  cta2Label: string | null
  cta2Href: string | null
  status: 'draft' | 'published'
  sortOrder: number
  startsAt: Date | null
  endsAt: Date | null
}

/**
 * Whether the slide would be on the site right now.
 *
 * Separate from `status`, the same way a coupon's is: a slide can be published
 * and still invisible because its dates have not come round or have passed.
 * That difference is what somebody is looking for when they ask why a slide is
 * not showing.
 */
function stateSql() {
  return sql<string>`CASE
    WHEN ${heroSlides.status} = 'draft' THEN 'draft'
    WHEN ${heroSlides.endsAt} IS NOT NULL AND ${heroSlides.endsAt} < NOW() THEN 'finished'
    WHEN ${heroSlides.startsAt} IS NOT NULL AND ${heroSlides.startsAt} > NOW() THEN 'scheduled'
    ELSE 'live'
  END`
}

const columns = {
  id: heroSlides.id,
  locale: heroSlides.locale,
  eyebrow: heroSlides.eyebrow,
  titleA: heroSlides.titleA,
  titleB: heroSlides.titleB,
  subtitle: heroSlides.subtitle,
  imagePath: heroSlides.imagePath,
  imageAlt: heroSlides.imageAlt,
  focalX: heroSlides.focalX,
  focalY: heroSlides.focalY,
  ctaLabel: heroSlides.ctaLabel,
  ctaHref: heroSlides.ctaHref,
  cta2Label: heroSlides.cta2Label,
  cta2Href: heroSlides.cta2Href,
  status: heroSlides.status,
  sortOrder: heroSlides.sortOrder,
  startsAt: heroSlides.startsAt,
  endsAt: heroSlides.endsAt,
  createdAt: heroSlides.createdAt,
  updatedAt: heroSlides.updatedAt,
}

export async function list(locale?: HeroLocale) {
  return db
    .select({ ...columns, state: stateSql() })
    .from(heroSlides)
    .where(locale ? eq(heroSlides.locale, locale) : undefined)
    .orderBy(asc(heroSlides.locale), asc(heroSlides.sortOrder), asc(heroSlides.id))
}

export async function get(id: number) {
  const [row] = await db
    .select({ ...columns, state: stateSql() })
    .from(heroSlides)
    .where(eq(heroSlides.id, id))
    .limit(1)
  if (!row) throw notFound('That slide does not exist.')
  return row
}

export async function create(input: HeroSlideInput) {
  const [res] = await db.insert(heroSlides).values(input)
  return get(Number(res.insertId))
}

export async function update(id: number, input: HeroSlideInput) {
  const before = await get(id)
  await db.update(heroSlides).set(input).where(eq(heroSlides.id, id))
  const after = await get(id)

  // Changing the picture leaves the old one in the store with nothing pointing
  // at it, exactly as editing an article does.
  await removeOrphanedPath(before.imagePath, after.imagePath)
  return { before, after }
}

export async function remove(id: number) {
  const slide = await get(id)
  await db.delete(heroSlides).where(eq(heroSlides.id, id))
  await removeOrphanedPath(slide.imagePath, null)
  return slide
}

/**
 * Puts the slides of one language in the given order.
 *
 * Takes the whole list rather than a move: dragging one slide changes the
 * position of several, and sending them one at a time would leave the order
 * briefly wrong if a request were lost.
 */
export async function reorder(locale: HeroLocale, ids: number[]) {
  const existing = await db
    .select({ id: heroSlides.id })
    .from(heroSlides)
    .where(eq(heroSlides.locale, locale))
  const known = new Set(existing.map((r) => r.id))

  let position = 0
  for (const id of ids) {
    // Silently skipping an unknown id rather than failing: the alternative is
    // a reorder that half-applies because somebody deleted a slide in another
    // tab a second ago.
    if (!known.has(id)) continue
    position += 1
    await db.update(heroSlides).set({ sortOrder: position }).where(eq(heroSlides.id, id))
  }
  return list(locale)
}

/**
 * What the public site shows, for one language.
 *
 * Published, inside its dates, in order. Nothing here is filtered in the
 * browser — a draft slide must never reach it at all.
 */
export async function published(locale: SiteLocale) {
  return db
    .select({
      id: heroSlides.id,
      eyebrow: heroSlides.eyebrow,
      titleA: heroSlides.titleA,
      titleB: heroSlides.titleB,
      subtitle: heroSlides.subtitle,
      imagePath: heroSlides.imagePath,
      imageAlt: heroSlides.imageAlt,
      focalX: heroSlides.focalX,
      focalY: heroSlides.focalY,
      ctaLabel: heroSlides.ctaLabel,
      ctaHref: heroSlides.ctaHref,
      cta2Label: heroSlides.cta2Label,
      cta2Href: heroSlides.cta2Href,
    })
    .from(heroSlides)
    .where(
      and(
        // This language, plus the ones written for every language. They sort
        // together by `sortOrder`, so a slide meant for everybody can sit
        // anywhere in the run rather than being stuck at one end.
        or(eq(heroSlides.locale, locale), eq(heroSlides.locale, 'all')),
        eq(heroSlides.status, 'published'),
        sql`(${heroSlides.startsAt} IS NULL OR ${heroSlides.startsAt} <= NOW())`,
        sql`(${heroSlides.endsAt} IS NULL OR ${heroSlides.endsAt} >= NOW())`,
      ),
    )
    .orderBy(asc(heroSlides.sortOrder), asc(heroSlides.id))
}
