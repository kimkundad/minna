<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppProgress from '@/components/ui/AppProgress.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import CoStateBox from '@/components/commerce/CoStateBox.vue'
import CoSteps from '@/components/commerce/CoSteps.vue'
import CoTotalsRows from '@/components/commerce/CoTotalsRows.vue'
import CommerceToasts from '@/components/commerce/CommerceToasts.vue'
import { assetUrl, call, protoHref, toast, useStoreTick } from '@/components/commerce/useCommerce'
import type { CommerceCategory, CommerceCourse, Order } from '@/components/commerce/types'
import { courseView } from '@/vendor'
import { date, dateTime, num } from '@/lib/format'

/**
 * The end of the order — which is not always a success.
 *
 * A failed or cancelled order lands here too, and gets a page of its own
 * rather than a red version of the same one: no steps, no receipt, no "start
 * learning", and a help card that says plainly that nothing was charged. The
 * two most useful things after a failed payment are knowing you were not
 * billed and being able to try again, so those are what the page leads with.
 *
 * Without `?order=` it shows the most recent order and says so, because the
 * usual way to arrive without one is by reopening the page later.
 */
const route = useRoute()
const { t } = useI18n()

const tick = useStoreTick()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
const baht = (n: number) => t('commerce.baht', { n: num(n) })

const METHOD_ICON: Record<string, string> = { qr: 'qr', card: 'credit-card', free: 'gift' }
const STATUS: Record<string, { badge: string; icon: string }> = {
  paid: { badge: 'done', icon: 'check-circle' },
  free: { badge: 'free', icon: 'gift' },
  failed: { badge: 'failed', icon: 'x-circle' },
  cancelled: { badge: 'expired', icon: 'ban' },
}

const isLoggedIn = computed(() => {
  void tick.value
  return Boolean(call<boolean>('isLoggedIn'))
})

const requestedId = computed(() => {
  const value = route.query.order
  return value ? String(value) : null
})

const found = computed(() => {
  void tick.value
  if (!isLoggedIn.value) return { order: null, latest: false }
  const mine = call<Order[]>('orders')
  if (requestedId.value) {
    return { order: mine.find((o) => o.id === requestedId.value) ?? null, latest: false }
  }
  return { order: mine[0] ?? null, latest: true }
})

const order = computed(() => found.value.order)
const isProblem = computed(
  () => order.value?.status === 'failed' || order.value?.status === 'cancelled',
)
const isFree = computed(() => order.value?.status === 'free')
const settled = computed(() => order.value?.status === 'paid' || isFree.value)

/* ---------------- the lines on the order ---------------- */

interface SuccessLine {
  cid: string
  title: string
  href: string
  category: string
  image: { src?: string; id?: string; alt?: string; fp?: string } | null
  artIcon?: string
  artPalette?: number
  until: string
  coupon: string | null
  couponOff: string
  price: number
  disc: number
  net: number
  /** Set when this purchase renewed access that had lapsed. */
  renewedPct: number | null
  learn: { label: string; href: string } | null
}

/** Where to carry on, when this account can already open the course. */
function learnInfo(cid: string): { label: string; href: string } | null {
  if (!call<{ has: boolean }>('access', cid).has) return null
  const progress = call<{ pct: number }>('progress', cid)
  const view = courseView(cid) as unknown as { learnHref?: string }
  return {
    label:
      progress.pct > 0 && progress.pct < 100
        ? t('commerce.success.resume')
        : t('commerce.success.start'),
    href: protoHref(view?.learnHref ?? `learn.html?id=${cid}`, locale.value),
  }
}

