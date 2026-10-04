<script setup lang="ts">
/**
 * Placeholder cards for the moment between changing a filter and the new
 * results arriving.
 *
 * It keeps the same number of cards the reference uses — six in the grid, three
 * in the list — so the page does not jump height when the real ones land.
 */
defineProps<{ count: number }>()
</script>

<template>
  <div v-for="n in count" :key="n" class="sk-card" aria-hidden="true">
    <div class="sk sk-media" />
    <div class="sk-body">
      <div class="sk sk-line w-40" />
      <div class="sk sk-line h-20 w-90" />
      <div class="sk sk-line h-20 w-60" />
      <div class="sk sk-line w-80" />
      <div class="sk sk-line w-40" />
    </div>
  </div>
</template>
