<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import CourseRail from '@/components/course/CourseRail.vue'
import CartItem from '@/components/commerce/CartItem.vue'
import CartSummaryRows from '@/components/commerce/CartSummaryRows.vue'
import CoSteps from '@/components/commerce/CoSteps.vue'
import CoStateBox from '@/components/commerce/CoStateBox.vue'
import CommerceConfirm from '@/components/commerce/CommerceConfirm.vue'
import CommerceToasts from '@/components/commerce/CommerceToasts.vue'
import {
  call,
  confirm,
  protoHref,
  toast,
  useBottomBar,
  useStoreTick,
} from '@/components/commerce/useCommerce'
import type { CommerceCourse, Totals } from '@/components/commerce/types'
import { num } from '@/lib/format'
import { vendorCourseView } from '@/lib/vendor-view'

/**
 * The cart — step one of four.
 *
 * Selection is per item, and the total counts only what is selected. That is
 * the whole shape of this page: you can keep a course in the cart for later
 * without paying for it today, and the summary says so in as many words.
 *
 * Three kinds of line cannot be bought — covered by a package, already owned,
 * no longer on sale — and they stay visible with their checkbox disabled
 * rather than being quietly removed. `store.cartBlock` is the only thing that
 * decides which, and `store.selectedCart` the only thing that decides what the
 * total is made of, so the page and the order it produces cannot drift apart.
 *
 * Removing asks first and then offers an undo, because a cart is a list people
 * prune quickly and a mis-click should cost nothing.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const tick = useStoreTick()
/** The locale in the URL, not the one i18n happens to be set to: every link
 *  on the page has to stay inside the path the visitor is already on. */
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
/** Until this page is served by our own API, its cards come from the
 *  prototype store. See `vendor-view.ts`. */
const vendorView = (id: string) => vendorCourseView(id, locale.value)

interface CartEntry {
  cid: string
  selected: boolean
}

const items = computed<CartEntry[]>(() => {
  void tick.value
  return call<CartEntry[]>('cart')
})

type Block = 'package' | 'owned' | 'ended' | null

const blocks = computed<Record<string, Block>>(() => {
  void tick.value
  const out: Record<string, Block> = {}
  items.value.forEach((x) => {
    out[x.cid] = call<Block>('cartBlock', x.cid)
  })
  return out
})

const isLoggedIn = computed(() => {
  void tick.value
  return Boolean(call<boolean>('isLoggedIn'))
})

const selectable = computed(() => items.value.filter((x) => blocks.value[x.cid] == null))
const selected = computed(() => selectable.value.filter((x) => x.selected))
const blockedCount = computed(() => items.value.length - selectable.value.length)

/** The select-all box is indeterminate while some but not all are chosen,
 *  which is the only honest state for a mixed selection. */
const allChecked = computed(
  () => selectable.value.length > 0 && selected.value.length === selectable.value.length,
)
const someChecked = computed(
  () => selected.value.length > 0 && selected.value.length < selectable.value.length,
)

const totals = computed(() => {
  void tick.value
  const ids = call<string[]>('selectedCart')
  const computed_ = call<Totals>('computeTotals', ids, {}, null)
  return {
    ids,
    count: ids.length,
    normal: computed_.normalTotal,
    saving: Math.max(0, computed_.normalTotal - computed_.subtotal),
    total: computed_.subtotal,
  }
})

const baht = (n: number) => t('commerce.baht', { n: num(n) })

/* ---------------- recommendations, for an empty cart ---------------- */

interface Recommendation {
  course: CommerceCourse
  reason: string
}

const recommended = computed<Recommendation[]>(() => {
  void tick.value
  if (items.value.length) return []
  return call<Recommendation[]>('recommended')
    .filter(
      (r) =>
        r.course.status !== 'ended' &&
        !call<boolean>('inCart', r.course.id) &&
        !call<{ has: boolean }>('access', r.course.id).has,
    )
    .slice(0, 8)
})

/* ---------------- actions ---------------- */

function setSelected(cid: string, value: boolean) {
  call('setSelected', cid, value)
}

function selectAll(value: boolean) {
  call('selectAll', value)
}

async function remove(cid: string) {
  const course = call<CommerceCourse>('course', cid)
  if (!course) return
  const wasSelected = items.value.find((x) => x.cid === cid)?.selected ?? false

  const ok = await confirm({
    title: t('commerce.cart.confirmTitle'),
    message: t('commerce.cart.confirmMessage', { title: course.title }),
    confirmLabel: t('commerce.cart.confirmOk'),
    cancelLabel: t('commerce.cancel'),
    danger: true,
  })
  if (!ok) return

  call('removeFromCart', cid)
  toast(t('commerce.cart.removed', { title: course.title }), {
    type: 'success',
    timeout: 6500,
    action: {
      label: t('commerce.undo'),
      onClick: () => {
        call('addToCart', cid)
        // Putting it back should not also select it if it was unselected.
        if (!wasSelected) call('setSelected', cid, false)
        toast(t('commerce.cart.restored', { title: course.title }), { type: 'info' })
      },
    },
  })
}

