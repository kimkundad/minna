import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { ZodError } from 'zod'
import { env } from '../config/env'
import { AppError } from '../lib/errors'

/** Turns a Zod failure into the flat `field -> message` map clients render. */
function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] ??= issue.message
  }
  return fields
}

export default fp(async function errorHandler(app: FastifyInstance) {
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: 'not_found', message: `No route for ${req.method} ${req.url}.` },
    })
  })

  app.setErrorHandler((err, req, reply) => {
    // Narrowing a FastifyError with `instanceof` collapses the negative branch
    // to `unknown`, so property reads go through this alias instead.
    const raw = err as { statusCode?: number; code?: string; message: string; cause?: unknown }

    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) },
      })
    }

    if (err instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: 'validation_failed',
          message: 'Some fields need fixing.',
          fields: zodFields(err),
        },
      })
    }

    // Validation raised by the route schema rather than thrown by our own code.
    const cause = raw.cause
    if (cause instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: 'validation_failed',
          message: 'Some fields need fixing.',
          fields: zodFields(cause),
        },
      })
    }

    if (raw.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'too_many_requests', message: 'Too many attempts. Try again shortly.' },
      })
    }

    if (raw.statusCode && raw.statusCode < 500) {
      return reply.status(raw.statusCode).send({
        error: { code: raw.code ?? 'bad_request', message: raw.message },
      })
    }

    req.log.error({ err }, 'unhandled error')
    return reply.status(500).send({
      error: {
        code: 'internal_error',
        // The real message can name tables, queries or file paths. Keep it in
        // the log, not in the response.
        message:
          env.NODE_ENV === 'production' ? 'Something went wrong on our side.' : raw.message,
      },
    })
  })
})
