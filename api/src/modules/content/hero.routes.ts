import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { LOCALES } from '../../db/schema/auth'
import { HERO_LOCALES } from '../../db/schema/content'
import { audit, diff } from '../../lib/audit'
import * as service from './hero.service'

/**
 * The home page slideshow.
 *
 * One route here is public — the one the home page itself calls. Everything
 * else is admin.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })

/** An empty date box means "no limit", which is a null rather than a bad date. */
const nullableDate = z
  .union([z.string().datetime({ offset: true }), z.string().length(0), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null))

const text = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v ? v : null))

const slideBody = z
  .object({
    // A slide belongs to one language, or to all of them.
    locale: z.enum(HERO_LOCALES).default('th'),
    eyebrow: text(120),
    titleA: z.string().trim().min(1, 'The headline cannot be empty.').max(200),
    titleB: text(200),
    subtitle: text(500),
    imagePath: text(512),
    imageAlt: text(255),
    /** Percentages, because the picture is cropped to a different shape on a
     *  phone and on a desktop and the middle is rarely the right answer. */
    focalX: z.coerce.number().int().min(0).max(100).default(50),
    focalY: z.coerce.number().int().min(0).max(100).default(50),
    ctaLabel: text(80),
    ctaHref: text(512),
    cta2Label: text(80),
    cta2Href: text(512),
    status: z.enum(['draft', 'published']).default('draft'),
    sortOrder: z.coerce.number().int().min(0).default(0),
    startsAt: nullableDate,
    endsAt: nullableDate,
  })
  .refine((v) => !v.ctaHref || Boolean(v.ctaLabel), {
    message: 'A button needs words on it.',
    path: ['ctaLabel'],
  })
  .refine((v) => !v.cta2Href || Boolean(v.cta2Label), {
    message: 'A button needs words on it.',
    path: ['cta2Label'],
  })
  .refine((v) => !v.imagePath || Boolean(v.imageAlt), {
    // Not a nicety: the headline is in the picture's half of the layout, and a
    // screen reader that meets an undescribed image there reads out a filename.
    message: 'Describe the picture for anyone who cannot see it.',
    path: ['imageAlt'],
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, {
    message: 'It would finish before it started.',
    path: ['endsAt'],
  })

export default async function heroRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }

  /**
   * What the home page shows. Public, and only ever published slides that are
   * inside their dates — a draft must not reach the browser at all.
   */
  app.get('/hero-slides/public', async (req) => {
    const { locale } = z.object({ locale: z.enum(LOCALES).default('th') }).parse(req.query)
    return { data: await service.published(locale) }
  })

  app.get('/hero-slides', adminOnly, async (req) => {
    const { locale } = z.object({ locale: z.enum(HERO_LOCALES).optional() }).parse(req.query)
    return { data: await service.list(locale) }
  })

  app.get('/hero-slides/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.get(id) }
  })

  app.post('/hero-slides', adminOnly, async (req, reply) => {
    const body = slideBody.parse(req.body)
    const slide = await service.create(body)

    audit(req, {
      action: 'hero_slide.created',
      subjectType: 'hero_slide',
      subjectId: slide.id,
      summary: `${slide.locale} — ${slide.titleA}`,
    })
    return reply.status(201).send({ data: slide })
  })

  app.put('/hero-slides/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = slideBody.parse(req.body)
    const { before, after } = await service.update(id, body)

    audit(req, {
      action:
        before.status !== after.status && after.status === 'published'
          ? 'hero_slide.published'
          : 'hero_slide.updated',
      subjectType: 'hero_slide',
      subjectId: id,
      summary: `${after.locale} — ${after.titleA}`,
      changes: diff(before, after),
    })
    return { data: after }
  })

  app.delete('/hero-slides/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const slide = await service.remove(id)

    audit(req, {
      action: 'hero_slide.deleted',
      subjectType: 'hero_slide',
      subjectId: id,
      summary: `${slide.locale} — ${slide.titleA}`,
    })
    return reply.status(204).send()
  })

  app.put('/hero-slides/order', adminOnly, async (req) => {
    const { locale, ids } = z
      .object({
        locale: z.enum(HERO_LOCALES),
        ids: z.array(z.coerce.number().int().positive()).max(50),
      })
      .parse(req.body)

    const after = await service.reorder(locale, ids)
    audit(req, {
      action: 'hero_slide.reordered',
      subjectType: 'hero_slide',
      summary: `${locale} — ${ids.length} slides`,
    })
    return { data: after }
  })
}
