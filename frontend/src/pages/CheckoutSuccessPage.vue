<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import CoStateBox from '@/components/commerce/CoStateBox.vue'
import CoSteps from '@/components/commerce/CoSteps.vue'
import CoTotalsRows from '@/components/commerce/CoTotalsRows.vue'
import { openAuth } from '@/components/auth/authChannel'
import { ApiError, api, mediaUrl } from '@/lib/api'
import type { PublicCategory, PublicCourse, PublicOrder } from '@/lib/api'
import { baht as toBaht } from '@/lib/checkout'
import { categoryLabel } from '@/lib/course'
import { dateTime, num, money } from '@/lib/format'
import { useAuthStore } from '@/stores/auth'

/**
 * The end of the order — which is not always a success.
 *
 * A failed or cancelled order lands here too, and gets a page of its own
 * rather than a red version of the same one: no steps, no receipt, no "start
 * learning", and a help card that says plainly that nothing was charged. The
 * two most useful things after a failed payment are knowing you were not
 * billed and being able to try again, so those are what it leads with.
 *
 * A pending order is asked about rather than waited on: the payment provider's
 * webhook may not have arrived, so the API checks with it directly instead of
 * making somebody refresh until it does.
 */
const route = useRoute()
const { t } = useI18n()
const auth = useAuthStore()

/** The locale in the address, which is what every link on this page keeps. */
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
/** The basket's own currency. A basket cannot mix two — the server refuses
 *  one that does — so a single answer covers every figure on the page. */
const baht = (n: number) => money(n, order.value?.currency ?? 'THB', String(locale.value))

const METHOD_ICON: Record<string, string> = {
  promptpay: 'qr',
  card: 'credit-card',
  free: 'gift',
}

const orderNo = computed(() => {
  const value = route.query.order
  return value ? String(value) : null
})

const order = ref<PublicOrder | null>(null)
const courses = ref<PublicCourse[]>([])
const categories = ref<PublicCategory[]>([])
const loading = ref(true)
const notFound = ref(false)
const loadError = ref('')

const isLoggedIn = computed(() => auth.isLoggedIn)

let seq = 0

async function load(): Promise<void> {
  if (!orderNo.value) {
    loading.value = false
    notFound.value = true
    return
  }
  if (!isLoggedIn.value) {
    loading.value = false
    return
  }

  const mine = ++seq
  loading.value = true
  notFound.value = false
  loadError.value = ''
  try {
    const { data } = await api.orderByNo(orderNo.value)
    if (mine !== seq) return
    order.value = data

    // The courses behind the lines, for their pictures and their links. The
    // order itself only remembers the title it was sold under, which is right
    // — a price list changing must not rewrite what somebody bought.
    const ids = data.items.map((i) => i.courseId).filter((id): id is number => id !== null)
    const [found, cats] = await Promise.all([
      Promise.all(ids.map((id) => api.course(id).then((r) => r.data).catch(() => null))),
      api.categories().catch(() => ({ data: [] as PublicCategory[] })),
    ])
    if (mine !== seq) return
    courses.value = found.filter((c): c is PublicCourse => c !== null)
    categories.value = cats.data
  } catch (err) {
    if (mine !== seq) return
    if (err instanceof ApiError && (err.status === 404 || err.status === 409)) notFound.value = true
    else loadError.value = err instanceof ApiError ? err.message : t('commerce.success.loadFailed')
  } finally {
    if (mine === seq) loading.value = false
  }
}

onMounted(load)
watch(() => [orderNo.value, isLoggedIn.value], load)

/* ---------------- what state it is in ---------------- */

const status = computed(() => order.value?.status ?? null)
const isProblem = computed(() => status.value === 'failed' || status.value === 'cancelled')
const isPending = computed(() => status.value === 'pending')
const isFree = computed(() => order.value?.total === 0 && status.value === 'paid')
const settled = computed(() => status.value === 'paid')

/**
 * While an order is pending, ask again.
 *
 * PromptPay is paid minutes later from a banking app, often on another device,
 * so the tab that started it never hears anything. Without this the buyer sits
 * on "waiting" after the money has gone and has to work out that reloading is
 * what they are supposed to do.
 *
 * Every few seconds, and only for a few minutes: by then the transfer has
 * either landed or it is not coming, and a page left open overnight should not
 * still be asking.
 */
const POLL_EVERY = 4000
const POLL_FOR = 5 * 60 * 1000

let poller: ReturnType<typeof setInterval> | undefined
let pollingSince = 0

function stopPolling(): void {
  clearInterval(poller)
  poller = undefined
}