const goingToCheckout = ref(false)

/** Signing in is not wired up yet, so a guest is sent to the order page, where
 *  the gate explains itself and keeps the chosen lines on screen. */
function goCheckout() {
  if (!totals.value.count || goingToCheckout.value) return
  goingToCheckout.value = true
  if (isLoggedIn.value) call('startCheckout', totals.value.ids.slice(), 'cart')
  void router.push(path('/checkout')).finally(() => {
    goingToCheckout.value = false
  })
}

/** CTAs on the recommendation rail. Signing in is not available yet, so those
 *  buttons fall through to the course page. */
function runAction(action: string, courseId?: string) {
  const cid = courseId ?? ''
  if (action === 'add-cart') {
    const r = call<{ ok: boolean; exists?: boolean; error?: string }>('addToCart', cid)
    const course = call<CommerceCourse>('course', cid)
    if (r.ok) {
      toast(
        r.exists
          ? t('commerce.cart.alreadyInCart')
          : t('commerce.cart.added', { title: course.title }),
        { type: 'success' },
      )
    } else if (r.error) {
      toast(r.error, { type: 'error' })
    }
    return
  }
  if (action === 'buy') {
    void router.push({ path: path('/checkout'), query: { items: cid } })
    return
  }
  if (cid) void router.push(path(`/courses/${cid}`))
}

/* ---------------- mobile summary bar ---------------- */

const bar = ref<HTMLElement | null>(null)
const barOpen = ref(false)
useBottomBar('page-cart', bar, () => items.value.length > 0)
</script>

