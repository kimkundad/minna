<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * The prototype's `U.modal`: a centred dialog on a desktop, a sheet that slides
 * up from the bottom at ≤767px. Both come out of `.modal-root.is-sheet`, which
 * components.css already styles, so this only supplies the structure and the
 * behaviour — backdrop, Escape, focus trap, and handing focus back.
 *
 * `is-sheet` is on by default because every use of it so far is a control
 * surface reached from a phone.
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    sub?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Which element inside to focus when it opens; the close button otherwise. */
    initialFocus?: string
    closeLabel: string
  }>(),
  { size: 'md', sub: '', initialFocus: '' },
)

const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLElement | null>(null)
let returnTo: HTMLElement | null = null

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || !dialog.value) return

  const items = Array.from(dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (!items.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement

  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    document.body.classList.toggle('is-locked', isOpen)
    if (isOpen) {
      returnTo = document.activeElement as HTMLElement | null
      nextTick(() => {
        const pick = props.initialFocus
          ? dialog.value?.querySelector<HTMLElement>(props.initialFocus)
          : null
        ;(pick ?? dialog.value?.querySelector<HTMLElement>('[data-sheet-close]'))?.focus()
      })
    } else {
      returnTo?.focus?.()
      returnTo = null
    }
  },
)

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('is-locked')
})
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="modal-root is-sheet">
      <div class="modal-backdrop" @click="emit('close')" />
      <div
        ref="dialog"
        class="modal"
        :class="`modal--${props.size}`"
        role="dialog"
        aria-modal="true"
        :aria-label="props.title"
      >
        <div class="sheet-grabber" aria-hidden="true" />

        <div class="modal-head">
          <div style="min-width: 0">
            <h2 class="modal-title">{{ props.title }}</h2>
            <p v-if="props.sub" class="modal-sub">{{ props.sub }}</p>
          </div>
          <button
            type="button"
            class="icon-btn icon-btn--ghost icon-btn--sm modal-close"
            data-sheet-close
            :aria-label="props.closeLabel"
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
