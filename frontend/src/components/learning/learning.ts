/**
 * The three learning pages' shared plumbing.
 *
 * The reactivity bridge, the link rewriter and the toast and confirm channels
 * already exist for the commerce pages and behave identically here, so they are
 * re-exported rather than written a second time — a second `protoHref` would
 * only drift from the first.
 *
 * What is new is everything the learning group needs and no other page does:
 * the compact header bar these pages carry instead of the site nav, Focus Mode,
 * and the small formatters the prototype kept in `ui.js`.
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { store } from '@/vendor'
import type { LessonType } from './types'

export {
  call,
  useStoreTick,
  assetUrl,
  protoHref,
  toast,
  confirm,
  toasts,
  dismissToast,
  pendingConfirm,
  settleConfirm,
} from '@/components/commerce/useCommerce'

/** Which icon stands for a lesson, matching the prototype's `TYPE` map. */
export const LESSON_ICON: Record<LessonType, string> = {
  video: 'video',
  pdf: 'file-text',
  quiz: 'clipboard-check',
}

/** A file size the way the prototype's `U.bytes` writes it. */
export function bytes(n: number): string {
  if (!n) return '0 KB'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}

/** "HH:MM" from an ISO timestamp, for the auto-save line. */
export function hm(iso: string | null | undefined): string {
  const d = (store as unknown as { date: { parse: (s: unknown) => Date | null } }).date.parse(iso)
  if (!d) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Seconds from "MM:SS" or "HH:MM:SS", used by the note timestamp buttons. */
export function toSec(stamp: string): number {
  const p = String(stamp).split(':').map(Number)
  return p.length === 3 ? p[0]! * 3600 + p[1]! * 60 + p[2]! : p[0]! * 60 + p[1]!
}

/**
 * The height of the page's own compact header, published as a custom property.
 *
 * `.lp-stage`, `.qz-bar` and `.qz-nav` all position themselves against
 * `--lp-hdr` / `--qz-hdr`, and the fallback in the CSS (77px) is only a guess —
 * a two-line title makes the bar taller and the sticky offsets wrong. So it is
 * measured from the element rather than assumed.
 */
export function useHeaderHeight(cssVar: string, el: Ref<HTMLElement | null>): void {
  function measure() {
    const h = el.value?.offsetHeight
    if (h) document.documentElement.style.setProperty(cssVar, `${h}px`)
  }

  let frame = 0
  function onResize() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }

  onMounted(() => {
    measure()
    // The Thai webfont lands after first paint and changes the bar's height.
    requestAnimationFrame(measure)
    window.addEventListener('resize', onResize)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', onResize)
    document.documentElement.style.removeProperty(cssVar)
  })
}

/**
 * Adds a class to `<body>` for as long as the page is mounted.
 *
 * A route's `bodyClass` meta lands on the `.app-root` wrapper, which is right
 * for `.page-learn`, but a few rules in the ported CSS reach for the body
 * element itself — `body.has-bottom-bar .toast-region` lifts the toasts clear
 * of the quiz's mobile bar — and those need the class here instead.
 */
export function useBodyClass(className: string, active: () => boolean = () => true): () => void {
  function sync() {
    document.body.classList.toggle(className, active())
  }
  onMounted(sync)
  onBeforeUnmount(() => document.body.classList.remove(className))
  return sync
}

/**
 * Focus Mode: the learning room's dark treatment, remembered across reloads.
 *
 * The state lives in the store (`store.focus()`), not in the component, because
 * the prototype persists it per visitor rather than per visit. Two classes carry
 * it: `focus-dark` has to sit on the same element as `page-learn` for
 * `.page-learn.focus-dark` to match, which is the `.app-root` wrapper; and
 * `lp-dark` goes on `<html>` so the scrollbars and the page behind a rubber-band
 * scroll turn dark too.
 */
export function useFocusMode() {
  const s = store as unknown as { focus: () => boolean; setFocus: (v: boolean) => void }
  const on = ref(s.focus())

  function appRoot(): HTMLElement | null {
    return document.querySelector('.app-root')
  }

  function apply() {
    appRoot()?.classList.toggle('focus-dark', on.value)
    document.documentElement.classList.toggle('lp-dark', on.value)
  }

  function set(value: boolean) {
    on.value = value
    s.setFocus(value)
    apply()
  }

  onMounted(apply)
  onBeforeUnmount(() => {
    appRoot()?.classList.remove('focus-dark')
    document.documentElement.classList.remove('lp-dark')
  })

  return { on, set, toggle: () => set(!on.value) }
}
