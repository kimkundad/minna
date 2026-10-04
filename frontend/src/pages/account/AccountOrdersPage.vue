<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import { call, fixImage, useStoreTick } from '@/components/account/account'
import type { CourseLike, OrderLike } from '@/components/account/types'
import { baht, dateTime, num } from '@/lib/format'

/**
 * Course orders, newest first.
 *
 * A failed or cancelled order is kept rather than hidden: the question people
 * come here with is usually "was I charged?", and an order that silently
 * disappeared answers it the wrong way.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const tick = useStoreTick()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const TABS = ['all', 'success', 'failed'] as const
type Tab = (typeof TABS)[number]

const orders = computed(() => {
  void tick.value
  return call<OrderLike[]>('orders')
})

const succeeded = (o: OrderLike) => o.status === 'paid' || o.status === 'free'

const counts = computed(
  () =>
    ({
      all: orders.value.length,
      success: orders.value.filter(succeeded).length,
      failed: orders.value.filter((o) => !succeeded(o)).length,
    }) as Record<Tab, number>,
)

const active = computed<Tab>(() => {
  const tab = String(route.query.tab ?? 'all')
  return (TABS as readonly string[]).includes(tab) ? (tab as Tab) : 'all'
})

const shown = computed(() => {
  if (active.value === 'all') return orders.value
  return orders.value.filter((o) => (active.value === 'success' ? succeeded(o) : !succeeded(o)))
})

const STATUS = {
  paid: { kind: 'done', icon: 'check-circle' },
  free: { kind: 'done', icon: 'gift' },
  failed: { kind: 'failed', icon: 'x-circle' },
  cancelled: { kind: 'expired', icon: 'ban' },
} as const

function statusBadge(o: OrderLike) {
  const spec = STATUS[o.status as keyof typeof STATUS] ?? STATUS.failed
  return { kind: spec.kind, icon: spec.icon, text: t(`account.orders.status.${o.status}`) }
}

const METHOD = { card: 'credit-card', qr: 'qr', free: 'gift' } as const
function methodIcon(m: string) {
  return METHOD[m as keyof typeof METHOD] ?? 'credit-card'
}

/** One line under the total, when there is something worth saying about the
 *  receipt — or about why there is none. */
function note(o: OrderLike): { icon: string; text: string } | null {
  if (o.status === 'failed') return { icon: 'info', text: t('account.orders.noteFailed') }
  if (o.status === 'cancelled') return { icon: 'info', text: t('account.orders.noteCancelled') }
  if (o.receipt?.want) {
    return {
      icon: 'file-text',
      text: t('account.orders.noteTax', {
        type: t(`account.orders.taxType.${o.receipt.type ?? 'individual'}`),
        status: t(`account.orders.receiptStatus.${o.receipt.status ?? 'processing'}`),
      }),
    }
  }
  return null
}

interface Line {
  cid: string
  net: number
  normal: number | null
  coupon: string | null
  course: CourseLike
  category: { name: string; icon: string; palette?: number }
}

/** Resolved once per line so the template never chains three lookups to reach
 *  a category name. */
function lines(o: OrderLike): Line[] {
  return o.items.map((it) => {
    const course = call<CourseLike>('course', it.cid)
    return {
      cid: it.cid,
      net: it.net,
      normal: it.normal,
      coupon: it.coupon,
      course,
      category: call<{ name: string; icon: string; palette?: number }>('category', course.category),
    }
  })
}

function reorder(o: OrderLike) {
  o.items.forEach((it) => call('addToCart', it.cid))
}

function select(tab: Tab) {
  void router.replace({ query: tab === 'all' ? {} : { tab } })
}
</script>

