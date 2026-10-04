<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import CheckoutItem from '@/components/commerce/CheckoutItem.vue'
import CoCouponApplied from '@/components/commerce/CoCouponApplied.vue'
import CoCouponChip from '@/components/commerce/CoCouponChip.vue'
import CoField from '@/components/commerce/CoField.vue'
import CoStateBox from '@/components/commerce/CoStateBox.vue'
import CoSteps from '@/components/commerce/CoSteps.vue'
import CoTaxPanel from '@/components/commerce/CoTaxPanel.vue'
import CoTotalsRows from '@/components/commerce/CoTotalsRows.vue'
import CommerceConfirm from '@/components/commerce/CommerceConfirm.vue'
import CommerceToasts from '@/components/commerce/CommerceToasts.vue'
import {
  assetUrl,
  call,
  confirm,
  protoHref,
  toast,
  useBottomBar,
  useStoreTick,
} from '@/components/commerce/useCommerce'
import type {
  CheckoutErrors,
  CheckoutForm,
  CommerceCategory,
  CommerceCourse,
  Coupon,
  Order,
  Totals,
} from '@/components/commerce/types'
import { data } from '@/vendor'
import { num } from '@/lib/format'

/**
 * The order page — step two of four, and five numbered sections: what you are
 * buying, who you are, whether you need a tax invoice, how you will pay, and
 * the total.
 *
 * Nothing here works out its own prices. `store.computeTotals` takes the lines,
 * the per-course coupons and the order coupon and returns every figure on the
 * page, and `store.validateCourseCoupon` / `validateOrderCoupon` decide whether
 * a code is allowed — including the reason it is not, which is shown verbatim
 * rather than reworded into something vaguer.
 *
 * An order that comes to nothing — all free courses, or coupons that cover the
 * whole amount — drops the tax section entirely and renumbers the rest, since
 * there is no payment to document.
 *
 * Which courses are on the order is settled once, by `resolveItems`: the
 * `items` query if there is one, then a saved draft, then whatever is selected
 * in the cart. Anything in that list that cannot be bought is lifted out into
 * a notice at the top rather than silently dropped, so a total that is smaller
 * than expected always has a reason attached.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const tick = useStoreTick()
/**
 * The checkout draft is saved without an event — `store.setCheckoutDraft`
 * writes the bucket and stops there — so the store's own tick never moves when
 * a coupon is applied. This ref is what the coupon computeds watch instead.
 */
const draftTick = ref(0)
function writeDraft(patch: Record<string, unknown>) {
  call('setCheckoutDraft', patch)
  draftTick.value += 1
}
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
const baht = (n: number) => t('commerce.baht', { n: num(n) })

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isLoggedIn = computed(() => {
  void tick.value
  return Boolean(call<boolean>('isLoggedIn'))
})

/* ---------------- which courses are on this order ---------------- */

type Block = 'package' | 'owned' | 'ended' | 'missing'

const resolved = computed(() => {
  void tick.value
  void draftTick.value
  const param = String(route.query.items ?? '')
  const draft = isLoggedIn.value
    ? call<{ items?: string[] } | null>('checkoutDraft')
    : null

  let raw: string[]
  let source: 'param' | 'draft' | 'cart'
  if (param) {
    raw = param.split(',').map((s) => s.trim()).filter(Boolean)
    source = 'param'
  } else if (draft?.items?.length) {
    raw = draft.items.slice()
    source = 'draft'
  } else {
    raw = call<string[]>('selectedCart')
    source = 'cart'
  }

  const items: string[] = []
  const removed: { cid: string; block: Block }[] = []
  raw.forEach((cid) => {
    if (items.includes(cid) || removed.some((r) => r.cid === cid)) return
    const block = call<CommerceCourse | null>('course', cid)
      ? (call<Block | null>('cartBlock', cid) ?? null)
      : 'missing'
    if (block) removed.push({ cid, block })
    else items.push(cid)
  })
  return { items, removed, source }
})

/** Lines taken out of the order by hand, which the draft also forgets. */
const dropped = ref<string[]>([])
const items = computed(() => resolved.value.items.filter((cid) => !dropped.value.includes(cid)))

const courseCoupons = computed<Record<string, string>>(() => {
  void tick.value
  void draftTick.value
  const draft = call<{ courseCoupons?: Record<string, string> } | null>('checkoutDraft')
  const out: Record<string, string> = {}
  Object.entries(draft?.courseCoupons ?? {}).forEach(([cid, code]) => {
    if (items.value.includes(cid) && code) out[cid] = code
  })
  return out
})

