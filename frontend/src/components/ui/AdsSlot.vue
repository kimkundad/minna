<script setup lang="ts">
/** A reserved advertising block. It renders at full size even with nothing
 *  sold, so the surrounding layout does not shift when a campaign starts. */
defineProps<{ extraClass?: string }>()
</script>

<template>
  <aside class="ads" :class="extraClass" aria-label="พื้นที่โฆษณา">
    <div class="ads-box">
      <span class="ads-label">ADS</span>
      <div class="ads-inner">
        <span class="ads-title">ADS / Sponsored</span>
        <span class="ads-size">พื้นที่โฆษณา · Desktop 4:1 · Mobile 4:5</span>
      </div>
    </div>
  </aside>
</template>
