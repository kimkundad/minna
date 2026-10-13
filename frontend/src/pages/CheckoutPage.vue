<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import CheckoutItem from '@/components/commerce/CheckoutItem.vue'
import CoCouponApplied from '@/components/commerce/CoCouponApplied.vue'
import CoField from '@/components/commerce/CoField.vue'
import CoStateBox from '@/components/commerce/CoStateBox.vue'
import CoSteps from '@/components/commerce/CoSteps.vue'
import CoTaxPanel from '@/components/commerce/CoTaxPanel.vue'
import CoTotalsRows from '@/components/commerce/CoTotalsRows.vue'
import type { CheckoutErrors, CheckoutForm, Coupon } from '@/components/commerce/types'
import { ApiError, api } from '@/lib/api'
import type { InvoiceRequest, PublicCategory } from '@/lib/api'
import {
  asContentLocale,
  mapQuote,
  quoteLines,
  resolveItems,
  type CheckoutTotals,
  type ResolvedItem,
  type Unavailable,
} from '@/lib/checkout'
import { num, money } from '@/lib/format'
import { openAuth } from '@/components/auth/authChannel'
import { useAuthStore } from '@/stores/auth'

/**
 * The order page: what is being bought, who is buying it, whether they want a
 * tax invoice, how they will pay, and the total.
 *
 * Nothing here works out a price. Every amount on this page came from
 * `/checkout/quote`, which prices the basket from the database — the only
 * thing stopping somebody paying ฿1 for a ฿1,900 course is that the browser
 * never does the sum. A coupon is "applied" by asking for a new quote with the
 * code in it; whether it is real, live, and allowed on these courses is the
 * server's answer, not a guess made here.
 *
 * The basket comes from the address. `?items=` carries slugs, because that is
 * what a course card links by and what somebody would paste to a friend.
 */
const route = useRoute()
const router = useRouter()
const { t, locale: uiLocale } = useI18n()
const auth = useAuthStore()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const isLoggedIn = computed(() => auth.isLoggedIn)

/* ---------------- the basket ---------------- */

const items = ref<ResolvedItem[]>([])
const unavailable = ref<Unavailable[]>([])
const categories = ref<PublicCategory[]>([])
const totals = ref<CheckoutTotals | null>(null)
const loading = ref(true)
const loadError = ref('')

/** A code typed against one course, and against the whole order. */
const courseCoupons = ref<Record<string, string>>({})
const orderCouponCode = ref<string | null>(null)

const couponDrafts = ref<Record<string, string>>({})
const couponErrors = ref<Record<string, string>>({})
const couponBusy = ref<string | null>(null)
const orderCouponDraft = ref('')
const orderCouponError = ref('')
const orderCouponBusy = ref(false)

function refsFromUrl(): string[] {
  const raw = route.query.items
  const value = Array.isArray(raw) ? raw.join(',') : String(raw ?? '')
  return value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20)
}

let seq = 0

/** Re-prices the basket. Every amount on the page comes from this. */
async function reprice(): Promise<void> {
  if (!items.value.length) {
    totals.value = null
    return
  }
  const mine = seq
  const lines = quoteLines(
    items.value.map((i) => ({
      ...i,
      couponCode: courseCoupons.value[i.course.slug],
    })),
  )
  const { data } = await api.quote(lines, orderCouponCode.value ?? undefined)
  if (mine !== seq) return
  totals.value = mapQuote(
    data,
    items.value.map((i) => ({ ...i, couponCode: courseCoupons.value[i.course.slug] })),
    { locale: locale.value, t, categories: categories.value },
  )
}