const lines = computed<SuccessLine[]>(() => {
  const o = order.value
  if (!o) return []
  // Only an order with more than one course offers a link per line; with one
  // course the hero's own button already goes there.
  const showLink = settled.value && (o.items ?? []).length > 1

  return (o.items ?? [])
    .map((item) => ({ item, course: call<CommerceCourse | null>('course', item.cid) }))
    .filter((x) => x.course)
    .map(({ item, course }) => {
      const c = course as CommerceCourse
      const category = call<CommerceCategory | null>('category', c.category)
      const entitlement = settled.value
        ? call<{ endAt?: string } | null>('entitlement', item.cid)
        : null
      const renewed = settled.value && (order.value?.renewed ?? []).includes(item.cid)
      const img = c.image
      return {
        cid: item.cid,
        title: c.title,
        href: protoHref(`course.html?id=${item.cid}`, locale.value),
        category: category?.name ?? '',
        image: img ? { ...img, src: assetUrl(img.src) ?? undefined } : null,
        artIcon: category?.icon,
        artPalette: category?.palette,
        until: entitlement?.endAt
          ? t('commerce.success.accessUntil', { date: date(entitlement.endAt) })
          : settled.value && c.isFree
            ? t('commerce.success.freeForMembers')
            : '',
        coupon: item.coupon,
        couponOff: item.disc ? `−${baht(item.disc)}` : baht(0),
        price: item.price,
        disc: item.disc,
        net: item.net,
        renewedPct: renewed ? call<{ pct: number }>('progress', item.cid).pct : null,
        learn: showLink ? learnInfo(item.cid) : null,
      }
    })
})

/** The hero's primary action on a settled order. */
const heroLearn = computed(() =>
  settled.value && lines.value.length ? learnInfo(lines.value[0]!.cid) : null,
)

/** Courses on a failed order that could still be bought. */
const buyable = computed(() => {
  const o = order.value
  if (!o) return []
  return (o.items ?? [])
    .map((i) => i.cid)
    .filter((cid) => call<CommerceCourse | null>('course', cid) && !call('cartBlock', cid))
})

const renewedCourses = computed(() =>
  (order.value?.renewed ?? [])
    .map((cid) => call<CommerceCourse | null>('course', cid))
    .filter((c): c is CommerceCourse => Boolean(c))
    .map((c) => ({
      title: c.title,
      pct: call<{ pct: number }>('progress', c.id).pct,
    })),
)

/* ---------------- receipt ---------------- */

const receipt = computed(() => {
  const o = order.value
  if (!o) return null
  const r = o.receipt ?? { want: false }
  if (isFree.value) return { kind: 'none' as const, icon: 'gift' }
  if (r.want) {
    return {
      kind: 'full' as const,
      icon: r.type === 'corporate' ? 'building' : 'id-card',
      type:
        r.type === 'corporate' ? t('commerce.tax.corporate') : t('commerce.tax.individual'),
      name: r.name || '—',
      corporate: r.type === 'corporate',
      branch:
        r.branch && r.branch !== '00000'
          ? t('commerce.success.receiptBranch', { no: r.branch })
          : t('commerce.success.receiptHeadOffice'),
      email: o.buyer?.email ?? '',
    }
  }
  return { kind: 'electronic' as const, icon: 'receipt', email: o.buyer?.email ?? '' }
})

/* ---------------- copy the order number ---------------- */

async function copyOrderId() {
  const id = order.value?.id
  if (!id) return
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(id)
    } else {
      // A fallback for plain http, where the clipboard API is unavailable.
      const field = document.createElement('textarea')
      field.value = id
      field.setAttribute('readonly', '')
      field.style.cssText = 'position:fixed;top:0;opacity:0'
      document.body.appendChild(field)
      field.select()
      const ok = document.execCommand('copy')
      field.remove()
      if (!ok) throw new Error('copy rejected')
    }
    toast(t('commerce.success.copied', { id }), { type: 'success' })
  } catch {
    toast(t('commerce.success.copyFailed', { id }), { type: 'info' })
  }
}

const h1 = ref<HTMLElement | null>(null)
</script>

