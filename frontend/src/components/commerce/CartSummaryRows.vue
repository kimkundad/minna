<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { num, money } from '@/lib/format'

/**
 * The cart's three summary rows, shared by the sidebar card and the mobile
 * sticky bar so the two can never disagree.
 *
 * Only selected lines are counted. A discount of zero still gets its row, in
 * the muted `is-zero` style rather than being dropped, so the shape of the
 * summary does not jump as coupons and selections change.
 */
const props = defineProps<{ count: number; normal: number; saving: number; currency?: string }>()

const { t, locale } = useI18n()
/** The basket's currency, which every line in it shares — a basket that
 *  mixed two could not be charged at all, so the server refuses one. */
const asMoney = (n: number) => money(n, props.currency ?? 'THB', String(locale.value))
</script>

<template>
  <dl class="co-rows">
    <div>
      <dt>{{ t('commerce.cart.selectedCount') }}</dt>
      <dd>{{ t('commerce.courseCount', { n: props.count }) }}</dd>
    </div>
    <div>
      <dt>{{ t('commerce.cart.normalTotal') }}</dt>
      <dd>{{ asMoney(props.normal) }}</dd>
    </div>
    <div :class="props.saving ? 'is-disc' : 'is-zero'">
      <dt>{{ t('commerce.cart.normalDiscount') }}</dt>
      <dd>{{ props.saving ? `−${asMoney(props.saving)}` : asMoney(0) }}</dd>
    </div>
  </dl>
</template>
