import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AD_LOCALES, AD_PLACEMENTS } from '../../db/schema/content'
import { audit, diff } from '../../lib/audit'
import * as service from './ads.service'

/**
 * Advertising.
 *
 * One public read, which every reserved box on the site calls to find out what
 * it is showing. Everything else is the school selling and scheduling.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })

/** A campaign's dates arrive as `YYYY-MM-DD` from a date input, or empty. */
const when = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), 'That is not a date.')

const adBody = z.object({
  name: z.string().trim().min(1, 'Give the campaign a name.').max(150),
  placement: z.enum(AD_PLACEMENTS),
  advertiser: z.string().trim().max(150).nullish(),
  /** Where the click goes. Absolute, because an advertiser is off this site. */
  href: z
    .string()
    .trim()
    .min(1, 'Where should the advertisement link to?')
    .max(512)
    .refine((v) => /^https?:\/\//i.test(v), 'Start the link with http:// or https://'),
  imageDesktopPath: z.string().trim().max(512).nullish(),
  imageMobilePath: z.string().trim().max(512).nullish(),
  imageAlt: z.string().trim().max(255).nullish(),
  locale: z.enum(AD_LOCALES).default('all'),
  status: z.enum(['draft', 'published']).default('draft'),
  startsAt: when,
  endsAt: when,
  sortOrder: z.coerce.number().int().min(0).default(0),
})

export default async function adRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }

  /* ---------------- what the site asks for ---------------- */

  /**
   * One advertisement per placement, or null where nothing is sold.
   *
   * Takes several placements at once because a page has more than one box and
   * should not make a request each. Unauthenticated: this is what every
   * visitor's page calls.
   */
  app.get('/ads/public', async (req) => {
    const query = z
      .object({
        placements: z
          .string()
          .min(1)
          .transform((v) =>
            v
              .split(',')
              .map((s) => s.trim())
              .filter((s): s is (typeof AD_PLACEMENTS)[number] =>
                (AD_PLACEMENTS as readonly string[]).includes(s),
              ),
          ),
        locale: z.enum(AD_LOCALES).optional(),
      })
      .parse(req.query)

    return { data: await service.liveAds(query.placements, query.locale) }
  })

  /* ---------------- selling and scheduling ---------------- */

  app.get('/ads', adminOnly, async (req) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(20),
        placement: z.enum(AD_PLACEMENTS).optional(),
        status: z.enum(['draft', 'published']).optional(),
        q: z.string().max(100).optional(),
      })
      .parse(req.query)

    const page = await service.listAds(query)
    // Alongside the list, so an unsold box is visible as unsold rather than
    // only visible as an absence.
    return { ...page, live: await service.placementCounts() }
  })

  app.get('/ads/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.getAd(id) }
  })

  app.post('/ads', adminOnly, async (req, reply) => {
    const body = adBody.parse(req.body)
    const ad = await service.createAd({
      ...body,
      advertiser: body.advertiser ?? null,
      imageDesktopPath: body.imageDesktopPath ?? null,
      imageMobilePath: body.imageMobilePath ?? null,
      imageAlt: body.imageAlt ?? null,
    })

    audit(req, {
      action: 'ad.created',
      subjectType: 'ad',
      subjectId: ad.id,
      summary: `${ad.placement} · ${ad.name}`,
    })
    return reply.status(201).send({ data: ad })
  })

  app.put('/ads/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = adBody.parse(req.body)
    const { before, after } = await service.updateAd(id, {
      ...body,
      advertiser: body.advertiser ?? null,
      imageDesktopPath: body.imageDesktopPath ?? null,
      imageMobilePath: body.imageMobilePath ?? null,
      imageAlt: body.imageAlt ?? null,
    })

    audit(req, {
      action: before.status !== after.status ? `ad.${after.status}` : 'ad.updated',
      subjectType: 'ad',
      subjectId: id,
      summary: `${after.placement} · ${after.name}`,
      changes: diff(before, after),
    })
    return { data: after }
  })

  app.delete('/ads/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const removed = await service.deleteAd(id)

    audit(req, {
      action: 'ad.deleted',
      subjectType: 'ad',
      subjectId: id,
      summary: `${removed.placement} · ${removed.name}`,
    })
    return reply.status(204).send()
  })
}
