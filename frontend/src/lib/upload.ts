import { api } from '@/lib/api'

/**
 * Sending a file to the store, from the public site.
 *
 * The bytes go straight from the browser to space-kim, never through our API —
 * the same protocol the admin uses, which is why the shape of this matches
 * `backend/src/lib/upload.ts`. Our API only issues the ticket: a short-lived
 * permission to write into exactly one folder.
 *
 * A member may send their own photo, and files into their own conversation
 * with the school — and the API enforces both rather than trusting this file.
 * The size check below is a courtesy, so somebody dragging in a camera original
 * is told before the upload starts rather than after.
 */

export class UploadError extends Error {}

export interface UploadResult {
  /** What to store. Never a URL: a URL expires. */
  path: string
  size: number
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** A member's own photo. */
export const uploadAvatar = (file: File, opts: UploadOptions = {}) =>
  uploadFile(file, { purpose: 'avatar' }, opts)

/**
 * A CV, sent with an application to teach.
 *
 * The applicant is an ordinary member at this moment — applying does not grant
 * the role — so this is uploaded with the token registration just returned,
 * and the API ties it to the application nobody has decided yet.
 */
export const uploadApplicationResume = (file: File, opts: UploadOptions = {}) =>
  uploadFile(file, { purpose: 'application-resume' }, opts)

/**
 * A clip of the applicant teaching, sent with the same application.
 *
 * A hundred megabytes rather than ten, and deleted the moment somebody
 * decides — it is watched once, and it shows a person's face and voice.
 */
export const uploadApplicationVideo = (file: File, opts: UploadOptions = {}) =>
  uploadFile(file, { purpose: 'application-video' }, opts)

/** A picture or a document into the member's own conversation with the school. */
export const uploadChatFile = (file: File, threadId: number, opts: UploadOptions = {}) =>
  uploadFile(file, { purpose: 'chat-file', threadId }, opts)

/**
 * One chunk, over XMLHttpRequest rather than `fetch`.
 *
 * `fetch` cannot say how much of a request body has gone out — there is no
 * event for it — so a bar driven by it can only step once per chunk. The store
 * decides the chunk size, and when it takes a file in one piece that is a bar
 * which sits at nothing for several minutes and then vanishes, which is the
 * same as having no bar at all for the file this matters most to.
 *
 * `xhr.upload.onprogress` reports bytes as they leave, which is what somebody
 * watching a hundred-megabyte clip needs to see.
 */
function putChunk(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // A chunk that landed is a whole chunk, whatever the last progress
        // event happened to say.
        opts.onProgress?.(1)
        resolve()
      } else {
        reject(new UploadError(xhr.responseText?.slice(0, 200) || `อัปโหลดไม่สำเร็จ (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new UploadError('อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง'))
    xhr.onabort = () => reject(new UploadError('ยกเลิกการอัปโหลดแล้ว'))

    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}

async function uploadFile(
  file: File,
  what: {
    purpose: 'avatar' | 'chat-file' | 'application-resume' | 'application-video'
    threadId?: number
  },
  opts: UploadOptions = {},
): Promise<UploadResult> {
  const ticket = (await api.uploadTicket(what)).data

  if (file.size > ticket.maxSize) {
    throw new UploadError(
      `ไฟล์นี้ ${mb(file.size)} MB · อัปโหลดได้ไม่เกิน ${mb(ticket.maxSize)} MB`,
    )
  }

  const headers = { 'X-Upload-Ticket': ticket.ticket }

  // 1. Announce it. The store decides the chunk size, not us.
  const started = await fetch(`${ticket.baseUrl}/api/v1/uploads`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: ticket.folder, filename: file.name, size: file.size }),
    signal: opts.signal,
  })
  if (!started.ok) throw new UploadError(await describe(started))
  const { uploadId, chunkSize, totalChunks } = (await started.json()) as {
    uploadId: string
    chunkSize: number
    totalChunks: number
  }

  // 2. Send the pieces, in order.
  for (let n = 0; n < totalChunks; n++) {
    const part = file.slice(n * chunkSize, (n + 1) * chunkSize)
    await putChunk(`${ticket.baseUrl}/api/v1/uploads/${uploadId}/chunks/${n}`, part, headers, {
      signal: opts.signal,
      // Whole chunks already sent, plus how far through this one — so a file
      // that the store takes in a single piece still has a bar that moves.
      onProgress: (within) => opts.onProgress?.((n + within) / totalChunks),
    })
  }

  // 3. Commit. Until this call the pieces are not a file.
  const done = await fetch(`${ticket.baseUrl}/api/v1/uploads/${uploadId}/complete`, {
    method: 'POST',
    headers,
    signal: opts.signal,
  })
  if (!done.ok) throw new UploadError(await describe(done))

  const placed = (await done.json()) as { path: string; size: number }
  return { path: placed.path, size: placed.size }
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

/** The store's errors are `{ error: { code, message } }`; anything else means
 *  something other than the store answered. */
async function describe(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch {
    /* fall through */
  }
  return `อัปโหลดไม่สำเร็จ (${res.status})`
}
