<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import InstructorLine from '@/components/course/InstructorLine.vue'
import CoAccessNote from './CoAccessNote.vue'
import CoCouponApplied from './CoCouponApplied.vue'
import CoCouponChip from './CoCouponChip.vue'
import { assetUrl, call, protoHref } from './useCommerce'
import { data, store } from '@/vendor'
import type { AccessNote, CommerceCategory, Coupon, TotalsLine } from './types'
import { num } from '@/lib/format'

/**
 * One course on the order, with its own coupon field.
 *
 * Coupons live on the line rather than in one box at the bottom because the
 * course-scoped ones only ever apply to a single course, and a single field
 * would have to explain which. The codes that do apply are offered as chips,
 * so nobody has to have one written down to use it.
 *
 * The remove button appears only when there is more than one line: removing
 * the last one would leave an order with nothing in it.
 */
const props = defineProps<{
  line: TotalsLine
  /** How many lines the order has, which decides whether removing is offered. */
  count: number
  /** The code typed in but not yet accepted, kept across re-renders. */
  draftCode: string
  error?: string
  busy?: boolean
}>()

const emit = defineEmits<{
  'update:draftCode': [code: string]
  apply: [courseId: string, code: string]
  'remove-coupon': [courseId: string]
  remove: [courseId: string]
  instructors: [courseId: string]
}>()

const { t } = useI18n()
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))

const course = computed(() => props.line.course)
const cid = computed(() => props.line.cid)
const category = computed(() => call<CommerceCategory | null>('category', course.value.category))
const courseHref = computed(() => protoHref(`course.html?id=${cid.value}`, locale.value))
const image = computed(() => {
  const img = course.value.image
  return img ? { ...img, src: assetUrl(img.src) ?? undefined } : null
})
const titleId = computed(() => `co-it-${cid.value}`)
const inputId = computed(() => `cp-in-${cid.value}`)

const baht = (n: number) => t('commerce.baht', { n: num(n) })

/** Course-scoped codes for this course, offered as chips. */
const hints = computed(() =>
  (data.coupons as unknown as Coupon[]).filter(
    (c) => c.scope === 'course' && c.courseId === cid.value,
  ),
)

const note = computed<AccessNote>(() => {
  const c = course.value
  if (c.isFree) return { icon: 'gift', tone: 'success', kind: 'free' }
  const access = call<{ reason?: string }>('access', cid.value)
  if (access.reason === 'expired') {
    const pr = call<{ pct: number }>('progress', cid.value)
    return { icon: 'refresh', tone: 'renew', kind: 'renew-short', pct: pr.pct, days: c.accessDays }
  }
  return { icon: 'clock', tone: 'info', kind: 'access', days: c.accessDays }
})

function submit() {
  emit('apply', cid.value, props.draftCode)
}

/** Lesson count stands where the reference showed CE units, which Minna does
 *  not award. */
const lessonCount = computed(
  () => (store as unknown as { lessons: (c: unknown) => unknown[] }).lessons(props.line.course).length,
)
</script>

<template>
  <article class="co-item" :data-cid="cid" :aria-labelledby="titleId">
    <a class="co-item-media" :href="courseHref" tabindex="-1" aria-hidden="true">
      <CourseImage
        :image="image"
        alt=""
        :width="336"
        :height="189"
        :art-icon="category?.icon"
        :art-palette="category?.palette"
        sizes="(max-width: 767px) 96px, 168px"
      />
    </a>

    <div class="co-item-head">
      <div class="co-item-cat">{{ category?.name ?? '' }}</div>
      <h3 class="co-item-title" :id="titleId">
        <a :href="courseHref">{{ course.title }}</a>
      </h3>
    </div>

    <div class="co-item-info">
      <InstructorLine
        :instructors="course.instructors"
        :course-id="cid"
        @open="emit('instructors', cid)"
      />
      <div class="co-item-meta">
        <span><AppIcon name="book-open" />{{ t('course.lessonCount', lessonCount) }}</span>
        <span><AppIcon name="clock" />{{ course.durationLabel }}</span>
      </div>
      <CoAccessNote :note="note" />
    </div>

    <div class="co-item-price" data-slot="price">
      <template v-if="course.isFree">
        <span class="co-price-lbl">{{ t('commerce.checkout.price') }}</span>
        <strong class="is-free">{{ t('commerce.free') }}</strong>
      </template>
      <template v-else-if="line.coupon">
        <span class="co-price-lbl">{{ t('commerce.checkout.netPrice') }}</span>
        <s
          ><span class="sr-only">{{ t('commerce.checkout.priceBeforeCoupon') }}</span
          >{{ baht(line.price) }}</s
        >
        <strong class="is-net">{{ baht(line.net) }}</strong>
      </template>
      <template v-else>
        <span class="co-price-lbl">{{ t('commerce.checkout.price') }}</span>
        <s v-if="course.normalPrice && course.normalPrice > course.price"
          ><span class="sr-only">{{ t('commerce.normalPrice') }}</span
          >{{ baht(course.normalPrice) }}</s
        >
        <strong>{{ baht(line.price) }}</strong>
      </template>

      <button
        v-if="count > 1"
        type="button"
        class="btn btn--ghost btn--sm co-item-rm"
        :data-rm-item="cid"
        :data-fk="`rmi-${cid}`"
        :aria-label="t('commerce.checkout.removeItemAria', { title: course.title })"
        @click="emit('remove', cid)"
      >
        <AppIcon name="trash" />{{ t('commerce.checkout.removeItem') }}
      </button>
    </div>

    <div v-if="!course.isFree" class="co-cp" data-slot="coupon">
      <CoCouponApplied
        v-if="line.coupon"
        :coupon="line.coupon"
        scope="course"
        :course-id="cid"
        :applies-to="course.title"
        :base="line.price"
        :disc="line.disc"
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
              :data-fk="`cp-go-${cid}`"
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
        <div v-if="hints.length" class="co-cp-hints">
          <span>{{ t('commerce.checkout.courseCouponHints') }}</span>
          <CoCouponChip
            v-for="h in hints"
            :key="h.code"
            :coupon="h"
            :course-id="cid"
            @apply="(code) => emit('apply', cid, code)"
          />
        </div>
      </form>
    </div>
  </article>
</template>
