
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * `U.modal` in its sheet form: full-screen dialog on a phone, centred panel
 * above 768px. The learning room opens the curriculum in one and the quiz opens
 * its question navigator in another.
 *
 * Markup follows the prototype's — `.modal-root.is-sheet` holding a backdrop,
 * the grabber, head and body — because the sheet behaviour comes out of that
 * nesting. It is teleported to the body: `.modal-root` is `position: fixed`,
 * and nesting it inside a page section would put it under the sticky header's
 * stacking context.
 *
 * It keeps the focus ring inside itself and hands focus back to whatever opened
 * it, which for the drawer is the "course contents" button.
 */
const props = withDefaults(
  defineProps<{
    title: string
    sub?: string
    size?: 'sm' | 'md' | 'lg'
    rootClass?: string
    modalClass?: string
    /** Selector focused first, e.g. the current lesson row. */
    initialFocus?: string
  }>(),
  { size: 'md' },
)

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const titleId = 'learning-sheet-title'
const dialog = ref<HTMLElement | null>(null)
let returnTo: HTMLElement | null = null

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  return dialog.value ? Array.from(dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : []
}

function onKeydown(e: KeyboardEvent) {
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

onMounted(async () => {
  returnTo = document.activeElement as HTMLElement | null
  document.body.classList.add('is-locked')
  document.addEventListener('keydown', onKeydown)
  await nextTick()
  const target =
    (props.initialFocus && dialog.value?.querySelector<HTMLElement>(props.initialFocus)) ||
    focusables()[0] ||
    dialog.value
  target?.focus({ preventScroll: true })
  // The current row is usually well down a long list, so bring it into view.
  if (props.initialFocus) {
    dialog.value
      ?.querySelector<HTMLElement>(props.initialFocus)
      ?.scrollIntoView({ block: 'center' })
  }
})

onBeforeUnmount(() => {
  document.body.classList.remove('is-locked')
  document.removeEventListener('keydown', onKeydown)
  if (returnTo?.isConnected) returnTo.focus({ preventScroll: true })
  returnTo = null
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-root is-sheet" :class="props.rootClass">
      <div class="modal-backdrop" @click="emit('close')" />
      <div
        ref="dialog"
        class="modal"
        :class="[`modal--${props.size}`, props.modalClass]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div class="sheet-grabber" aria-hidden="true" />
        <div class="modal-head">
          <div style="min-width: 0">
            <h2 class="modal-title" :id="titleId">{{ props.title }}</h2>
            <p v-if="props.sub" class="modal-sub">{{ props.sub }}</p>
          </div>
          <button
            type="button"
            class="icon-btn icon-btn--ghost icon-btn--sm modal-close"
            :aria-label="t('learning.sheet.close')"
            @click="emit('close')"
          >
            <AppIcon name="x" />
          </button>
        </div>
        <div class="modal-body"><slot /></div>
      </div>
    </div>
  </Teleport>
</template>