<template>
  <div id="cs-root">
    <div class="cs-page">
      <!-- Signed out -->
      <template v-if="!isLoggedIn">
        <section class="page-hero co-hero" aria-labelledby="cs-h">
          <div class="container">
            <h1 id="cs-h" tabindex="-1">{{ t('commerce.success.pageTitle') }}</h1>
            <p>{{ t('commerce.success.pageSub') }}</p>
          </div>
        </section>
        <div class="container container--mid co-page">
          <CoStateBox
            icon="lock"
            plain
            :title="t('commerce.success.gateTitle')"
            :text="t('commerce.success.gateText')"
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
        </div>
      </template>

      <!-- No such order -->
      <template v-else-if="!order">
        <section class="page-hero co-hero" aria-labelledby="cs-h">
          <div class="container">
            <h1 id="cs-h" tabindex="-1">{{ t('commerce.success.pageTitle') }}</h1>
          </div>
        </section>
        <div class="container container--mid co-page">
          <CoStateBox
            icon="receipt"
            :title="
              requestedId ? t('commerce.success.notFoundTitle') : t('commerce.success.noneTitle')
            "
            :text="
              requestedId
                ? t('commerce.success.notFoundText', { id: requestedId })
                : t('commerce.success.noneText')
            "
          >
            <template #actions>
              <RouterLink class="btn btn--primary" :to="path('/courses')">
                <AppIcon name="book-open" />{{ t('commerce.cart.browseCourses') }}
              </RouterLink>
              <RouterLink
                v-if="requestedId"
                class="btn btn--secondary"
                :to="path('/account/orders')"
              >
                <AppIcon name="history" />{{ t('commerce.success.orderHistory') }}
              </RouterLink>
              <RouterLink v-else class="btn btn--secondary" :to="path('/cart')">
                <AppIcon name="cart" />{{ t('commerce.success.backToCart') }}
              </RouterLink>
            </template>
          </CoStateBox>
        </div>
      </template>

      <template v-else>
        <!-- Something went wrong: a page of its own, not a red success page -->
        <section
          v-if="isProblem"
          class="cs-hero cs-hero--problem"
          aria-labelledby="cs-h"
        >
          <div class="container cs-anim">
            <div
              class="cs-icon"
              :class="order.status === 'failed' ? 'cs-icon--failed' : 'cs-icon--cancelled'"
              aria-hidden="true"
            >
              <AppIcon :name="order.status === 'failed' ? 'x-circle' : 'ban'" />
            </div>
            <p class="eyebrow cs-eyebrow">
              {{
                order.status === 'failed'
                  ? t('commerce.success.failedEyebrow')
                  : t('commerce.success.cancelledEyebrow')
              }}
            </p>
            <h1 id="cs-h" ref="h1" tabindex="-1">
              {{
                order.status === 'failed'
                  ? t('commerce.success.failedTitle')
                  : t('commerce.success.cancelledTitle')
              }}
            </h1>
            <p class="lead">
              {{
                order.status === 'failed'
                  ? t('commerce.success.failedLead', { id: order.id })
                  : t('commerce.success.cancelledLead', { id: order.id })
              }}
            </p>

            <div>
              <span class="cs-ref"
                >{{ t('commerce.success.orderLabel') }} <b>{{ order.id }}</b
                ><button
                  type="button"
                  class="icon-btn icon-btn--ghost"
                  :data-copy="order.id"
                  :aria-label="t('commerce.success.copyAria', { id: order.id })"
                  @click="copyOrderId"
                >
                  <AppIcon name="copy" /></button
              ></span>
            </div>

            <div v-if="found.latest" class="cs-latest">
              <div class="notice notice--info" role="status">
                <AppIcon name="info" />
                <div class="notice-body">
                  <b>{{ t('commerce.success.latestTitle') }}</b>
                  <span>
                    <i18n-t keypath="commerce.success.latestText">
                      <template #link>
                        <RouterLink class="link" :to="path('/account/orders')">{{
                          t('commerce.success.orderHistoryShort')
                        }}</RouterLink>
                      </template>
                    </i18n-t>
                  </span>
                </div>
              </div>
            </div>

            <div class="cs-ctas">
              <RouterLink
                v-if="buyable.length"
                class="btn btn--primary btn--lg"
                :to="{ path: path('/checkout'), query: { items: buyable.join(',') } }"
              >
                <AppIcon name="refresh" />{{
                  order.status === 'failed'
                    ? t('commerce.success.retryFailed')
                    : t('commerce.success.retryCancelled')
                }}
              </RouterLink>
              <RouterLink
                class="btn btn--lg"
                :class="buyable.length ? 'btn--secondary' : 'btn--primary'"
                :to="path('/cart')"
              >
                <AppIcon name="cart" />{{ t('commerce.success.backToCart') }}
              </RouterLink>
            </div>

            <p v-if="!buyable.length" class="text-sm text-muted mt-16 mb-0">
              {{ t('commerce.success.nothingToPay') }}
            </p>

            <RouterLink class="link cs-history" :to="path('/account/orders')">{{
              t('commerce.success.orderHistory')
            }}</RouterLink>
          </div>
        </section>

        <!-- Paid, or claimed for free -->
        <section v-else class="cs-hero" aria-labelledby="cs-h">
          <div class="container cs-anim">
            <CoSteps :current="4" all-done />
            <div class="cs-icon" aria-hidden="true">
              <AppIcon :name="isFree ? 'gift' : 'check-circle'" />
            </div>
            <p class="eyebrow eyebrow--cyan cs-eyebrow">
              {{
                isFree
                  ? t('commerce.success.freeEyebrow')
                  : t('commerce.success.successEyebrow')
              }}
            </p>
            <h1 id="cs-h" ref="h1" tabindex="-1">
              {{ isFree ? t('commerce.success.freeTitle') : t('commerce.success.successTitle') }}
            </h1>
            <p class="lead">
              {{ isFree ? t('commerce.success.freeLead') : t('commerce.success.successLead') }}
            </p>

            <div>
              <span class="cs-ref"
                >{{ t('commerce.success.orderLabel') }} <b>{{ order.id }}</b
                ><button
                  type="button"
                  class="icon-btn icon-btn--ghost"
                  :data-copy="order.id"
                  :aria-label="t('commerce.success.copyAria', { id: order.id })"
                  @click="copyOrderId"
                >
                  <AppIcon name="copy" /></button
              ></span>
            </div>

            <div v-if="renewedCourses.length" class="notice notice--info" role="status">
              <AppIcon name="refresh" />
              <div class="notice-body">
                <b>{{ t('commerce.success.renewNoticeTitle') }}</b>
                <span>
                  <template v-for="(r, i) in renewedCourses" :key="r.title">
                    <br v-if="i" />{{
                      t('commerce.success.renewNoticeItem', { title: r.title, pct: `${r.pct}%` })
                    }}
                  </template>
                </span>
              </div>
            </div>

            <div v-if="found.latest" class="cs-latest">
              <div class="notice notice--info" role="status">
                <AppIcon name="info" />
                <div class="notice-body">
                  <b>{{ t('commerce.success.latestTitle') }}</b>
                  <span>
                    <i18n-t keypath="commerce.success.latestText">
                      <template #link>
                        <RouterLink class="link" :to="path('/account/orders')">{{
                          t('commerce.success.orderHistoryShort')
                        }}</RouterLink>
                      </template>
                    </i18n-t>
                  </span>
                </div>
              </div>
            </div>

            <div class="cs-ctas">
              <a v-if="heroLearn" class="btn btn--primary btn--lg" :href="heroLearn.href">
                <AppIcon name="play" />{{ heroLearn.label }}
              </a>
              <RouterLink
                class="btn btn--lg"
                :class="heroLearn ? 'btn--secondary' : 'btn--primary'"
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
                <dd><b class="tabular">{{ order.id }}</b></dd>
                <dt>{{ t('commerce.success.dateTime') }}</dt>
                <dd>{{ dateTime(order.at) }}</dd>
                <dt>{{ t('commerce.success.method') }}</dt>
                <dd>
                  <AppIcon :name="METHOD_ICON[order.method] ?? 'credit-card'" :size="16" />{{
                    t(`commerce.success.method${order.method === 'qr' ? 'Qr' : order.method === 'card' ? 'Card' : 'Free'}`)
                  }}
                </dd>
                <dt>{{ t('commerce.success.status') }}</dt>
                <dd>
                  <span class="badge" :class="`badge--${STATUS[order.status]?.badge}`">
                    <AppIcon :name="STATUS[order.status]?.icon ?? 'info'" />{{
                      t(`commerce.success.status${order.status.charAt(0).toUpperCase()}${order.status.slice(1)}`)
                    }}
                  </span>
                </dd>
                <template v-if="order.buyer?.name">
                  <dt>{{ t('commerce.success.buyer') }}</dt>
                  <dd>{{ order.buyer.name }}{{ order.buyer.email ? ` · ${order.buyer.email}` : '' }}</dd>
                </template>
              </dl>

              <h3>{{ t('commerce.success.itemsHeading', { n: lines.length }) }}</h3>
              <ul class="cs-items" role="list">
                <li v-for="l in lines" :key="l.cid" class="cs-item">
                  <a class="cs-item-media" :href="l.href" tabindex="-1" aria-hidden="true">
                    <CourseImage
                      :image="l.image"
                      alt=""
                      :width="224"
                      :height="126"
                      :art-icon="l.artIcon"
                      :art-palette="l.artPalette"
                    />
                  </a>
                  <div>
                    <h4 class="cs-item-title"><a :href="l.href">{{ l.title }}</a></h4>
                    <div class="cs-item-meta">
                      <span>{{ l.category }}</span>
                      <span v-if="l.until"><AppIcon name="calendar" />{{ l.until }}</span>
                      <span v-if="l.coupon" class="cs-coupon">
                        <AppIcon name="tag" />{{ l.coupon }} {{ l.couponOff }}
                      </span>
                    </div>
                  </div>
                  <div class="cs-item-price">
                    <s v-if="l.disc"
                      ><span class="sr-only">{{ t('commerce.success.priceBeforeDiscount') }}</span
                      >{{ baht(l.price) }}</s
                    >
                    <strong>{{ l.net === 0 ? t('commerce.free') : baht(l.net) }}</strong>
                  </div>
                  <div v-if="l.renewedPct !== null || l.learn" class="cs-item-extra">
                    <div v-if="l.renewedPct !== null" class="cs-renew">
                      <b><AppIcon name="refresh" />{{ t('commerce.success.renewedTitle') }}</b>
                      {{ t('commerce.success.renewedText', { pct: `${l.renewedPct}%` }) }}
                      <AppProgress
                        :value="l.renewedPct"
                        :label="t('commerce.success.renewedProgressLabel', { title: l.title })"
                      />
                    </div>
                    <a v-if="l.learn" class="link-arrow" :href="l.learn.href">
                      {{ l.learn.label }}<AppIcon name="arrow-right" />
                    </a>
                  </div>
                </li>
              </ul>

              <div class="cs-totals">
                <CoTotalsRows
                  :count="lines.length"
                  :subtotal="order.subtotal"
                  :course-disc="order.courseDisc"
                  :order-disc="order.orderDisc"
                  :order-coupon-code="order.orderCoupon"
                />
                <div class="co-total">
                  <span class="co-total-lbl"
                    >{{
                      settled
                        ? t('commerce.success.netTotalPaid')
                        : t('commerce.success.netTotalDue')
                    }}<small>{{
                      isFree
                        ? t('commerce.success.freeNoCharge')
                        : settled
                          ? t('commerce.success.paidVia', {
                              method: t(
                                `commerce.success.method${order.method === 'qr' ? 'Qr' : 'Card'}`,
                              ),
                            })
                          : t('commerce.success.notCharged')
                    }}</small></span
                  >
                  <strong class="co-total-amt">{{ baht(order.net) }}</strong>
                </div>
              </div>
            </section>

            <div class="cs-side">
              <!-- Problem: how to get help -->
              <section v-if="isProblem" class="cs-card" aria-labelledby="cs-hp-h">
                <h2 id="cs-hp-h">
                  <AppIcon name="help-circle" />{{ t('commerce.success.helpHeading') }}
                </h2>
                <ul class="cs-next" role="list">
                  <li>
                    <AppIcon name="shield-check" />
                    <span
                      ><b>{{ t('commerce.success.help1Title') }}</b
                      >{{
                        t('commerce.success.help1Text', {
                          id: order.id,
                          reason:
                            order.status === 'failed'
                              ? t('commerce.success.statusFailed')
                              : t('commerce.success.reasonCancelled'),
                        })
                      }}</span
                    >
                  </li>
                  <li>
                    <AppIcon name="refresh" />
                    <span
                      ><b>{{ t('commerce.success.help2Title') }}</b
                      >{{ t('commerce.success.help2Text') }}</span
                    >
                  </li>
                  <li>
                    <AppIcon name="mail" />
                    <span
                      ><b>{{ t('commerce.success.help3Title') }}</b>
                      <i18n-t keypath="commerce.success.help3Text">
                        <template #link>
                          <a class="link" href="#contact" data-proto-link>{{
                            t('commerce.success.contactUs')
                          }}</a>
                        </template>
                      </i18n-t>
                    </span>
                  </li>
                </ul>
              </section>

              <!-- Settled: the receipt, then what to do next -->
              <template v-else>
                <section class="cs-card" aria-labelledby="cs-r-h">
                  <h2 id="cs-r-h">
                    <AppIcon name="file-text" />{{ t('commerce.success.receiptHeading') }}
                  </h2>
                  <div class="cs-receipt">
                    <span class="cs-receipt-ico" aria-hidden="true">
                      <AppIcon :name="receipt?.icon ?? 'receipt'" />
                    </span>
                    <div>
                      <template v-if="receipt?.kind === 'none'">
                        <b>{{ t('commerce.success.receiptFreeTitle') }}</b>
                        <p>{{ t('commerce.success.receiptFreeText') }}</p>
                      </template>
                      <template v-else-if="receipt?.kind === 'full'">
                        <b>{{
                          t('commerce.success.receiptFullTitle', { type: receipt.type })
                        }}</b>
                        <p>
                          <template v-if="receipt.email">
                            <i18n-t keypath="commerce.success.receiptFullText">
                              <template #email>
                                <span class="cs-mail">{{ receipt.email }}</span>
                              </template>
                            </i18n-t>
                          </template>
                          <template v-else>{{
                            t('commerce.success.receiptFullTextNoEmail')
                          }}</template>
                        </p>
                        <span class="badge badge--pending">
                          <AppIcon name="hourglass" />{{
                            t('commerce.success.receiptProcessing')
                          }}
                        </span>
                        <dl class="kv">
                          <dt>{{ t('commerce.success.receiptIssuedTo') }}</dt>
                          <dd>{{ receipt.name }}</dd>
                          <template v-if="receipt.corporate">
                            <dt>{{ t('commerce.success.receiptPremises') }}</dt>
                            <dd>{{ receipt.branch }}</dd>
                          </template>
                        </dl>
                      </template>
                      <template v-else>
                        <b>{{ t('commerce.success.receiptEtitle') }}</b>
                        <p>
                          <i18n-t keypath="commerce.success.receiptEtext">
                            <template #link>
                              <RouterLink class="link" :to="path('/account/orders')">{{
                                t('commerce.success.orderHistoryShort')
                              }}</RouterLink>
                            </template>
                          </i18n-t>
                          <template v-if="receipt?.email">{{
                            t('commerce.success.receiptEcopy', { email: receipt.email })
                          }}</template>
                        </p>
                        <span class="badge badge--done">
                          <AppIcon name="check" />{{ t('commerce.success.receiptReady') }}
                        </span>
                      </template>
                    </div>
                  </div>
                </section>

                <section class="cs-card" aria-labelledby="cs-n-h">
                  <h2 id="cs-n-h">
                    <AppIcon name="route" />{{ t('commerce.success.nextHeading') }}
                  </h2>
                  <ul class="cs-next" role="list">
                    <li>
                      <AppIcon name="play-circle" />
                      <span
                        ><b>{{ t('commerce.success.next1Title') }}</b
                        >{{ t('commerce.success.next1Text') }}</span
                      >
                    </li>
                    <li>
                      <AppIcon name="history" />
                      <span
                        ><b>{{ t('commerce.success.next2Title') }}</b
                        >{{ t('commerce.success.next2Text') }}</span
                      >
                    </li>
                    <li>
                      <AppIcon name="award" />
                      <span
                        ><b>{{ t('commerce.success.next3Title') }}</b
                        >{{ t('commerce.success.next3Text') }}</span
                      >
                    </li>
                  </ul>
                </section>
              </template>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>

  <CommerceToasts />
</template>
