import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { forbidden } from '../../lib/errors'
import { signedUrl, storageRoot } from '../../lib/storage'
import * as service from './chat.service'

/**
 * Chat.
 *
 * A teacher has one conversation, with the school. A learner has one, also
 * with the school. An admin has one per teacher and one per learner who has
 * written. Which of the three you are is decided from the token, never from
 * anything the request carries — there is no `userId` parameter anywhere here.
 *
 * Learners and teachers never reach each other. A learner's question gets to
 * a teacher only when an admin passes it on through `/me/chats/forward`, and
 * what arrives there names nobody.
 *
 * Delivery is Server-Sent Events over this same Fastify, rather than a socket
 * library or a hosted service. The chat only ever pushes one way: sending is
 * an ordinary POST, and a stream is all that is needed to receive. At a few
 * dozen members of staff that is a handful of held connections, which costs
 * nothing a socket server would save — and it rides the authentication,
 * reconnection and reverse proxy that are already there.
 */

const threadParam = z.object({ id: z.coerce.number().int().positive() })

function viewerOf(req: FastifyRequest): service.Viewer {
  return { id: req.user.sub, roles: req.user.roles }
}

/** Keeps a proxy from closing an idle stream, and tells a dead client apart. */
const HEARTBEAT_MS = 25_000
/** How often the stream looks for anything new. */
const POLL_MS = 2_000

