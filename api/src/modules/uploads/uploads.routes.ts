import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env'
import { audit } from '../../lib/audit'
import { forbidden } from '../../lib/errors'
import {
  createUploadTicket,
  isStorageConfigured,
  scopedPath,
  signedUrl,
  storageRoot,
} from '../../lib/storage'
import { AppError } from '../../lib/errors'
import { schoolMonth } from '../../lib/time'
import { assertMayRead as assertMayChat } from '../chat/chat.service'
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
  /**
   * A course's cover picture and its free sample are marketing: they have to
   * load for somebody who has not signed in and may never buy. So they go into
   * `content/`, the one folder served without a signature, rather than beside
   * the lessons.
   *
   * The lesson videos below stay where they are. The split is by what the file
   * is for, not by which course it belongs to — a sample is published, a lesson
   * is the thing being sold.
   */
  'course-thumbnail': {
    folder: (id: number) => `content/courses/${id}`,
    maxSize: 8 * 1024 * 1024,
    ttl: 600,
  },
  'course-sample': {
    folder: (id: number) => `content/courses/${id}`,
    maxSize: 2 * 1024 * 1024 * 1024,
    ttl: 3600,
  },
  'course-video': { folder: (id: number) => `courses/${id}/video`, maxSize: 8 * 1024 * 1024 * 1024, ttl: 3600 },
  'course-document': { folder: (id: number) => `courses/${id}/docs`, maxSize: 200 * 1024 * 1024, ttl: 1800 },
  /**
   * A picture or a file sent in a staff conversation.
   *
   * Outside `content/`, so it is not reachable by guessing a URL. The only
   * way to it is through the thread it was sent to, which is where being in
   * the conversation is checked.
   */
  'chat-file': { folder: (id: number) => `chat/${id}`, maxSize: 25 * 1024 * 1024, ttl: 900 },
  /**
   * A teacher's photo is their account avatar: one person, one picture.
   *
   * Under `content/`, the one folder served without a signature, because an
   * avatar is already shown to other people — beside a question in a course
   * thread, and on a teacher's public page, which has no reader to sign a URL
   * for. Filed outside it, as it was, nothing could display it at all: the
   * media route serves `content/` and nothing else, so every avatar was a 404
   * waiting for somebody to upload one.
   */
  'avatar': { folder: (id: number) => `content/avatars/${id}`, maxSize: 4 * 1024 * 1024, ttl: 600 },
  /**
   * A picture dropped into an article or a course description.
   *
   * Filed by month rather than by whatever it belongs to, because the writing
   * it sits in may not exist yet — a new article has no id until it is saved,
   * and the picture goes in while it is being written.
   *
   * `content/` is the one folder served without a signature, through
   * `media.routes.ts`. Nothing else may be uploaded into it.
   */
  /**
   * The school's own logo, for the public site and the admin alike.
   *
   * One folder for every version of it rather than a fixed filename: the store
   * gives each upload its own name, so the old logo stays reachable and a
   * browser holding the previous one in cache is not shown the new one at the
   * same address.
   */
  'site-logo': {
    folder: () => 'content/site',
    maxSize: 2 * 1024 * 1024,
    ttl: 600,
  },
  'content-image': {
    folder: () => `content/${schoolMonth().replace('-', '/')}`,
    maxSize: 8 * 1024 * 1024,
    ttl: 600,
  },

  /**
   * A national ID card or passport, uploaded so that the school can check the
   * person it pays is the person it agreed to pay.
   *
   * Deliberately NOT under `content/`. That folder is served without a
   * signature, so a file in it is readable by anyone who learns the address —
   * which, for an identity document, is the worst thing this system could
   * leak. It goes beside the lesson videos, where reading needs a signed link
   * the API issues per request, and the route below only issues one to the
   * owner or to an administrator.
   *
   * The folder is the owner's user id and the route pins it to whoever is
   * asking, so a ticket cannot be aimed at somebody else's.
   */
  'identity-document': {
    folder: (id: number) => `identity/${id}`,
    maxSize: 12 * 1024 * 1024,
    ttl: 600,
  },

  /**
   * A CV, sent with an application to teach.
   *
   * Not under `content/`: it is somebody's work history, handed over by a
   * person who does not work here and may never be offered the chance. The
   * only people who should ever read it are the ones deciding, and they get a
   * signed link that expires.
   *
   * Uploaded by the applicant themselves, moments after their account is made
   * — registering returns a token, so the form has one by the time the file
   * goes up. Nobody else may write into the folder.
   */
  'application-resume': {
    folder: (id: number) => `applications/${id}`,
    maxSize: 10 * 1024 * 1024,
    ttl: 600,
  },

  /**
   * A clip of the applicant teaching.
   *
   * Beside the CV, in the same private folder, and deleted the moment the
   * application is decided — the only file here with an end date, because it
   * is a hundred megabytes of somebody's face and voice and the question it
   * answers is answered once.
   *
   * The longer ticket is for the size: a hundred megabytes over a phone
   * connection outlasts the ten minutes the smaller files get.
   */
  'application-video': {
    folder: (id: number) => `applications/${id}`,
    maxSize: 100 * 1024 * 1024,
    ttl: 3600,
  },

  /**
   * A teacher's CV, replaced after they joined.
   *
   * Into `identity/<their id>`, beside their ID document: the same person's
   * private papers, in the same private place, readable only through a signed
   * link. Not `applications/`, because that folder holds what they sent when
   * applying and that record is not theirs — or anyone's — to overwrite.
   */
  'teacher-resume': {
    folder: (id: number) => `identity/${id}`,
    maxSize: 10 * 1024 * 1024,
    ttl: 600,
  },
} as const

