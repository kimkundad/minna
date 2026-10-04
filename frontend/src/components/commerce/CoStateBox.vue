<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * The design's empty / gate box: a glyph, a heading, a sentence and the way
 * out.
 *
 * `plain` is the signed-out gate variant — a solid border on white rather than
 * the dashed outline an empty list gets — because being asked to sign in is not
 * the same kind of nothing as having nothing yet.
 */
withDefaults(defineProps<{ icon?: string; title: string; text?: string; plain?: boolean }>(), {
  icon: 'inbox',
})
</script>

<template>
  <div
    class="state-box"
    :class="{ 'state-box--plain': plain }"
    :style="plain ? 'padding:56px 24px' : undefined"
  >
    <div class="state-ico"><AppIcon :name="icon" /></div>
    <h3>{{ title }}</h3>
    <p v-if="text">{{ text }}</p>
    <div v-if="$slots.actions" class="state-actions"><slot name="actions" /></div>
  </div>
</template>
