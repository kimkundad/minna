<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
import { confirm, toast, useBottomBar } from '@/components/commerce/useCommerce'
import { openAuth } from '@/components/auth/authChannel'
import { api } from '@/lib/api'
import type { ContentLocale, PublicCategory, PublicCourse } from '@/lib/api'
import { baht as toBaht } from '@/lib/checkout'
import { courseView } from '@/lib/course'
import { num, money } from '@/lib/format'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'

/**
 * The basket — step one of four.
 *
 * Selection is per line, and the total counts only what is ticked. That is the
 * whole shape of this page: a course can sit here for later without being paid
 * for today, and the summary says so in as many words.
 *
 * The total is the server's. Ticking a line asks for a new price for the whole
 * basket, so what this page shows and what the order charges come from the one
 * calculation.
 *
 * A line that cannot be bought — already owned, no longer sold — keeps its
 * place with the box disabled rather than vanishing. Removing asks first and
 * then offers an undo, because a basket is a list people prune quickly and a
 * mis-click should cost nothing.
 */
const route = useRoute()
const router = useRouter()
const { t, locale: uiLocale } = useI18n()
const auth = useAuthStore()
const cart = useCartStore()

/** The locale in the URL, not the one i18n happens to be set to: every link on
 *  the page has to stay inside the path the visitor is already on. */
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const isLoggedIn = computed(() => auth.isLoggedIn)
const categories = ref<PublicCategory[]>([])

onMounted(async () => {
  categories.value = await api
    .categories()
    .then((r) => r.data)
    .catch(() => [])
  await cart.load()
  await loadRecommended()
})

// Signing in from the notice turns an empty basket into whatever was in it.
watch(isLoggedIn, () => {
  void cart.load()
})

/* ---------------- the lines ---------------- */

interface Line {
  courseId: number
  selected: boolean
  view: ReturnType<typeof courseView>
  block: 'owned' | 'ended' | null
}

const lines = computed<Line[]>(() =>
  cart.items.flatMap((item) => {
    const course = cart.courseFor(item.courseId)
    if (!course) return []
    return [
      {
        courseId: item.courseId,
        selected: item.selected,
        view: courseView(course, { locale: locale.value, t, categories: categories.value }),
        block: cart.owned.includes(item.courseId)
          ? ('owned' as const)
          : !course.sellable && course.price > 0
            ? ('ended' as const)
            : null,
      },
    ]
  }),
)

const selectable = computed(() => lines.value.filter((l) => !l.block))
const selected = computed(() => selectable.value.filter((l) => l.selected))
const blockedCount = computed(() => lines.value.length - selectable.value.length)

/** Indeterminate while some but not all are ticked, which is the only honest
 *  state for a mixed selection. */
const allChecked = computed(
  () => selectable.value.length > 0 && selected.value.length === selectable.value.length,
)
const someChecked = computed(
  () => selected.value.length > 0 && selected.value.length < selectable.value.length,
)

/**
 * The summary, from the server's quote.
 *
 * `normal` is what it would have cost at the struck-through prices, which is
 * the only number this page works out for itself — it is a comparison the
 * server was never asked for, and it changes nothing about what is charged.
 */
const totals = computed(() => {
  const q = cart.quote
  const chosen = selected.value
  const normal = chosen.reduce((sum, l) => sum + (l.view.normalPrice ?? l.view.price), 0)
  const subtotal = q ? toBaht(q.subtotal) : 0
  return {
    count: chosen.length,
    normal,
    saving: Math.max(0, normal - subtotal),
    total: q ? toBaht(q.total) : 0,
    // The quote's own answer. Before it arrives there is nothing priced on the
    // page anyway, so baht is a placeholder rather than a guess at a price.
    currency: q?.currency ?? 'THB',
  }
})

/** The basket's own currency. A basket cannot mix two — the server refuses
 *  one that does — so a single answer covers every figure on the page. */
const baht = (n: number) => money(n, totals.value?.currency ?? 'THB', String(locale.value))

/* ---------------- actions ---------------- */

function setSelected(courseId: number, value: boolean): void {
  void cart.setSelected(courseId, value)
}

function selectAll(value: boolean): void {
  void cart.selectAll(value)
}

async function remove(courseId: number): Promise<void> {
  const line = lines.value.find((l) => l.courseId === courseId)
  if (!line) return
  const wasSelected = line.selected

  const ok = await confirm({
    title: t('commerce.cart.confirmTitle'),
    message: t('commerce.cart.confirmMessage', { title: line.view.title }),
    confirmLabel: t('commerce.cart.confirmOk'),
    cancelLabel: t('commerce.cancel'),
    danger: true,
  })
  if (!ok) return

  await cart.remove(courseId)
  toast(t('commerce.cart.removed', { title: line.view.title }), {
    type: 'success',
    timeout: 6500,
    action: {
      label: t('commerce.undo'),
      onClick: () => {
        void cart.add(courseId).then(() => {
          // Putting it back should not also tick it if it was unticked.
          if (!wasSelected) void cart.setSelected(courseId, false)
          toast(t('commerce.cart.restored', { title: line.view.title }), { type: 'info' })
        })
      },
    },
  })
}

const goingToCheckout = ref(false)

function goCheckout(): void {
  if (!totals.value.count || goingToCheckout.value) return
  if (!isLoggedIn.value) {
    openAuth({ step: 'login', reason: t('auth.reasonCheckout') })
    return
  }
  goingToCheckout.value = true
  // The ticked lines travel in the address, which is what checkout reads.
  const slugs = selected.value.map((l) => l.view.slug).join(',')
  void router
    .push({ path: path('/checkout'), query: { items: slugs } })
    .finally(() => (goingToCheckout.value = false))
}

