<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { num, money } from '@/lib/format'

/**
 * The money breakdown: course prices, then each kind of discount.
 *
 * Every row stays even at zero, in the muted `is-zero` style. A summary that
 * grows and shrinks as coupons come and go is one people stop trusting,
 * because the number they remember has moved somewhere else on the card.
 *
 * `totalDisc` is left out on the confirmation page, where the order is already
 * settled and the combined-savings line has nothing left to decide.
 */
const props = defineProps<{
  /** What this basket is priced in. Every line shares it. */
  currency?: string
  count: number
  subtotal: number
  courseDisc: number
  orderDisc: number
  orderCouponCode?: string | null
  totalDisc?: number
  /** What the server worked out. Omitted where the order is free. */
  vat?: number
  /** Whether that VAT is already inside the total or was added to it. */
  vatInclusive?: boolean
}>()

const { t, locale } = useI18n()
/** The basket's currency, which every line in it shares — a basket that
 *  mixed two could not be charged at all, so the server refuses one. */
const asMoney = (n: number) => money(n, props.currency ?? 'THB', String(locale.value))
const minus = (n: number) => (n ? `−${asMoney(n)}` : asMoney(0))
</script>

<template>
  <dl class="co-rows">
    <div>
      <dt
        >{{ t('commerce.totals.courses')
        }}<small>{{ t('commerce.courseCount', { n: props.count }) }}</small></dt
      >
      <dd>{{ asMoney(props.subtotal) }}</dd>
    </div>
    <div :class="props.courseDisc ? 'is-disc' : 'is-zero'">
      <dt>{{ t('commerce.totals.courseCoupons') }}</dt>
      <dd>{{ minus(props.courseDisc) }}</dd>
    </div>
    <div :class="props.orderDisc ? 'is-disc' : 'is-zero'">
      <dt
        >{{ t('commerce.totals.orderCoupon')
        }}<small v-if="props.orderCouponCode">{{ props.orderCouponCode }}</small></dt
      >
      <dd>{{ minus(props.orderDisc) }}</dd>
    </div>
    <div v-if="props.vat" class="is-sep" :class="{ 'is-zero': props.vatInclusive }">
      <dt
        >{{ t('commerce.totals.vat')
        }}<small v-if="props.vatInclusive">{{ t('commerce.totals.vatIncluded') }}</small></dt
      >
      <dd>{{ props.vatInclusive ? asMoney(props.vat) : '+' + asMoney(props.vat) }}</dd>
    </div>
    <div v-if="props.totalDisc !== undefined" class="is-sep" :class="props.totalDisc ? 'is-disc' : 'is-zero'">
      <dt>{{ t('commerce.totals.allDiscounts') }}</dt>
      <dd>{{ minus(props.totalDisc) }}</dd>
    </div>
  </dl>
</template>
