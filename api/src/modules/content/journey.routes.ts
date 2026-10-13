import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { LOCALES } from '../../db/schema/auth'
import { audit, diff } from '../../lib/audit'
import { HOME_BANDS } from '../../db/schema/content'
import { ICON_NAMES } from '../../lib/icon-names'
import * as service from './journey.service'

/**
 * The "how learning works here" band on the home page.
 *
 * One route is public — the one the home page calls. The rest is admin, and
 * every write names the language it is about, because the same screen edits
 * eight of them and an audit entry that does not say which is no use at all.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })
/**
 * Which band. The journey by default, so an older caller that names no band
 * still asks about the one that existed when it was written.
 */
const bandQuery = z.object({ band: z.enum(HOME_BANDS).default('journey') })
const localeParam = z.object({ band: z.enum(HOME_BANDS), locale: z.enum(LOCALES) })

const text = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v ? v : null))

const sectionBody = z.object({
  eyebrow: text(120),
  heading: z.string().trim().min(1, 'The heading cannot be empty.').max(200),
  intro: text(2000),
  ctaLabel: text(80),
  ctaHref: text(512),
  status: z.enum(['draft', 'published']).default('draft'),
})

const stepBody = z.object({
  band: z.enum(HOME_BANDS).default('journey'),
  locale: z.enum(LOCALES),
  /**
   * Checked against the site's own icon set rather than taken as free text.
   *
   * A name outside it is not an error on the page — it draws an empty circle,
   * which reads as a broken design rather than a typo in a form, and that is
   * how categories went months with blank glyphs.
   */
  icon: z.enum(ICON_NAMES, { errorMap: () => ({ message: 'Pick an icon from the list.' }) }),
  title: z.string().trim().min(1, 'The step needs a title.').max(200),
  text: text(1000),
})

export default async function journeyRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }

  /* ---------------- what the home page reads ---------------- */

  app.get('/journey/public', async (req) => {
    const { band, locale } = z
      .object({ band: z.enum(HOME_BANDS).default('journey'), locale: z.enum(LOCALES).default('th') })
      .parse(req.query)
    return { data: await service.published(band, locale) }
  })

  /** The icons an administrator may choose from, so the picker cannot offer
   *  one the site will not draw. */
  app.get('/journey/icons', async () => ({ data: ICON_NAMES }))

  /* ---------------- what the admin edits ---------------- */

  app.get('/journey', adminOnly, async (req) => {
    const { band, locale } = z
      .object({ band: z.enum(HOME_BANDS).default('journey'), locale: z.enum(LOCALES).default('th') })
      .parse(req.query)
    return { data: await service.forAdmin(band, locale) }
  })

  app.get('/journey/summary', adminOnly, async (req) => {
    const { band } = bandQuery.parse(req.query)
    return { data: await service.summary(band) }
  })

  app.put('/journey/:band/:locale', adminOnly, async (req) => {
    const { band, locale } = localeParam.parse(req.params)
    const body = sectionBody.parse(req.body)
    const before = await service.forAdmin(band, locale)
    const after = await service.saveSection(band, locale, body)

    audit(req, {
      action: 'journey.section.saved',
      subjectType: 'journey',
      summary: `${band} · ${locale} — ${body.heading}`,
      changes: diff(before.section as never, body as never),
    })
    return { data: after }
  })

  app.post('/journey/steps', adminOnly, async (req, reply) => {
    const body = stepBody.parse(req.body)
    const made = await service.createStep(body)

    audit(req, {
      action: 'journey.step.created',
      subjectType: 'journey',
      subjectId: made?.id,
      summary: `${body.band} · ${body.locale} — ${body.title}`,
    })
    reply.code(201)
    return { data: made }
  })

  app.put('/journey/steps/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = stepBody.parse(req.body)
    const { before, after } = await service.updateStep(id, body)

    audit(req, {
      action: 'journey.step.updated',
      subjectType: 'journey',
      subjectId: id,
      summary: `${body.band} · ${body.locale} — ${body.title}`,
      changes: diff(before as never, body as never),
    })
    return { data: after }
  })

  app.delete('/journey/steps/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const gone = await service.removeStep(id)

    audit(req, {
      action: 'journey.step.deleted',
      subjectType: 'journey',
      subjectId: id,
      summary: `${gone.band} · ${gone.locale} — ${gone.title}`,
    })
    reply.code(204)
  })

  /** The whole order for one language, not a single move: shifting one step
   *  changes where several sit. */
  app.put('/journey/steps/order', adminOnly, async (req) => {
    const { band, locale, ids } = z
      .object({
        band: z.enum(HOME_BANDS).default('journey'),
        locale: z.enum(LOCALES),
        ids: z.array(z.coerce.number().int().positive()),
      })
      .parse(req.body)
    return { data: await service.reorder(band, locale, ids) }
  })
}