/* ---------------- what to suggest when it is empty ---------------- */

const recommended = ref<PublicCourse[]>([])

/**
 * Only once the basket is empty, and only courses that are not in it and not
 * already owned — suggesting something somebody has already bought is the
 * fastest way to look like nothing here knows them.
 */
async function loadRecommended(): Promise<void> {
  if (cart.items.length) {
    recommended.value = []
    return
  }
  try {
    const res = await api.courses({
      sort: 'recommended',
      perPage: 12,
      // The language the teaching is given in, which is what a reader of this
      // site in English can actually follow.
      locales: [String(uiLocale.value) as ContentLocale],
    })
    recommended.value = res.data
      .filter((c) => !cart.has(c.id) && !cart.owned.includes(c.id))
      .slice(0, 8)
  } catch {
    // An empty basket with no suggestions is still an empty basket.
  }
}

watch(() => cart.items.length, loadRecommended)

const recommendedCards = computed(() =>
  recommended.value.map((c) =>
    courseView(c, { locale: locale.value, t, categories: categories.value }),
  ),
)

/* ---------------- mobile summary bar ---------------- */

const bar = ref<HTMLElement | null>(null)
const barOpen = ref(false)
useBottomBar('page-cart', bar, () => lines.value.length > 0)
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
          <template v-if="lines.length">
            <span class="co-hero-count">
              <AppIcon name="cart" />{{ t('commerce.cart.itemCount', { n: lines.length }) }}
            </span>
            {{ t('commerce.cart.subtitle') }}
          </template>
          <template v-else>{{ t('commerce.cart.emptySubtitle') }}</template>
        </p>
      </div>
      <CoSteps id="cart-steps" :current="1" />
    </div>
  </section>

  <section
    class="co-page"
    :class="{ 'has-rec': !lines.length }"
    :aria-label="t('commerce.cart.regionLabel')"
  >
    <div class="container" id="cart-root">
      <!-- Still reading it -->
      <CoStateBox
        v-if="cart.loading && !cart.loaded"
        icon="hourglass"
        plain
        :title="t('commerce.cart.loading')"
      />

      <!-- Nothing in it yet -->
      <template v-else-if="!lines.length">
        <h2 class="sr-only">{{ t('commerce.cart.listHeading') }}</h2>
        <CoStateBox
          icon="cart"
          :title="t('commerce.cart.emptyTitle')"
          :text="isLoggedIn ? t('commerce.cart.emptyText') : t('commerce.cart.emptyTextGuest')"
        >
          <template #actions>
            <RouterLink class="btn btn--primary" :to="path('/courses')">
              <AppIcon name="book-open" />{{ t('commerce.cart.browseCourses') }}
            </RouterLink>
            <RouterLink class="btn btn--secondary" :to="`${path('/courses')}?price=free`">
              <AppIcon name="gift" />{{ t('commerce.cart.browseFree') }}
            </RouterLink>
          </template>
        </CoStateBox>
      </template>

      <div v-else class="ct-layout">
        <div class="ct-main">
          <h2 class="sr-only" id="ct-list-h">{{ t('commerce.cart.listHeading') }}</h2>

          <div id="ct-blocked">
            <!-- A basket that cannot be priced says so here rather than
                 showing an empty total and no reason. The server sends the
                 sentence, because it is the one that knows which two
                 currencies met. -->
            <div v-if="cart.problem" class="ct-blocked-note">
              <AppNotice tone="danger" :text="cart.problem" />
            </div>
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
              v-for="line in lines"
              :key="line.courseId"
              :view="line.view"
              :course-id="line.courseId"
              :selected="line.selected"
              :block="line.block"
              :busy="cart.busy === line.courseId"
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
              :currency="totals.currency"
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

            <button
              type="button"
              class="btn btn--primary btn--lg btn--block"
              :class="{ 'is-loading': goingToCheckout }"
              data-checkout
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

  <!-- Suggestions, which only earn their place once the basket is empty -->
  <section
    v-if="recommendedCards.length"
    class="co-rec"
    id="cart-rec"
    aria-labelledby="cart-rec-h"
  >
    <div class="container" data-slot>
      <CourseRail
        id="cart-rec"
        eyebrow="Recommended"
        :title="t('commerce.cart.recTitle')"
        :sub="isLoggedIn ? t('commerce.cart.recSubMember') : t('commerce.cart.recSubGuest')"
        :more-href="path('/courses')"
        :more-label="t('course.viewAllCourses')"
        :count="recommendedCards.length"
      >
        <CourseCard v-for="c in recommendedCards" :key="c.id" :view="c" />
      </CourseRail>
    </div>
  </section>

  <!-- Mobile summary bar: below 960px the sidebar card is hidden -->
  <div
    v-if="lines.length"
    ref="bar"
    class="sticky-bar co-bar"
    id="cart-bar"
    role="region"
    :aria-label="t('commerce.cart.barLabel')"
  >
    <div class="co-bar-in">
      <div class="co-bar-detail" id="ct-bar-detail" :hidden="!barOpen">
        <CartSummaryRows
          :count="totals.count"
          :normal="totals.normal"
          :saving="totals.saving"
          :currency="totals.currency"
        />
        <p class="co-sum-note">
          <AppIcon name="tag" /><span>{{ t('commerce.cart.couponNext') }}</span>
        </p>
      </div>
      <div class="co-bar-row">
        <button
          type="button"
          class="co-bar-sum"
          data-bar-toggle
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
          :disabled="!totals.count"
          @click="goCheckout"
        >
          {{ t('commerce.cart.checkout') }}
        </button>
      </div>
    </div>
  </div>

  <CommerceConfirm />
</template>
