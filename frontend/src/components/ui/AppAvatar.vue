<script setup lang="ts">
/**
 * Falls back to initials on a palette colour when there is no photo, which is
 * what keeps a list of people looking even rather than half-empty.
 *
 * Marked aria-hidden on purpose: every avatar in this design sits beside the
 * person's name, so announcing it again would only repeat.
 */
withDefaults(
  defineProps<{
    name?: string
    initials?: string
    color?: number
    photo?: string | null
    size?: 'sm' | 'md' | 'lg'
    extraClass?: string
  }>(),
  { name: '', initials: '?', color: 0, photo: null, size: 'sm' },
)
</script>

<template>
  <span
    class="avatar"
    :class="[`avatar--${size}`, `av-${color}`, { 'avatar--photo': photo }, extraClass]"
    aria-hidden="true"
    :title="name"
  >
    <img v-if="photo" :src="photo" alt="" loading="lazy" decoding="async" />
    <template v-else>{{ initials }}</template>
  </span>
</template>
