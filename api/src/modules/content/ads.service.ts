import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { ads } from '../../db/schema/index'
import type { AD_LOCALES, AD_PLACEMENTS } from '../../db/schema/content'
import { notFound } from '../../lib/errors'
import { removeOrphanedPath } from '../../lib/media'

/**
 * Advertising.
 *
 * A placement is a box on the site, and a campaign buys one of them between
 * two dates. Several campaigns may hold the same placement at once, in which
 * case the page gets one of them at random — which is what "rotation" means
 * here, and why the choice is made on the server: the browser is sent the one
 * advertisement it is showing, not every advertiser's artwork.
 */

export type AdPlacement = (typeof AD_PLACEMENTS)[number]
export type AdLocale = (typeof AD_LOCALES)[number]

export interface AdInput {
  name: string
  placement: AdPlacement
  advertiser: string | null
  href: string
  imageDesktopPath: string | null
  imageMobilePath: string | null
  imageAlt: string | null
  locale: AdLocale
  status: 'draft' | 'published'
  startsAt: Date | null
  endsAt: Date | null
  sortOrder: number
}

/* ---------------- what a reader is shown ---------------- */

/**
 * Live now: published, inside its dates, and for this reader's language.
 *
 * An open end means no end — a campaign with no `endsAt` runs until somebody
 * stops it, which is how an open-ended sponsorship is sold.
 */
function liveClause(placement: AdPlacement, locale: AdLocale | undefined) {
  const now = new Date()
  return and(
    eq(ads.placement, placement),
    eq(ads.status, 'published'),
    or(sql`${ads.startsAt} IS NULL`, sql`${ads.startsAt} <= ${now}`),
    or(sql`${ads.endsAt} IS NULL`, sql`${ads.endsAt} >= ${now}`),
    locale && locale !== 'all'
      ? or(eq(ads.locale, locale), eq(ads.locale, 'all'))
      : undefined,
  )
}

const PUBLIC_COLUMNS = {
  id: ads.id,
  placement: ads.placement,
  href: ads.href,
  imageDesktopPath: ads.imageDesktopPath,
  imageMobilePath: ads.imageMobilePath,
  imageAlt: ads.imageAlt,
} as const

/**
 * One advertisement per placement asked for, or none where nothing is sold.
 *
 * `RAND()` rather than a counter: a counter would need a write on every page
 * view, and over any real number of views a random pick spreads impressions
 * evenly enough for what this is. `sortOrder` breaks nothing — it only decides
 * which campaign wins when the school wants one to.
 */
export async function liveAds(placements: AdPlacement[], locale?: AdLocale) {
  const out: Record<string, unknown | null> = {}

  for (const placement of placements) {
    const [row] = await db
      .select(PUBLIC_COLUMNS)
      .from(ads)
      .where(liveClause(placement, locale))
      .orderBy(asc(ads.sortOrder), sql`RAND()`)
      .limit(1)
    out[placement] = row ?? null
  }

  return out
}

/* ---------------- the admin's side ---------------- */

export async function listAds(opts: {
  page: number
  perPage: number
  placement?: AdPlacement | undefined
  status?: 'draft' | 'published' | undefined
  q?: string | undefined
}) {
  const term = `%${opts.q ?? ''}%`
  const where = [
    opts.placement ? eq(ads.placement, opts.placement) : undefined,
    opts.status ? eq(ads.status, opts.status) : undefined,
    opts.q ? sql`(${ads.name} LIKE ${term} OR ${ads.advertiser} LIKE ${term})` : undefined,
  ].filter(Boolean)
  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(ads)
    .where(filter)

  const rows = await db
    .select()
    .from(ads)
    .where(filter)
    .orderBy(asc(ads.placement), asc(ads.sortOrder), desc(ads.id))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows,
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
    },
  }
}

export async function getAd(id: number) {
  const [row] = await db.select().from(ads).where(eq(ads.id, id)).limit(1)
  if (!row) throw notFound('That advertisement does not exist.')
  return row
}

export async function createAd(input: AdInput) {
  const [res] = await db.insert(ads).values(input)
  return getAd(Number(res.insertId))
}

export async function updateAd(id: number, input: AdInput) {
  const before = await getAd(id)
  await db.update(ads).set(input).where(eq(ads.id, id))
  const after = await getAd(id)

  // After the write, never before: the question is what still points at a
  // picture, and the answer has to come from what is now stored.
  await removeOrphanedPath(before.imageDesktopPath, after.imageDesktopPath)
  await removeOrphanedPath(before.imageMobilePath, after.imageMobilePath)

  return { before, after }
}

export async function deleteAd(id: number) {
  const row = await getAd(id)
  await db.delete(ads).where(eq(ads.id, id))
  await removeOrphanedPath(row.imageDesktopPath, null)
  await removeOrphanedPath(row.imageMobilePath, null)
  return row
}

/** How many campaigns are live in each placement right now. What the admin
 *  list shows at the top, so an unsold box is visible as unsold. */
export async function placementCounts() {
  const now = new Date()
  const rows = await db
    .select({ placement: ads.placement, n: sql<number>`COUNT(*)` })
    .from(ads)
    .where(
      and(
        eq(ads.status, 'published'),
        or(sql`${ads.startsAt} IS NULL`, sql`${ads.startsAt} <= ${now}`),
        or(sql`${ads.endsAt} IS NULL`, sql`${ads.endsAt} >= ${now}`),
      ),
    )
    .groupBy(ads.placement)

  const out: Record<string, number> = {}
  for (const r of rows) out[r.placement] = Number(r.n)
  return out
}

