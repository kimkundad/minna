import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env'
import { badRequest, unauthorized } from '../../lib/errors'
import { parseDuration } from '../../lib/tokens'
import { sendMail } from '../../lib/mailer'
import {
  emailVerifiedMail,
  passwordResetMail,
  verifyEmailMail,
} from '../../lib/email-templates'
import * as schemas from './auth.schemas'
import * as service from './auth.service'

const REFRESH_COOKIE = 'minna_refresh'

/**
 * The refresh token is returned in the body *and* set as an httpOnly cookie.
 * The web app uses the cookie, which JavaScript cannot read and so an XSS bug
 * cannot steal; the Flutter app reads the body and keeps it in secure storage.
 */
function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/api/v1/auth',
    maxAge: Math.floor(parseDuration(env.JWT_REFRESH_TTL) / 1000),
  })
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' })
}

function deviceOf(req: FastifyRequest, label?: string) {
  return {
    deviceLabel: label,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  }
}

function readRefreshToken(req: FastifyRequest, fromBody?: string): string {
  const token = fromBody ?? req.cookies[REFRESH_COOKIE]
  if (!token) throw unauthorized('No session to refresh. Please sign in.')
  return token
}

export default async function authRoutes(app: FastifyInstance) {
  /** Auth endpoints get a tighter limit than the rest of the API. */
  const strictLimit = {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }

  app.post('/register', strictLimit, async (req, reply) => {
    const body = schemas.registerBody.parse(req.body)
    const user = await service.register(body)
    const accessToken = app.jwt.sign({ sub: user.id, roles: user.roles })
    const refreshToken = await service.issueRefreshToken(user.id, deviceOf(req))

    // Sent now, but nothing is gated on it yet: someone can look around and
    // start a free course straight away, and only needs a verified address at
    // the point money and a receipt are involved.
    const pending = await service.createEmailVerification(user.id)
    if (pending) {
      const url = `${env.APP_URL}/verify-email?token=${pending.token}`
      void sendMail({ ...verifyEmailMail(pending.name, url), to: pending.email }, req.log)
    }

    setRefreshCookie(reply, refreshToken)
    return reply.status(201).send({ user, accessToken, refreshToken })
  })

  app.post('/login', strictLimit, async (req, reply) => {
    const body = schemas.loginBody.parse(req.body)
    const user = await service.login(body.email, body.password)
    const accessToken = app.jwt.sign({ sub: user.id, roles: user.roles })
    const refreshToken = await service.issueRefreshToken(user.id, deviceOf(req, body.deviceLabel))

    setRefreshCookie(reply, refreshToken)
    return reply.send({ user, accessToken, refreshToken })
  })

  app.post('/refresh', async (req, reply) => {
    const body = schemas.refreshBody.parse(req.body ?? {})
    const token = readRefreshToken(req, body.refreshToken)
    const { user, refreshToken } = await service.rotateRefreshToken(token, deviceOf(req))
    const accessToken = app.jwt.sign({ sub: user.id, roles: user.roles })

    setRefreshCookie(reply, refreshToken)
    return reply.send({ user, accessToken, refreshToken })
  })

  app.post('/logout', async (req, reply) => {
    const body = schemas.refreshBody.parse(req.body ?? {})
    const token = body.refreshToken ?? req.cookies[REFRESH_COOKIE]
    if (token) await service.revokeRefreshToken(token)

    clearRefreshCookie(reply)
    return reply.status(204).send()
  })

  app.post('/logout-all', { preHandler: app.authenticate }, async (req, reply) => {
    await service.revokeAllSessions(req.user.sub)
    clearRefreshCookie(reply)
    return reply.status(204).send()
  })

  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    return { user: await service.findUser(req.user.sub) }
  })

  app.get('/sessions', { preHandler: app.authenticate }, async (req) => {
    const current = req.cookies[REFRESH_COOKIE]
    return { data: await service.listSessions(req.user.sub, current) }
  })

  app.delete('/sessions/:id', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    await service.revokeSession(req.user.sub, id)
    return reply.status(204).send()
  })

  app.post('/forgot-password', strictLimit, async (req, reply) => {
    const body = schemas.forgotPasswordBody.parse(req.body)
    const reset = await service.createPasswordReset(body.email)

    if (reset) {
      const url = `${env.APP_URL}/reset-password?token=${reset.token}`
      const mail = passwordResetMail(reset.name, url)
      // Not awaited: the answer must take the same time whether or not the
      // address exists, and a slow mail server would otherwise say so.
      void sendMail({ ...mail, to: body.email }, req.log)
    }

    return reply.send({
      message: 'If that address has an account, a reset link is on its way.',
    })
  })

  /**
   * Sends — or re-sends — the verification link for the signed-in account.
   * Rate limited harder than the rest: this one puts mail in someone's inbox.
   */
  app.post(
    '/verify-email/send',
    { preHandler: app.authenticate, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const pending = await service.createEmailVerification(req.user.sub)

      if (pending) {
        const url = `${env.APP_URL}/verify-email?token=${pending.token}`
        const mail = verifyEmailMail(pending.name, url)
        void sendMail({ ...mail, to: pending.email }, req.log)
      }

      // The same answer either way, so an already-verified account is not
      // reported differently from one that has just been sent a link.
      return reply.send({ message: 'If the address still needs verifying, a link is on its way.' })
    },
  )

  app.post('/verify-email', strictLimit, async (req, reply) => {
    const { token } = schemas.verifyEmailBody.parse(req.body)
    const user = await service.verifyEmail(token)

    const mail = emailVerifiedMail(`${user.firstName} ${user.lastName}`.trim())
    void sendMail({ ...mail, to: user.email }, req.log)

    return reply.send({ user })
  })

  app.post('/reset-password', strictLimit, async (req, reply) => {
    const body = schemas.resetPasswordBody.parse(req.body)
    await service.resetPassword(body.token, body.password)
    clearRefreshCookie(reply)
    return reply.send({ message: 'Password updated. Sign in with your new password.' })
  })

  app.post('/change-password', { preHandler: app.authenticate }, async (req, reply) => {
    const body = schemas.changePasswordBody.parse(req.body)
    if (body.currentPassword === body.newPassword) {
      throw badRequest('Choose a password you have not used here before.', {
        newPassword: 'This is your current password.',
      })
    }
    await service.changePassword(req.user.sub, body.currentPassword, body.newPassword)
    clearRefreshCookie(reply)
    return reply.send({ message: 'Password updated. Please sign in again.' })
  })

  app.post('/accept-privacy', { preHandler: app.authenticate }, async (req) => {
    await service.acceptPrivacy(req.user.sub)
    return { user: await service.findUser(req.user.sub) }
  })
}
