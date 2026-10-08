import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { LOCALES } from '../../db/schema/auth'
import { audit, diff } from '../../lib/audit'
import * as service from './content.service'
import { queryBool } from '../../lib/query'

/**
 * The site's own content.
 *
 * Articles and testimonials are written here and read by the public site.
 * Enquiries and subscribers arrive from the public site and are read here —
 * their public ends do not exist yet, so for now those two tables only fill up
 * when something else puts a row in them.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })
const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
})

const postBody = z.object({
  title: z.string().trim().min(1, 'Give it a title.').max(255),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9฀-๿-]+$/, 'Lower-case letters, numbers and dashes only.'),
  excerpt: z.string().trim().max(500).nullish(),
  coverPath: z.string().trim().max(512).nullish(),
  contentHtml: z.string().max(200000).nullish(),
  contentLocale: z.enum(LOCALES).default('th'),
  status: z.enum(['draft', 'published']).default('draft'),
})

const testimonialBody = z.object({
  name: z.string().trim().min(1, 'Who said it?').max(150),
  designation: z.string().trim().max(150).nullish(),
  content: z.string().trim().min(1, 'What did they say?').max(2000),
  rating: z.coerce.number().int().min(1).max(5).default(5),
  avatarPath: z.string().trim().max(512).nullish(),
  status: z.enum(['draft', 'published']).default('published'),
  sortOrder: z.coerce.number().int().min(0).default(0),
})

export default async function contentRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }

  /* ---------------- articles ---------------- */

  app.get('/posts', adminOnly, async (req) => {
    const query = paging
      .extend({
        status: z.enum(['draft', 'published']).optional(),
        locale: z.enum(LOCALES).optional(),
        q: z.string().max(100).optional(),
      })
      .parse(req.query)
    return service.listPosts(query)
  })

  app.get('/posts/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.getPost(id) }
  })

  app.post('/posts', adminOnly, async (req, reply) => {
    const body = postBody.parse(req.body)
    const post = await service.createPost(
      {
        ...body,
        excerpt: body.excerpt ?? null,
        coverPath: body.coverPath ?? null,
        contentHtml: body.contentHtml ?? null,
      },
      req.user.sub,
    )

    audit(req, {
      action: 'post.created',
      subjectType: 'post',
      subjectId: post.id,
      summary: post.title,
    })
    return reply.status(201).send({ data: post })
  })

  app.put('/posts/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = postBody.parse(req.body)
    const { before, after } = await service.updatePost(id, {
      ...body,
      excerpt: body.excerpt ?? null,
      coverPath: body.coverPath ?? null,
      contentHtml: body.contentHtml ?? null,
    })

    audit(req, {
      action: before.status !== after.status && after.status === 'published'
        ? 'post.published'
        : 'post.updated',
      subjectType: 'post',
      subjectId: id,
      summary: after.title,
      // The body is thousands of characters and useless in a log line; the
      // fields somebody would ask about are the rest.
      changes: diff({ ...before, contentHtml: null }, { ...after, contentHtml: null }),
    })
    return { data: after }
  })

  app.delete('/posts/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const post = await service.deletePost(id)

    audit(req, {
      action: 'post.deleted',
      subjectType: 'post',
      subjectId: id,
      summary: post.title,
    })
    return reply.status(204).send()
  })

  /* ---------------- testimonials ---------------- */

  app.get('/testimonials', adminOnly, async (req) => {
    const query = paging
      .extend({
        status: z.enum(['draft', 'published']).optional(),
        q: z.string().max(100).optional(),
      })
      .parse(req.query)
    return service.listTestimonials(query)
  })

  app.post('/testimonials', adminOnly, async (req, reply) => {
    const body = testimonialBody.parse(req.body)
    const row = await service.createTestimonial({
      ...body,
      designation: body.designation ?? null,
      avatarPath: body.avatarPath ?? null,
    })

    audit(req, {
      action: 'testimonial.created',
      subjectType: 'testimonial',
      subjectId: row.id,
      summary: row.name,
    })
    return reply.status(201).send({ data: row })
  })

  app.put('/testimonials/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = testimonialBody.parse(req.body)
    const { before, after } = await service.updateTestimonial(id, {
      ...body,
      designation: body.designation ?? null,
      avatarPath: body.avatarPath ?? null,
    })

    audit(req, {
      action: 'testimonial.updated',
      subjectType: 'testimonial',
      subjectId: id,
      summary: after.name,
      changes: diff(before, after),
    })
    return { data: after }
  })

  app.delete('/testimonials/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const row = await service.deleteTestimonial(id)

    audit(req, {
      action: 'testimonial.deleted',
      subjectType: 'testimonial',
      subjectId: id,
      summary: row.name,
    })
    return reply.status(204).send()
  })

  /* ---------------- enquiries ---------------- */

  app.get('/contact-messages', adminOnly, async (req) => {
    const query = paging
      .extend({
        unreadOnly: queryBool,
        q: z.string().max(100).optional(),
      })
      .parse(req.query)
    return service.listMessages(query)
  })

  app.post('/contact-messages/:id/read', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const { read } = z.object({ read: z.boolean().default(true) }).parse(req.body ?? {})
    const row = await service.setMessageRead(id, read)

    // Not audited: marking a message read is housekeeping, and a log full of it
    // is a log nobody reads.
    return { data: row }
  })

  app.delete('/contact-messages/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const row = await service.deleteMessage(id)

    audit(req, {
      action: 'enquiry.deleted',
      subjectType: 'contact_message',
      subjectId: id,
      summary: `${row.name} — ${row.subject}`,
    })
    return reply.status(204).send()
  })

  /* ---------------- subscribers ---------------- */

  app.get('/subscribers', adminOnly, async (req) => {
    const query = paging
      .extend({
        state: z.enum(['confirmed', 'pending', 'unsubscribed']).optional(),
        q: z.string().max(100).optional(),
      })
      .parse(req.query)
    return service.listSubscribers(query)
  })

  app.post('/subscribers/:id/unsubscribe', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const row = await service.unsubscribe(id)

    audit(req, {
      action: 'subscriber.unsubscribed',
      subjectType: 'subscriber',
      subjectId: id,
      summary: row.email,
    })
    return { data: row }
  })

  /**
   * The confirmed addresses, as a file.
   *
   * Plain text rather than a mailing integration: whoever sends the newsletter
   * uses their own tool, and a list they can paste is more use than an
   * integration with whichever one was fashionable when this was written.
   */
  app.get('/subscribers/export', adminOnly, async (req, reply) => {
    const emails = await service.exportSubscribers()

    audit(req, {
      action: 'subscriber.exported',
      subjectType: 'subscriber',
      summary: `${emails.length} addresses`,
    })

    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="subscribers.txt"')
      .send(emails.join('\n'))
  })
}