const ticketBody = z.object({
  purpose: z.enum([
    'course-thumbnail',
    'course-sample',
    'course-video',
    'course-document',
    'chat-file',
    'avatar',
    'content-image',
    'site-logo',
    'identity-document',
    'application-resume',
    'application-video',
    'teacher-resume',
  ]),
  /** The course the file belongs to. Ignored for an avatar. */
  courseId: z.coerce.number().int().positive().optional(),
  /** Which conversation a chat attachment belongs to. */
  threadId: z.coerce.number().int().positive().optional(),
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
  /**
   * Everything here is staff work except two things: a member's own photo,
   * and a file into a conversation they are part of.
   *
   * So the route authenticates rather than gating on a role, and the first
   * thing it does is turn away anyone who is not staff asking for anything
   * else. A member uploading their picture writes into `avatars/<their own
   * id>`; one uploading into a chat writes into that thread's folder and no
   * other, which the thread itself is asked about further down.
   */
  const signedIn = { preHandler: app.authenticate }

  app.post('/uploads/ticket', signedIn, async (req, reply) => {
    if (!isStorageConfigured()) {
      throw new AppError(503, 'storage_unconfigured', 'File storage is not configured.')
    }

    const body = ticketBody.parse(req.body)
    const rule = PURPOSES[body.purpose]
    const isAdmin = req.user.roles.includes('admin')
    const isStaff = isAdmin || req.user.roles.includes('teacher')

    // Two things a member may send: their own photo, and a file into a
    // conversation they are in. The second is not waved through here — it is
    // checked below against the thread itself, which is the only thing that
    // knows whose conversation it is.
    // An applicant to teach is a student at this moment — the role is granted
    // only if they are approved — so the CV they are asked for has to be
    // uploadable by somebody who is not staff yet.
    if (
      !isStaff &&
      body.purpose !== 'avatar' &&
      body.purpose !== 'chat-file' &&
      body.purpose !== 'application-resume' &&
      body.purpose !== 'application-video'
    ) {
      throw forbidden(
        'You may only upload your own photo, a file into your own conversation, or a CV with an application to teach.',
      )
    }
    if (!isStaff && body.userId && body.userId !== req.user.sub) {
      throw forbidden('Only an administrator can set the photo of another account.')
    }

    let subjectId = body.userId ?? req.user.sub
    if (body.purpose === 'avatar' && body.userId && body.userId !== req.user.sub && !isAdmin) {
      throw forbidden('Only an administrator can set the photo of another account.')
    }
    // Neither an avatar nor a content picture belongs to a course, so neither
    // needs one named. A content picture is filed by month.
    // A teacher may upload into their own courses; the thing at the top of
    // every page on the site is not one of them.
    if (body.purpose === 'site-logo' && !isAdmin) {
      throw forbidden('Only an administrator can change the logo.')
    }

    // A chat attachment belongs to a conversation, and the right to write
    // into its folder is the right to be in it — the same check the thread
    // itself makes, asked here because a ticket is write access.
    if (body.purpose === 'chat-file') {
      if (!body.threadId) {
        throw new AppError(422, 'validation_failed', 'A conversation is required for this upload.', {
          threadId: 'Required.',
        })
      }
      await assertMayChat({ id: req.user.sub, roles: req.user.roles }, body.threadId)
      subjectId = body.threadId
    }

    /**
     * An identity document is your own, unless an administrator is helping.
     *
     * `subjectId` above defaults to `body.userId`, which anybody may send.
     * Left alone, a teacher could aim a ticket at another teacher's folder —
     * write access to the one place in this system holding scans of people's
     * ID cards. So a teacher always gets their own, whatever they asked for.
     *
     * An administrator may upload for somebody else, because somebody has to:
     * teachers send photos by message, and some will never get the form to
     * work. The record keeps whose upload it was, and the screen shows it, so
     * a document supplied from the same desk that typed the bank details is
     * something a second person can see.
     */
    if (body.purpose === 'identity-document' || body.purpose === 'teacher-resume') {
      subjectId = isAdmin && body.userId ? body.userId : req.user.sub
    }

    // Always your own, whoever asks. Nobody sends a CV on another person's
    // behalf, and an administrator has no reason to: the only moment this is
    // uploaded is while somebody is applying.
    if (body.purpose === 'application-resume' || body.purpose === 'application-video') {
      subjectId = req.user.sub
    }

    if (
      body.purpose !== 'avatar' &&
      body.purpose !== 'content-image' &&
      body.purpose !== 'site-logo' &&
      body.purpose !== 'chat-file' &&
      body.purpose !== 'identity-document' &&
      body.purpose !== 'application-resume' &&
      body.purpose !== 'application-video' &&
      body.purpose !== 'teacher-resume'
    ) {
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
   * rather than stored.
   *
   * An admin may sign anything. A teacher may sign only what belongs to a
   * course they teach, plus the public folder — being staff used to be the
   * whole of the check, which meant a teacher who guessed at
   * `courses/<id>/video/...` could watch somebody else's lesson. Signing is
   * the last door on private storage; it cannot be looser than the course it
   * leads into.
   */
  app.post('/uploads/sign', signedIn, async (req) => {
    const body = signBody.parse(req.body)
    const isAdmin = req.user.roles.includes('admin')
    if (!isAdmin && !req.user.roles.includes('teacher')) {
      throw forbidden('You do not have access to this.')
    }

    if (!isAdmin) {
      const scoped = scopedPath(body.path)
      if (scoped.includes('..') || scoped.includes('\\')) {
        throw forbidden('That is not a path in our store.')
      }

      // Your own identity document, and nobody else's. Matched on the whole
      // folder segment so that `identity/12` cannot be reached by a teacher
      // whose id is 1 — a prefix test would have let it.
      const ownIdentity = `${storageRoot()}/identity/${req.user.sub}/`
      const isOwnIdentity = scoped.startsWith(ownIdentity)

      // `<root>/courses/<id>/…` is the only other private shape a teacher may
      // reach, and only for one of their own.
      const owned = /\/courses\/(\d+)\//.exec(scoped)
      const isPublic = scoped.startsWith(`${storageRoot()}/content/`)
      if (!isPublic && !isOwnIdentity) {
        if (scoped.includes(`${storageRoot()}/identity/`)) {
          throw forbidden('That identity document is not yours.')
        }
        if (!owned) throw forbidden('That file does not belong to a course you teach.')
        if (!(await isCourseInstructor(Number(owned[1]), req.user.sub))) {
          throw forbidden('You are not an instructor on that course.')
        }
      }
    }

    /**
     * Who looked at somebody's passport, and when.
     *
     * The rest of private storage is course material — a lesson video read by
     * an administrator is unremarkable. An identity document is not: it is
     * there because a person was asked to prove who they are, and the least
     * owed to them is that every time it is opened leaves a trace.
     */
    if (scopedPath(body.path).includes(`${storageRoot()}/identity/`) && isAdmin) {
      audit(req, {
        action: 'identity_document.viewed',
        subjectType: 'user',
        summary: scopedPath(body.path),
      })
    }

    return { data: { url: signedUrl(body.path, body.ttl) } }
  })
}
