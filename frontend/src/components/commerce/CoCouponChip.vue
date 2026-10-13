<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { num, money } from '@/lib/format'
import type { Coupon } from './types'

/**
 * A coupon offered as a chip, so nobody has to know a code by heart to use it.
 *
 * `dim` is for an order coupon whose minimum the basket has not reached yet. It
 * stays clickable on purpose: pressing it returns the store's own explanation
 * of how far short the total is, which is more use than a disabled button.
 */
const props = defineProps<{ coupon: Coupon; courseId?: string; dim?: boolean; currency?: string }>()

defineEmits<{ apply: [code: string, courseId?: string] }>()

const { t, locale } = useI18n()

/** The basket's currency, which every line in it shares — a basket that
 *  mixed two could not be charged at all, so the server refuses one. */
const asMoney = (n: number) => money(n, props.currency ?? 'THB', String(locale.value))

/** The short form on the chip: value first, then any minimum. */
const description = computed(() => {
  const c = props.coupon
  const value =
    c.type === 'percent'
      ? c.max
        ? t('commerce.coupon.percentUpTo', { pct: c.value, max: num(c.max) })
        : t('commerce.coupon.percent', { pct: c.value })
      : t('commerce.coupon.amount', { amount: asMoney(c.value) })
  return c.minSubtotal
    ? `${value} · ${t('commerce.coupon.minimum', { amount: asMoney(c.minSubtotal) })}`
    : value
})

const ariaLabel = computed(() => {
  const base = t('commerce.coupon.applyAria', {
    code: props.coupon.code,
    detail: description.value,
  })
  return props.dim ? `${base}${t('commerce.coupon.belowMinimumAria')}` : base
})
</script>

<template>
  <button
    type="button"
    class="co-cpc"
    :class="{ 'is-dim': dim }"
    :data-apply-cp="coupon.code"
    :data-cp-cid="courseId"
    :data-fk="`cpc-${courseId ?? 'order'}-${coupon.code}`"
    :aria-label="ariaLabel"
    @click="$emit('apply', coupon.code, courseId)"
  >
    <span class="co-cpc-code"><AppIcon name="tag" />{{ coupon.code }}</span>
    <span class="co-cpc-desc">{{ description }}</span>
  </button>
</template>