const orderCouponCode = computed(() => {
  void tick.value
  void draftTick.value
  return call<{ orderCoupon?: string | null } | null>('checkoutDraft')?.orderCoupon ?? null
})

const totals = computed(() =>
  call<Totals>('computeTotals', items.value, courseCoupons.value, orderCouponCode.value),
)

/** An order with nothing left to pay skips the invoice and the card details. */
const isFree = computed(
  () => totals.value.lines.length > 0 && (totals.value.allFree || totals.value.net === 0),
)

/** Keeps the saved draft in step, so coupons survive a reload. */
watch(
  [items, isLoggedIn],
  () => {
    if (!isLoggedIn.value || !items.value.length) return
    const draft = call<{ items?: string[] } | null>('checkoutDraft')
    const source = resolved.value.source === 'param' ? 'buy-now' : 'cart'
    if (!draft) {
      writeDraft({
        items: items.value.slice(),
        source,
        courseCoupons: {},
        orderCoupon: null,
      })
      return
    }
    const existing = draft.items ?? []
    const subset = items.value.every((cid) => existing.includes(cid))
    if (!subset) {
      writeDraft({
        items: items.value.slice(),
        source,
        courseCoupons: {},
        orderCoupon: null,
      })
    } else if (existing.length !== items.value.length) {
      writeDraft({ items: items.value.slice(), courseCoupons: courseCoupons.value })
    }
  },
  { immediate: true },
)

/* ---------------- the form ---------------- */

const form = reactive<CheckoutForm>({
  buyerName: '',
  buyerEmail: '',
  buyerPhone: '',
  taxWant: 'no',
  taxType: 'corporate',
  company: '',
  taxId: '',
  branchType: 'head',
  branchNo: '',
  taxFirstName: '',
  taxLastName: '',
  idCard: '',
  address: '',
  method: 'qr',
  terms: false,
})

const errors = ref<CheckoutErrors>({})
const ctaMessage = ref('')

/** Prefilled from the profile; edits here apply to this order only. */
watch(
  isLoggedIn,
  (loggedIn) => {
    if (!loggedIn) return
    const p = call<Record<string, string>>('profile') ?? {}
    form.buyerName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
    form.buyerEmail = p.email ?? ''
    form.buyerPhone = p.phone ?? ''
    form.taxFirstName = p.firstName ?? ''
    form.taxLastName = p.lastName ?? ''
  },
  { immediate: true },
)

function validate(): CheckoutErrors {
  const e: CheckoutErrors = {}
  if (!form.buyerName.trim()) e.buyerName = t('commerce.error.name')

  const email = form.buyerEmail.trim()
  if (!email) e.buyerEmail = t('commerce.error.emailRequired')
  else if (!EMAIL.test(email)) e.buyerEmail = t('commerce.error.emailFormat')

  const phone = form.buyerPhone.trim()
  const digits = phone.replace(/[\s\-().]/g, '')
  const digitCount = (digits.match(/\d/g) ?? []).length
  if (!phone) e.buyerPhone = t('commerce.error.phoneRequired')
  else if (!/^\+?[0-9Xx]{9,12}$/.test(digits) || digitCount < 4)
    e.buyerPhone = t('commerce.error.phoneFormat')

  if (!isFree.value && form.taxWant === 'yes') {
    if (form.taxType === 'corporate') {
      if (!form.company.trim()) e.company = t('commerce.error.company')
      if (!form.taxId) e.taxId = t('commerce.error.taxIdRequired')
      else if (!/^\d{13}$/.test(form.taxId)) e.taxId = t('commerce.error.taxIdFormat')
      if (form.branchType === 'branch' && !/^\d{5}$/.test(form.branchNo))
        e.branchNo = t('commerce.error.branchNo')
    } else {
      if (!form.taxFirstName.trim()) e.taxFirstName = t('commerce.error.firstName')
      if (!form.taxLastName.trim()) e.taxLastName = t('commerce.error.lastName')
      if (!form.idCard) e.idCard = t('commerce.error.idCardRequired')
      else if (!/^\d{13}$/.test(form.idCard)) e.idCard = t('commerce.error.idCardFormat')
    }
    const address = form.address.trim()
    if (!address) e.address = t('commerce.error.addressRequired')
    else if (address.length < 10) e.address = t('commerce.error.addressShort')
  }
  return e
}

/* ---------------- coupons ---------------- */

const couponDrafts = ref<Record<string, string>>({})
const couponErrors = ref<Record<string, string>>({})
const couponBusy = ref<string | null>(null)
const orderCouponDraft = ref('')
const orderCouponError = ref('')
const orderCouponBusy = ref(false)

