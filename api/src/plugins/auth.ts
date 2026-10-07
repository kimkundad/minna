import fastifyJwt from '@fastify/jwt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '../config/env'
import { forbidden, unauthorized } from '../lib/errors'

export type RoleName = 'superadmin' | 'admin' | 'teacher' | 'student'

export interface AccessTokenPayload {
  /** User id. */
  sub: number
  roles: RoleName[]
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload
    user: AccessTokenPayload
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: rejects the request unless a valid access token is present. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    /** preHandler: reads a token when one is sent and ignores it when not.
     *  For routes that answer everyone but answer staff differently. */
    optionalAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    /** preHandler factory: authenticates, then checks for one of these roles. */
    requireRole: (
      ...roles: RoleName[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(async function auth(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
  })

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify()
    } catch {
      // Expired and malformed both read the same to a client: log in again.
      throw unauthorized('Your session has expired. Please sign in again.')
    }
  })

  app.decorate('optionalAuth', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify()
    } catch {
      // No token, or a bad one. Both mean "treat this as a guest" — the route
      // decides what a guest is allowed to see.
    }
  })

  app.decorate(
    'requireRole',
    (...roles: RoleName[]) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        await app.authenticate(req, reply)
        const held = req.user?.roles ?? []
        // A superadmin can do anything an admin can, so it satisfies any check
        // that asks for 'admin'. Spelling out both at every call site would
        // mean one forgotten pair silently locking a superadmin out.
        const effective: RoleName[] = held.includes('superadmin') ? [...held, 'admin'] : held
        if (!roles.some((r) => effective.includes(r))) {
          throw forbidden('You do not have access to this.')
        }
      },
  )
})