watch(isPending, (pending) => {
  if (!pending) {
    stopPolling()
    return
  }
  if (poller) return
  pollingSince = Date.now()
  poller = setInterval(() => {
    if (Date.now() - pollingSince > POLL_FOR) {
      stopPolling()
      return
    }
    void load()
  }, POLL_EVERY)
})

onBeforeUnmount(stopPolling)

/* ---------------- the lines ---------------- */

interface SuccessLine {
  id: number
  title: string
  href: string | null
  category: string
  image: { src: string; alt: string } | null
  artIcon: string
  artPalette: number
  price: number
  disc: number
  net: number
  access: string
}

const lines = computed<SuccessLine[]>(() =>
  (order.value?.items ?? []).map((item) => {
    const course = courses.value.find((c) => c.id === item.courseId)
    const cat = course?.categoryId
      ? categories.value.find((c) => c.id === course.categoryId)
      : undefined
    // Only for the fallback glyph: a sub-category rarely has one of its own.
    const parent = cat?.parentId ? categories.value.find((c) => c.id === cat.parentId) : undefined

    return {
      id: item.id,
      title: item.titleSnapshot,
      // Into the room. They have just paid for it; sending them back to the
      // page that sold it would be the one thing they no longer need.
      href: course ? `/${locale.value}/learn/${course.slug}` : null,
      // The same helper the cards use, rather than a second copy of the
      // parent-and-child rule that would not know about the other languages.
      category: cat ? categoryLabel(cat, categories.value, locale.value) : '',
      image: course?.thumbnailPath
        ? { src: mediaUrl(course.thumbnailPath), alt: item.titleSnapshot }
        : null,
      artIcon: cat?.icon ?? parent?.icon ?? 'book-open',
      artPalette: (course?.categoryId ?? 0) % 6,
      price: toBaht(item.unitPrice),
      disc: toBaht(item.discount),
      net: toBaht(Math.max(0, item.unitPrice - item.discount)),
      access:
        item.accessType === 'limited' && item.accessDurationDays
          ? t('course.infoAccessDays', { days: item.accessDurationDays })
          : t('course.perkLifetime'),
    }
  }),
)

/** Where to carry on. A paid order granted access, so the course page is open
 *  to them — the lesson player is still the prototype's, so it is not offered
 *  as though it were ready. */
const firstCourseHref = computed(() => lines.value.find((l) => l.href)?.href ?? null)

/** Buying again after a failure: the same courses, back through checkout. */
const retryHref = computed(() => {
  const slugs = (order.value?.items ?? [])
    .map((i) => courses.value.find((c) => c.id === i.courseId)?.slug)
    .filter(Boolean)
  return slugs.length ? `${path('/checkout')}?items=${slugs.join(',')}` : path('/courses')
})

const totalDiscount = computed(() =>
  order.value ? toBaht(order.value.courseDiscount + order.value.orderDiscount) : 0,
)

const failReason = computed(() =>
  status.value === 'cancelled'
    ? t('commerce.success.reasonCancelled')
    : t('commerce.success.reasonFailed'),
)

/* ---------------- copying the number ---------------- */

const copied = ref(false)

async function copyOrderNo(): Promise<void> {
  const id = order.value?.orderNo
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Denied, or no clipboard at all. The number is on the page either way.
  }
}
</script>

