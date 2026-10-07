import { createHmac } from 'node:crypto'
import { env } from '../config/env'
import { AppError } from './errors'

/**
 * Files live in space-kim, a self-hosted store that keeps everything private
 * and hands out signed URLs that expire.
 *
 * Two things shape how this is used:
 *
 * Store the `path` it returns, never the URL. A URL carries an expiry, so a
 * stored one is a link that stops working; the path is permanent and a fresh
 * URL costs nothing to make.
 *
 * Signing is local. The HMAC is computed here from the key secret, with no call
 * to the service, so putting a signed URL on every lesson in a long course adds
 * no round trips — which is the whole reason a video page can render quickly.
 */

/** The API key is `<keyId>.<secret>`; only the secret signs, and the id rides
 *  along in the URL so the service knows which key to check against. */
function credentials(): { keyId: string; secret: string } | null {
  const token = env.SPACE_API_KEY
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  return { keyId: token.slice(0, dot), secret: token.slice(dot + 1) }
}

function baseUrl(): string {
  return (env.SPACE_BASE_URL ?? '').replace(/\/+$/, '')
}

export function isStorageConfigured(): boolean {
  return Boolean(baseUrl() && credentials())
}

/**
 * The folder this key owns. Everything the API stores lives under it.
 *
 * The service refuses any path outside the key's scope with a 403, and it has
 * no endpoint that reports what the scope is — so the value lives in .env and
 * the checks below happen here, where the message can say which path was wrong
 * instead of arriving as a bare 403 from somewhere else.
 */
export function storageRoot(): string {
  return env.SPACE_FOLDER
}

/** Prefixes the key's folder unless the path already carries it, so callers can
 *  pass either `courses/1/cover.jpg` or the stored `minna/courses/1/cover.jpg`. */
export function scopedPath(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '')
  const root = storageRoot()
  if (!root) return clean
  if (!clean) return root
  if (clean === root || clean.startsWith(`${root}/`)) return clean
  return `${root}/${clean}`
}

function assertInScope(path: string): string {
  const clean = scopedPath(path)
  const root = storageRoot()
  // scopedPath cannot fix `../` — that has to be refused outright.
  if (clean.split('/').includes('..')) {
    throw new AppError(400, 'invalid_path', `Path escapes ${root}/: ${path}`)
  }
  return clean
}

function requireCredentials(): { keyId: string; secret: string } {
  const creds = credentials()
  if (!baseUrl() || !creds) {
    throw new AppError(503, 'storage_unconfigured', 'File storage is not configured.')
  }
  return creds
}

/**
 * A URL that works until `ttl` seconds from now.
 *
 * Default six hours, because the common case is a lesson video: the link has to
 * outlast watching it, and someone who pauses halfway through a two-hour
 * recording and comes back after lunch should not meet a dead player.
 */
export function signedUrl(path: string, ttl = env.SIGNED_URL_TTL): string {
  const { keyId, secret } = requireCredentials()
  const clean = assertInScope(path)
  const exp = Math.floor(Date.now() / 1000) + ttl
  const sig = createHmac('sha256', secret).update(`${clean}\n${exp}`).digest('base64url')
  return `${baseUrl()}/${clean}?kid=${keyId}&exp=${exp}&sig=${sig}`
}

interface StoredFile {
  /** Keep this. It is what the database column holds. */
  path: string
  size: number
  /** Valid briefly; sign again rather than storing it. */
  url: string
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  requireCredentials()
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { 'X-Api-Key': env.SPACE_API_KEY!, ...(init.headers ?? {}) },
  })

  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Non-JSON means something other than the service answered.
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error
    throw new AppError(
      res.status === 404 ? 404 : 502,
      err?.code?.toLowerCase() ?? 'storage_error',
      err?.message ?? `Storage returned ${res.status}.`,
    )
  }
  return body as T
}

/**
 * Uploads one file. `folder` is taken relative to the key's own folder, so
 * `courses/12` lands in `minna/courses/12` — a key cannot reach another
 * project's files even if asked to.
 */
export async function uploadFile(opts: {
  folder: string
  filename: string
  body: Blob | Uint8Array
  contentType?: string
  /** Without a name the service makes a unique one; with it, a clash is a 409. */
  keepName?: boolean
}): Promise<StoredFile> {
  const form = new FormData()
  // The service reads fields in order and needs these before the bytes.
  form.set('folder', assertInScope(opts.folder))
  if (opts.keepName) form.set('name', opts.filename)

  const blob =
    opts.body instanceof Blob
      ? opts.body
      : new Blob([opts.body], { type: opts.contentType ?? 'application/octet-stream' })
  form.set('file', blob, opts.filename)

  return call<StoredFile>('/api/v1/files', { method: 'POST', body: form })
}

/**
 * A ticket the browser uses to upload a large file in chunks, straight to the
 * store. A course video is measured in gigabytes; routing that through this API
 * would tie up a process for the whole upload and cap the size at whatever the
 * body limit is.
 */
export async function createUploadTicket(opts: {
  folder: string
  maxSize: number
  expiresIn?: number
}): Promise<{ ticket: string; expiresAt: string }> {
  return call('/api/v1/upload-tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder: assertInScope(opts.folder),
      maxSize: opts.maxSize,
      expiresIn: opts.expiresIn ?? 3600,
    }),
  })
}

export async function deleteFile(path: string): Promise<void> {
  await call(`/api/v1/files/${assertInScope(path)}`, { method: 'DELETE' })
}

/** Lists the key's own folder by default. An empty prefix would mean the whole
 *  store, which the service refuses, so it resolves to the root instead. */
export async function listFiles(
  prefix = '',
  opts: { offset?: number; limit?: number } = {},
): Promise<{ files: { path: string; size: number }[] }> {
  const query = new URLSearchParams({
    prefix: assertInScope(prefix),
    offset: String(opts.offset ?? 0),
    limit: String(opts.limit ?? 200),
  })
  return call(`/api/v1/files?${query}`)
}

/** Confirms the service answers and the key is accepted, for a health check. */
export async function verifyStorage(): Promise<'ok' | 'not-configured' | string> {
  if (!isStorageConfigured()) return 'not-configured'
  try {
    await listFiles(storageRoot(), { limit: 1 })
    return 'ok'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
