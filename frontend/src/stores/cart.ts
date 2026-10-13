import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, api } from '@/lib/api'
import type { PublicCourse, Quote } from '@/lib/api'
import { useAuthStore } from './auth'
import { i18n } from '@/locales'
import router from '@/router'
import { toast } from '@/components/commerce/useCommerce'

/**
 * The basket.
 *
 * One store, because three things need to agree about it: the badge in the
 * header, the cart page, and the button on a course card. Each keeping its own
 * copy is how a badge comes to say two while the page shows three.
 *
 * It holds no prices of its own. The server prices the ticked rows every time
 * the basket changes, so a course that went up overnight or a coupon that
 * expired is reflected the moment it is looked at rather than when the row was
 * written.
 *
 * Signed-in only — see `cart.service.ts` on the API side for why. A signed-out
 * visitor has an empty basket and is asked to sign in when they try to fill it.
 */

export interface CartRow {
  courseId: number
  selected: boolean
  addedAt: string
}

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartRow[]>([])
  const quote = ref<Quote | null>(null)
  /** Why the basket has no total, when it should have one. */
  const problem = ref<string | null>(null)
  const owned = ref<number[]>([])
  /** The courses behind the rows, for their titles and pictures. */
  const courses = ref<PublicCourse[]>([])

  const loading = ref(false)
  const busy = ref<number | null>(null)
  const loaded = ref(false)

  const count = computed(() => items.value.length)
  const selectedIds = computed(() =>
    items.value.filter((i) => i.selected).map((i) => i.courseId),
  )

  /** A course already owned cannot be bought again; it stays visible with its
   *  box disabled rather than vanishing. */
  const blockedIds = computed(() => new Set(owned.value))
  const selectableIds = computed(() =>
    items.value.filter((i) => !blockedIds.value.has(i.courseId)).map((i) => i.courseId),
  )

  function courseFor(id: number): PublicCourse | undefined {
    return courses.value.find((c) => c.id === id)
  }

  /** Fetches the courses the basket names, and forgets the ones it no longer
   *  does, so this does not grow for the length of a session. */
  async function syncCourses(): Promise<void> {
    const wanted = items.value.map((i) => i.courseId)
    const missing = wanted.filter((id) => !courses.value.some((c) => c.id === id))
    const fetched = await Promise.all(
      missing.map((id) => api.course(id).then((r) => r.data).catch(() => null)),
    )
    courses.value = [
      ...courses.value.filter((c) => wanted.includes(c.id)),
      ...fetched.filter((c): c is PublicCourse => c !== null),
    ]
  }

  function apply(data: {
    items: CartRow[]
    quote: Quote | null
    problem?: string | null
    alreadyOwned: number[]
  }): void {
    items.value = data.items
    quote.value = data.quote
    problem.value = data.problem ?? null
    owned.value = data.alreadyOwned
  }

  async function load(): Promise<void> {
    const auth = useAuthStore()
    if (!auth.isLoggedIn) {
      apply({ items: [], quote: null, alreadyOwned: [] })
      courses.value = []
      loaded.value = true
      return
    }
    loading.value = true
    try {
      apply((await api.cart()).data)
      await syncCourses()
      loaded.value = true
    } catch {
      // An unreadable basket is shown as empty rather than as an error: there
      // is nothing a reader can do about it, and the rest of the page works.
    } finally {
      loading.value = false
    }
  }

  /**
   * Says so, briefly.
   *
   * Short on purpose: it confirms a click, it is not news. The cart itself is
   * one tap away for anyone who wants to check, which is cheaper than a dialog
   * they have to dismiss before carrying on shopping.
   */
  function announce(courseId: number): void {
    const t = i18n.global.t
    const title = courseFor(courseId)?.title ?? ''
    toast(t('commerce.cart.added', { title }), {
      type: 'success',
      timeout: 2600,
      action: {
        label: t('commerce.cart.viewCart'),
        onClick: () => {
          const locale = String(router.currentRoute.value.params.locale ?? 'th')
          void router.push(`/${locale}/cart`)
        },
      },
    })
  }

  /**
   * Adds a course. Returns false when nobody is signed in, so the caller can
   * ask them to — the store does not open dialogs.
   */
  async function add(courseId: number): Promise<boolean> {
    const auth = useAuthStore()
    if (!auth.isLoggedIn) return false

    busy.value = courseId
    try {
      apply((await api.addToCart(courseId)).data)
      await syncCourses()
      announce(courseId)
      return true
    } catch (err) {
      /**
       * A refusal the buyer can act on is shown, not thrown.
       *
       * The server turns away a course priced in a currency the basket does
       * not already use, because one payment cannot be made in two. That
       * reached the browser as an unhandled rejection: the console had the
       * sentence explaining what to do, and the person clicking the button saw
       * a button that simply did nothing.
       *
       * Rethrown only when there is no message worth reading — a sign-in
       * prompt is the caller's job, and it keys off `false`.
       */
      if (err instanceof ApiError) {
        if (err.status === 409) {
          toast(err.message, { type: 'error', timeout: 7000 })
          return true
        }
        throw err
      }
      return false
    } finally {
      busy.value = null
    }
  }

  async function remove(courseId: number): Promise<void> {
    busy.value = courseId
    try {
      apply((await api.removeFromCart(courseId)).data)
      await syncCourses()
    } finally {
      busy.value = null
    }
  }

  async function setSelected(courseId: number, selected: boolean): Promise<void> {
    busy.value = courseId
    try {
      apply((await api.selectInCart(courseId, selected)).data)
    } finally {
      busy.value = null
    }
  }

  async function selectAll(selected: boolean): Promise<void> {
    apply((await api.selectAllInCart(selected)).data)
  }

  function has(courseId: number): boolean {
    return items.value.some((i) => i.courseId === courseId)
  }

  /** Emptied on sign-out so the next person at the same browser does not see
   *  somebody else's basket in the badge. */
  function clear(): void {
    apply({ items: [], quote: null, alreadyOwned: [] })
    courses.value = []
    loaded.value = false
  }

  return {
    items,
    quote,
    problem,
    owned,
    courses,
    loading,
    busy,
    loaded,
    count,
    selectedIds,
    blockedIds,
    selectableIds,
    courseFor,
    has,
    load,
    add,
    remove,
    setSelected,
    selectAll,
    clear,
  }
})
