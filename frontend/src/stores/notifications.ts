import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { notifications as notifyApi, type AppNotification } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

/**
 * What happened while they were away.
 *
 * Polled rather than pushed, and on purpose: the only thing the badge has to
 * be is roughly right. A learner who is told about their receipt a minute late
 * has lost nothing, and a socket held open for every visitor costs more than
 * that minute is worth. When the chat arrives it will bring a live channel
 * with it, and this can ride on it then.
 *
 * Fetched when somebody signs in and when the page comes back to the front —
 * not on a timer, because a tab left open overnight should not spend the night
 * asking.
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const unread = ref(0)
  const loading = ref(false)
  const loaded = ref(false)
  let inFlight: Promise<void> | null = null

  const newest = computed(() => items.value.slice(0, 8))

  /** Safe to call from anywhere; only the first of a burst fetches. */
  function load(): Promise<void> {
    const auth = useAuthStore()
    if (!auth.isLoggedIn) {
      items.value = []
      unread.value = 0
      return Promise.resolve()
    }
    inFlight ??= (async () => {
      loading.value = true
      try {
        const res = await notifyApi.list({ limit: 20 })
        items.value = res.data
        unread.value = res.meta.unread
        loaded.value = true
      } catch {
        // The bell goes quiet rather than wrong. Nothing on a page depends on
        // this having worked.
      } finally {
        loading.value = false
        inFlight = null
      }
    })()
    return inFlight
  }

  /**
   * Marks one read straight away on screen, then tells the server.
   *
   * Optimistic because the click is usually also a navigation: waiting for a
   * round trip would leave the badge showing a number the reader has just
   * dealt with, on a page they have already left.
   */
  async function markRead(id: number): Promise<void> {
    const row = items.value.find((n) => n.id === id)
    if (!row || row.readAt) return
    row.readAt = new Date().toISOString()
    unread.value = Math.max(0, unread.value - 1)
    try {
      await notifyApi.read(id)
    } catch {
      // Left as read on screen: the next load settles it either way, and
      // flipping it back under the pointer reads as a bug.
    }
  }

  async function markAllRead(): Promise<void> {
    const now = new Date().toISOString()
    for (const n of items.value) n.readAt ??= now
    unread.value = 0
    try {
      await notifyApi.readAll()
    } catch {
      /* same reasoning as above */
    }
  }

  /** On sign-out, so the next person at this browser sees none of it. */
  function clear(): void {
    items.value = []
    unread.value = 0
    loaded.value = false
  }

  return { items, newest, unread, loading, loaded, load, markRead, markAllRead, clear }
})