async function load(): Promise<void> {
  const mine = ++seq
  loading.value = true
  loadError.value = ''
  try {
    const [resolved, cats] = await Promise.all([
      resolveItems(refsFromUrl()),
      api.categories().catch(() => ({ data: [] as PublicCategory[] })),
    ])
    if (mine !== seq) return
    items.value = resolved.items
    unavailable.value = resolved.unavailable
    categories.value = cats.data

    // The quote needs a session; a signed-out visitor sees the gate and a
    // preview of what is waiting behind it instead.
    if (isLoggedIn.value) await reprice()
  } catch (err) {
    if (mine !== seq) return
    loadError.value = err instanceof ApiError ? err.message : t('commerce.checkout.loadFailed')
  } finally {
    if (mine === seq) loading.value = false
  }
}

onMounted(() => {
  void load()
  void loadBilling()
})
watch(() => route.fullPath, () => {
  if (route.name === 'checkout') void load()
})
// Signing in from the gate turns the preview into a real order.
watch(isLoggedIn, (now) => {
  if (now) void load()
})

/* ---------------- coupons ---------------- */

/**
 * Applying a coupon is asking for a new quote with it.
 *
 * If the server prices the line no lower, the code did not apply — to these
 * courses, at this moment, or at all — and saying so is more honest than
 * repeating the server's reason, which it does not give one of.
 */
async function applyCourseCoupon(slug: string, code: string): Promise<void> {
  const clean = code.trim().toUpperCase()
  if (!clean) return
  couponBusy.value = slug
  couponErrors.value = { ...couponErrors.value, [slug]: '' }

  /**
   * Whether a coupon worked is whether the bill went down.
   *
   * This used to ask whether *this line* got cheaper, which is only true of a
   * coupon for this course. A basket coupon typed into a course's box takes
   * its discount off the order instead — the line is untouched — so a code
   * that had just worked perfectly was reported back as invalid and undone.
   */
  const before = totals.value?.total ?? 0
  const previous = courseCoupons.value[slug]
  courseCoupons.value = { ...courseCoupons.value, [slug]: clean }
  try {
    await reprice()
    const after = totals.value?.total ?? 0
    if (after >= before) {
      courseCoupons.value = { ...courseCoupons.value, [slug]: previous ?? '' }
      if (!previous) delete courseCoupons.value[slug]
      await reprice()
      couponErrors.value = { ...couponErrors.value, [slug]: t('commerce.coupon.notValid') }
    } else {
      couponDrafts.value = { ...couponDrafts.value, [slug]: '' }
    }
  } catch (err) {
    courseCoupons.value = { ...courseCoupons.value, [slug]: previous ?? '' }
    couponErrors.value = {
      ...couponErrors.value,
      [slug]: err instanceof ApiError ? err.message : t('commerce.coupon.notValid'),
    }
  } finally {
    couponBusy.value = null
  }
}

async function removeCourseCoupon(slug: string): Promise<void> {
  const next = { ...courseCoupons.value }
  delete next[slug]
  courseCoupons.value = next
  await reprice()
}

async function applyOrderCoupon(code: string): Promise<void> {
  const clean = code.trim().toUpperCase()
  if (!clean) return
  orderCouponBusy.value = true
  orderCouponError.value = ''
  // The bill, for the same reason as above: one test that holds for every
  // kind of coupon, rather than one per kind that has to be kept in step.
  const before = totals.value?.total ?? 0
  const previous = orderCouponCode.value
  orderCouponCode.value = clean
  try {
    await reprice()
    if ((totals.value?.total ?? 0) >= before) {
      orderCouponCode.value = previous
      await reprice()
      orderCouponError.value = t('commerce.coupon.notValid')
    } else {
      orderCouponDraft.value = ''
    }
  } catch (err) {
    orderCouponCode.value = previous
    orderCouponError.value = err instanceof ApiError ? err.message : t('commerce.coupon.notValid')
  } finally {
    orderCouponBusy.value = false
  }
}

async function removeOrderCoupon(): Promise<void> {
  orderCouponCode.value = null
  await reprice()
}

/* ---------------- removing a line ---------------- */

