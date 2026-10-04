<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useI18n } from 'vue-i18n'
import { pendingConfirm, settleConfirm } from './useCommerce'

/**
 * The prototype's `U.confirm` — a small sheet-on-mobile dialog — as a single
 * component driven by the `pendingConfirm` channel.
 *
 * Markup follows `U.modal`: `.modal-root.is-sheet` with a backdrop, the
 * grabber, head, body and foot, because the sheet behaviour at ≤767px comes
 * out of that nesting.
 *
 * It keeps the focus ring inside itself while open and hands focus back to
 * whatever opened it, which for the cart is the remove button of the row the
 * person was working on.
 */
const { t } = useI18n()

const titleId = 'commerce-confirm-title'
const dialog = ref<HTMLElement | null>(null)
let returnTo: HTMLElement | null = null

const open = computed(() => pendingConfirm.value !== null)

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  if (!dialog.value) return []
  return Array.from(dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE))
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    settleConfirm(false)
    return
  }
  if (e.key !== 'Tab') return
  const items = focusables()
  if (!items.length) {
    e.preventDefault()
    return
  }
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement
  if (e.shiftKey && (active === first || !dialog.value?.contains(active))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(open, async (isOpen) => {
  if (isOpen) {
    returnTo = document.activeElement as HTMLElement | null
    document.body.classList.add('is-locked')
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    // The destructive action is not the first stop: cancel is, so a stray
    // Enter does not delete anything.
    focusables()[0]?.focus()
  } else {
    document.body.classList.remove('is-locked')
    document.removeEventListener('keydown', onKeydown)
    if (returnTo?.isConnected) returnTo.focus()
    returnTo = null
  }
})

onBeforeUnmount(() => {
  document.body.classList.remove('is-locked')
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="pendingConfirm" class="modal-root is-sheet">
      <div class="modal-backdrop" @click="settleConfirm(false)" />
      <div
        ref="dialog"
        class="modal modal--sm"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div class="sheet-grabber" aria-hidden="true" />
        <div class="modal-head">
          <div style="min-width: 0">
            <h2 class="modal-title" :id="titleId">{{ pendingConfirm.title }}</h2>
          </div>
          <button
            type="button"
            class="icon-btn icon-btn--ghost icon-btn--sm modal-close"
            :aria-label="t('commerce.confirm.close')"
            @click="settleConfirm(false)"
          >
            <AppIcon name="x" />
          </button>
        </div>
        <div class="modal-body">
          <p style="margin: 0; color: var(--ink-primary)">{{ pendingConfirm.message }}</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn--ghost" @click="settleConfirm(false)">
            {{ pendingConfirm.cancelLabel }}
          </button>
          <button
            type="button"
            class="btn"
            :class="pendingConfirm.danger ? 'btn--danger' : 'btn--primary'"
            @click="settleConfirm(true)"
          >
            {{ pendingConfirm.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
