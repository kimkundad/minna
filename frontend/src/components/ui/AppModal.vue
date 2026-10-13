<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * A dialog, with the behaviour a dialog has to have.
 *
 * Markup follows `U.modal`: `.modal-root.is-sheet` with a backdrop, the
 * grabber, head, body and foot — the sheet behaviour at ≤767px comes out of
 * that nesting, so it is load-bearing rather than decorative.
 *
 * It keeps focus inside itself while open, closes on Escape and on the
 * backdrop, locks the page behind it and hands focus back to whatever opened
 * it. Those are the parts that are tedious to remember and obvious when they
 * are missing, which is why they live here rather than in each caller.
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    /** 'sm' | '' | 'lg' | 'xl'; the house widths. */
    size?: 'sm' | 'md' | 'lg' | 'xl'
  }>(),
  { size: 'md' },
)
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const dialog = ref<HTMLElement | null>(null)
const titleId = `modal-${Math.random().toString(36).slice(2, 8)}`
let returnTo: HTMLElement | null = null

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  if (!dialog.value) return []
  return Array.from(dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE))
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
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

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      returnTo = document.activeElement as HTMLElement | null
      document.body.classList.add('is-locked')
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      focusables()[0]?.focus()
    } else {
      document.body.classList.remove('is-locked')
      document.removeEventListener('keydown', onKeydown)
      if (returnTo?.isConnected) returnTo.focus()
      returnTo = null
    }
  },
)

onBeforeUnmount(() => {
  document.body.classList.remove('is-locked')
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-root is-sheet">
      <div class="modal-backdrop" @click="emit('close')" />
      <div
        ref="dialog"
        class="modal"
        :class="size === 'md' ? undefined : `modal--${size}`"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div class="sheet-grabber" aria-hidden="true" />
        <div class="modal-head">
          <div style="min-width: 0">
            <h2 class="modal-title" :id="titleId">{{ title }}</h2>
            <p v-if="$slots.sub" class="modal-sub"><slot name="sub" /></p>
          </div>
          <button
            type="button"
            class="icon-btn icon-btn--ghost icon-btn--sm modal-close"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <AppIcon name="x" />
          </button>
        </div>
        <div class="modal-body"><slot /></div>
        <div v-if="$slots.foot" class="modal-foot"><slot name="foot" /></div>
      </div>
    </div>
  </Teleport>
</template>
