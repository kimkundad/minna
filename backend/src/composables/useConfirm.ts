import { ref } from 'vue'

/**
 * A replacement for `window.confirm` and `window.prompt`.
 *
 * The browser's own dialogs say "localhost:5173 says" above the question, look
 * nothing like the rest of the admin, and block the whole tab while they are
 * open. This is the same shape of call — ask, await an answer — rendered with
 * the theme's modal.
 *
 * The state is module-scoped and the dialog is mounted once in AdminLayout, so
 * any view can ask without wiring a component of its own. One question at a
 * time, which is all `window.confirm` ever allowed either.
 */

export interface ConfirmOptions {
  title: string
  /** Shown under the title. Line breaks are kept. */
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red button for anything that destroys or suspends. */
  tone?: 'danger' | 'primary'
  /** Adds a text box, the way `window.prompt` did. */
  reason?: { label: string; placeholder?: string; required?: boolean }
}

export interface ConfirmAnswer {
  ok: boolean
  /** What was typed, when `reason` was asked for. */
  reason: string
}

const open = ref(false)
const options = ref<ConfirmOptions>({ title: '' })
const reasonText = ref('')
let settle: ((answer: ConfirmAnswer) => void) | null = null

export function useConfirm() {
  /**
   * Asks, and resolves when the person answers. Always resolves — a cancel is
   * an answer of `{ ok: false }`, never a rejection, so callers do not have to
   * wrap an ordinary "no" in a try/catch.
   */
  function ask(opts: ConfirmOptions): Promise<ConfirmAnswer> {
    // A second question while one is open would strand the first promise.
    settle?.({ ok: false, reason: '' })

    options.value = opts
    reasonText.value = ''
    open.value = true
    return new Promise((resolve) => {
      settle = resolve
    })
  }

  function answer(ok: boolean) {
    if (ok && options.value.reason?.required && !reasonText.value.trim()) return
    open.value = false
    settle?.({ ok, reason: reasonText.value.trim() })
    settle = null
  }

  return { open, options, reasonText, ask, answer }
}
