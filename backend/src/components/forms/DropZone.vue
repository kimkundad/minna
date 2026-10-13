<script setup lang="ts">
import { computed, ref } from 'vue'
import { ApiError, api, type UploadPurpose } from '@/lib/api'
import { UploadError, uploadFile } from '@/lib/upload'

/**
 * Drag a file in, or click to choose one.
 *
 * Built beside `FileField` rather than replacing it: that one is used for
 * nine kinds of upload across the admin, and changing all of them to answer a
 * question about one is how a small request turns into a week of regressions.
 * This is for the places where the file is the point of the screen and worth
 * the room — a sample lesson, where somebody is about to sit and wait for a
 * hundred megabytes.
 *
 * It works in two modes, because a course has no id until it is saved and an
 * upload ticket names a folder by that id:
 *
 *   `deferred` — hold the file, hand it back, and let the page send it once
 *                there is something to send it against
 *   otherwise — upload as soon as it is dropped, and keep the stored path
 *
 * The same box either way, so the create screen and the edit screen are not
 * two different-looking answers to the same question.
 */
const props = withDefaults(
  defineProps<{
    /** The stored path, in upload mode. Null when nothing is kept yet. */
    modelValue?: string | null
    purpose: UploadPurpose
    courseId?: number
    label: string
    hint?: string
    accept?: string
    /** Hold the file instead of sending it; the page uploads it later. */
    deferred?: boolean
    disabled?: boolean
  }>(),
  { accept: 'video/*' },
)

const emit = defineEmits<{
  'update:modelValue': [string | null]
  /** Deferred mode: the file the page will send once it can. */
  file: [File | null]
}>()

const input = ref<HTMLInputElement | null>(null)
const over = ref(false)
const busy = ref(false)
const percent = ref(0)
const error = ref('')
/** Deferred mode keeps the file itself; upload mode keeps only its name. */
const held = ref<File | null>(null)
let abort: AbortController | null = null

const storedName = computed(() => (props.modelValue ?? '').split('/').pop() ?? '')
const shown = computed(() => held.value?.name || storedName.value)
const shownSize = computed(() =>
  held.value ? `${(held.value.size / 1024 / 1024).toFixed(1)} MB` : '',
)

function open() {
  if (!busy.value && !props.disabled) input.value?.click()
}

function onDrop(e: DragEvent) {
  over.value = false
  if (busy.value || props.disabled) return
  const file = e.dataTransfer?.files?.[0]
  if (file) void take(file)
}

function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) void take(file)
}

async function take(file: File) {
  error.value = ''

  // The browser's `accept` only filters the picker; a dropped file has not
  // been through it, so the same rule is applied here.
  if (props.accept === 'video/*' && !file.type.startsWith('video/')) {
    error.value = 'That is not a video file.'
    return
  }

  if (props.deferred) {
    held.value = file
    emit('file', file)
    return
  }

  busy.value = true
  percent.value = 0
  abort = new AbortController()
  try {
    const res = await uploadFile(file, {
      purpose: props.purpose,
      ...(props.courseId ? { courseId: props.courseId } : {}),
      onProgress: (f) => (percent.value = Math.round(f * 100)),
      signal: abort.signal,
    })
    held.value = null
    emit('update:modelValue', res.path)
  } catch (err) {
    if (abort.signal.aborted) error.value = 'Upload cancelled.'
    else if (err instanceof UploadError || err instanceof ApiError) error.value = err.message
    else error.value = 'Could not upload that file.'
  } finally {
    busy.value = false
    abort = null
    // So the same file can be chosen again after a failure.
    if (input.value) input.value.value = ''
  }
}

function clear() {
  held.value = null
  error.value = ''
  emit('file', null)
  emit('update:modelValue', null)
  if (input.value) input.value.value = ''
}

function cancel() {
  abort?.abort()
}

/** Watching it back needs a signed link; the stored path opens nothing. */
const playUrl = ref('')
async function play() {
  if (!props.modelValue) return
  try {
    playUrl.value = (await api.signPath(props.modelValue, 900)).data.url
  } catch {
    error.value = 'Could not open that file.'
  }
}

/** Progress is reported for the whole upload, and the page may also want it. */
defineExpose({ percent, busy })
</script>

<template>
  <div>
    <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
      {{ label }}
    </label>

    <div
      class="rounded-xl border-2 border-dashed px-5 py-7 text-center transition"
      :class="[
        over
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
          : 'border-gray-300 dark:border-gray-700',
        busy || disabled ? 'opacity-70' : 'cursor-pointer hover:border-brand-400',
      ]"
      role="button"
      tabindex="0"
      @click="open"
      @keydown.enter.prevent="open"
      @keydown.space.prevent="open"
      @dragover.prevent="over = true"
      @dragleave.prevent="over = false"
      @drop.prevent="onDrop"
    >
      <template v-if="busy">
        <p class="text-sm font-medium text-gray-800 dark:text-white/90">
          Sending… {{ percent }}%
        </p>
        <div class="mx-auto mt-3 h-2 max-w-sm overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <span
            class="block h-full rounded-full bg-brand-500 transition-[width] duration-200"
            :style="{ width: percent + '%' }"
          />
        </div>
        <p class="mt-2 text-xs text-gray-400">Keep this page open until it finishes.</p>
        <button
          type="button"
          class="mt-2 text-xs text-error-500 hover:text-error-600"
          @click.stop="cancel"
        >
          Cancel
        </button>
      </template>

      <template v-else-if="shown">
        <p class="truncate text-sm font-medium text-gray-800 dark:text-white/90">{{ shown }}</p>
        <p v-if="shownSize" class="mt-0.5 text-xs text-gray-400">{{ shownSize }}</p>
        <p v-if="deferred && held" class="mt-0.5 text-xs text-gray-400">
          It uploads when you save.
        </p>
        <div class="mt-3 flex items-center justify-center gap-4 text-sm">
          <button type="button" class="text-brand-500 hover:text-brand-600" @click.stop="open">
            Replace
          </button>
          <button
            v-if="modelValue && !held"
            type="button"
            class="text-gray-500 hover:text-gray-700 dark:text-gray-400"
            @click.stop="play"
          >
            Watch
          </button>
          <button type="button" class="text-error-500 hover:text-error-600" @click.stop="clear">
            Remove
          </button>
        </div>
      </template>

      <template v-else>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          Drag a video here, or <span class="text-brand-500">choose a file</span>
        </p>
        <p v-if="hint" class="mt-1 text-xs text-gray-400">{{ hint }}</p>
      </template>

      <input
        ref="input"
        type="file"
        class="hidden"
        :accept="accept"
        :disabled="busy || disabled"
        @change="onPick"
      />
    </div>

    <video
      v-if="playUrl"
      :src="playUrl"
      controls
      class="mt-3 w-full max-w-lg rounded-lg border border-gray-200 dark:border-gray-800"
    />

    <p v-if="error" class="mt-1 text-sm text-error-500">{{ error }}</p>
  </div>
</template>