export default async function chatRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: app.authenticate }

  /** Everyone signed in has one conversation; what differs is with whom. */
  function assertMay(req: FastifyRequest) {
    if (!service.mayChat(viewerOf(req))) {
      throw forbidden('You do not have access to this.')
    }
  }

  app.get('/me/chats', signedIn, async (req) => {
    assertMay(req)
    return { data: await service.listThreads(viewerOf(req)) }
  })

  app.get('/me/chats/unread-count', signedIn, async (req) => {
    assertMay(req)
    return { data: { unread: await service.unreadTotal(viewerOf(req)) } }
  })

  /**
   * The thread for one teacher, made on first use.
   *
   * An admin names the teacher; a teacher names nobody and gets their own —
   * which is the whole of the rule that a teacher cannot choose who to write
   * to.
   */
  app.post('/me/chats', signedIn, async (req) => {
    assertMay(req)
    const viewer = viewerOf(req)
    const body = z
      .object({ teacherId: z.coerce.number().int().positive().optional() })
      .parse(req.body ?? {})

    if (!service.isStaff(viewer)) {
      return { data: { id: await service.threadFor(viewer.id, service.kindFor(viewer)) } }
    }
    if (!body.teacherId) {
      throw forbidden('Say which teacher the conversation is with.')
    }
    return { data: { id: await service.threadForTeacher(body.teacherId) } }
  })

  /**
   * Passing a learner's question on to a teacher.
   *
   * Staff only, and the API is what makes that true rather than a hidden
   * button: a learner and a teacher never reach each other directly, so the
   * only path between their conversations runs through here.
   */
  app.post('/me/chats/forward', signedIn, async (req, reply) => {
    assertMay(req)
    const body = z
      .object({
        messageId: z.coerce.number().int().positive(),
        teacherId: z.coerce.number().int().positive(),
        /** A line of the admin's own, for context the quote does not carry. */
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body)

    const sent = await service.forward(viewerOf(req), body)
    return reply.status(201).send({ data: sent })
  })

  app.get('/me/chats/:id/messages', signedIn, async (req) => {
    assertMay(req)
    const { id } = threadParam.parse(req.params)
    const query = z
      .object({
        before: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(req.query)
    // Shaped like every other list in this API: the rows under `data`, and
    // anything about the page under `meta`.
    const { rows, hasMore } = await service.messages(viewerOf(req), id, query)
    return { data: rows, meta: { hasMore } }
  })

  app.post('/me/chats/:id/messages', signedIn, async (req, reply) => {
    assertMay(req)
    const { id } = threadParam.parse(req.params)
    const body = z
      .object({
        body: z.string().trim().max(4000).optional(),
        attachmentPath: z.string().trim().max(512).optional(),
        attachmentName: z.string().trim().max(255).optional(),
        attachmentKind: z.enum(['image', 'file']).optional(),
        attachmentSize: z.coerce.number().int().min(0).optional(),
      })
      .parse(req.body)

    // A path is accepted only inside this thread's own folder. Without that,
    // "attach a file" would be a way to make the chat serve any stored path
    // to anybody in any conversation.
    if (body.attachmentPath) {
      const wanted = `${storageRoot()}/chat/${id}/`
      const path = body.attachmentPath.includes(storageRoot())
        ? body.attachmentPath
        : `${storageRoot()}/${body.attachmentPath.replace(/^\/+/, '')}`
      if (path.includes('..') || !path.startsWith(wanted)) {
        throw forbidden('That file does not belong to this conversation.')
      }
    }

    const sent = await service.send(viewerOf(req), id, body)
    return reply.status(201).send({ data: sent })
  })

  app.post('/me/chats/:id/read', signedIn, async (req, reply) => {
    assertMay(req)
    const { id } = threadParam.parse(req.params)
    await service.markRead(viewerOf(req), id)
    return reply.status(204).send()
  })

  /**
   * A short-lived link to one message's attachment.
   *
   * Reached through the thread, so holding the link means having been in the
   * conversation. The file itself lives outside the public folder and has no
   * other way in.
   *
   * The URL comes back as JSON rather than as a 302. A redirect would be
   * tidier to type into `src`, but the access token lives in memory on both
   * clients and an `<img>` carries no Authorization header — so the browser
   * would ask for this unauthenticated and get a 401. Handing back the signed
   * URL lets the image load cross-origin, which needs no header at all.
   */
  app.get('/me/chats/:id/messages/:messageId/file', signedIn, async (req, reply) => {
    assertMay(req)
    const { id } = threadParam.parse(req.params)
    const { messageId } = z
      .object({ messageId: z.coerce.number().int().positive() })
      .parse(req.params)

    const path = await service.attachmentPath(viewerOf(req), id, messageId)
    // Private, so no shared cache may keep it; a browser may, briefly, because
    // the same image is drawn on every scroll past it.
    reply.header('Cache-Control', 'private, max-age=60')
    return { data: { url: signedUrl(path, 300), expiresIn: 300 } }
  })

  /**
   * The live stream for one thread.
   *
   * Polls the table rather than holding a bus in memory. At this size that is
   * one cheap indexed query every couple of seconds per open conversation, and
   * it survives the API restarting mid-conversation — which an in-memory
   * subscriber list does not.
   */
  app.get('/me/chats/:id/stream', signedIn, async (req, reply: FastifyReply) => {
    assertMay(req)
    const { id } = threadParam.parse(req.params)
    const { after } = z
      .object({ after: z.coerce.number().int().min(0).default(0) })
      .parse(req.query)
    const viewer = viewerOf(req)
    await service.assertMayRead(viewer, id)

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // nginx buffers by default, which turns a stream into a long silence
      // followed by everything at once.
      'X-Accel-Buffering': 'no',
    })

    let lastId = after
    let open = true
    const stop = () => {
      open = false
      clearInterval(poll)
      clearInterval(beat)
    }

    const send = (event: string, data: unknown) => {
      if (!open) return
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const poll = setInterval(() => {
      void (async () => {
        if (!open) return
        try {
          const fresh = await service.since(viewer, id, lastId)
          for (const message of fresh) {
            lastId = Math.max(lastId, message.id)
            send('message', message)
          }
        } catch {
          // A thread that has gone, or a database blip. Closing is honest: the
          // client reconnects and finds out properly.
          stop()
          reply.raw.end()
        }
      })()
    }, POLL_MS)

    const beat = setInterval(() => send('ping', Date.now()), HEARTBEAT_MS)

    req.raw.on('close', stop)
    reply.raw.on('close', stop)

    // Tells the client where it is starting from, so a reconnect that misses
    // nothing can be told apart from one that has catching up to do.
    send('open', { threadId: id, after: lastId })
  })
}
