<script setup lang="ts">
import { useBrandingStore } from '@/stores/branding'

/**
 * The logo, wherever it appears.
 *
 * A component rather than an import, so the admin changing it changes all of
 * them. The class comes from the caller through attribute fallthrough, because
 * the header, the footer and the printed sheet each size it their own way.
 */
const brand = useBrandingStore()
</script>

<template>
  <img :src="brand.logo" width="85" height="35" alt="" decoding="async" />
</template>
