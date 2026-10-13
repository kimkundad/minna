<script setup lang="ts">
import { useBrandingStore } from '@/stores/branding'

/**
 * The logo in the admin's own chrome.
 *
 * One component so the settings screen changes every copy of it. With nothing
 * uploaded it renders TailAdmin's light and dark pair as before; with a logo of
 * the school's own there is one picture, used on either background.
 */
withDefaults(defineProps<{ variant?: 'wide' | 'icon'; width?: number; height?: number }>(), {
  variant: 'wide',
})

const brand = useBrandingStore()
</script>

<template>
  <img
    v-if="variant === 'icon'"
    :src="brand.icon"
    alt="Logo"
    :width="width ?? 32"
    :height="height ?? 32"
  />
  <img
    v-else-if="brand.custom"
    :src="brand.logo"
    alt="Logo"
    :width="width"
    :height="height"
    class="max-h-10 w-auto"
  />
  <template v-else>
    <img class="dark:hidden" :src="brand.logo" alt="Logo" :width="width" :height="height" />
    <img class="hidden dark:block" :src="brand.logoDark" alt="Logo" :width="width" :height="height" />
  </template>
</template>
