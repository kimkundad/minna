/**
 * Shared plumbing for the five account pages.
 *
 * Three things every one of them needs and none of them should re-invent: a
 * usable image URL, a usable link, and a way to notice that the store changed.
 */
import { onBeforeUnmount, ref, type Ref } from 'vue'
import { store } from '@/vendor'

/** Calls a store function without fighting the `never` parameter types the
 *  vendored module is declared with. */
export function call<T = unknown>(name: string, ...args: unknown[]): T {
  const fn = (store as unknown as Record<string, (...a: unknown[]) => unknown>)[name]
  return fn(...args) as T
}

/**
 * The fixture data writes image paths relative — `assets/img/cat.png` — which
 * only resolves at the site root. Account pages live two segments deep, so the
 * same string would be read as `/th/account/assets/…` and come back as the SPA
 * shell. Anchoring it at the root is what makes it an image again.
 */
export function assetUrl(path?: string | null): string | null {
  if (!path) return null
  return /^(https?:|data:|\/)/.test(path) ? path : `/${path}`
}

/** The same correction for a course or article image, which carries its local
 *  file under `src` and a remote one under `id`. */
export function fixImage<T extends { src?: string } | null | undefined>(image: T): T {
  if (!image?.src) return image
  return { ...image, src: assetUrl(image.src) as string }
}

/**
 * The prototype's own hrefs — `course.html?id=COURSE-001` — translated into
 * this app's routes. Anything unrecognised falls back to the locale home
 * rather than leaving a link that goes nowhere.
 */
export function protoHref(href: string | null | undefined, locale: string): string {
  const base = `/${locale}`
  if (!href) return base
  if (/^(https?:|#|mailto:)/.test(href)) return href

  const [path, query = ''] = href.split('?')
  const params = new URLSearchParams(query)
  const id = params.get('id')
  const rest = (keep: string[]) => {
    const kept = new URLSearchParams()
    keep.forEach((k) => {
      const v = params.get(k)
      if (v) kept.set(k, v)
    })
    const s = kept.toString()
    return s ? `?${s}` : ''
  }

  switch (path) {
    case 'index.html':
      return base
    case 'courses.html':
      return `${base}/courses${query ? `?${query}` : ''}`
    case 'course.html':
      return id ? `${base}/courses/${id}` : `${base}/courses`
    case 'cart.html':
      return `${base}/cart`
    case 'learn.html':
      return id ? `${base}/learn/${id}${rest(['lesson'])}` : base
    case 'quiz.html':
      return id ? `${base}/quiz/${id}` : base
    case 'result.html':
      return id ? `${base}/result/${id}` : base
    case 'account.html':
      return `${base}/account`
    case 'account-learning.html':
      return `${base}/account/learning${query ? `?${query}` : ''}`
    case 'account-orders.html':
      return `${base}/account/orders`
    case 'account-package.html':
      return `${base}/account/package`
    case 'account-profile.html':
      return `${base}/account/profile`
    default:
      return base
  }
}

/**
 * A counter that ticks whenever the store changes.
 *
 * The store predates Vue and emits its own events, so nothing it returns is
 * reactive. Reading this ref inside a computed is what makes that computed
 * recalculate after a renewal, a saved profile or a signed-out device.
 */
export function useStoreTick(): Ref<number> {
  const tick = ref(0)
  const off = (store as unknown as { on: (fn: () => void) => () => void }).on(() => {
    tick.value += 1
  })
  onBeforeUnmount(off)
  return tick
}

/** Today as `YYYY-MM-DD`, for date inputs that may not accept a past day. */
export function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
