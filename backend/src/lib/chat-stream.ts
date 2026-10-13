import { getAccessToken, refresh } from '@/lib/api'

/**
 * Reading the chat's live stream.
 *
 * Not `EventSource`, which is what Server-Sent Events are normally read with —
 * it cannot send an Authorization header, and the access token lives in memory
 * on purpose, so there is nothing for it to authenticate with. Putting the
 * token in the query string instead would write it into every proxy log on the
 * way. So the stream is read with `fetch`, which carries the header, and the
 * few lines of the SSE format are parsed here.
 *
 * What is given up by not using `EventSource` is its automatic reconnection,
 * which is replaced below — and a reconnect has to be deliberate anyway,
 * because it must say which message it had got up to.
 */

export interface StreamOptions {
  /** The last message already on screen, so a reconnect misses nothing. */
  after: number
  onMessage: (message: unknown) => void
  /** Called when a connection ends, so the caller can refetch if it wants. */
  onReconnect?: () => void
}

export interface Stream {
  /** The newest id seen, which is where a reconnect starts from. */
  readonly after: number
  close: () => void
}

/** Backs off so a restarting API is not hammered, then stops growing. */
const WAITS = [1000, 2000, 5000, 10_000, 15_000]

export function openChatStream(threadId: number, opts: StreamOptions): Stream {
  let after = opts.after
  let closed = false
  let attempt = 0
  let controller: AbortController | null = null

  const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

  async function run() {
    while (!closed) {
      controller = new AbortController()
      try {
        const token = getAccessToken()
        const res = await fetch(`/api/v1/me/chats/${threadId}/stream?after=${after}`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        })

        // The token went stale while the stream was open — which it will, since
        // these are held for as long as the tab is. Renew and come straight
        // back rather than falling into the backoff.
        if (res.status === 401) {
          if (await refresh()) continue
          return
        }
        // Not allowed, or no such thread. Retrying would only repeat it.
        if (res.status === 403 || res.status === 404) return
        if (!res.ok || !res.body) throw new Error(String(res.status))

        attempt = 0
        for await (const event of events(res.body)) {
          if (closed) return
          if (event.name !== 'message') continue
          const message = event.data as { id?: number }
          if (typeof message.id === 'number') after = Math.max(after, message.id)
          opts.onMessage(message)
        }
      } catch {
        /* a dropped connection, a restart, or our own abort */
      }

      if (closed) return
      // The stream ended. Anything said in the gap is still in the table, and
      // the next connection asks for everything after `after` — so nothing is
      // lost, but the caller may want to redraw.
      opts.onReconnect?.()
      await sleep(WAITS[Math.min(attempt, WAITS.length - 1)])
      attempt += 1
    }
  }

  void run()

  return {
    get after() {
      return after
    },
    close() {
      closed = true
      controller?.abort()
    },
  }
}

interface ServerEvent {
  name: string
  data: unknown
}

/** The SSE wire format, which is all this chat uses: `event:`, `data:`, blank
 *  line. Comments and `id:`/`retry:` are ignored because nothing sends them. */
async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })

    // A frame ends at a blank line. A chunk can hold several, or half of one.
    let cut = buffer.indexOf('\n\n')
    while (cut !== -1) {
      const frame = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      const parsed = parse(frame)
      if (parsed) yield parsed
      cut = buffer.indexOf('\n\n')
    }
  }
}

function parse(frame: string): ServerEvent | null {
  let name = 'message'
  const lines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) lines.push(line.slice(5).trim())
  }
  if (!lines.length) return null
  try {
    return { name, data: JSON.parse(lines.join('\n')) }
  } catch {
    return null
  }
}
