<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * Drag a file in, or click to choose one.
 *
 * It holds the file rather than sending it. The two places this is used — a CV
 * and a sample lesson on the teaching application — cannot upload until the
 * account exists, because an upload needs a token and registering is what
 * returns one. So the page keeps the file and sends it when it can, and this
 * only has to make choosing one plain and show what was chosen.
 *
 * A bare `<input type="file">` did the job and said almost nothing: on a phone
 * the control is a short grey button whose label is the browser's, and a
 * hundred-megabyte video is a thing people want to see they have actually
 * attached. This shows the name, the size and a way to change it.
 *
 * The admin has its own `DropZone`, which uploads as it goes and is built from
 * the admin's Tailwind classes and upload client. Sharing one component across
 * the two would mean a component that knows about both.
 */
const props = withDefaults(
  defineProps<{
    id: string
    label: string
    hint?: string
    /** Passed to the picker, and checked again on a dropped file. */
    accept?: string
    /** Refused above this, in megabytes, before anything is sent. */
    maxMb?: number
    required?: boolean
    /** While the page is sending it: the box locks and shows the bar. */
    busy?: boolean
    /** 0–100. Only drawn while `busy`. */
    percent?: number
    /** Shown under the box, from the page rather than from here. */
    error?: string
  }>(),
  { accept: '', maxMb: 0, percent: 0 },
)

const emit = defineEmits<{ 'update:file': [File | null] }>()

const input = ref<HTMLInputElement | null>(null)
const over = ref(false)
const held = ref<File | null>(null)
/** Our own complaint about the file, as opposed to the page's about sending it. */
const problem = ref('')

/** The size of the file that was turned away, so "that file is 142 MB" can
 *  name a number. The file itself is not kept — it was refused. */
const refusedSize = ref(0)
/** And its name: the refusal is shown beside a file that was accepted earlier,
 *  so without it the message reads as being about the wrong one. */
const refusedName = ref('')

const bytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`

const sizeLabel = computed(() => bytes(held.value?.size ?? 0))
const refusedLabel = computed(() => bytes(refusedSize.value))

function open() {
  if (!props.busy) input.value?.click()
}

/** Space and Enter on a focused box, since it behaves as a button. */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    open()
  }
}

function onDrop(e: DragEvent) {
  over.value = false
  if (props.busy) return
  const file = e.dataTransfer?.files?.[0]
  if (file) take(file)
}

function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) take(file)
}

/**
 * `accept` filters the picker only.
 *
 * A dropped file never went through it, so the same rule is applied here —
 * otherwise the one way in that skips the check is the one somebody uses by
 * accident.
 */
function matchesAccept(file: File): boolean {
  if (!props.accept) return true
  const name = file.name.toLowerCase()
  return props.accept.split(',').some((raw) => {
    const rule = raw.trim().toLowerCase()
    if (!rule) return false
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return file.type.startsWith(rule.slice(0, -1))
    return file.type === rule
  })
}

function take(file: File) {
  problem.value = ''
  refusedSize.value = file.size
  refusedName.value = file.name

  if (!matchesAccept(file)) {
    problem.value = 'wrongType'
    reset()
    return
  }
  if (props.maxMb && file.size > props.maxMb * 1024 * 1024) {
    problem.value = 'tooBig'
    reset()
    return
  }
  if (!file.size) {
    problem.value = 'empty'
    reset()
    return
  }

  held.value = file
  emit('update:file', file)
}

function clear() {
  held.value = null
  problem.value = ''
  reset()
  emit('update:file', null)
}

/** So the same file can be chosen again after it was refused or removed. */
function reset() {
  if (input.value) input.value.value = ''
}

defineExpose({ file: held })
</script>

<template>
  <div class="field" :class="{ 'has-error': Boolean(error) || Boolean(problem) }">
    <label class="label" :for="id">{{ label }}<span v-if="required" class="req">*</span></label>

    <!-- A button rather than a label wrapping the input: a label would open the
         picker on every click inside, including the one on "remove". -->
    <div
      class="dz"
      :class="{ 'is-over': over, 'is-busy': busy, 'has-file': Boolean(held) }"
      role="button"
      tabindex="0"
      :aria-describedby="hint ? `${id}-hint` : undefined"
      :aria-disabled="busy ? 'true' : 'false'"
      @click="open"
      @keydown="onKey"
      @dragover.prevent="over = !busy"
      @dragleave.prevent="over = false"
      @drop.prevent="onDrop"
    >
      <input
        :id="id"
        ref="input"
        type="file"
        class="dz-input"
        :accept="accept || undefined"
        :disabled="busy"
        @change="onPick"
      />

      <template v-if="held">
        <span class="dz-ico" aria-hidden="true"><AppIcon name="file-text" /></span>
        <span class="dz-body">
          <b class="dz-name">{{ held.name }}</b>
          <small class="dz-meta">{{ sizeLabel }}</small>
        </span>
        <button
          v-if="!busy"
          type="button"
          class="dz-x"
          :aria-label="$t('drop.remove', { name: held.name })"
          @click.stop="clear"
        >
          <AppIcon name="x" />
        </button>
      </template>

      <template v-else>
        <span class="dz-ico" aria-hidden="true"><AppIcon name="upload" /></span>
        <span class="dz-body">
          <b>{{ $t('drop.here') }}</b>
          <small class="dz-meta">{{ $t('drop.orPick') }}</small>
        </span>
      </template>
    </div>

    <p v-if="hint" :id="`${id}-hint`" class="hint">{{ hint }}</p>

    <!-- The page's own message about sending it, kept apart from ours about
         the file itself. -->
    <span v-if="problem" class="field-error">
      <AppIcon name="alert-circle" :size="16" />
      <span v-if="problem === 'wrongType'">{{ $t('drop.badType', { name: refusedName }) }}</span>
      <span v-else-if="problem === 'tooBig'">
        {{ $t('drop.tooBig', { name: refusedName, size: refusedLabel, max: maxMb }) }}
      </span>
      <span v-else>{{ $t('drop.empty', { name: refusedName }) }}</span>
    </span>
    <span v-else-if="error" class="field-error">
      <AppIcon name="alert-circle" :size="16" />{{ error }}
    </span>

    <slot name="progress" />
  </div>
</template>

<style scoped>
.dz {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 12px 14px;
  border: 1.5px dashed var(--c-border, #d6dee0);
  border-radius: 12px;
  background: var(--c-surface-soft, #f7fafb);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}
.dz:hover,
.dz:focus-visible {
  border-color: var(--c-brand, #0ea5b7);
}
.dz.is-over {
  border-color: var(--c-brand, #0ea5b7);
  background: var(--brand-primary-soft, rgba(0, 194, 214, 0.08));
}
.dz.has-file {
  border-style: solid;
}
.dz.is-busy {
  cursor: default;
  opacity: 0.75;
}

/* Off-screen rather than display:none, so it stays focusable and the label
   still points at a real control. */
.dz-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.dz-ico {
  display: grid;
  place-items: center;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--brand-primary-soft, rgba(0, 194, 214, 0.12));
  color: var(--c-brand, #0ea5b7);
}
.dz-ico svg {
  width: 19px;
  height: 19px;
}

.dz-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.dz-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dz-meta {
  font-size: 13px;
  color: var(--ink-secondary, #5b6b6e);
}

.dz-x {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-secondary, #5b6b6e);
  cursor: pointer;
}
.dz-x:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--c-danger, #b42318);
}
.dz-x svg {
  width: 16px;
  height: 16px;
}
</style>
