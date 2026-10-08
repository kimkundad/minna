import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { env } from './config/env'
import { pool } from './db/client'
import authPlugin from './plugins/auth'
import errorHandler from './plugins/error-handler'
import auditRoutes from './modules/audit/audit.routes'
import contentRoutes from './modules/content/content.routes'
import heroRoutes from './modules/content/hero.routes'
import dashboardRoutes from './modules/dashboard/dashboard.routes'
import authRoutes from './modules/auth/auth.routes'
import catalogRoutes from './modules/catalog/catalog.routes'
import uploadRoutes from './modules/uploads/uploads.routes'
import mediaRoutes from './modules/uploads/media.routes'
import peopleRoutes from './modules/people/people.routes'
import memberDetailRoutes from './modules/people/member-detail.routes'
import meRoutes from './modules/people/me.routes'
import essayRoutes from './modules/learning/essay.routes'
import insightsRoutes from './modules/learning/insights.routes'
import commerceRoutes from './modules/commerce/commerce.routes'
import couponRoutes from './modules/commerce/coupons.routes'
import invoiceRoutes from './modules/commerce/invoices.routes'
import settingsRoutes from './modules/settings/settings.routes'
import webhookRoutes from './modules/commerce/webhooks.routes'

export async function buildApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : true,
    // Behind nginx, so req.ip must come from X-Forwarded-For or every rate
    // limit would key on the proxy and throttle everyone together.
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  })

  await app.register(errorHandler)

  await app.register(fastifyCors, {
    origin: env.CORS_ORIGINS,
    // The refresh cookie only travels if the browser is told to send it.
    credentials: true,
  })

  await app.register(fastifyCookie)

  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: '1 minute',
  })

  await app.register(authPlugin)

  app.get('/health', async () => {
    await pool.query('SELECT 1')
    return { status: 'ok', uptime: Math.round(process.uptime()) }
  })

  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.register(auditRoutes, { prefix: '/api/v1' })
  await app.register(dashboardRoutes, { prefix: '/api/v1' })
  await app.register(contentRoutes, { prefix: '/api/v1' })
  await app.register(heroRoutes, { prefix: '/api/v1' })
  await app.register(catalogRoutes, { prefix: '/api/v1' })
  await app.register(uploadRoutes, { prefix: '/api/v1' })
  // Public on purpose: it serves the pictures inside published writing.
  await app.register(mediaRoutes, { prefix: '/api/v1' })
  await app.register(peopleRoutes, { prefix: '/api/v1' })
  await app.register(memberDetailRoutes, { prefix: '/api/v1' })
  await app.register(meRoutes, { prefix: '/api/v1' })
  await app.register(essayRoutes, { prefix: '/api/v1' })
  await app.register(insightsRoutes, { prefix: '/api/v1' })
  await app.register(couponRoutes, { prefix: '/api/v1' })
  await app.register(invoiceRoutes, { prefix: '/api/v1' })
  await app.register(settingsRoutes, { prefix: '/api/v1' })
  await app.register(commerceRoutes, { prefix: '/api/v1' })
  // Its own registration, so its raw-body parser stays inside its own scope.
  await app.register(webhookRoutes, { prefix: '/api/v1' })

  return app
}
