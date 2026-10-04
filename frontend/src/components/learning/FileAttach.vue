
<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { bytes, toast } from './learning'
import FileChip from './FileChip.vue'
import type { AttachedFile } from './types'

/**
 * The one optional file an essay answer may carry: drag it in or pick it, one
 * file, 10 MB, PDF / JPG / PNG / DOCX.
 *
 * Only the name, size and type are kept — there is no upload behind this — so
 * the help text says so rather than implying the file went somewhere.
 *
 * Validation happens here and not on submit, because "that file is 14 MB" is
 * only useful while the person is still looking at the file picker.
 */
const props = defineProps<{
  modelValue: AttachedFile | null
  /** Element-id prefix: `qz` while taking the quiz, `qe` while revising. */
  idPrefix: string
  /** The file the previous version carried, offered back after a removal. */
  original?: AttachedFile | null
}>()

const emit = defineEmits<{ 'update:modelValue': [file: AttachedFile | null] }>()

const { t } = useI18n()

const MAX = 10 * 1024 * 1024
const EXT = ['pdf', 'jpg', 'jpeg', 'png', 'docx']
const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
const ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const input = ref<HTMLInputElement | null>(null)
const error = ref('')
const dragging = ref(false)

function pick() {
  if (!input.value) return
  input.value.value = ''
  input.value.click()
}

function validate(list: FileList | null | undefined): AttachedFile | null {
  if (!list || !list.length) return null
  if (list.length > 1) {
    error.value = t('learning.attach.onlyOne')
    return null
  }
  const f = list[0]!
  const ext = String(f.name.split('.').pop() ?? '').toLowerCase()
  if (!EXT.includes(ext)) {
    error.value = t('learning.attach.badType')
    return null
  }
  if (!f.size) {
    error.value = t('learning.attach.emptyFile')
    return null
  }
  if (f.size > MAX) {
    error.value = t('learning.attach.tooBig', { size: bytes(f.size) })
    return null
  }
  error.value = ''
  return { name: f.name, size: f.size, type: f.type || MIME[ext] || '' }
}

function accept(list: FileList | null | undefined) {
  const file = validate(list)
  if (!file) return
  emit('update:modelValue', file)
  toast(t('learning.attach.attached', { name: file.name }), { type: 'success', timeout: 2600 })
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
  accept(e.dataTransfer?.files)
}

function remove() {
  emit('update:modelValue', null)
  error.value = ''
  void nextTick(() => {
    document.querySelector<HTMLElement>(`#${props.idPrefix}-attach [data-pick]`)?.focus()
  })
  toast(t('learning.attach.removed'), { type: 'info', timeout: 2200 })
}

function restore() {
  if (props.original) emit('update:modelValue', props.original)
}
</script>

<template>
  <div
    class="field qz-attach"
    :id="`${props.idPrefix}-attach`"
    :class="{ 'has-error': !!error }"
    :data-attach="props.idPrefix"
  >
    <span class="label" :id="`${props.idPrefix}-file-label`">
      {{ t('learning.attach.label') }}
      <span class="opt">{{ t('learning.attach.optional') }}</span>
    </span>

    <div data-attach-body>
      <FileChip
        v-if="props.modelValue"
        :file="props.modelValue"
        extra-class="qz-chip"
        change
        remove
        @pick="pick"
        @remove="remove"
      />
      <div
        v-else
        class="file-drop"
        :class="{ 'is-drag': dragging }"
        data-drop
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop="onDrop"
      >
        <span class="fd-ico"><AppIcon name="upload" /></span>
        <span class="fd-text">
          <b>{{ t('learning.attach.dropHere') }}</b>
          {{ t('learning.attach.orPick') }}
        </span>
        <button type="button" class="btn btn--secondary btn--sm" data-pick @click="pick">
          <AppIcon name="paperclip" />{{ t('learning.attach.choose') }}
        </button>
      </div>

      <button
        v-if="!props.modelValue && props.original"
        type="button"
        class="link qz-restore"
        data-restore-file
        @click="restore"
      >
        <AppIcon name="rotate-ccw" :size="15" />{{
          t('learning.attach.reuse', { name: props.original.name })
        }}
      </button>
    </div>

    <input
      ref="input"
      type="file"
      :id="`${props.idPrefix}-file`"
      class="sr-only"
      tabindex="-1"
      :accept="ACCEPT"
      :aria-labelledby="`${props.idPrefix}-file-label`"
      @change="accept(($event.target as HTMLInputElement).files)"
    />
    <p class="field-help">{{ t('learning.attach.help') }}</p>
    <div data-file-error aria-live="polite">
      <p v-if="error" class="field-error">
        <AppIcon name="alert-circle" /><span>{{ error }}</span>
      </p>
    </div>
  </div>
</template>
