<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import InstructorLine from '@/components/course/InstructorLine.vue'
import CoAccessNote from './CoAccessNote.vue'
import CoCouponApplied from './CoCouponApplied.vue'
import type { AccessNote, Coupon } from './types'
import type { CheckoutLine } from '@/lib/checkout'
import { num, money } from '@/lib/format'

/**
 * One course on the order, with its own coupon field.
 *
 * Coupons live on the line rather than in one box at the bottom because the
 * course-scoped ones only ever apply to a single course, and a single field
 * would have to explain which.
 *
 * The remove button appears only when there is more than one line: removing
 * the last one would leave an order with nothing in it.
 */
const props = defineProps<{
  /** What this basket is priced in. Every line shares it. */
  currency?: string
  line: CheckoutLine
  /** How many lines the order has, which decides whether removing is offered. */
  count: number
  /** The code typed in but not yet accepted, kept across re-renders. */
  draftCode: string
  error?: string
  busy?: boolean
}>()

const emit = defineEmits<{
  'update:draftCode': [code: string]
  apply: [slug: string, code: string]
  'remove-coupon': [slug: string]
  remove: [slug: string]
}>()

const { t, locale } = useI18n()

const view = computed(() => props.line.view)
const cid = computed(() => props.line.slug)
const titleId = computed(() => `co-it-${cid.value}`)
const inputId = computed(() => `cp-in-${cid.value}`)

/** The basket's currency, which every line in it shares — a basket that
 *  mixed two could not be charged at all, so the server refuses one. */
const asMoney = (n: number) => money(n, props.currency ?? 'THB', String(locale.value))

/**
 * The coupon as `CoCouponApplied` draws it. The server decided the discount;
 * this only names the code that earned it, because the page must never look
 * as though it worked the amount out itself.
 */
const applied = computed<Coupon | null>(() =>
  props.line.couponCode && props.line.discount > 0
    ? {
        code: props.line.couponCode,
        name: props.line.couponCode,
        scope: 'course',
        courseId: cid.value,
        type: 'amount',
        value: props.line.discount,
        condition: '',
        expires: '',
      }
    : null,
)

/**
 * What the buyer gets, and for how long.
 *
 * Only the two cases that can be told apart without a session: free, and
 * bought. Whether this buyer's old access has lapsed is a question for the
 * student API, which does not exist — and a renewal note shown on a guess
 * would be worse than none.
 */
const note = computed<AccessNote>(() => {
  if (props.line.net === 0) return { icon: 'gift', tone: 'success', kind: 'free' }
  return {
    icon: 'clock',
    tone: 'info',
    kind: 'access',
    days: props.line.accessDurationDays ?? 0,
  }
})

function submit() {
  emit('apply', cid.value, props.draftCode)
}
</script>

<template>
  <article class="co-item" :data-cid="cid" :aria-labelledby="titleId">
    <RouterLink class="co-item-media" :to="view.href" tabindex="-1" aria-hidden="true">
      <CourseImage
        :image="view.image"
        alt=""
        :width="336"
        :height="189"
        :art-icon="view.categoryIcon"
        :art-palette="view.categoryPalette"
        sizes="(max-width: 767px) 96px, 168px"
      />
    </RouterLink>

    <div class="co-item-head">
      <div class="co-item-cat">{{ view.categoryName }}</div>
      <h3 class="co-item-title" :id="titleId">
        <RouterLink :to="view.href">{{ view.title }}</RouterLink>
      </h3>
    </div>

    <div class="co-item-info">
      <InstructorLine :people="view.people" :course-id="cid" />
      <div class="co-item-meta">
        <span
          ><AppIcon name="book-open" />{{
            t('course.lessonCount', { count: view.lessonCount })
          }}</span
        >
        <span><AppIcon name="clock" />{{ view.durationLabel }}</span>
      </div>
      <CoAccessNote :note="note" />
    </div>

    <div class="co-item-price" data-slot="price">
      <template v-if="line.unitPrice === 0">
        <span class="co-price-lbl">{{ t('commerce.checkout.price') }}</span>
        <strong class="is-free">{{ t('commerce.free') }}</strong>
      </template>
      <template v-else-if="applied">
        <span class="co-price-lbl">{{ t('commerce.checkout.netPrice') }}</span>
        <s
          ><span class="sr-only">{{ t('commerce.checkout.priceBeforeCoupon') }}</span
          >{{ asMoney(line.unitPrice) }}</s
        >
        <strong class="is-net">{{ asMoney(line.net) }}</strong>
      </template>
      <template v-else>
        <span class="co-price-lbl">{{ t('commerce.checkout.price') }}</span>
        <s v-if="line.normalPrice"
          ><span class="sr-only">{{ t('commerce.normalPrice') }}</span
          >{{ asMoney(line.normalPrice) }}</s
        >
        <strong>{{ asMoney(line.unitPrice) }}</strong>
      </template>

      <button
        v-if="count > 1"
        type="button"
        class="btn btn--ghost btn--sm co-item-rm"
        :data-rm-item="cid"
        :aria-label="t('commerce.checkout.removeItemAria', { title: view.title })"
        @click="emit('remove', cid)"
      >
        <AppIcon name="trash" />{{ t('commerce.checkout.removeItem') }}
      </button>
    </div>

    <div v-if="line.unitPrice > 0" class="co-cp" data-slot="coupon">
      <CoCouponApplied
        v-if="applied"
        :coupon="applied"
        scope="course"
        :course-id="cid"
        :applies-to="view.title"
        :base="line.unitPrice"
        :disc="line.discount"
        :net="line.net"
        @remove="emit('remove-coupon', cid)"
      />
      <form v-else class="co-cp-form" :data-cp-form="cid" novalidate @submit.prevent="submit">
        <div class="field" :class="{ 'has-error': !!error }">
          <label class="label" :for="inputId">
            <AppIcon name="tag" />{{ t('commerce.checkout.courseCouponLabel') }}
          </label>
          <div class="co-cp-row">
            <input
              class="input"
              type="text"
              :id="inputId"
              name="code"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              :placeholder="t('commerce.checkout.couponPlaceholder')"
              :value="draftCode"
              :aria-invalid="error ? 'true' : undefined"
              :aria-describedby="error ? `cp-err-${cid}` : undefined"
              @input="emit('update:draftCode', ($event.target as HTMLInputElement).value)"
            />
            <button
              type="submit"
              class="btn btn--secondary"
              :class="{ 'is-loading': busy }"
              :disabled="busy"
            >
              <template v-if="busy">
                <span class="spinner" aria-hidden="true" /><span>{{
                  t('commerce.coupon.checking')
                }}</span>
              </template>
              <template v-else>{{ t('commerce.coupon.use') }}</template>
            </button>
          </div>
          <p v-if="error" class="field-error" :id="`cp-err-${cid}`">
            <AppIcon name="alert-circle" /><span>{{ error }}</span>
          </p>
        </div>
      </form>
    </div>
  </article>
</template>
