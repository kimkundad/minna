<script setup lang="ts">
import { num } from '@/lib/format'

/** A struck-through normal price only appears when there is one, so a course
 *  never looks discounted by an empty element. */
defineProps<{
  price: number
  normalPrice?: number | null
  isFree?: boolean
  lg?: boolean
}>()
</script>

<template>
  <div v-if="isFree" class="price price--free" :class="{ 'price--lg': lg }">
    <strong>ฟรี</strong><span class="text-xs text-muted">สำหรับสมาชิก</span>
  </div>
  <div v-else class="price" :class="{ 'price--lg': lg }">
    <strong>{{ num(price) }} บาท</strong>
    <s v-if="normalPrice"><span class="sr-only">ราคาปกติ </span>{{ num(normalPrice) }} บาท</s>
  </div>
</template>