const orderCouponHints = computed(() =>
  (data.coupons as unknown as Coupon[]).filter((c) => c.scope === 'order'),
)
const baseAfterCourse = computed(() => totals.value.subtotal - totals.value.courseDisc)

/** A short pause before the verdict: the prototype's, and it reads as the
 *  code being checked rather than the page flickering. */
const pause = () => new Promise((r) => setTimeout(r, 420))

async function applyCourseCoupon(cid: string, raw: string) {
  const code = String(raw ?? '').trim().toUpperCase()
  couponDrafts.value = { ...couponDrafts.value, [cid]: code }
  if (code) {
    couponBusy.value = cid
    await pause()
    couponBusy.value = null
  }

  const result = call<{ ok: boolean; error?: string; coupon?: Coupon }>(
    'validateCourseCoupon',
    code,
    cid,
  )
  if (!result.ok) {
    couponErrors.value = { ...couponErrors.value, [cid]: result.error ?? '' }
    return
  }
  writeDraft({
    courseCoupons: { ...courseCoupons.value, [cid]: result.coupon!.code },
  })
  const { [cid]: _dropped, ...rest } = couponErrors.value
  couponErrors.value = rest
  couponDrafts.value = { ...couponDrafts.value, [cid]: '' }
  const line = totals.value.lines.find((l) => l.cid === cid)
  toast(
    t('commerce.coupon.applied', {
      code: result.coupon!.code,
      amount: baht(line?.disc ?? 0),
    }),
    { type: 'success' },
  )
}

function removeCourseCoupon(cid: string) {
  const next = { ...courseCoupons.value }
  const code = next[cid]
  delete next[cid]
  writeDraft({ courseCoupons: next })
  toast(t('commerce.coupon.removed', { code: code ?? '' }), { type: 'info' })
}

async function applyOrderCoupon(raw: string) {
  const code = String(raw ?? '').trim().toUpperCase()
  orderCouponDraft.value = code
  if (code) {
    orderCouponBusy.value = true
    await pause()
    orderCouponBusy.value = false
  }

  const result = call<{ ok: boolean; error?: string; coupon?: Coupon }>(
    'validateOrderCoupon',
    code,
    baseAfterCourse.value,
  )
  if (!result.ok) {
    orderCouponError.value = result.error ?? ''
    return
  }
  writeDraft({ orderCoupon: result.coupon!.code })
  orderCouponError.value = ''
  orderCouponDraft.value = ''
  toast(
    t('commerce.coupon.applied', {
      code: result.coupon!.code,
      amount: baht(totals.value.orderDisc),
    }),
    { type: 'success' },
  )
}

function removeOrderCoupon() {
  const code = orderCouponCode.value
  writeDraft({ orderCoupon: null })
  toast(t('commerce.coupon.removed', { code: code ?? '' }), { type: 'info' })
}

/* ---------------- removing a line ---------------- */

async function removeItem(cid: string) {
  if (items.value.length < 2) return
  const course = call<CommerceCourse>('course', cid)
  const ok = await confirm({
    title: t('commerce.checkout.removeTitle'),
    message: call<boolean>('inCart', cid)
      ? t('commerce.checkout.removeMessageInCart', { title: course.title })
      : t('commerce.checkout.removeMessage', { title: course.title }),
    confirmLabel: t('commerce.checkout.removeConfirm'),
    cancelLabel: t('commerce.cancel'),
    danger: true,
  })
  if (!ok) return

  dropped.value = [...dropped.value, cid]
  const next = { ...courseCoupons.value }
  delete next[cid]
  writeDraft({ items: items.value.slice(), courseCoupons: next })
  if (resolved.value.source === 'param') {
    void router.replace({ path: path('/checkout'), query: { items: items.value.join(',') } })
  }
  toast(t('commerce.checkout.removed', { title: course.title }), { type: 'info' })
}

/* ---------------- confirming ---------------- */

const placing = ref(false)

