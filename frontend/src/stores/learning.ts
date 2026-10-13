import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api, type MyCourseItem } from '@/lib/api'
import { useAuthStore } from './auth'

/**
 * What this member may study.
 *
 * One store, because three places have to agree about it: the card's button,
 * the home page's own rail, and the account's shelf. A card that offers to sell
 * somebody a course they already own is the worst of the three to get wrong.
 *
 * Built from entitlements, so a course granted free, bought, or opened by hand
 * on the admin's mark-as-paid button all count the same.
 *
 * Signed out, it is empty and asks for nothing — the endpoint needs a session,
 * and a guest owns nothing by definition.
 */
export const useLearningStore = defineStore('learning', () => {
  const items = ref<MyCourseItem[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  /** Only the ones that can actually be opened: access that has lapsed is not
   *  ownership, and offering "เริ่มเรียน" on it would lead to a locked course. */
  const openIds = computed(
    () => new Set(items.value.filter((i) => i.blocked === null).map((i) => i.course.id)),
  )

  /** Everything on the shelf, lapsed included, for the pages that show both. */
  const allIds = computed(() => new Set(items.value.map((i) => i.course.id)))

  function has(courseId: number): boolean {
    return openIds.value.has(courseId)
  }

  function itemFor(courseId: number): MyCourseItem | undefined {
    return items.value.find((i) => i.course.id === courseId)
  }

  async function load(force = false): Promise<void> {
    const auth = useAuthStore()
    if (!auth.isLoggedIn) {
      items.value = []
      loaded.value = true
      return
    }
    if (loaded.value && !force) return

    loading.value = true
    try {
      items.value = (await api.myCourses()).data
      loaded.value = true
    } catch {
      // An unreadable shelf is shown as an empty one. Every page this touches
      // works without it; none of them should break because it failed.
    } finally {
      loading.value = false
    }
  }

  /** Emptied on sign-out, so the next person at the same browser is not told
   *  they own somebody else's courses. */
  function clear(): void {
    items.value = []
    loaded.value = false
  }

  /**
   * Signing in fills it; signing out empties it.
   *
   * Here rather than in each page, because the pages that read this are the
   * catalog, the home page and the cards inside both — and a card that keeps
   * saying "ซื้อคอร์สนี้" after its owner has just signed in is the bug this
   * store exists to prevent.
   */
  watch(
    () => useAuthStore().isLoggedIn,
    (signedIn) => {
      if (signedIn) void load(true)
      else clear()
    },
  )

  return { items, loading, loaded, openIds, allIds, has, itemFor, load, clear }
})
