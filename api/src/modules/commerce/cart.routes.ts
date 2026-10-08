import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as service from './cart.service'

/**
 * The basket.
 *
 * Signed-in only, deliberately — see `cart.service.ts`. Everything is keyed by
 * course id rather than by a row id: a basket holds a course at most once, so
 * the course is the handle, and the client never has to remember a row number
 * to remove what it just added.
 */

const courseParam = z.object({ courseId: z.coerce.number().int().positive() })

export default async function cartRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: app.authenticate }

  app.get('/cart', signedIn, async (req) => {
    return { data: await service.getCart(req.user.sub) }
  })

  app.post('/cart/items', signedIn, async (req, reply) => {
    const { courseId } = z
      .object({ courseId: z.coerce.number().int().positive() })
      .parse(req.body)
    await service.addToCart(req.user.sub, courseId)
    return reply.status(201).send({ data: await service.getCart(req.user.sub) })
  })

  /** Ticking a row, which decides whether it is paid for now or left behind. */
  app.patch('/cart/items/:courseId', signedIn, async (req) => {
    const { courseId } = courseParam.parse(req.params)
    const { selected } = z.object({ selected: z.boolean() }).parse(req.body)
    await service.selectInCart(req.user.sub, selected, courseId)
    return { data: await service.getCart(req.user.sub) }
  })

  app.delete('/cart/items/:courseId', signedIn, async (req) => {
    const { courseId } = courseParam.parse(req.params)
    await service.removeFromCart(req.user.sub, courseId)
    return { data: await service.getCart(req.user.sub) }
  })

  /** Every row at once, which is what the "select all" box does. */
  app.patch('/cart', signedIn, async (req) => {
    const { selected } = z.object({ selected: z.boolean() }).parse(req.body)
    await service.selectInCart(req.user.sub, selected)
    return { data: await service.getCart(req.user.sub) }
  })
}
