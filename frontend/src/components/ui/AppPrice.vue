<script setup lang="ts">

import { useI18n } from 'vue-i18n'
import { money } from '@/lib/format'

const { t, locale } = useI18n()

/** A struck-through normal price only appears when there is one, so a course
 *  never looks discounted by an empty element. */
const props = withDefaults(
  defineProps<{
    price: number
    normalPrice?: number | null
    isFree?: boolean
    lg?: boolean
    /**
     * What the price is in. A course is charged in the currency its teacher
     * set, wherever the buyer is, so this travels with the number rather than
     * being assumed — the old wording said "บาท" for every price on the site,
     * which for a euro course would have been a figure with the wrong
     * currency's name on it.
     */
    currency?: string
  }>(),
  { currency: 'THB' },
)

/** Each language writes money its own way; `money` knows the conventions. */
const asMoney = (n: number) => money(n, props.currency, String(locale.value))
</script>

<template>
  <div v-if="isFree" class="price price--free" :class="{ 'price--lg': lg }">
    <strong>{{ t('commerce.free') }}</strong
    ><span class="text-xs text-muted">{{ t('commerce.freeForMembers') }}</span>
  </div>
  <div v-else class="price" :class="{ 'price--lg': lg }">
    <strong>{{ asMoney(price) }}</strong>
    <s v-if="normalPrice"
      ><span class="sr-only">{{ t('commerce.normalPrice') }} </span>{{ asMoney(normalPrice) }}</s
    >
  </div>
</template>
