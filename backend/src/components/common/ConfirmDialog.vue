<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import { useConfirm } from '@/composables/useConfirm'

/**
 * The dialog behind `useConfirm().ask()`, mounted once in AdminLayout.
 *
 * Escape cancels and Enter confirms, because that is what the browser's own
 * dialog did and muscle memory outlives the thing that taught it.
 */
const { open, options, reasonText, answer } = useConfirm()

const input = ref<HTMLInputElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)

watch(open, (isOpen) => {
  document.body.classList.toggle('overflow-hidden', isOpen)
  if (!isOpen) return
  // Focus the box when there is something to type, the safe button otherwise:
  // a destructive action should not be one stray Enter away.
  nextTick(() => (options.value.reason ? input.value?.focus() : confirmButton.value?.focus()))
})

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    answer(false)
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    answer(true)
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('overflow-hidden')
})
</script>

<template>
  <Modal v-if="open" :full-screen-backdrop="true" @close="answer(false)">
    <template #body>
      <div
        class="relative w-full max-w-[480px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:p-8"
        role="alertdialog"
        aria-modal="true"
        :aria-label="options.title"
      >
        <h4 class="text-lg font-semibold text-gray-800 dark:text-white/90">
          {{ options.title }}
        </h4>
        <p
          v-if="options.message"
          class="mt-2 whitespace-pre-line text-sm leading-6 text-gray-500 dark:text-gray-400"
        >
          {{ options.message }}
        </p>

        <div v-if="options.reason" class="mt-5">
          <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            {{ options.reason.label }}
            <span v-if="options.reason.required" class="text-error-500">*</span>
          </label>
          <input
            ref="input"
            v-model="reasonText"
            type="text"
            maxlength="255"
            :placeholder="options.reason.placeholder"
            class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>

        <div class="mt-7 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            @click="answer(false)"
          >
            {{ options.cancelLabel ?? 'Cancel' }}
          </button>
          <button
            ref="confirmButton"
            type="button"
            class="rounded-lg px-4 py-2.5 text-sm font-medium text-white transition"
            :class="
              options.tone === 'danger'
                ? 'bg-error-500 hover:bg-error-600'
                : 'bg-brand-500 hover:bg-brand-600'
            "
            @click="answer(true)"
          >
            {{ options.confirmLabel ?? 'Confirm' }}
          </button>
        </div>
      </div>
    </template>
  </Modal>
</template>
