<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * The clickable form of the advertising block: the same reserved box as
 * `ui/AdsSlot`, plus the "ลิงก์ผู้สนับสนุน" affordance the catalog's inline slot
 * carries.
 *
 * This exists here rather than in `ui/` only because `AdsSlot` has no `href`
 * yet; folding it back in is the right end state.
 */
defineProps<{ href: string }>()
</script>

<template>
  <aside class="ads" aria-label="พื้นที่โฆษณา">
    <a class="ads-box" :href="href" rel="sponsored noopener" data-proto-link>
      <span class="ads-label">ADS</span>
      <div class="ads-inner">
        <span class="ads-title">ADS / Sponsored</span>
        <span class="ads-size">พื้นที่โฆษณา · Desktop 4:1 · Mobile 4:5</span>
      </div>
      <span class="ads-link">ลิงก์ผู้สนับสนุน <AppIcon name="external" /></span>
    </a>
  </aside>
</template>