<template>
  <div id="cs-root">
    <!-- Still finding out -->
    <section v-if="loading" class="page-hero co-hero">
      <div class="container">
        <CoStateBox icon="hourglass" plain :title="t('commerce.success.loading')" />
      </div>
    </section>

    <!-- Signed out: an order belongs to an account -->
    <section v-else-if="!isLoggedIn" class="page-hero co-hero" aria-labelledby="cs-h">
      <div class="container">
        <h1 class="sr-only" id="cs-h">{{ t('commerce.success.pageTitle') }}</h1>
        <CoStateBox
          icon="lock"
          :title="t('commerce.success.gateTitle')"
          :text="t('commerce.success.gateText')"
        >
          <template #actions>
            <button type="button" class="btn btn--primary" @click="openAuth({ step: 'login' })">
              <AppIcon name="log-in" />{{ t('common.login') }}
            </button>
          </template>
        </CoStateBox>
      </div>
    </section>

    <!-- Could not load it -->
    <section v-else-if="loadError" class="page-hero co-hero" aria-labelledby="cs-h">
      <div class="container">
        <h1 class="sr-only" id="cs-h">{{ t('commerce.success.pageTitle') }}</h1>
        <CoStateBox icon="wifi-off" :title="t('commerce.success.loadFailed')" :text="loadError">
          <template #actions>
            <button type="button" class="btn btn--primary" data-retry="order" @click="load()">
              <AppIcon name="refresh" />{{ t('catalog.retry') }}
            </button>
          </template>
        </CoStateBox>
      </div>
    </section>

    <!-- No such order, or not this account's -->
    <section v-else-if="notFound || !order" class="page-hero co-hero" aria-labelledby="cs-h">
      <div class="container">
        <h1 class="sr-only" id="cs-h">{{ t('commerce.success.pageTitle') }}</h1>
        <CoStateBox
          icon="search"
          :title="t('commerce.success.notFoundTitle')"
          :text="
            orderNo
              ? t('commerce.success.notFoundText', { id: orderNo })
              : t('commerce.success.noneText')
          "
        >
          <template #actions>
            <RouterLink class="btn btn--primary" :to="path('/account/orders')">
              <AppIcon name="receipt" />{{ t('commerce.success.orderHistoryShort') }}
            </RouterLink>
            <RouterLink class="btn btn--secondary" :to="path('/courses')">
              <AppIcon name="book-open" />{{ t('commerce.cart.browseCourses') }}
            </RouterLink>
          </template>
        </CoStateBox>
      </div>
    </section>

    <template v-else>
      <!-- Something went wrong: a page of its own, not a red success page -->
      <section v-if="isProblem" class="page-hero co-hero" aria-labelledby="cs-h">
        <div class="container">
          <div class="state-box state-box--error" role="alert">
            <div class="state-ico"><AppIcon name="x-circle" /></div>
            <h1 id="cs-h">
              {{
                status === 'cancelled'
                  ? t('commerce.success.cancelledTitle')
                  : t('commerce.success.failedTitle')
              }}
            </h1>
            <p>
              {{
                status === 'cancelled'
                  ? t('commerce.success.cancelledLead', { id: order.orderNo })
                  : t('commerce.success.failedLead', { id: order.orderNo })
              }}
            </p>
            <div class="state-actions">
              <RouterLink class="btn btn--primary" :to="retryHref">
                <AppIcon name="refresh" />{{ t('commerce.success.retryCancelled') }}
              </RouterLink>
              <RouterLink class="btn btn--secondary" :to="path('/account/orders')">
                <AppIcon name="receipt" />{{ t('commerce.success.orderHistoryShort') }}
              </RouterLink>
            </div>
          </div>
        </div>
      </section>

      <!-- Paid for, or waiting to be -->
      <section v-else class="cs-hero" aria-labelledby="cs-h">
        <div class="container cs-anim">
          <CoSteps :current="4" :all-done="settled" />
          <div class="cs-icon" aria-hidden="true">
            <AppIcon :name="isPending ? 'hourglass' : isFree ? 'gift' : 'check-circle'" />
          </div>
          <p class="eyebrow eyebrow--cyan cs-eyebrow">
            {{
              isPending
                ? t('commerce.success.pendingEyebrow')
                : isFree
                  ? t('commerce.success.freeEyebrow')
                  : t('commerce.success.successEyebrow')
            }}
          </p>
          <h1 id="cs-h" tabindex="-1">
            {{
              isPending
                ? t('commerce.success.pendingTitle')
                : isFree
                  ? t('commerce.success.freeTitle')
                  : t('commerce.success.successTitle')
            }}
          </h1>
          <p class="lead">
            {{
              isPending
                ? t('commerce.success.pendingLead')
                : isFree
                  ? t('commerce.success.freeLead')
                  : t('commerce.success.successLead')
            }}
          </p>

          <div>
            <span class="cs-ref"
              >{{ t('commerce.success.orderLabel') }} <b>{{ order.orderNo }}</b
              ><button
                type="button"
                class="icon-btn icon-btn--ghost"
                :data-copy="order.orderNo"
                :aria-label="t('commerce.success.copyAria', { id: order.orderNo })"
                @click="copyOrderNo"
              >
                <AppIcon :name="copied ? 'check' : 'copy'" /></button
            ></span>
          </div>

          <div class="cs-ctas">
            <RouterLink
              v-if="settled && firstCourseHref"
              class="btn btn--primary btn--lg"
              :to="firstCourseHref"
            >
              <AppIcon name="play" />{{ t('commerce.success.start') }}
            </RouterLink>
            <RouterLink
              class="btn btn--lg"
              :class="settled && firstCourseHref ? 'btn--secondary' : 'btn--primary'"
              :to="path('/account/learning')"
            >
              <AppIcon name="book-open" />{{ t('commerce.success.myCourses') }}
            </RouterLink>
          </div>

          <RouterLink class="link cs-history" :to="path('/account/orders')">{{
            t('commerce.success.orderHistory')
          }}</RouterLink>
        </div>
      </section>

      <div class="container">
        <div class="cs-grid cs-anim">
          <!-- What was ordered -->
          <section class="cs-card" aria-labelledby="cs-d-h">
            <h2 id="cs-d-h">
              <AppIcon name="receipt" />{{ t('commerce.success.detailsHeading') }}
            </h2>
            <dl class="kv cs-kv">
              <dt>{{ t('commerce.success.orderNo') }}</dt>
              <dd><b class="tabular">{{ order.orderNo }}</b></dd>
              <dt>{{ t('commerce.success.dateTime') }}</dt>
              <dd>{{ dateTime(order.paidAt ?? order.createdAt) }}</dd>
              <dt>{{ t('commerce.success.method') }}</dt>
              <dd>
                <AppIcon :name="METHOD_ICON[order.paymentMethod ?? 'free'] ?? 'credit-card'" :size="16" />{{
                  order.total === 0
                    ? t('commerce.success.methodFree')
                    : order.paymentMethod === 'promptpay'
                      ? t('commerce.success.methodQr')
                      : t('commerce.success.methodCard')
                }}
              </dd>
              <dt>{{ t('commerce.success.status') }}</dt>
              <dd>
                <span
                  class="badge"
                  :class="settled ? 'badge--done' : isProblem ? 'badge--failed' : 'badge--info'"
                  >{{ t(`commerce.success.state${status}`) }}</span
                >
              </dd>
            </dl>

            <h3 class="cs-items-h">
              {{ t('commerce.success.itemsHeading', { n: lines.length }) }}
            </h3>
            <ul class="cs-items" role="list">
              <li v-for="l in lines" :key="l.id" class="cs-item">
                <span class="cs-item-media">
                  <CourseImage
                    :image="l.image"
                    alt=""
                    :width="224"
                    :height="126"
                    :art-icon="l.artIcon"
                    :art-palette="l.artPalette"
                  />
                </span>
                <div>
                  <h4 class="cs-item-title">
                    <RouterLink v-if="l.href" :to="l.href">{{ l.title }}</RouterLink>
                    <template v-else>{{ l.title }}</template>
                  </h4>
                  <div class="cs-item-meta">
                    <span v-if="l.category">{{ l.category }}</span>
                    <span v-if="settled"><AppIcon name="calendar" />{{ l.access }}</span>
                  </div>
                </div>
                <span class="cs-item-price">
                  <s v-if="l.disc">{{ baht(l.price) }}</s>
                  <strong>{{ l.net === 0 ? t('commerce.free') : baht(l.net) }}</strong>
                </span>
              </li>
            </ul>

            <CoTotalsRows
              :count="lines.length"
              :subtotal="toBaht(order.subtotal)"
              :course-disc="toBaht(order.courseDiscount)"
              :order-disc="toBaht(order.orderDiscount)"
              :total-disc="totalDiscount"
              :vat="toBaht(order.vatAmount)"
              vat-inclusive
            />
            <div class="co-total">
              <span class="co-total-lbl">{{ t('commerce.success.paidTotal') }}</span>
              <strong class="co-total-amt">{{
                order.total === 0 ? t('commerce.free') : baht(toBaht(order.total))
              }}</strong>
            </div>
          </section>

          <!-- What happens now -->
          <section class="cs-card" aria-labelledby="cs-n-h">
            <h2 id="cs-n-h"><AppIcon name="info" />{{ t('commerce.success.nextHeading') }}</h2>

            <ol class="cs-next" role="list">
              <li v-if="isPending">
                <span class="cs-next-ico"><AppIcon name="hourglass" /></span>
                <div>
                  <b>{{ t('commerce.success.pendingStepTitle') }}</b>
                  <p>{{ t('commerce.success.pendingStepText') }}</p>
                </div>
              </li>
              <template v-else>
                <li>
                  <span class="cs-next-ico"><AppIcon name="play-circle" /></span>
                  <div>
                    <b>{{ t('commerce.success.next1Title') }}</b>
                    <p>{{ t('commerce.success.next1Text') }}</p>
                  </div>
                </li>
                <li v-if="order.total > 0">
                  <span class="cs-next-ico"><AppIcon name="mail" /></span>
                  <div>
                    <b>{{ t('commerce.success.next2Title') }}</b>
                    <p>{{ t('commerce.success.next2Text') }}</p>
                  </div>
                </li>
                <li>
                  <span class="cs-next-ico"><AppIcon name="receipt" /></span>
                  <div>
                    <b>{{ t('commerce.success.next3Title') }}</b>
                    <p>{{ t('commerce.success.next3Text') }}</p>
                  </div>
                </li>
              </template>
            </ol>

            <p class="cs-help">
              <AppIcon name="help-circle" />
              <span>{{ t('commerce.success.helpText', { id: order.orderNo }) }}</span>
            </p>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