<template>
  <section class="page-hero co-hero" aria-labelledby="cart-h">
    <div class="container co-hero-in">
      <div class="co-hero-copy">
        <nav :aria-label="t('common.breadcrumb')">
          <ol class="crumbs">
            <li><RouterLink :to="path('')">{{ t('common.home') }}</RouterLink></li>
            <li aria-hidden="true"><AppIcon name="chevron-right" :size="14" /></li>
            <li><span aria-current="page">{{ t('common.cart') }}</span></li>
          </ol>
        </nav>
        <h1 id="cart-h">{{ t('commerce.cart.title') }}</h1>
        <p id="cart-sub">
          <template v-if="items.length">
            <span class="co-hero-count">
              <AppIcon name="cart" />{{ t('commerce.cart.itemCount', { n: items.length }) }}
            </span>
            {{ t('commerce.cart.subtitle') }}
          </template>
          <template v-else>{{ t('commerce.cart.emptySubtitle') }}</template>
        </p>
      </div>
      <CoSteps id="cart-steps" :current="1" />
    </div>
  </section>

  <section class="co-page" :class="{ 'has-rec': !items.length }" :aria-label="t('commerce.cart.regionLabel')">
    <div class="container" id="cart-root">
      <!-- Nothing in the cart yet -->
      <template v-if="!items.length">
        <h2 class="sr-only">{{ t('commerce.cart.listHeading') }}</h2>
        <CoStateBox
          icon="cart"
          :title="t('commerce.cart.emptyTitle')"
          :text="t('commerce.cart.emptyText')"
        >
          <template #actions>
            <RouterLink class="btn btn--primary" :to="path('/courses')">
              <AppIcon name="book-open" />{{ t('commerce.cart.browseCourses') }}
            </RouterLink>
            <RouterLink class="btn btn--secondary" :to="`${path('/courses')}?access=free`">
              <AppIcon name="gift" />{{ t('commerce.cart.browseFree') }}
            </RouterLink>
          </template>
        </CoStateBox>
      </template>

      <div v-else class="ct-layout">
        <div class="ct-main">
          <h2 class="sr-only" id="ct-list-h">{{ t('commerce.cart.listHeading') }}</h2>

          <div id="ct-blocked">
            <div v-if="blockedCount" class="ct-blocked-note">
              <AppNotice
                tone="info"
                :title="t('commerce.cart.blockedTitle', { n: blockedCount })"
                :text="t('commerce.cart.blockedText')"
              />
            </div>
          </div>

          <div class="ct-toolbar">
            <label class="check">
              <input
                type="checkbox"
                id="ct-all"
                :checked="allChecked"
                :indeterminate="someChecked"
                :disabled="!selectable.length"
                @change="selectAll(($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t('commerce.cart.selectAll') }}</span>
            </label>
            <span class="ct-selcount" id="ct-selcount" aria-live="polite">
              <i18n-t keypath="commerce.cart.selectionCount">
                <template #done><b>{{ selected.length }}</b></template>
                <template #total>{{ selectable.length }}</template>
              </i18n-t>
            </span>
          </div>

          <ul class="ct-list" role="list" aria-labelledby="ct-list-h" id="ct-list">
            <CartItem
              v-for="entry in items"
              :key="entry.cid"
              :course-id="entry.cid"
              :selected="entry.selected"
              :block="blocks[entry.cid] ?? null"
              @toggle-select="setSelected"
              @remove="remove"
            />
          </ul>
        </div>

        <aside class="co-side ct-side" aria-labelledby="ct-sum-h">
          <div class="co-sum" id="ct-sum">
            <div class="co-sum-head">
              <h2 id="ct-sum-h">{{ t('commerce.summaryTitle') }}</h2>
            </div>

            <CartSummaryRows
              :count="totals.count"
              :normal="totals.normal"
              :saving="totals.saving"
            />

            <div class="co-total">
              <span class="co-total-lbl"
                >{{ t('commerce.cart.total')
                }}<small>{{ t('commerce.cart.totalNote') }}</small></span
              >
              <strong class="co-total-amt">{{ baht(totals.total) }}</strong>
            </div>

            <p class="co-sum-note">
              <AppIcon name="tag" /><span>{{ t('commerce.cart.couponNext') }}</span>
            </p>

            <AppNotice
              v-if="!isLoggedIn"
              tone="info"
              icon="user"
              :text="t('commerce.cart.guestNotice')"
            />

            <button
              type="button"
              class="btn btn--primary btn--lg btn--block"
              :class="{ 'is-loading': goingToCheckout }"
              data-checkout
              data-fk="sum-cta"
              :disabled="!totals.count || goingToCheckout"
              :aria-describedby="totals.count ? undefined : 'ct-help'"
              @click="goCheckout"
            >
              <template v-if="goingToCheckout">
                <span class="spinner" aria-hidden="true" /><span>{{
                  t('commerce.cart.goingToCheckout')
                }}</span>
              </template>
              <template v-else>
                {{ t('commerce.cart.checkout') }}<AppIcon name="arrow-right" />
              </template>
            </button>

            <p v-if="!totals.count" class="co-sum-help" id="ct-help">
              <AppIcon name="info" /><span>{{ t('commerce.cart.pickAtLeastOne') }}</span>
            </p>

            <ul class="co-trust" role="list">
              <li>
                <AppIcon name="shield-check" /><span>{{ t('commerce.trust.payment') }}</span>
              </li>
              <li><AppIcon name="receipt" /><span>{{ t('commerce.trust.receipt') }}</span></li>
              <li><AppIcon name="history" /><span>{{ t('commerce.trust.keptInCart') }}</span></li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  </section>

  <!-- Recommendations, which only earn their place once the cart is empty -->
  <section
    class="co-rec"
    id="cart-rec"
    aria-labelledby="cart-rec-h"
    :hidden="!recommended.length"
  >
    <div class="container" data-slot>
      <CourseRail
        v-if="recommended.length"
        id="cart-rec"
        eyebrow="Recommended"
        :title="t('commerce.cart.recTitle')"
        :sub="isLoggedIn ? t('commerce.cart.recSubMember') : t('commerce.cart.recSubGuest')"
        :more-href="path('/courses')"
        :more-label="t('course.viewAllCourses')"
        :count="recommended.length"
      >
        <CourseCard
          v-for="r in recommended"
          :key="r.course.id"
          :view="vendorView(r.course.id)"
          :reason="isLoggedIn ? r.reason : undefined"
          @run="runAction"
        />
      </CourseRail>
    </div>
  </section>

  <!-- Mobile summary bar: below 960px the sidebar card is hidden -->
  <div
    v-if="items.length"
    ref="bar"
    class="sticky-bar co-bar"
    id="cart-bar"
    role="region"
    :aria-label="t('commerce.cart.barLabel')"
  >
    <div class="co-bar-in">
      <div class="co-bar-detail" id="ct-bar-detail" :hidden="!barOpen">
        <CartSummaryRows :count="totals.count" :normal="totals.normal" :saving="totals.saving" />
        <p class="co-sum-note">
          <AppIcon name="tag" /><span
            >{{ t('commerce.cart.couponNext')
            }}{{ isLoggedIn ? '' : ` · ${t('commerce.cart.signInFirst')}` }}</span
          >
        </p>
      </div>
      <div class="co-bar-row">
        <button
          type="button"
          class="co-bar-sum"
          data-bar-toggle
          data-fk="bar-toggle"
          :aria-expanded="barOpen"
          aria-controls="ct-bar-detail"
          @click="barOpen = !barOpen"
        >
          <small
            >{{
              totals.count
                ? t('commerce.cart.barSelected', { n: totals.count })
                : t('commerce.cart.barNone')
            }}
            <b
              >{{ barOpen ? t('commerce.hideDetail') : t('commerce.showDetail')
              }}<AppIcon name="chevron-up" /></b
          ></small>
          <strong>{{ baht(totals.total) }}</strong>
        </button>
        <button
          type="button"
          class="btn btn--primary"
          data-checkout
          data-fk="bar-cta"
          :disabled="!totals.count"
          @click="goCheckout"
        >
          {{ t('commerce.cart.checkout') }}
        </button>
      </div>
    </div>
  </div>

  <CommerceConfirm />
  <CommerceToasts />
</template>
