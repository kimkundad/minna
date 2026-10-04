/**
 * Serves the reference prototype from _design-ref so we can read its rendered
 * DOM and compare screenshots against it.
 *
 *   node scripts/serve-reference.mjs [port]      default 5180
 *
 * It adds one route the prototype does not have:
 *
 *   /__seed?state=paid&to=account.html
 *
 * The prototype keeps its session in localStorage, and several pages — the
 * account section, the quiz, the result page — render only a sign-in gate
 * without one. A headless dump cannot run script to set that, but a page on the
 * same origin can: this route writes the session and forwards to the target, so
 * those pages can be captured in the state that actually has something in them.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '_design-ref')
const PORT = Number(process.argv[2] ?? 5180)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.md': 'text/plain; charset=utf-8',
}

/** Matches store.js: prefix rv:v1:, key session, seedVersion 5. */
function seedPage(state, memberType, pkgStatus, to) {
  const session = JSON.stringify({
    state,
    memberType,
    pkgStatus,
    pending: null,
    simulateError: false,
    seedVersion: 5,
  })
  return `<!doctype html><meta charset="utf-8"><title>seeding…</title><script>
try { localStorage.setItem('rv:v1:session', ${JSON.stringify(session)}); } catch (e) {}
location.replace(${JSON.stringify(to)});
</script>`
}

if (!existsSync(ROOT)) {
  console.error(`Reference not found at ${ROOT}.`)
  console.error('Clone it from https://github.com/ideavivat/Frontend-Readvpn.git into _design-ref/.')
  process.exit(1)
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (url.pathname === '/__seed') {
    const state = url.searchParams.get('state') ?? 'paid'
    const memberType = url.searchParams.get('memberType') ?? 'vet'
    const pkgStatus = url.searchParams.get('pkgStatus') ?? 'active'
    const to = url.searchParams.get('to') ?? 'index.html'
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(seedPage(state, memberType, pkgStatus, to))
  }

  let path = join(ROOT, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''))

  try {
    if (statSync(path).isDirectory()) path = join(path, 'index.html')
    statSync(path)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('not found')
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
  })
  createReadStream(path).pipe(res)
}).listen(PORT, () => {
  console.log(`Reference prototype on http://localhost:${PORT}`)
  console.log(`Signed-in capture: http://localhost:${PORT}/__seed?state=paid&to=account.html`)
})
