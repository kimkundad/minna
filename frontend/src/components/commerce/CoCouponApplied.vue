<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { num } from '@/lib/format'
import type { Coupon } from './types'

/**
 * A coupon that is already on the order, with the arithmetic it caused written
 * out: price, minus the discount, equals the net. People check a discount
 * against the number they expected, and showing only the new total makes that
 * impossible.
 *
 * An order coupon can become invalid without being removed — take a course out
 * and the basket can drop under its minimum. That state is kept visible in
 * amber rather than silently dropping the code, so the total is explained
 * rather than just smaller than hoped.
 */
const props = defineProps<{
  coupon: Coupon
  /** Which scope this is, which decides the labels and the focus key. */
  scope: 'course' | 'order'
  /** Course title, or "the whole order (N courses)". */
  appliesTo: string
  courseId?: string
  base: number
  disc: number
  net: number
  invalid?: boolean
}>()

defineEmits<{ remove: [courseId?: string] }>()

const { t } = useI18n()
const baht = (n: number) => t('commerce.baht', { n: num(n) })

/** The full value, spelled out for the detail list. */
const value = computed(() => {
  const c = props.coupon
  if (c.type !== 'percent') return t('commerce.coupon.amount', { amount: baht(c.value) })
  return c.max
    ? t('commerce.coupon.percentMax', { pct: c.value, max: baht(c.max) })
    : t('commerce.coupon.percent', { pct: c.value })
})

const ariaLabel = computed(() => {
  if (props.scope === 'course') {
    return t('commerce.coupon.appliedCourseAria', {
      code: props.coupon.code,
      amount: baht(props.disc),
    })
  }
  return props.invalid
    ? t('commerce.coupon.appliedOrderInvalidAria', { code: props.coupon.code })
    : t('commerce.coupon.appliedOrderAria', {
        code: props.coupon.code,
        amount: baht(props.disc),
      })
})

const calc = computed(() =>
  props.scope === 'course'
    ? {
        before: t('commerce.coupon.calcPriceBefore'),
        off: t('commerce.coupon.calcDiscount'),
        after: t('commerce.coupon.calcPriceAfter'),
      }
    : {
        before: t('commerce.coupon.calcTotalBefore'),
        off: t('commerce.coupon.calcDiscount'),
        after: t('commerce.coupon.calcTotalAfter'),
      },
)
</script>

<template>
  <div
    class="co-cp-applied"
    :class="{ 'is-invalid': invalid }"
    tabindex="-1"
    :data-fk="scope === 'course' ? `cpbox-${courseId}` : 'ocpbox'"
    role="group"
    :aria-label="ariaLabel"
  >
    <div class="co-cp-ahead">
      <span class="co-cp-code"><AppIcon name="tag" />{{ coupon.code }}</span>
      <span v-if="invalid" class="badge badge--access-expired">
        <AppIcon name="alert-triangle" />{{ t('commerce.coupon.badgeInvalid') }}
      </span>
      <span v-else class="badge badge--done">
        <AppIcon name="check" />{{ t('commerce.coupon.badgeApplied') }}
      </span>
      <button
        type="button"
        class="btn btn--ghost btn--sm co-cp-rm"
        :data-rm-cp="scope === 'course' ? courseId : undefined"
        :data-rm-ocp="scope === 'order' ? '' : undefined"
        :data-fk="scope === 'course' ? `rmcp-${courseId}` : 'rm-ocp'"
        :aria-label="t('commerce.coupon.removeAria', { code: coupon.code })"
        @click="$emit('remove', courseId)"
      >
        <AppIcon name="x" />{{ t('commerce.coupon.remove') }}
      </button>
    </div>

    <dl class="co-cp-dl">
      <dt>{{ t('commerce.coupon.name') }}</dt>
      <dd>{{ coupon.name }}</dd>
      <dt>{{ t('commerce.coupon.condition') }}</dt>
      <dd>{{ coupon.condition }}</dd>
      <dt>{{ t('commerce.coupon.value') }}</dt>
      <dd>{{ value }}</dd>
      <dt>{{ scope === 'course' ? t('commerce.coupon.forCourse') : t('commerce.coupon.forOrder') }}</dt>
      <dd>{{ appliesTo }}</dd>
    </dl>

    <p v-if="invalid" class="co-cp-warn">
      <AppIcon name="alert-triangle" /><span>{{
        t('commerce.coupon.belowMinimum', {
          current: baht(base),
          minimum: baht(coupon.minSubtotal ?? 0),
        })
      }}</span>
    </p>

    <div v-else class="co-cp-calc">
      <div>
        <small>{{ calc.before }}</small>
        <b>{{ baht(base) }}</b>
      </div>
      <AppIcon name="arrow-right" />
      <div class="is-disc">
        <small>{{ calc.off }}</small>
        <b>{{ disc ? `−${baht(disc)}` : baht(0) }}</b>
      </div>
      <AppIcon name="arrow-right" />
      <div class="is-net">
        <small>{{ calc.after }}</small>
        <b>{{ baht(net) }}</b>
      </div>
    </div>
  </div>
</template>
