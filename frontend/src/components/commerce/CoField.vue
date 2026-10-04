<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * One labelled form control, in the design's field shape.
 *
 * `max` turns it into a digits-only field with a counter — the tax ID, the ID
 * card number and the branch code are all fixed-length and all easier to get
 * right when you can see how many digits you have. The counter turns green on
 * the last one rather than warning you at the end.
 */
const props = withDefaults(
  defineProps<{
    id: string
    name: string
    label: string
    modelValue: string
    type?: string
    required?: boolean
    help?: string
    placeholder?: string
    autocomplete?: string
    inputmode?: string
    /** Fixed digit count: adds a counter and strips anything that is not a digit. */
    max?: number
    textarea?: boolean
    span?: boolean
    error?: string
  }>(),
  { type: 'text' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const helpId = computed(() => `${props.id}-h`)
const errorId = computed(() => `${props.id}-err`)

const describedBy = computed(() => {
  const ids = [props.help ? helpId.value : null, props.error ? errorId.value : null].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
})

function onInput(event: Event) {
  const el = event.target as HTMLInputElement | HTMLTextAreaElement
  let value = el.value
  if (props.max) {
    value = value.replace(/\D/g, '').slice(0, props.max)
    if (value !== el.value) el.value = value
  }
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="field" :class="{ 'span-2': span, 'has-error': !!error }">
    <div v-if="max" class="field-row">
      <label class="label" :for="id"
        >{{ label }} <span v-if="required" class="req" aria-hidden="true">*</span></label
      >
      <span
        class="counter"
        :class="{ 'is-done': modelValue.length === max }"
        :data-counter="name"
        aria-hidden="true"
        >{{ modelValue.length }}/{{ max }}</span
      >
    </div>
    <label v-else class="label" :for="id"
      >{{ label }} <span v-if="required" class="req" aria-hidden="true">*</span></label
    >

    <textarea
      v-if="textarea"
      class="textarea"
      :id="id"
      :name="name"
      rows="3"
      :aria-required="required ? 'true' : undefined"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :value="modelValue"
      @input="onInput"
    />
    <input
      v-else
      class="input"
      :class="{ tabular: !!max }"
      :type="type"
      :id="id"
      :name="name"
      :aria-required="required ? 'true' : undefined"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :maxlength="max"
      :placeholder="placeholder"
      :value="modelValue"
      @input="onInput"
    />

    <span v-if="help" class="field-help" :id="helpId">{{ help }}</span>
    <p v-if="error" class="field-error" :id="errorId">
      <AppIcon name="alert-circle" /><span>{{ error }}</span>
    </p>
  </div>
</template>
