<script setup lang="ts">
import { computed } from 'vue'
import { ICON_PATHS } from '@/lib/icon-paths'

/**
 * One of the public site's own icons, drawn here.
 *
 * The admin has its own icons for its own furniture; this is for showing what
 * a visitor will see. Picking one from a list of names — "compass", "route",
 * "signal", "target" — told nobody anything, and the only way to tell them
 * apart was to save and go and look at the site.
 *
 * The paths are generated from the site's set by
 * `api/scripts/sync-icon-names.mts`, so a name the admin can draw is a name
 * the site can draw. An unknown one renders as nothing rather than as a box:
 * the API refuses to store one, so this only happens to rows that predate the
 * rule, and an empty space beside its name is honest about that.
 */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })

const markup = computed(() => ICON_PATHS[props.name] ?? '')
</script>

<template>
  <svg
    v-if="markup"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="markup"
  />
</template>
