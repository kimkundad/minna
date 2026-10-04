import { buildApp } from './app'
import { env } from './config/env'
import { pool } from './db/client'

const app = await buildApp()

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