/** Rewrites the address, because the address is what the basket is. */
async function removeItem(slug: string): Promise<void> {
  const left = items.value.filter((i) => i.course.slug !== slug).map((i) => i.course.slug)
  await router.replace({ query: { ...route.query, items: left.join(',') } })
}

/* ---------------- the form ---------------- */

const form = ref<CheckoutForm>({
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

/**
 * A field stops being wrong the moment it is changed.
 *
 * Validation runs on submit, so without this the message sits under a box
 * somebody has already fixed — which reads as "still wrong" and sends them
 * looking for a second mistake that is not there.
 */
let checkedValues: Partial<CheckoutForm> = {}

watch(
  form,
  (now) => {
    if (!Object.keys(errors.value).length) return
    const cleared = { ...errors.value }
    // Compared against a snapshot taken when the form was checked. A deep
    // watcher hands back the same object twice, so the old value has to be
    // kept separately or nothing ever looks changed.
    for (const key of Object.keys(cleared) as (keyof CheckoutForm)[]) {
      if (now[key] !== checkedValues[key]) delete cleared[key]
    }
    errors.value = cleared
  },
  { deep: true },
)

/** The buyer's own details, so nobody retypes what the account already knows. */
watch(
  () => auth.user,
  (user) => {
    if (!user) return
    form.value.buyerName ||= `${user.firstName} ${user.lastName}`.trim()
    form.value.buyerEmail ||= user.email
    form.value.buyerPhone ||= user.phoneNational ?? ''
  },
  { immediate: true },
)

/**
 * The tax invoice details, as given last time.
 *
 * Filled in but not ticked: wanting a full tax invoice is a decision made per
 * order, and pre-ticking it would issue documents nobody asked for. What is
 * saved is the typing, which is the part that was tedious.
 *
 * A branch code of 00000 is the head office by law rather than a number
 * somebody chose, so it goes back into the radio it came from and not into the
 * box.
 */
const billingLoaded = ref(false)

async function loadBilling(): Promise<void> {
  if (!auth.isLoggedIn) return
  try {
    const saved = (await api.myBilling()).data
    if (!saved) return
    const f = form.value
    f.taxType = saved.type
    if (saved.type === 'corporate') {
      f.company ||= saved.name
      f.taxId ||= saved.taxId
      f.branchType = saved.branchCode === '00000' || !saved.branchCode ? 'head' : 'branch'
      if (f.branchType === 'branch') f.branchNo ||= saved.branchCode ?? ''
    } else {
      const [first = '', ...rest] = saved.name.split(/s+/)
      f.taxFirstName ||= first
      f.taxLastName ||= rest.join(' ')
      f.idCard ||= saved.taxId
    }
    f.address ||= saved.address
    billingLoaded.value = true
  } catch {
    // Nothing saved, or it could not be read. The form is simply empty, which
    // is where everybody started anyway.
  }
}

/**
 * And kept, once an order carries them.
 *
 * Same timing as the phone below and for the same reason: after the order, not
 * while it is being typed. Failing is silent — the order is placed, and these
 * are a convenience for next time rather than part of the sale.
 */
async function rememberBilling(invoice: InvoiceRequest | null): Promise<void> {
  if (!invoice) return
  try {
    await api.saveMyBilling(invoice)
  } catch {
    /* next time asks again, which is where it is already asked */
  }
}

/**
 * A phone number given at checkout is kept.
 *
 * Asking for it on every order and then forgetting it is asking somebody to do
 * the same work repeatedly for no reason. Saved after the order is placed
 * rather than before — a number typed by someone who then changed their mind
 * is not a correction to their account.
 *
 * Only when it differs from what is stored, and the page says it happened,
 * because quietly rewriting a saved detail is a surprise even when it is what
 * was wanted.
 */
const phoneSaved = ref(false)

async function rememberPhone(): Promise<void> {
  const user = auth.user
  const typed = form.value.buyerPhone.trim()
  if (!user || !typed || typed === (user.phoneNational ?? '')) return

  try {
    await api.updateProfile({
      firstName: user.firstName,
      lastName: user.lastName,
      phoneCountryCode: user.phoneCountryCode ?? '+66',
      phoneNational: typed,
      locale: user.locale,
    })
    await auth.refreshUser()
    phoneSaved.value = true
  } catch {
    // The order is placed and that is what matters. A number that did not
    // save can be given again next time, which is where it is already asked.
  }
}

const isFree = computed(() => totals.value?.allFree ?? false)

function validate(): boolean {
  const e: CheckoutErrors = {}
  const f = form.value

  if (!f.buyerName.trim()) e.buyerName = t('commerce.checkout.errName')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.buyerEmail.trim())) {
    e.buyerEmail = t('commerce.checkout.errEmail')
  }
  if (f.buyerPhone.replace(/\D/g, '').length < 9) e.buyerPhone = t('commerce.checkout.errPhone')

  if (!isFree.value && f.taxWant === 'yes') {
    if (f.taxType === 'corporate') {
      if (!f.company.trim()) e.company = t('commerce.tax.errCompany')
      if (f.branchType === 'branch' && !f.branchNo.trim()) {
        e.branchNo = t('commerce.tax.errBranch')
      }
    } else {
      if (!f.taxFirstName.trim()) e.taxFirstName = t('commerce.tax.errFirstName')
      if (!f.taxLastName.trim()) e.taxLastName = t('commerce.tax.errLastName')
    }
    // Shape only. Whether the check digit adds up is the server's answer, and
    // it gives a better one than a copy of the rule kept in two places.
    if (f.taxId.replace(/\D/g, '').length !== 13) e.taxId = t('commerce.tax.errTaxId')
    if (!f.address.trim()) e.address = t('commerce.tax.errAddress')
  }

  if (!f.terms) e.terms = t('commerce.checkout.errTerms')

  errors.value = e
  checkedValues = { ...form.value }
  return Object.keys(e).length === 0
}

