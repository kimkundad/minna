<script setup lang="ts">
import { computed } from 'vue'
import { pct as clamp } from '@/lib/format'

/**
 * `progress--done` is not a prop: it follows from reaching 100, so a finished
 * course can never be styled as unfinished by mistake.
 *
 * Width comes from the `--p` custom property alone, as the design's CSS expects
 * — setting an inline width instead would bypass its transition.
 */
const props = withDefaults(
  defineProps<{ value: number; lg?: boolean; muted?: boolean; label?: string }>(),
  { label: 'ความคืบหน้าการเรียน' },
)

const value = computed(() => clamp(props.value))
</script>

<template>
  <div
    class="progress"
    :class="{ 'progress--done': value >= 100, 'progress--muted': muted, 'progress--lg': lg }"
  >
    <div
      class="progress-track"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="value"
      :aria-label="label"
    >
      <div class="progress-fill" :style="{ '--p': `${value}%` }" />
    </div>
    <span class="progress-label">{{ value }}%</span>
  </div>
</template>
