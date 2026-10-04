<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { BadgeSpec } from '@/vendor'

/**
 * `onMedia` is for badges laid over a course thumbnail, where the CSS swaps in
 * a translucent dark ground so the label stays readable on any image.
 */
defineProps<{ badge: BadgeSpec; onMedia?: boolean }>()
</script>

<template>
  <span class="badge" :class="[`badge--${badge.kind}`, { 'badge--on-media': onMedia }]">
    <AppIcon v-if="badge.icon" :name="badge.icon" />{{ badge.text ?? (badge as any).label }}
  </span>
</template>
