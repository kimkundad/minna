<script setup lang="ts">
import { computed } from 'vue'
/**
 * Falls back to initials on a palette colour when there is no photo, which is
 * what keeps a list of people looking even rather than half-empty.
 *
 * Marked aria-hidden on purpose: every avatar in this design sits beside the
 * person's name, so announcing it again would only repeat.
 */
const props = withDefaults(
  defineProps<{
    name?: string
    initials?: string
    color?: number
    photo?: string | null
    size?: 'sm' | 'md' | 'lg' | 'xl'
    extraClass?: string
  }>(),
  { name: '', initials: '?', color: 0, photo: null, size: 'sm' },
)

/**
 * Fixture photos are stored as bare relative paths, which a browser resolves
 * against the current route — so the same avatar that works one level deep asks
 * for a path two levels deep and gets the SPA shell back. Anchor at the root.
 */
const photoUrl = computed(() => {
  const p = props.photo
  if (!p) return null
  return p.startsWith('assets/') ? '/' + p : p
})
</script>

<template>
  <span
    class="avatar"
    :class="[`avatar--${size}`, `av-${color}`, { 'avatar--photo': photo }, extraClass]"
    aria-hidden="true"
    :title="name"
  >
    <img v-if="photoUrl" :src="photoUrl" alt="" loading="lazy" decoding="async" />
    <template v-else>{{ initials }}</template>
  </span>
</template>