<template>
  <AccountShell page="orders">
    <div class="acct-toolbar">
      <div
        class="tabs tabs--pill acct-ftabs"
        role="tablist"
        :aria-label="t('account.orders.filterLabel')"
      >
        <button
          v-for="tab in TABS"
          :key="tab"
          type="button"
          class="tab"
          role="tab"
          :id="`od-tab-${tab}`"
          aria-controls="od-panel"
          :aria-selected="active === tab"
          :tabindex="active === tab ? 0 : -1"
          @click="select(tab)"
        >
          <span>{{ t(`account.orders.tab.${tab}`) }}</span>
          <span class="tab-count">{{ counts[tab] }}</span>
        </button>
      </div>
      <p class="acct-toolbar-note">
        <AppIcon name="info" />{{ t('account.orders.toolbarNote') }}
      </p>
    </div>

    <div role="tabpanel" id="od-panel" :aria-labelledby="`od-tab-${active}`" tabindex="-1">
      <template v-if="shown.length">
        <p class="sr-only" aria-live="polite">{{ t('account.orders.showing', { count: shown.length }) }}</p>

        <div class="acct-order-list">
          <article
            v-for="o in shown"
            :key="o.id"
            class="acct-order"
            :class="succeeded(o) ? 'acct-order--success' : 'acct-order--failed'"
            :aria-labelledby="`od-${o.id}`"
          >
            <header class="acct-order-head">
              <span class="acct-order-ico" aria-hidden="true"><AppIcon name="receipt" /></span>
              <div class="acct-order-id">
                <h3 :id="`od-${o.id}`">
                  <span class="sr-only">{{ t('account.orders.order') }}</span>{{ o.id }}
                </h3>
                <p>
                  <span>
                    <AppIcon name="calendar" />
                    <time :datetime="o.at">{{ dateTime(o.at) }}</time>
                  </span>
                  <span>
                    <AppIcon :name="methodIcon(o.method)" />{{ t(`account.orders.method.${o.method}`) }}
                  </span>
                  <span>
                    <AppIcon name="book-open" />{{ t('account.orders.itemCount', { count: o.items.length }) }}
                  </span>
                </p>
              </div>
              <AppBadge class="badge--lg acct-order-st" :badge="statusBadge(o)" />
            </header>

            <ul class="acct-oi-list" role="list">
              <li v-for="line in lines(o)" :key="line.cid" class="acct-oi">
                <RouterLink
                  class="acct-oi-media"
                  :to="path(`/courses/${line.cid}`)"
                  tabindex="-1"
                  aria-hidden="true"
                >
                  <CourseImage
                    :image="fixImage(line.course.image)"
                    :width="192"
                    :height="108"
                    :art-icon="line.category?.icon"
                    :art-palette="line.category?.palette ?? 0"
                  />
                </RouterLink>
                <div class="acct-oi-body">
                  <span class="acct-cat">{{ line.category?.name }}</span>
                  <RouterLink class="acct-oi-title" :to="path(`/courses/${line.cid}`)">
                    {{ line.course.title }}
                  </RouterLink>
                  <span v-if="line.coupon" class="acct-oi-coupon">
                    <AppIcon name="tag" />{{ t('account.orders.coupon', { code: line.coupon }) }}
                  </span>
                </div>
                <div class="acct-oi-price">
                  <b class="tabular">{{ baht(line.net) }}</b>
                  <s v-if="line.normal" class="tabular">
                    <span class="sr-only">{{ t('account.orders.normalPrice') }}</span>
                    {{ baht(line.normal) }}
                  </s>
                </div>
              </li>
            </ul>

            <footer class="acct-order-foot">
              <div class="acct-order-total">
                <span>{{ t('account.orders.net') }}</span>
                <b class="tabular">{{ baht(o.net) }}</b>
                <small v-if="o.courseDisc + o.orderDisc">
                  {{ t('account.orders.saved', { amount: num(o.courseDisc + o.orderDisc) }) }}
                </small>
              </div>

              <p v-if="note(o)" class="acct-order-note">
                <AppIcon :name="note(o)!.icon" /><span>{{ note(o)!.text }}</span>
              </p>

              <div class="acct-order-actions">
                <button
                  v-if="o.status === 'cancelled'"
                  type="button"
                  class="btn btn--ghost btn--sm"
                  @click="reorder(o)"
                >
                  <AppIcon name="refresh" />{{ t('account.orders.reorder') }}
                </button>
                <!-- Both wait on work outside this page: the receipt comes
                     from the order service and the breakdown opens in a dialog
                     this app has no component for yet. They are rendered now so
                     the row does not change shape when either arrives. -->
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  :disabled="!succeeded(o)"
                  :aria-label="t('account.orders.receiptFor', { id: o.id })"
                >
                  <AppIcon name="download" />{{ t('account.orders.receipt') }}
                </button>
                <button type="button" class="btn btn--primary btn--sm">
                  <AppIcon name="file-text" />{{ t('account.orders.detail') }}
                </button>
              </div>
            </footer>
          </article>
        </div>
      </template>

      <div v-else-if="orders.length" class="state-box state-box--plain">
        <div class="state-ico"><AppIcon name="receipt" /></div>
        <h3>{{ t('account.orders.noneInTab') }}</h3>
        <p>{{ t('account.orders.noneInTabText') }}</p>
        <div class="state-actions">
          <RouterLink class="btn btn--secondary" :to="path('/account/orders')">
            {{ t('account.orders.tab.all') }}
          </RouterLink>
        </div>
      </div>

      <div v-else class="state-box">
        <div class="state-ico"><AppIcon name="receipt" /></div>
        <h3>{{ t('account.orders.emptyTitle') }}</h3>
        <p>{{ t('account.orders.emptyText') }}</p>
        <div class="state-actions">
          <RouterLink class="btn btn--primary" :to="path('/courses')">
            <AppIcon name="search" />{{ t('account.empty.findCourses') }}
          </RouterLink>
        </div>
      </div>
    </div>
  </AccountShell>
</template>