async function confirmOrder() {
  if (placing.value || !isLoggedIn.value || !items.value.length) return

  const found = validate()
  if (!form.terms) found.terms = t('commerce.error.terms')
  errors.value = found

  const count = Object.keys(found).length
  if (count) {
    ctaMessage.value = t('commerce.error.summary', { n: count })
    return
  }
  ctaMessage.value = ''
  placing.value = true
  await new Promise((r) => setTimeout(r, isFree.value ? 700 : 550))

  const tax = !isFree.value && form.taxWant === 'yes'
    ? form.taxType === 'corporate'
      ? {
          want: true,
          type: 'corporate',
          company: form.company.trim(),
          taxId: form.taxId,
          branchType: form.branchType,
          branchNo: form.branchType === 'branch' ? form.branchNo : '00000',
          address: form.address.trim(),
        }
      : {
          want: true,
          type: 'individual',
          firstName: form.taxFirstName.trim(),
          lastName: form.taxLastName.trim(),
          idCard: form.idCard,
          address: form.address.trim(),
        }
    : { want: false }

  const order = call<Order | null>('placeOrder', {
    items: items.value.slice(),
    courseCoupons: courseCoupons.value,
    orderCoupon: totals.value.orderCoupon ? totals.value.orderCoupon.code : null,
    buyer: {
      name: form.buyerName.trim(),
      email: form.buyerEmail.trim(),
      phone: form.buyerPhone.trim(),
    },
    tax,
    method: isFree.value ? 'free' : form.method,
    status: isFree.value ? 'free' : 'paid',
  })

  placing.value = false
  if (!order) return
  void router.push({ path: path('/checkout/success'), query: { order: order.id } })
}

/* ---------------- copy that depends on the order ---------------- */

const subtitle = computed(() => {
  if (!isLoggedIn.value) return t('commerce.checkout.subtitleGuest')
  if (!items.value.length) return t('commerce.checkout.subtitleEmpty')
  return isFree.value
    ? t('commerce.checkout.subtitleFree', { n: items.value.length })
    : t('commerce.checkout.subtitle', { n: items.value.length })
})

const itemsSub = computed(() =>
  `${t('commerce.courseCount', { n: items.value.length })} · ${
    totals.value.allFree
      ? t('commerce.checkout.itemsSubFree')
      : t('commerce.checkout.itemsSubCoupon')
  }`,
)

const removedList = computed(() =>
  resolved.value.removed.map((r) => ({
    cid: r.cid,
    title: call<CommerceCourse | null>('course', r.cid)?.title ?? r.cid,
    reason: t(`commerce.block.${r.block}`),
  })),
)

/** The guest preview: what the order would be, without the form. */
const previewLines = computed(() => {
  if (isLoggedIn.value) return []
  return call<Totals>('computeTotals', items.value, {}, null).lines.map((l) => {
    const category = call<CommerceCategory | null>('category', l.course.category)
    const img = l.course.image
    return {
      cid: l.cid,
      title: l.course.title,
      meta: category?.name ?? '',
      price: l.course.isFree ? t('commerce.free') : baht(l.price),
      image: img ? { ...img, src: assetUrl(img.src) ?? undefined } : null,
      artIcon: category?.icon,
      artPalette: category?.palette,
    }
  })
})
const previewTotal = computed(
  () => call<Totals>('computeTotals', items.value, {}, null).subtotal,
)

/* ---------------- mobile summary bar ---------------- */

const bar = ref<HTMLElement | null>(null)
const barOpen = ref(false)
useBottomBar('page-checkout', bar, () => isLoggedIn.value && items.value.length > 0)
</script>

