import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env'
import { audit } from '../../lib/audit'
import { forbidden } from '../../lib/errors'
import { createUploadTicket, isStorageConfigured, signedUrl, storageRoot } from '../../lib/storage'
import { AppError } from '../../lib/errors'
import { isCourseInstructor } from '../catalog/catalog.service'

/**
 * Upload tickets.
 *
 * The bytes never pass through this API. A ticket is a short-lived permission
 * to write into one folder, and the browser uploads straight to the store with
 * it — a course video is measured in gigabytes, and routing that through here
 * would tie up a Node process for the whole upload and cap the size at whatever
 * the body limit is.
 *
 * A ticket is therefore a capability, so it is issued as narrowly as the job
 * allows: one folder, one size limit, and minutes rather than hours. The
 * purpose decides all three — the client asks for "a course video", not for
 * "write access to minna/courses/12".
 */

/** What each kind of upload may do. Sizes are bytes. */
const PURPOSES = {
  'course-thumbnail': { folder: (id: number) => `courses/${id}`, maxSize: 8 * 1024 * 1024, ttl: 600 },
  'course-video': { folder: (id: number) => `courses/${id}/video`, maxSize: 8 * 1024 * 1024 * 1024, ttl: 3600 },
  'course-document': { folder: (id: number) => `courses/${id}/docs`, maxSize: 200 * 1024 * 1024, ttl: 1800 },
  // A teacher's photo is their account avatar: one person, one picture.
  'avatar': { folder: (id: number) => `avatars/${id}`, maxSize: 4 * 1024 * 1024, ttl: 600 },
} as const

const ticketBody = z.object({
  purpose: z.enum(['course-thumbnail', 'course-video', 'course-document', 'avatar']),
  /** The course the file belongs to. Ignored for an avatar. */
  courseId: z.coerce.number().int().positive().optional(),
  /** Whose avatar, when an admin is setting it for somebody else. */
  userId: z.coerce.number().int().positive().optional(),
})

const signBody = z.object({
  path: z.string().min(1).max(512),
  /** Seconds. Capped by the service at seven days. */
  ttl: z.coerce.number().int().min(60).max(604800).optional(),
})

export default async function uploadRoutes(app: FastifyInstance) {
  const staffOnly = { preHandler: app.requireRole('admin', 'teacher') }

  app.post('/uploads/ticket', staffOnly, async (req, reply) => {
    if (!isStorageConfigured()) {
      throw new AppError(503, 'storage_unconfigured', 'File storage is not configured.')
    }

    const body = ticketBody.parse(req.body)
    const rule = PURPOSES[body.purpose]
    const isAdmin = req.user.roles.includes('admin')

    let subjectId = body.userId ?? req.user.sub
    if (body.purpose === 'avatar' && body.userId && body.userId !== req.user.sub && !isAdmin) {
      throw forbidden('Only an administrator can set the photo of another account.')
    }
    if (body.purpose !== 'avatar') {
      if (!body.courseId) {
        throw new AppError(422, 'validation_failed', 'A course is required for this upload.', {
          courseId: 'Required.',
        })
      }
      // The same ownership rule as editing the course. A ticket is write
      // access, so it cannot be looser than the thing it writes to.
      if (!isAdmin && !(await isCourseInstructor(body.courseId, req.user.sub))) {
        throw forbidden('You are not an instructor on this course.')
      }
      subjectId = body.courseId
    }

    const folder = `${storageRoot()}/${rule.folder(subjectId)}`
    const issued = await createUploadTicket({
      folder,
      maxSize: rule.maxSize,
      expiresIn: rule.ttl,
    })

    audit(req, {
      action: 'upload.ticket_issued',
      subjectType: body.purpose === 'avatar' ? 'user' : 'course',
      subjectId,
      summary: body.purpose,
    })

    return reply.status(201).send({
      data: {
        ...issued,
        // The browser uploads to the store directly, so it needs to know where
        // that is; it is not the same origin as this API.
        baseUrl: env.SPACE_BASE_URL,
        folder,
        maxSize: rule.maxSize,
      },
    })
  })

  /**
   * A URL for a stored path, valid for a while.
   *
   * Paths are what the database holds; a URL expires, so it is made on demand
   * rather than stored. Staff only: an endpoint that signs any path for anyone
   * would undo the point of private storage.
   */
  app.post('/uploads/sign', staffOnly, async (req) => {
    const body = signBody.parse(req.body)
    return { data: { url: signedUrl(body.path, body.ttl) } }
  })
}
