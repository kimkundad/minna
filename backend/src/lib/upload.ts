import { api, type UploadPurpose } from '@/lib/api'

/**
 * Sending a file to the store.
 *
 * The bytes go straight from the browser to space-kim, never through our API.
 * A course video is measured in gigabytes; relaying that would tie up a Node
 * process for the whole upload and cap the size at whatever its body limit is.
 *
 * Our API only issues the ticket — a short-lived permission to write into one
 * folder — and the three calls below are the store's own protocol: say what is
 * coming, send it in pieces, then say it is done. Chunking is what makes a
 * two-gigabyte upload survive a dropped connection: only the piece in flight is
 * lost, and `received` says where to pick up.
 */

export interface UploadResult {
  /** What to store in the database. Never a URL: a URL expires. */
  path: string
  size: number
}

export class UploadError extends Error {}

export async function uploadFile(
  file: File,
  opts: {
    purpose: UploadPurpose
    courseId?: number
    /** 0 to 1. Called often enough for a progress bar to look alive. */
    onProgress?: (fraction: number) => void
    signal?: AbortSignal
  },
): Promise<UploadResult> {
  const ticket = (
    await api.uploadTicket({
      purpose: opts.purpose,
      ...(opts.courseId ? { courseId: opts.courseId } : {}),
    })
  ).data

  if (file.size > ticket.maxSize) {
    throw new UploadError(
      `That file is ${mb(file.size)} MB. The limit for this is ${mb(ticket.maxSize)} MB.`,
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
    const res = await fetch(`${ticket.baseUrl}/api/v1/uploads/${uploadId}/chunks/${n}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body: part,
      signal: opts.signal,
    })
    if (!res.ok) throw new UploadError(await describe(res))
    // Report after the chunk lands, so the bar never runs ahead of the upload.
    opts.onProgress?.((n + 1) / totalChunks)
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
  return `Upload failed (${res.status}).`
}