<template>
  <section class="page-hero co-hero" aria-labelledby="co-h">
    <div class="container co-hero-in">
      <div class="co-hero-copy">
        <nav :aria-label="t('common.breadcrumb')">
          <ol class="crumbs">
            <li><RouterLink :to="path('')">{{ t('common.home') }}</RouterLink></li>
            <li aria-hidden="true"><AppIcon name="chevron-right" :size="14" /></li>
            <li><RouterLink :to="path('/cart')">{{ t('common.cart') }}</RouterLink></li>
            <li aria-hidden="true"><AppIcon name="chevron-right" :size="14" /></li>
            <li><span aria-current="page">{{ t('commerce.checkout.title') }}</span></li>
          </ol>
        </nav>
        <h1 id="co-h">{{ t('commerce.checkout.title') }}</h1>
        <p id="co-sub">{{ subtitle }}</p>
      </div>
      <CoSteps id="co-steps" :current="2" />
    </div>
  </section>

  <section class="co-page" :aria-label="t('commerce.checkout.regionLabel')">
    <div class="container" id="co-root">
      <!-- Signed out: the gate, with what is waiting behind it -->
      <div v-if="!isLoggedIn" class="co-guest">
        <h2 class="sr-only">{{ t('commerce.checkout.gateHeading') }}</h2>
        <CoStateBox
          icon="lock"
          plain
          :title="t('commerce.checkout.gateTitle')"
          :text="t('commerce.checkout.gateText')"
        >
          <template #actions>
            <button type="button" class="btn btn--primary" data-act="login">
              <AppIcon name="log-in" />{{ t('common.login') }}
            </button>
            <button type="button" class="btn btn--secondary" data-act="register">
              {{ t('common.register') }}
            </button>
          </template>
        </CoStateBox>

        <section v-if="previewLines.length" class="card co-preview" aria-labelledby="co-prev-h">
          <h2 id="co-prev-h">
            {{ t('commerce.checkout.previewTitle', { n: previewLines.length }) }}
          </h2>
          <ul class="co-mini" role="list">
            <li v-for="l in previewLines" :key="l.cid">
              <span class="co-mini-media">
                <CourseImage
                  :image="l.image"
                  alt=""
                  :width="176"
                  :height="99"
                  :art-icon="l.artIcon"
                  :art-palette="l.artPalette"
                />
              </span>
              <span><b>{{ l.title }}</b><small>{{ l.meta }}</small></span>
              <span class="co-mini-price">{{ l.price }}</span>
            </li>
          </ul>
          <div class="co-preview-foot">
            <span
              >{{ t('commerce.cart.total') }}
              <span class="text-sm text-muted">{{
                t('commerce.checkout.previewTotalNote')
              }}</span></span
            >
            <strong>{{ baht(previewTotal) }}</strong>
          </div>
          <p class="text-sm mt-16 mb-0">
            <RouterLink class="link" :to="path('/cart')">{{
              t('commerce.checkout.editCart')
            }}</RouterLink>
          </p>
        </section>
      </div>

      <!-- Signed in, but nothing left to buy -->
      <template v-else-if="!items.length">
        <div v-if="removedList.length" class="co-flash">
          <div class="notice notice--warning" role="status">
            <AppIcon name="alert-triangle" />
            <div class="notice-body">
              <b>{{ t('commerce.checkout.removedTitle', { n: removedList.length }) }}</b>
              <span>{{ t('commerce.checkout.removedText') }}</span>
              <ul>
                <li v-for="r in removedList" :key="r.cid">
                  <b>{{ r.title }}</b> — {{ r.reason }}
                </li>
              </ul>
            </div>
          </div>
        </div>
        <h2 class="sr-only">{{ t('commerce.checkout.itemsHeading') }}</h2>
        <CoStateBox
          icon="receipt"
          :title="t('commerce.checkout.emptyTitle')"
          :text="
            removedList.length
              ? t('commerce.checkout.emptyTextBlocked')
              : t('commerce.checkout.emptyText')
          "
        >
          <template #actions>
            <RouterLink class="btn btn--primary" :to="path('/cart')">
              <AppIcon name="cart" />{{ t('commerce.checkout.backToCart') }}
            </RouterLink>
            <RouterLink class="btn btn--secondary" :to="path('/courses')">
              <AppIcon name="book-open" />{{ t('commerce.cart.browseCourses') }}
            </RouterLink>
          </template>
        </CoStateBox>
      </template>

      <!-- The order itself -->
      <template v-else>
        <div v-if="removedList.length" class="co-flash">
          <div class="notice notice--warning" role="status">
            <AppIcon name="alert-triangle" />
            <div class="notice-body">
              <b>{{ t('commerce.checkout.removedTitle', { n: removedList.length }) }}</b>
              <span>{{ t('commerce.checkout.removedText') }}</span>
              <ul>
                <li v-for="r in removedList" :key="r.cid">
                  <b>{{ r.title }}</b> — {{ r.reason }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="co-layout">
          <div class="co-main">
            <!-- 1 · what you are buying -->
            <section class="co-block" id="co-sec-items" aria-labelledby="co-items-h">
              <div class="co-block-head">
                <span class="co-num" aria-hidden="true">1</span>
                <div>
                  <h2 id="co-items-h">{{ t('commerce.checkout.itemsHeading') }}</h2>
                  <p><span id="co-items-sub">{{ itemsSub }}</span></p>
                </div>
              </div>
              <div class="co-items" id="co-items">
                <CheckoutItem
                  v-for="line in totals.lines"
                  :key="line.cid"
                  :line="line"
                  :count="items.length"
                  :draft-code="couponDrafts[line.cid] ?? ''"
                  :error="couponErrors[line.cid]"
                  :busy="couponBusy === line.cid"
                  @update:draft-code="(code) => (couponDrafts = { ...couponDrafts, [line.cid]: code })"
                  @apply="applyCourseCoupon"
                  @remove-coupon="removeCourseCoupon"
                  @remove="removeItem"
                />
              </div>
            </section>

            <form class="co-details" id="co-details" novalidate @submit.prevent>
              <!-- 2 · who you are -->
              <section class="co-block" aria-labelledby="co-buyer-h">
                <div class="co-block-head">
                  <span class="co-num" aria-hidden="true">2</span>
                  <div>
                    <h2 id="co-buyer-h">{{ t('commerce.checkout.buyerHeading') }}</h2>
                    <p>{{ t('commerce.checkout.buyerSub') }}</p>
                  </div>
                </div>
                <div class="form-grid">
                  <CoField
                    id="co-name"
                    name="buyerName"
                    :label="t('commerce.checkout.fullName')"
                    required
                    autocomplete="name"
                    span
                    v-model="form.buyerName"
                    :error="errors.buyerName"
                  />
                  <CoField
                    id="co-email"
                    name="buyerEmail"
                    :label="t('commerce.checkout.email')"
                    required
                    type="email"
                    autocomplete="email"
                    :placeholder="t('commerce.checkout.emailPlaceholder')"
                    v-model="form.buyerEmail"
                    :error="errors.buyerEmail"
                  />
                  <CoField
                    id="co-phone"
                    name="buyerPhone"
                    :label="t('commerce.checkout.phone')"
                    required
                    type="tel"
                    autocomplete="tel"
                    inputmode="tel"
                    :placeholder="t('commerce.checkout.phonePlaceholder')"
                    :help="t('commerce.checkout.phoneHelp')"
                    v-model="form.buyerPhone"
                    :error="errors.buyerPhone"
                  />
                </div>
                <p class="co-prefill">
                  <AppIcon name="user" /><span>{{ t('commerce.checkout.prefill') }}</span>
                </p>
              </section>

              <!-- 3 · the tax invoice, when there is something to document -->
              <section v-if="!isFree" class="co-block" id="co-sec-tax" aria-labelledby="co-tax-h">
                <div class="co-block-head">
                  <span class="co-num" aria-hidden="true">3</span>
                  <div>
                    <h2 id="co-tax-h">{{ t('commerce.tax.heading') }}</h2>
                    <p>{{ t('commerce.tax.sub') }}</p>
                  </div>
                </div>
                <fieldset class="fieldset">
                  <legend>{{ t('commerce.tax.question') }}</legend>
                  <div class="co-opts">
                    <label class="opt-card">
                      <span class="radio">
                        <input type="radio" name="taxWant" value="yes" v-model="form.taxWant" />
                      </span>
                      <span class="oc-body">
                        <span class="oc-title">{{ t('commerce.tax.wantYes') }}</span>
                        <span class="oc-desc">{{ t('commerce.tax.wantYesDesc') }}</span>
                      </span>
                    </label>
                    <label class="opt-card">
                      <span class="radio">
                        <input type="radio" name="taxWant" value="no" v-model="form.taxWant" />
                      </span>
                      <span class="oc-body">
                        <span class="oc-title">{{ t('commerce.tax.wantNo') }}</span>
                        <span class="oc-desc">{{ t('commerce.tax.wantNoDesc') }}</span>
                      </span>
                    </label>
                  </div>
                </fieldset>
                <div id="co-tax-panel">
                  <CoTaxPanel v-if="form.taxWant === 'yes'" :form="form" :errors="errors" />
                </div>
              </section>

              <!-- 4 · how you will pay -->
              <section class="co-block" id="co-sec-pay" aria-labelledby="co-pay-h">
                <div class="co-block-head">
                  <span class="co-num" aria-hidden="true">{{ isFree ? 3 : 4 }}</span>
                  <div>
                    <h2 id="co-pay-h">{{ t('commerce.pay.heading') }}</h2>
                    <p v-if="!isFree">{{ t('commerce.pay.sub') }}</p>
                  </div>
                </div>

                <div v-if="isFree" class="co-free">
                  <span class="co-free-ico" aria-hidden="true"><AppIcon name="gift" /></span>
                  <div>
                    <b>{{ t('commerce.pay.freeTitle') }}</b>
                    <p>{{ t('commerce.pay.freeText') }}</p>
                  </div>
                </div>

                <template v-else>
                  <fieldset class="fieldset">
                    <legend class="sr-only">{{ t('commerce.pay.legend') }}</legend>
                    <div class="co-pay-opts">
                      <label class="opt-card co-pay-opt">
                        <span class="radio">
                          <input type="radio" name="method" value="qr" v-model="form.method" />
                        </span>
                        <span class="co-pay-ico" aria-hidden="true"><AppIcon name="qr" /></span>
                        <span class="oc-body">
                          <span class="oc-title">{{ t('commerce.pay.qrTitle') }}</span>
                          <span class="oc-desc">{{ t('commerce.pay.qrDesc') }}</span>
                          <span class="co-pay-tags" aria-hidden="true">
                            <span>PromptPay</span><span>Mobile Banking</span>
                          </span>
                        </span>
                      </label>
                      <label class="opt-card co-pay-opt">
                        <span class="radio">
                          <input type="radio" name="method" value="card" v-model="form.method" />
                        </span>
                        <span class="co-pay-ico" aria-hidden="true">
                          <AppIcon name="credit-card" />
                        </span>
                        <span class="oc-body">
                          <span class="oc-title">{{ t('commerce.pay.cardTitle') }}</span>
                          <span class="oc-desc">{{ t('commerce.pay.cardDesc') }}</span>
                          <span class="co-pay-tags" aria-hidden="true">
                            <span>VISA</span><span>Mastercard</span><span>JCB</span>
                          </span>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                  <p class="co-pay-note">
                    <AppIcon name="shield-check" /><span>{{ t('commerce.pay.note') }}</span>
                  </p>
                </template>
              </section>
            </form>
          </div>

          <!-- 5 · the total -->
          <aside class="co-side" aria-labelledby="co-sum-h">
            <div class="co-sum" id="co-sum">
              <div class="co-sum-head">
                <span class="co-num" id="co-sum-num" aria-hidden="true">{{ isFree ? 4 : 5 }}</span>
                <h2 id="co-sum-h">{{ t('commerce.checkout.totalHeading') }}</h2>
              </div>

              <div id="co-ocp-slot">
                <template v-if="!isFree">
                  <div v-if="totals.orderCoupon || totals.orderCouponInvalid" class="co-ocp">
                    <CoCouponApplied
                      :coupon="
                        (totals.orderCoupon ?? call('coupon', orderCouponCode ?? '')) as Coupon
                      "
                      scope="order"
                      :applies-to="
                        t('commerce.coupon.wholeOrder', { n: items.length })
                      "
                      :base="baseAfterCourse"
                      :disc="totals.orderDisc"
                      :net="baseAfterCourse - totals.orderDisc"
                      :invalid="totals.orderCouponInvalid"
                      @remove="removeOrderCoupon"
                    />
                  </div>
                  <form
                    v-else
                    class="co-ocp"
                    data-ocp-form
                    novalidate
                    @submit.prevent="applyOrderCoupon(orderCouponDraft)"
                  >
                    <div class="field" :class="{ 'has-error': !!orderCouponError }">
                      <label class="label" for="co-ocp-in">
                        <AppIcon name="percent" />{{ t('commerce.checkout.orderCouponLabel') }}
                      </label>
                      <div class="co-cp-row">
                        <input
                          class="input"
                          type="text"
                          id="co-ocp-in"
                          name="code"
                          autocomplete="off"
                          autocapitalize="characters"
                          spellcheck="false"
                          :placeholder="t('commerce.checkout.couponPlaceholder')"
                          v-model="orderCouponDraft"
                          :aria-invalid="orderCouponError ? 'true' : undefined"
                          :aria-describedby="orderCouponError ? 'co-ocp-err' : undefined"
                        />
                        <button
                          type="submit"
                          class="btn btn--secondary"
                          :class="{ 'is-loading': orderCouponBusy }"
                          data-fk="ocp-go"
                          :disabled="orderCouponBusy"
                        >
                          <template v-if="orderCouponBusy">
                            <span class="spinner" aria-hidden="true" /><span>{{
                              t('commerce.coupon.checking')
                            }}</span>
                          </template>
                          <template v-else>{{ t('commerce.coupon.use') }}</template>
                        </button>
                      </div>
                      <p v-if="orderCouponError" class="field-error" id="co-ocp-err">
                        <AppIcon name="alert-circle" /><span>{{ orderCouponError }}</span>
                      </p>
                    </div>
                    <div class="co-cp-hints">
                      <span>{{ t('commerce.checkout.orderCouponHints') }}</span>
                      <CoCouponChip
                        v-for="h in orderCouponHints"
                        :key="h.code"
                        :coupon="h"
                        :dim="!!h.minSubtotal && baseAfterCourse < h.minSubtotal"
                        @apply="(code) => applyOrderCoupon(code)"
                      />
                    </div>
                  </form>
                </template>
              </div>

              <div id="co-rows-slot">
                <CoTotalsRows
                  :count="items.length"
                  :subtotal="totals.subtotal"
                  :course-disc="totals.courseDisc"
                  :order-disc="totals.orderDisc"
                  :order-coupon-code="totals.orderCoupon?.code ?? null"
                  :total-disc="totals.totalDisc"
                />
                <div class="co-total">
                  <span class="co-total-lbl"
                    >{{ t('commerce.checkout.netTotal')
                    }}<small v-if="isFree">{{ t('commerce.checkout.netFree') }}</small
                    ><small v-else-if="totals.totalDisc">{{
                      t('commerce.checkout.netSaved', { amount: baht(totals.totalDisc) })
                    }}</small></span
                  >
                  <strong class="co-total-amt">{{ baht(totals.net) }}</strong>
                </div>
              </div>

              <div class="field co-terms" id="co-terms-wrap" :class="{ 'has-error': !!errors.terms }">
                <label class="check">
                  <input
                    type="checkbox"
                    name="terms"
                    id="co-terms"
                    aria-required="true"
                    v-model="form.terms"
                  />
                  <span
                    >{{ t('commerce.checkout.terms') }}
                    <span class="req" aria-hidden="true">*</span></span
                  >
                </label>
                <a
                  class="link"
                  :href="path('/purchase-terms')"
                  target="_blank"
                  rel="noopener"
                  >{{ t('commerce.checkout.termsLink') }}</a
                >
                <p v-if="errors.terms" class="field-error">
                  <AppIcon name="alert-circle" /><span>{{ errors.terms }}</span>
                </p>
              </div>

              <button
                type="button"
                class="btn btn--primary btn--lg btn--block"
                :class="{ 'is-loading': placing }"
                id="co-submit"
                data-confirm
                :disabled="placing"
                @click="confirmOrder"
              >
                <template v-if="placing">
                  <span class="spinner" aria-hidden="true" /><span>{{
                    isFree ? t('commerce.checkout.enrolling') : t('commerce.checkout.preparing')
                  }}</span>
                </template>
                <template v-else-if="isFree">
                  <AppIcon name="gift" />{{ t('commerce.checkout.claimFree') }}
                </template>
                <template v-else>
                  <AppIcon name="lock" />{{ t('commerce.checkout.confirm') }}
                </template>
              </button>

              <p class="co-cta-msg" id="co-cta-msg" role="status">
                <template v-if="ctaMessage">
                  <AppIcon name="alert-circle" /><span>{{ ctaMessage }}</span>
                </template>
              </p>

              <ul class="co-trust" role="list" id="co-trust">
                <template v-if="isFree">
                  <li><AppIcon name="gift" /><span>{{ t('commerce.trust.freeForMembers') }}</span></li>
                  <li>
                    <AppIcon name="play-circle" /><span>{{ t('commerce.trust.startAfterClaim') }}</span>
                  </li>
                </template>
                <template v-else>
                  <li>
                    <AppIcon name="shield-check" /><span>{{ t('commerce.trust.simulated') }}</span>
                  </li>
                  <li><AppIcon name="receipt" /><span>{{ t('commerce.trust.emailed') }}</span></li>
                  <li>
                    <AppIcon name="play-circle" /><span>{{ t('commerce.trust.startAfterPay') }}</span>
                  </li>
                </template>
              </ul>
            </div>
          </aside>
        </div>
      </template>
    </div>
  </section>

  <p class="sr-only" id="co-live" aria-live="polite" />

  <div
    v-if="isLoggedIn && items.length"
    ref="bar"
    class="sticky-bar co-bar"
    id="co-bar"
    role="region"
    :aria-label="t('commerce.checkout.barLabel')"
  >
    <div class="co-bar-in">
      <div class="co-bar-detail" id="co-bar-detail" :hidden="!barOpen">
        <CoTotalsRows
          :count="items.length"
          :subtotal="totals.subtotal"
          :course-disc="totals.courseDisc"
          :order-disc="totals.orderDisc"
          :order-coupon-code="totals.orderCoupon?.code ?? null"
          :total-disc="totals.totalDisc"
        />
      </div>
      <div class="co-bar-row">
        <button
          type="button"
          class="co-bar-sum"
          data-bar-toggle
          data-fk="bar-toggle"
          :aria-expanded="barOpen"
          aria-controls="co-bar-detail"
          @click="barOpen = !barOpen"
        >
          <small
            >{{ t('commerce.checkout.netTotal') }}
            <b
              >{{ barOpen ? t('commerce.hideDetail') : t('commerce.showDetail')
              }}<AppIcon name="chevron-up" /></b
          ></small>
          <strong>{{ baht(totals.net) }}</strong>
        </button>
        <button
          type="button"
          class="btn btn--primary"
          data-confirm
          data-fk="bar-cta"
          :disabled="placing"
          @click="confirmOrder"
        >
          <template v-if="isFree">
            <AppIcon name="gift" />{{ t('commerce.checkout.claimFree') }}
          </template>
          <template v-else>{{ t('commerce.checkout.confirm') }}</template>
        </button>
      </div>
    </div>
  </div>

  <CommerceConfirm />
  <CommerceToasts />
</template>
