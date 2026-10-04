/**
 * The commerce pages' shared plumbing: a reactivity bridge to the vendored
 * store, link and asset helpers, and the toast and confirm channels the cart
 * and checkout need.
 *
 * `src/vendor/store.js` is a plain object over localStorage, so nothing Vue
 * tracks changes when it mutates. It does emit, though — `store.on(reason)`
 * fires on every commit — so one subscription turns that into a ref, and any
 * computed that reads it recomputes when the cart or an order moves.
 *
 * The toast and confirm state lives at module scope rather than inside a
 * component, so a page's logic can open either without reaching into a child
 * and the two overlay components stay purely presentational.
 */
import { onBeforeUnmount, onMounted, onUpdated, ref, type Ref } from 'vue'
import { store } from '@/vendor'

/** Calls a store function without fighting the `never` parameter types the
 *  vendored module is declared with. */
export function call<T = unknown>(name: string, ...args: unknown[]): T {
  const fn = (store as unknown as Record<string, (...a: unknown[]) => unknown>)[name]
  return fn(...args) as T
}

/**
 * A counter that ticks whenever the store changes.
 *
 * Reading this ref inside a computed is what makes that computed recalculate
 * after an item is removed from the cart, a coupon is applied, or an order is
 * placed.
 */
export function useStoreTick(): Ref<number> {
  const tick = ref(0)
  const off = (store as unknown as { on: (fn: () => void) => () => void }).on(() => {
    tick.value += 1
  })
  onBeforeUnmount(off)
  return tick
}

/**
 * The fixture data writes image paths relative — `assets/img/cat.png` — which
 * only resolves at the site root. These pages live one or two segments deep,
 * so the same string would be read as `/th/checkout/assets/…` and come back as
 * the SPA shell. Anchoring it at the root is what makes it an image again.
 */
export function assetUrl(path?: string | null): string | null {
  if (!path) return null
  return /^(https?:|data:|\/)/.test(path) ? path : `/${path}`
}

/**
 * Rewrites one of the prototype's flat `.html` links as a path in our app, with
 * the locale on the front.
 *
 * `courseView` and the store hand back hrefs like `learn.html?id=COURSE-001`,
 * and it is better to translate them in one place than to pick each decision
 * apart at every call site.
 */
export function protoHref(href: string | null | undefined, locale: string): string {
  const base = `/${locale}`
  if (!href) return base
  if (/^(https?:|#|mailto:|tel:)/.test(href)) return href

  const [path, query = ''] = href.split('?')
  const params = new URLSearchParams(query)
  const id = params.get('id')
  const withQuery = (p: string) => (query ? `${p}?${query}` : p)

  switch (path) {
    case 'index.html':
      return base
    case 'courses.html':
      return withQuery(`${base}/courses`)
    case 'course.html':
      return id ? `${base}/courses/${id}` : `${base}/courses`
    case 'cart.html':
      return `${base}/cart`
    case 'checkout.html':
      return withQuery(`${base}/checkout`)
    case 'checkout-success.html':
      return withQuery(`${base}/checkout/success`)
    case 'learn.html': {
      const lesson = params.get('lesson')
      return id ? `${base}/learn/${id}${lesson ? `?lesson=${encodeURIComponent(lesson)}` : ''}` : base
    }
    case 'quiz.html':
      return id ? `${base}/quiz/${id}` : base
    case 'result.html':
      return id ? `${base}/result/${id}` : base
    case 'certificate.html':
      return id ? `${base}/certificates/${id}` : base
    case 'account.html':
      return `${base}/account`
    case 'account-learning.html':
      return withQuery(`${base}/account/learning`)
    case 'account-orders.html':
      return `${base}/account/orders`
    case 'account-package.html':
      return `${base}/account/package`
    case 'account-profile.html':
      return `${base}/account/profile`
    case 'account-certificates.html':
      return `${base}/account/certificates`
    case 'purchase-terms.html':
      return `${base}/purchase-terms`
    default:
      return base
  }
}

/* ---------------- mobile sticky bar ---------------- */

/**
 * Wires the mobile summary bar to the page the way the prototype does.
 *
 * Two things have to happen on `<body>` and nowhere else. `page-cart` /
 * `page-checkout` with `has-bottom-bar` is what pads the footer and lifts the
 * toasts clear of the bar — the selectors are `body.has-bottom-bar.page-cart
 * …`, and our route's `bodyClass` lands on a wrapper div instead. And
 * `--co-bar-h` carries the bar's measured height, which those same rules read,
 * so it has to be set from the element rather than guessed.
 *
 * Below 960px only: above it the bar is `display: none` and the sidebar
 * summary takes over, so none of this applies.
 */
export function useBottomBar(
  pageClass: string,
  bar: Ref<HTMLElement | null>,
  visible: () => boolean,
): void {
  const mq = window.matchMedia('(max-width: 959px)')

  function sync() {
    const on = mq.matches && visible()
    document.body.classList.toggle('has-bottom-bar', on)
    if (on && bar.value) {
      document.body.style.setProperty('--co-bar-h', `${bar.value.offsetHeight}px`)
    } else {
      document.body.style.removeProperty('--co-bar-h')
    }
  }

  onMounted(() => {
    document.body.classList.add(pageClass)
    mq.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    sync()
  })

  // Re-measure after every render, because applying a coupon or selecting a
  // course changes the bar's own height.
  onUpdated(sync)

  onBeforeUnmount(() => {
    mq.removeEventListener('change', sync)
    window.removeEventListener('resize', sync)
    document.body.classList.remove(pageClass, 'has-bottom-bar')
    document.body.style.removeProperty('--co-bar-h')
  })
}

/* ---------------- toasts ---------------- */

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  type: 'info' | 'success' | 'error'
  message: string
  action?: ToastAction
  leaving?: boolean
}

export const toasts = ref<Toast[]>([])

let toastId = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export function dismissToast(id: number): void {
  const item = toasts.value.find((x) => x.id === id)
  if (!item || item.leaving) return
  item.leaving = true
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  // Matches the .is-leaving animation, so the toast is not yanked mid-fade.
  timers.set(
    id,
    setTimeout(() => {
      toasts.value = toasts.value.filter((x) => x.id !== id)
      timers.delete(id)
    }, 200),
  )
}

/** Three at a time, like the prototype: a fourth would cover the sticky bar. */
export function toast(
  message: string,
  opts: { type?: Toast['type']; timeout?: number; action?: ToastAction } = {},
): void {
  const id = ++toastId
  toasts.value = [
    ...toasts.value,
    { id, type: opts.type ?? 'info', message, action: opts.action },
  ].slice(-3)
  timers.set(
    id,
    setTimeout(() => dismissToast(id), opts.timeout ?? 4800),
  )
}

/* ---------------- confirm ---------------- */

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void
}

export const pendingConfirm = ref<PendingConfirm | null>(null)

/** Resolves true only when the confirm button is pressed; dismissing it in any
 *  other way resolves false, so a stray Escape never destroys anything. */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    pendingConfirm.value = { ...request, resolve }
  })
}

export function settleConfirm(ok: boolean): void {
  const pending = pendingConfirm.value
  pendingConfirm.value = null
  pending?.resolve(ok)
}
