import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { isStorageConfigured, scopedPath, signedUrl, storageRoot } from '../../lib/storage'
import { AppError, forbidden, notFound } from '../../lib/errors'

/**
 * A stable address for a picture inside a piece of writing.
 *
 * Everything in the store is private and reached through a signed URL that
 * expires — six hours by default, because the usual case is a lesson video. A
 * picture pasted into an article is the opposite case: the URL is written into
 * the saved HTML and has to work in a year. Signing one at the moment it is
 * inserted would produce an article whose images all break the same afternoon.
 *
 * So the HTML holds this route and nothing else: `/api/v1/media/content/...`.
 * It signs the path when the picture is actually asked for, and redirects. The
 * address in the article never changes, and nothing in the store is ever made
 * public.
 *
 * Open to anyone, which is the point — the article is public. That makes the
 * prefix check the whole of the security: `content/` is the only folder the
 * editors can upload into, and the only one this will serve. A lesson video,
 * somebody's avatar, a course document: all refused here.
 */

/**
 * The one folder served without a signature.
 *
 * Anything outside it stays behind an authenticated, signed URL. Adding to this
 * list means deciding that a whole folder is public, which is a decision, not a
 * configuration change.
 */
const PUBLIC_FOLDER = 'content'

/**
 * How long the signed URL this redirects to lasts: seven days, the most
 * space-kim accepts.
 *
 * A browser keeps the address it was redirected to and asks for it again
 * directly — when a page left open re-renders its pictures, or when its cache
 * revalidates. Any of that after the signature expires is a 403 and a broken
 * picture, so a short lifetime here meant broken images for anyone who kept a
 * tab open for more than an hour.
 *
 * A long one costs nothing: this route is public and its address is permanent,
 * so a signed link copied out of the network tab gives no access that the
 * route itself does not already give to everyone.
 */
const SIGN_TTL = 7 * 24 * 3600

/** Browsers and any CDN in front of this may hold the redirect this long. The
 *  file at a given path never changes — a new upload gets a new name — so this
 *  can be generous. */
const CACHE_SECONDS = 300

export default async function mediaRoutes(app: FastifyInstance) {
  app.get('/media/*', async (req, reply) => {
    if (!isStorageConfigured()) {
      throw new AppError(503, 'storage_unconfigured', 'File storage is not configured.')
    }

    const { '*': raw } = z.object({ '*': z.string().min(1).max(512) }).parse(req.params)

    // Traversal first, before anything is compared: `content/../video/x.mp4`
    // sits under an allowed prefix as a string and is not in that folder at all.
    const path = decodeURIComponent(raw)
    if (path.includes('..') || path.includes('\\') || path.startsWith('/')) {
      throw forbidden('That is not a media path.')
    }

    // Accepts the path with or without the storage root, because the store
    // returns one form and the database holds the other. `scopedPath` settles
    // it, and the check is made on the settled value rather than on what was
    // sent.
    const scoped = scopedPath(path)
    if (!scoped.startsWith(`${storageRoot()}/${PUBLIC_FOLDER}/`)) {
      // Not "forbidden": whether a file exists outside the public folder is not
      // something an anonymous caller should be able to learn.
      throw notFound('No such picture.')
    }

    reply.header('Cache-Control', `public, max-age=${CACHE_SECONDS}`)
    return reply.redirect(signedUrl(scoped, SIGN_TTL), 302)
  })
}
