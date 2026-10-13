<script setup lang="ts">
import { computed, ref } from 'vue'
import { ApiError, api, type UploadPurpose } from '@/lib/api'
import { UploadError, uploadFile } from '@/lib/upload'

/**
 * Pick a file, upload it, keep the path.
 *
 * The model is the stored path, which is what the database column holds. A URL
 * is never stored, because it expires; one is asked for only when something has
 * to be shown, and it is thrown away with the page.
 */
const props = defineProps<{
  modelValue: string | null | undefined
  purpose: UploadPurpose
  courseId?: number
  /** Whose file this is, when it is not the person uploading it — an admin
   *  setting somebody else photo, or an identity document sent by message.
   *  The API decides whether that is allowed; this only asks. */
  userId?: number
  label: string
  /** `accept` for the file input, e.g. 'image/*' or 'video/mp4,video/*'. */
  accept?: string
  hint?: string
  /** Show the stored file as an image rather than as a filename. */
  preview?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [string | null]
  /** The whole result, for a caller that wants the name and the size as well
   *  as the path — a course handout is listed by name, not by object key. */
  uploaded: [{ path: string; size: number; name: string }]
}>()

const input = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const progress = ref(0)
const error = ref('')
const previewUrl = ref('')
let abort: AbortController | null = null

/** The tail of the path; the folder is noise once it is stored. */
const fileName = computed(() => (props.modelValue ?? '').split('/').pop() ?? '')

async function choose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  busy.value = true
  error.value = ''
  progress.value = 0
  abort = new AbortController()

  try {
    const result = await uploadFile(file, {
      purpose: props.purpose,
      ...(props.courseId ? { courseId: props.courseId } : {}),
      ...(props.userId ? { userId: props.userId } : {}),
      onProgress: (f) => (progress.value = f),
      signal: abort.signal,
    })
    emit('update:modelValue', result.path)
    emit('uploaded', { path: result.path, size: result.size, name: file.name })
    previewUrl.value = ''
    if (props.preview) await loadPreview(result.path)
  } catch (err) {
    if (abort.signal.aborted) error.value = 'Upload cancelled.'
    else if (err instanceof UploadError) error.value = err.message
    else if (err instanceof ApiError) error.value = err.message
    else error.value = 'Could not upload that file.'
  } finally {
    busy.value = false
    abort = null
    // Let the same file be picked again after a failure.
    if (input.value) input.value.value = ''
  }
}

async function loadPreview(path: string) {
  try {
    previewUrl.value = (await api.signPath(path, 600)).data.url
  } catch {
    // No preview is better than a broken image; the path is still shown.
  }
}

function clear() {
  emit('update:modelValue', null)
  previewUrl.value = ''
  error.value = ''
}

function cancel() {
  abort?.abort()
}

// Show what is already stored, once.
if (props.preview && props.modelValue) void loadPreview(props.modelValue)
</script>

<template>
  <div>
    <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
      {{ props.label }}
    </label>

    <div
      class="rounded-lg border border-dashed border-gray-300 p-4 dark:border-gray-700"
      :class="{ 'opacity-60': busy }"
    >
      <div v-if="props.modelValue" class="mb-3 flex items-center gap-3">
        <img
          v-if="props.preview && previewUrl"
          :src="previewUrl"
          alt=""
          class="h-16 w-24 rounded object-cover"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-gray-800 dark:text-white/90">{{ fileName }}</p>
          <p class="truncate font-mono text-xs text-gray-400">{{ props.modelValue }}</p>
        </div>
        <button
          type="button"
          class="text-sm text-error-500 hover:text-error-600"
          :disabled="busy"
          @click="clear"
        >
          Remove
        </button>
      </div>

      <input
        ref="input"
        type="file"
        :accept="props.accept"
        :disabled="busy"
        class="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600 dark:text-gray-400"
        @change="choose"
      />

      <div v-if="busy" class="mt-3 flex items-center gap-3">
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
          <div
            class="h-full rounded-full bg-brand-500 transition-[width] duration-200"
            :style="{ width: `${Math.round(progress * 100)}%` }"
          />
        </div>
        <span class="text-xs text-gray-500">{{ Math.round(progress * 100) }}%</span>
        <button type="button" class="text-xs text-error-500" @click="cancel">Cancel</button>
      </div>

      <p v-if="props.hint && !busy" class="mt-2 text-xs text-gray-400">{{ props.hint }}</p>
      <p v-if="error" role="alert" class="mt-2 text-sm text-error-500">{{ error }}</p>
    </div>
  </div>
</template>
