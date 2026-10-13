import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { chat } from '@/lib/api'

/**
 * How many messages are waiting, for the badge in the sidebar.
 *
 * Polled, not streamed. The stream in the chat page carries one conversation,
 * and holding one open per conversation just to colour a number would be a
 * connection per teacher on every admin's screen. One small query a minute is
 * the cheaper lie, and the page itself is live once it is open.
 *
 * Nothing here throws. A failed count shows the last one rather than an error
 * in the navigation, which nobody can do anything about.
 */
const EVERY_MS = 60_000

export const useChatUnreadStore = defineStore('chatUnread', () => {
  const count = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  async function refresh() {
    try {
      count.value = (await chat.unreadCount()).data.unread
    } catch {
      /* keep the last known number */
    }
  }

  function start() {
    if (timer) return
    void refresh()
    timer = setInterval(() => {
      // A background tab is not being read, so there is nothing to badge.
      if (document.visibilityState === 'visible') void refresh()
    }, EVERY_MS)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    count.value = 0
  }

  /** The page sets this itself after reading, so the badge does not lag a
   *  minute behind what is plainly on screen. */
  function clearFor(unread: number) {
    count.value = Math.max(0, count.value - unread)
  }

  return {
    count,
    label: computed(() => (count.value > 9 ? '9+' : String(count.value))),
    refresh,
    start,
    stop,
    clearFor,
  }
})
