import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { journeySections, journeySteps } from '../../db/schema/index'
import { badRequest, notFound } from '../../lib/errors'
import { isIconName } from '../../lib/icon-names'

/**
 * The "how learning works here" band on the home page.
 *
 * A heading and a short run of steps, written per language. It used to be four
 * steps hard-coded into the page in Thai, so seven languages read it in Thai
 * and the school could not change a word without a developer.
 *
 * No `all` language here, unlike the slideshow: every field is a sentence, and
 * one sentence shared across eight languages is a Thai paragraph on the Korean
 * page.
 */

export type SiteLocale = 'th' | 'en' | 'jp' | 'vn' | 'id' | 'zh' | 'ko' | 'tw'

/**
 * Which band at the bottom of the home page.
 *
 * They are the same shape — a heading and a short list of items with an icon
 * each — so one set of tables and one screen serves both. A journey step has a
 * sentence under its title; a call-to-action chip is the title alone.
 */
export type HomeBand = 'journey' | 'cta'

export interface JourneySectionInput {
  eyebrow: string | null
  heading: string
  intro: string | null
  ctaLabel: string | null
  ctaHref: string | null
  status: 'draft' | 'published'
}

export interface JourneyStepInput {
  band: HomeBand
  locale: SiteLocale
  icon: string
  title: string
  text: string | null
  sortOrder?: number
}

/**
 * What the home page shows, or null when there is nothing to show.
 *
 * Null rather than an empty shell: a band with a heading and no steps, or
 * steps under no heading, is worse than no band. The page leaves the section
 * out entirely, which is also what a language nobody has written yet gets —
 * there is no falling back to another language, because that would put Thai
 * sentences on a Korean page.
 */
export async function published(band: HomeBand, locale: SiteLocale) {
  const [section] = await db
    .select({
      eyebrow: journeySections.eyebrow,
      heading: journeySections.heading,
      intro: journeySections.intro,
      ctaLabel: journeySections.ctaLabel,
      ctaHref: journeySections.ctaHref,
    })
    .from(journeySections)
    .where(and(eq(journeySections.band, band), eq(journeySections.locale, locale)))
    .limit(1)

  if (!section) return null

  const [row] = await db
    .select({ status: journeySections.status })
    .from(journeySections)
    .where(and(eq(journeySections.band, band), eq(journeySections.locale, locale)))
    .limit(1)
  if (row?.status !== 'published') return null

  const steps = await stepsFor(band, locale)
  if (!steps.length) return null

  return { ...section, steps }
}

export async function stepsFor(band: HomeBand, locale: SiteLocale) {
  return db
    .select({
      id: journeySteps.id,
      icon: journeySteps.icon,
      title: journeySteps.title,
      text: journeySteps.text,
      sortOrder: journeySteps.sortOrder,
    })
    .from(journeySteps)
    .where(and(eq(journeySteps.band, band), eq(journeySteps.locale, locale)))
    .orderBy(asc(journeySteps.sortOrder), asc(journeySteps.id))
}

/* ---------------- what the admin edits ---------------- */

/** The heading for one language, with its steps. Never null: a language with
 *  nothing written yet opens an empty form rather than an error. */
export async function forAdmin(band: HomeBand, locale: SiteLocale) {
  const [section] = await db
    .select()
    .from(journeySections)
    .where(and(eq(journeySections.band, band), eq(journeySections.locale, locale)))
    .limit(1)

  return {
    section: section ?? {
      locale,
      eyebrow: null,
      heading: '',
      intro: null,
      ctaLabel: null,
      ctaHref: null,
      status: 'draft' as const,
      updatedAt: null,
    },
    steps: await stepsFor(band, locale),
  }
}

/** One row per language, so saving is an upsert rather than a create-or-edit
 *  decision the caller has to make. */
export async function saveSection(band: HomeBand, locale: SiteLocale, body: JourneySectionInput) {
  await db
    .insert(journeySections)
    .values({ band, locale, ...body })
    .onDuplicateKeyUpdate({ set: body })
  return forAdmin(band, locale)
}

function checkIcon(icon: string) {
  if (!isIconName(icon)) {
    throw badRequest(`The site has no icon called “${icon}”.`, { icon: 'Pick an icon from the list.' })
  }
}

export async function createStep(body: JourneyStepInput) {
  checkIcon(body.icon)

  // Added at the end, where somebody adding a step expects it to appear.
  const existing = await stepsFor(body.band, body.locale)
  const sortOrder = body.sortOrder ?? (existing.at(-1)?.sortOrder ?? 0) + 1

  const [{ insertId }] = await db.insert(journeySteps).values({ ...body, sortOrder })
  const [made] = await db.select().from(journeySteps).where(eq(journeySteps.id, insertId)).limit(1)
  return made
}

export async function updateStep(id: number, body: JourneyStepInput) {
  checkIcon(body.icon)

  const [before] = await db.select().from(journeySteps).where(eq(journeySteps.id, id)).limit(1)
  if (!before) throw notFound('That step does not exist.')

  await db.update(journeySteps).set(body).where(eq(journeySteps.id, id))
  const [after] = await db.select().from(journeySteps).where(eq(journeySteps.id, id)).limit(1)
  return { before, after }
}

export async function removeStep(id: number) {
  const [row] = await db.select().from(journeySteps).where(eq(journeySteps.id, id)).limit(1)
  if (!row) throw notFound('That step does not exist.')
  await db.delete(journeySteps).where(eq(journeySteps.id, id))
  return row
}

/**
 * The whole order for one language, not a single move.
 *
 * Moving one step changes the position of several, and sending them one at a
 * time leaves a window where two share a number — which is the window a reader
 * loads the page in.
 */
export async function reorder(band: HomeBand, locale: SiteLocale, ids: number[]) {
  const mine = await stepsFor(band, locale)
  const known = new Set(mine.map((s) => s.id))
  const clean = ids.filter((id) => known.has(id))
  if (clean.length !== mine.length) {
    throw badRequest('That list does not match the steps in this language.')
  }

  for (const [i, id] of clean.entries()) {
    await db
      .update(journeySteps)
      .set({ sortOrder: i + 1 })
      .where(eq(journeySteps.id, id))
  }
  return stepsFor(band, locale)
}

/** Every language that has something written, for the admin's own overview. */
export async function summary(band: HomeBand) {
  const sections = await db
    .select({
      locale: journeySections.locale,
      status: journeySections.status,
      heading: journeySections.heading,
    })
    .from(journeySections)
    .where(eq(journeySections.band, band))

  const steps = await db
    .select({ locale: journeySteps.locale, id: journeySteps.id })
    .from(journeySteps)
    .where(eq(journeySteps.band, band))

  const counted = new Map<string, number>()
  for (const s of steps) counted.set(s.locale, (counted.get(s.locale) ?? 0) + 1)

  return sections.map((s) => ({ ...s, steps: counted.get(s.locale) ?? 0 }))
}

