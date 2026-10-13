import { buildApp } from './app'
import { env } from './config/env'
import { pool } from './db/client'
import { isCaptchaConfigured } from './lib/captcha'

const app = await buildApp()

// Said once, at the top, rather than per request. Production refuses to start
// without it (see REQUIRED_IN_PRODUCTION), so this only ever prints on a
// developer's machine — where it is a reminder, not a fault.
if (!isCaptchaConfigured()) {
  console.warn('RECAPTCHA_SECRET is not set: every captcha check passes.')
}

try {
  await app.listen({ port: env.PORT, host: env.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

/** Finish in-flight requests and release the pool before the process ends. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      app.log.info(`${signal} received, shutting down`)
      await app.close()
      await pool.end()
      process.exit(0)
    })()
  })
}
