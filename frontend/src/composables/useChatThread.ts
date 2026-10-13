import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { ApiError, chat as chatApi, type ChatMessage } from '@/lib/api'
import { openChatStream, type Stream } from '@/lib/chat-stream'
import { UploadError, uploadChatFile } from '@/lib/upload'

/**
 * One learner's conversation with the school, as both places that show it need
 * it.
 *
 * There are two: the full page under the account, and the floating panel that
 * opens over a lesson. They draw different furniture around the same
 * conversation, and the moment the loading, sending, attaching, reading and
 * live-stream handling existed twice, one of them would quietly start
 * behaving differently from the other. So all of it lives here and neither
 * owns it.
 *
 * `t` is passed in rather than imported: `useI18n()` only works inside a
 * component's own setup, and this is called from two of them.
 */
export interface ChatThreadOptions {
  t: (key: string, named?: Record<string, unknown>) => string
  /** The element the transcript scrolls in, for staying at the newest. */
  scroller: Ref<HTMLElement | null>
}

export function useChatThread({ t, scroller }: ChatThreadOptions) {
  const threadId = ref<number | null>(null)
  const messages = ref<ChatMessage[]>([])
  const hasOlder = ref(false)
  const loading = ref(true)
  const loadingOlder = ref(false)
  const error = ref('')
  const sendError = ref('')

  const draft = ref('')
  const sending = ref(false)
  const uploadPct = ref<number | null>(null)

  let stream: Stream | null = null

  /* ---------------- staying at the newest ---------------- */

  /**
   * Whether the view should stay stuck to the bottom.
   *
   * True on opening, and true again whenever somebody scrolls back down to the
   * end. Reading something further up turns it off, so a message arriving does
   * not yank them away from what they were reading.
   */
  const pinned = ref(true)

  function nearBottom(): boolean {
    const box = scroller.value
    if (!box) return true
    return box.scrollHeight - box.scrollTop - box.clientHeight < 120
  }

  function onScroll(): void {
    pinned.value = nearBottom()
  }

  function stick(): void {
    const box = scroller.value
    if (box) box.scrollTop = box.scrollHeight
  }

  /**
   * Down to the newest, and again once the browser has laid out.
   *
   * One scroll is not enough: the bubbles are placed then, but the pictures in
   * them are not — their signed links arrive afterwards, and each one that
   * loads makes the transcript taller under what was the bottom.
   */
  async function toBottom(): Promise<void> {
    pinned.value = true
    await nextTick()
    stick()
    requestAnimationFrame(stick)
  }

  /** An attachment finished loading and changed the height under the reader. */
  function onMediaLoad(): void {
    if (pinned.value) stick()
  }

  /* ---------------- loading ---------------- */

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      // Made on first use, so opening this is how a learner starts.
      const id = (await chatApi.open()).data.id
      threadId.value = id
      const res = await chatApi.messages(id)
      messages.value = res.data
      hasOlder.value = res.meta.hasMore
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : t('messages.loadFailed')
      return
    } finally {
      loading.value = false
    }

    await toBottom()
    await markRead()
    listen()
  }

  async function older(): Promise<void> {
    const first = messages.value[0]
    if (!first || !threadId.value || loadingOlder.value) return
    loadingOlder.value = true
    const box = scroller.value
    const before = box?.scrollHeight ?? 0
    try {
      const res = await chatApi.messages(threadId.value, { before: first.id })
      messages.value = [...res.data, ...messages.value]
      hasOlder.value = res.meta.hasMore
      // Hold their place: prepending would otherwise jump them to the top of
      // everything that was just inserted.
      await nextTick()
      if (box) box.scrollTop = box.scrollHeight - before
    } catch {
      /* leave what is on screen; they can try again */
    } finally {
      loadingOlder.value = false
    }
  }

  /* ---------------- live ---------------- */

  function listen(): void {
    const id = threadId.value
    if (!id) return
    stream = openChatStream(id, {
      after: messages.value.length ? messages.value[messages.value.length - 1].id : 0,
      onMessage: (raw) => {
        const message = raw as ChatMessage
        if (message.threadId !== threadId.value) return
        // Ours are already on screen, put there by the POST's answer.
        if (messages.value.some((m) => m.id === message.id)) return
        const atBottom = nearBottom()
        messages.value.push(message)
        if (atBottom) {
          void toBottom()
          // Having it in front of somebody is what reading is — but only if
          // they are actually at the bottom, looking.
          if (!message.mine) void markRead()
        }
      },
    })
  }

  async function markRead(): Promise<void> {
    if (!threadId.value) return
    await chatApi.read(threadId.value).catch(() => {})
  }

  /* ---------------- saying something ---------------- */

  async function say(text = draft.value): Promise<ChatMessage | null> {
    const body = text.trim()
    if (!body || !threadId.value || sending.value) return null
    sending.value = true
    sendError.value = ''
    try {
      const sent = (await chatApi.say(threadId.value, { body })).data
      if (text === draft.value) draft.value = ''
      messages.value.push(sent)
      await toBottom()
      return sent
    } catch (err) {
      sendError.value = err instanceof ApiError ? err.message : t('messages.sendFailed')
      return null
    } finally {
      sending.value = false
    }
  }

  async function attach(file: File): Promise<void> {
    if (!threadId.value) return
    const id = threadId.value
    sendError.value = ''
    uploadPct.value = 0
    try {
      const placed = await uploadChatFile(file, id, {
        onProgress: (fraction) => {
          uploadPct.value = Math.round(fraction * 100)
        },
      })
      const sent = (
        await chatApi.say(id, {
          body: draft.value.trim() || undefined,
          attachmentPath: placed.path,
          attachmentName: file.name,
          attachmentKind: file.type.startsWith('image/') ? 'image' : 'file',
          attachmentSize: placed.size,
        })
      ).data
      draft.value = ''
      messages.value.push(sent)
      await toBottom()
    } catch (err) {
      sendError.value =
        err instanceof UploadError || err instanceof ApiError
          ? err.message
          : t('messages.sendFailed')
    } finally {
      uploadPct.value = null
    }
  }

  /* ---------------- attachments ---------------- */

  /**
   * Signed links, fetched once each and kept for the life of the page.
   *
   * They last five minutes, which is longer than it takes to look at a
   * picture; a stale one shows a broken image and the next visit asks again.
   * Worth it to avoid a request per bubble per scroll.
   */
  const links = ref<Record<number, string>>({})

  async function link(message: ChatMessage): Promise<void> {
    if (!message.attachment || links.value[message.id] || !threadId.value) return
    try {
      links.value[message.id] = (await chatApi.fileUrl(threadId.value, message.id)).data.url
    } catch {
      /* nothing to show; the name is still there */
    }
  }

  // Deep, because the array is pushed into when a message is sent or arrives
  // on the stream — a shallow watch only fires when the whole array is
  // replaced, and a picture just sent would sit there as its own filename.
  watch(
    messages,
    (rows) => {
      for (const m of rows) if (m.attachment) void link(m)
    },
    { deep: true, immediate: true },
  )

  async function open(message: ChatMessage): Promise<void> {
    await link(message)
    const url = links.value[message.id]
    if (url) window.open(url, '_blank', 'noopener')
  }

  onBeforeUnmount(() => stream?.close())

  return {
    threadId,
    messages,
    hasOlder,
    loading,
    loadingOlder,
    error,
    sendError,
    draft,
    sending,
    uploadPct,
    links,
    empty: computed(() => !loading.value && !error.value && !messages.value.length),
    load,
    older,
    say,
    attach,
    markRead,
    open,
    onScroll,
    onMediaLoad,
    toBottom,
    close: () => stream?.close(),
  }
}
