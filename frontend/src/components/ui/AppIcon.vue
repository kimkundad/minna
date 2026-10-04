<script setup lang="ts">
import { computed } from 'vue'
import { icon } from '@/vendor'

/**
 * Renders one of the 143 stroke icons from the prototype's set. The markup is
 * produced by the vendored icons.js so the SVG attributes stay byte-identical
 * to the design: same viewBox, stroke width, line caps and a11y handling.
 *
 * Passing `label` makes the icon meaningful to a screen reader; leaving it off
 * marks the icon decorative, which is right whenever adjacent text already says
 * what it means.
 */
const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    stroke?: number
    label?: string
    cls?: string
  }>(),
  { size: 24, stroke: 2 },
)

const html = computed(() =>
  icon(props.name, {
    size: props.size,
    stroke: props.stroke,
    ...(props.label ? { label: props.label } : {}),
    ...(props.cls ? { cls: props.cls } : {}),
  }),
)
</script>

<template>
  <span class="icon-slot" v-html="html" />
</template>

<style scoped>
/* The SVG must sit in the flow exactly where the raw markup used to, so this
   wrapper adds nothing of its own. */
.icon-slot {
  display: contents;
}
</style>