/** The invoice block, in the shape the API takes. */
function invoicePayload(): InvoiceRequest | null {
  const f = form.value
  if (isFree.value || f.taxWant !== 'yes') return null
  return {
    type: f.taxType,
    name:
      f.taxType === 'corporate'
        ? f.company.trim()
        : `${f.taxFirstName.trim()} ${f.taxLastName.trim()}`.trim(),
    taxId: (f.taxType === 'corporate' ? f.taxId : f.idCard || f.taxId).replace(/\D/g, ''),
    branchType: f.taxType === 'corporate' ? f.branchType : null,
    // The head office is 00000 by law, not a number somebody chooses.
    branchCode:
      f.taxType === 'corporate' ? (f.branchType === 'head' ? '00000' : f.branchNo.trim()) : null,
    address: f.address.trim(),
  }
}

/* ---------------- placing it ---------------- */

const placing = ref(false)
const ctaMessage = ref('')

async function confirmOrder(): Promise<void> {
  // Worked out once: the same block is sent with the order and then saved to
  // the account, and two calls to `invoicePayload()` could disagree if the
  // form changed between them.
  const invoice = invoicePayload()

  if (placing.value || !items.value.length) return
  ctaMessage.value = ''

  if (!validate()) {
    ctaMessage.value = t('commerce.checkout.errSomething')
    // Take them to what is wrong rather than leaving them to find it.
    document
      .querySelector('.field.has-error, .co-block [aria-invalid="true"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  placing.value = true
  try {
    const { data } = await api.checkout({
      lines: quoteLines(
        items.value.map((i) => ({ ...i, couponCode: courseCoupons.value[i.course.slug] })),
      ),
      ...(orderCouponCode.value ? { couponCode: orderCouponCode.value } : {}),
      method: form.value.method === 'qr' ? 'promptpay' : 'card',
      invoice,
    })

    await rememberPhone()
    await rememberBilling(invoice)

    if (data.url) {
      // Stripe's own page takes the card details, so none of them ever touch
      // this site. A full navigation, not a router push.
      window.location.href = data.url
      return
    }

    await router.push({ path: path('/checkout/success'), query: { order: data.order.orderNo } })
  } catch (err) {
    ctaMessage.value = err instanceof ApiError ? err.message : t('commerce.checkout.errPlacing')
    placing.value = false
  }
}

/* ---------------- what the page says ---------------- */

/**
 * The basket's own currency. A basket cannot mix two — the server refuses one
 * that does — so a single answer covers every total on the page.
 *
 * Only the totals, though: they exist because a quote came back, and the quote
 * is what names the currency. A signed-out visitor gets no quote, so anything
 * shown before signing in has to read the currency off the course itself —
 * see `lineMoney`.
 */
const baht = (n: number) => money(n, totals.value?.currency ?? 'THB', String(locale.value))

/**
 * One line's price, in the currency that line is priced in.
 *
 * The preview a guest sees is built without a quote, and falling back to baht
 * there put "฿100" under a course that costs US$100 — the right number with
 * the wrong currency on it, which is the one mistake this must never make.
 */
const lineMoney = (n: number, currency: string | null | undefined) =>
  money(n, currency ?? 'THB', String(locale.value))

/**
 * Whether PromptPay is on offer.
 *
 * It is a Thai QR standard and settles in baht only, so a basket priced in
 * anything else can be paid by card alone. The server refuses the combination
 * as well, which is where this was discovered: QR is the default choice, so a
 * dollar-priced course went to the till and came back with a refusal instead
 * of a payment page.
 */
const qrAvailable = computed(() => (totals.value?.currency ?? 'THB') === 'THB')

// Never leave an impossible method selected. Immediate, so a basket that is
// already in dollars when the page opens starts on the card.
watch(
  qrAvailable,
  (ok) => {
    if (!ok && form.value.method === 'qr') form.value.method = 'card'
  },
  { immediate: true },
)

const subtitle = computed(() => {
  if (loading.value) return t('commerce.checkout.loading')
  if (!items.value.length) return t('commerce.checkout.subtitleEmpty')
  if (!isLoggedIn.value) return t('commerce.checkout.subtitleGuest')
  if (isFree.value) return t('commerce.checkout.subtitleFree', { n: items.value.length })
  return t('commerce.checkout.subtitle', { n: items.value.length })
})

const itemsSub = computed(() =>
  isFree.value
    ? t('commerce.checkout.itemsSubFree')
    : t('commerce.checkout.itemsSub', { n: items.value.length }),
)

/** Why each unavailable thing is not on the order, in its own words. */
const removedList = computed(() =>
  unavailable.value.map((u) => ({
    cid: u.ref,
    title: u.title ?? u.ref,
    reason:
      u.reason === 'missing'
        ? t('commerce.checkout.reasonMissing')
        : t('commerce.checkout.reasonNotForSale'),
  })),
)

/** Courses the buyer already has. The server refuses the order, so it is said
 *  here rather than discovered at the end. */
const ownedLines = computed(() => totals.value?.lines.filter((l) => l.owned) ?? [])

/** The guest preview: what is waiting behind the gate, with no prices — a
 *  quote needs a session, and inventing one here would be the browser doing
 *  the sum. */
const previewLines = computed(() =>
  items.value.map((i) => ({
    cid: i.course.slug,
    title: i.course.title,
    meta: i.course.categoryName ?? '',
    image: i.course.thumbnailPath
      ? { src: `/api/v1/media/${i.course.thumbnailPath}`, alt: '' }
      : null,
    artIcon: 'book-open',
    artPalette: (i.course.categoryId ?? 0) % 6,
    price:
      i.course.price === 0
        ? t('commerce.free')
        : lineMoney(i.course.price / 100, i.course.currency),
  })),
)

const baseAfterCourse = computed(() =>
  totals.value ? totals.value.subtotal - totals.value.courseDiscount : 0,
)

const totalDiscount = computed(() =>
  totals.value ? totals.value.courseDiscount + totals.value.orderDiscount : 0,
)

/** The order coupon as `CoCouponApplied` draws it. The amount is the server's. */
const orderCoupon = computed<Coupon | null>(() =>
  orderCouponCode.value && (totals.value?.orderDiscount ?? 0) > 0
    ? {
        code: orderCouponCode.value,
        name: orderCouponCode.value,
        scope: 'order',
        type: 'amount',
        value: totals.value?.orderDiscount ?? 0,
        condition: '',
        expires: '',
      }
    : null,
)

const barOpen = ref(false)

function goSignIn(): void {
  openAuth({ step: 'login', reason: t('auth.reasonCheckout') })
}

function goRegister(): void {
  openAuth({ step: 'register', reason: t('auth.reasonCheckout') })
}

/** Unused for now, but the locale the reader is in decides which language the
 *  receipt is written in once that is wired up. */
void asContentLocale(uiLocale.value)
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
      <!-- Still finding out what is in the basket -->
      <CoStateBox
        v-if="loading"
        icon="hourglass"
        plain
        :title="t('commerce.checkout.loading')"
      />

      <!-- Could not find out -->
      <CoStateBox
        v-else-if="loadError"
        icon="wifi-off"
        :title="t('commerce.checkout.loadFailed')"
        :text="loadError"
      >
        <template #actions>
          <button type="button" class="btn btn--primary" data-retry="checkout" @click="load()">
            <AppIcon name="refresh" />{{ t('catalog.retry') }}
          </button>
        </template>
      </CoStateBox>

      <!-- Signed out: the gate, with what is waiting behind it -->
      <div v-else-if="!isLoggedIn" class="co-guest">
        <h2 class="sr-only">{{ t('commerce.checkout.gateHeading') }}</h2>
        <CoStateBox
          icon="lock"
          plain
          :title="t('commerce.checkout.gateTitle')"
          :text="t('commerce.checkout.gateText')"
        >
          <template #actions>
            <button type="button" class="btn btn--primary" data-act="login" @click="goSignIn">
              <AppIcon name="log-in" />{{ t('common.login') }}
            </button>
            <button type="button" class="btn btn--secondary" data-act="register" @click="goRegister">
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
          <p class="text-sm mt-16 mb-0">{{ t('commerce.checkout.previewTotalNote') }}</p>
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
      <template v-else-if="totals">
        <div v-if="removedList.length || ownedLines.length" class="co-flash">
          <div v-if="removedList.length" class="notice notice--warning" role="status">
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
          <div v-if="ownedLines.length" class="notice notice--info" role="status">
            <AppIcon name="info" />
            <div class="notice-body">
              <b>{{ t('commerce.checkout.ownedTitle', { n: ownedLines.length }) }}</b>
              <span>{{ t('commerce.checkout.ownedText') }}</span>
              <ul>
                <li v-for="l in ownedLines" :key="l.slug"><b>{{ l.view.title }}</b></li>
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
                  :key="line.slug"
                  :line="line"
                  :count="totals.lines.length"
                  :draft-code="couponDrafts[line.slug] ?? ''"
                  :error="couponErrors[line.slug]"
                  :busy="couponBusy === line.slug"
                  :currency="totals.currency"
                  @update:draft-code="
                    (code) => (couponDrafts = { ...couponDrafts, [line.slug]: code })
                  "
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
                  <AppIcon :name="phoneSaved ? 'check-circle' : 'user'" />
                  <span>{{
                    phoneSaved ? t('commerce.checkout.phoneSaved') : t('commerce.checkout.prefill')
                  }}</span>
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
                  <AppNotice
                    v-if="!qrAvailable"
                    tone="info"
                    :text="
                      t('commerce.pay.cardOnly', { currency: totals?.currency ?? '' })
                    "
                  />
                  <fieldset class="fieldset">
                    <legend class="sr-only">{{ t('commerce.pay.legend') }}</legend>
                    <div class="co-pay-opts">
                      <!-- PromptPay settles in baht only, so a basket priced
                           in anything else is not offered it. The server
                           refuses it too; this is so nobody picks it and then
                           reads a refusal where a price should be. -->
                      <label v-if="qrAvailable" class="opt-card co-pay-opt">
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
                  <div v-if="orderCoupon" class="co-ocp">
                    <CoCouponApplied
                      :coupon="orderCoupon"
                      scope="order"
                      :applies-to="t('commerce.coupon.wholeOrder', { n: totals.lines.length })"
                      :base="baseAfterCourse"
                      :disc="totals.orderDiscount"
                      :net="baseAfterCourse - totals.orderDiscount"
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
                  </form>
                </template>
              </div>

              <div id="co-rows-slot">
                <CoTotalsRows
                  :count="totals.lines.length"
                  :subtotal="totals.subtotal"
                  :course-disc="totals.courseDiscount"
                  :order-disc="totals.orderDiscount"
                  :order-coupon-code="orderCoupon?.code ?? null"
                  :total-disc="totalDiscount"
                  :vat="totals.vatAmount"
                  :vat-inclusive="totals.vatInclusive"
                  :currency="totals.currency"
                />
                <div class="co-total">
                  <span class="co-total-lbl"
                    >{{ t('commerce.checkout.netTotal')
                    }}<small v-if="isFree">{{ t('commerce.checkout.netFree') }}</small
                    ><small v-else-if="totalDiscount">{{
                      t('commerce.checkout.netSaved', { amount: baht(totalDiscount) })
                    }}</small></span
                  >
                  <strong class="co-total-amt">{{ baht(totals.total) }}</strong>
                </div>
              </div>

              <div
                class="field co-terms"
                id="co-terms-wrap"
                :class="{ 'has-error': !!errors.terms }"
              >
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
                <RouterLink class="link" :to="path('/purchase-terms')" target="_blank">{{
                  t('commerce.checkout.termsLink')
                }}</RouterLink>
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
                  <li>
                    <AppIcon name="gift" /><span>{{ t('commerce.trust.freeForMembers') }}</span>
                  </li>
                  <li>
                    <AppIcon name="play-circle" /><span>{{
                      t('commerce.trust.startAfterClaim')
                    }}</span>
                  </li>
                </template>
                <template v-else>
                  <li>
                    <AppIcon name="shield-check" /><span>{{ t('commerce.trust.secure') }}</span>
                  </li>
                  <li><AppIcon name="receipt" /><span>{{ t('commerce.trust.emailed') }}</span></li>
                  <li>
                    <AppIcon name="play-circle" /><span>{{
                      t('commerce.trust.startAfterPay')
                    }}</span>
                  </li>
                </template>
              </ul>
            </div>
          </aside>
        </div>
      </template>
    </div>
  </section>

  <div
    v-if="isLoggedIn && totals && totals.lines.length"
    class="sticky-bar co-bar"
    id="co-bar"
    role="region"
    :aria-label="t('commerce.checkout.barLabel')"
  >
    <div class="co-bar-in">
      <div class="co-bar-detail" id="co-bar-detail" :hidden="!barOpen">
        <CoTotalsRows
          :count="totals.lines.length"
          :subtotal="totals.subtotal"
          :course-disc="totals.courseDiscount"
          :order-disc="totals.orderDiscount"
          :order-coupon-code="orderCoupon?.code ?? null"
          :total-disc="totalDiscount"
          :vat="totals.vatAmount"
          :vat-inclusive="totals.vatInclusive"
                  :currency="totals.currency"
        />
      </div>
      <div class="co-bar-row">
        <button
          type="button"
          class="co-bar-sum"
          data-bar-toggle
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
          <strong>{{ baht(totals.total) }}</strong>
        </button>
        <button
          type="button"
          class="btn btn--primary"
          data-confirm
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
</template>
