<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { num } from '@/lib/format'

const { t } = useI18n()

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
    <strong>{{ t('commerce.free') }}</strong
    ><span class="text-xs text-muted">{{ t('commerce.freeForMembers') }}</span>
  </div>
  <div v-else class="price" :class="{ 'price--lg': lg }">
    <strong>{{ t('commerce.baht', { n: num(price) }) }}</strong>
    <s v-if="normalPrice"
      ><span class="sr-only">{{ t('commerce.normalPrice') }} </span
      >{{ t('commerce.baht', { n: num(normalPrice) }) }}</s
    >
  </div>
</template>
