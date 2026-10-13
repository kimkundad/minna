<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import AppModal from '@/components/ui/AppModal.vue'
import { ApiError, api, mediaUrl, type MyOrder, type MyOrderItem } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { baht as toBaht } from '@/lib/course'
import { money as fmtMoney, dateTime, num } from '@/lib/format'

/**
 * Course orders, newest first.
 *
 * A failed or cancelled order is kept rather than hidden: the question people
 * come here with is usually "was I charged?", and an order that silently
 * disappeared answers it the wrong way.
 *
 * Every figure on this page is the figure the API froze at purchase — not the
 * course's price today. A course that has since been repriced or renamed still
 * reads here as it was bought.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const cart = useCartStore()

const locale = computed(() => String(route.params.locale ?? 'th'))

/**
 * An amount in the currency its own order was paid in.
 *
 * This page used to print every figure as baht, because the only formatter it
 * had wrote the word — so an order paid in dollars read as '100 บาท'. Each
 * order carries its currency, and it is per order rather than per page: the
 * list shows several at once.
 */
const money = (n: number, currency: string) => fmtMoney(n, currency, locale.value)
const path = (p: string) => `/${locale.value}${p}`

const orders = ref<MyOrder[]>([])
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    orders.value = (await api.myOrders()).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('account.orders.loadFailed')
  } finally {
    loading.value = false
  }
}
onMounted(load)

/* ---------------- status ---------------- */

const TABS = ['all', 'success', 'pending', 'failed'] as const
type Tab = (typeof TABS)[number]

/**
 * What the badge says. The database records a free enrolment as a paid order
 * for nothing, which is right — it is still a sale with an order number — but
 * "ชำระเงินแล้ว ฿0" is not what happened, so it is named separately here.
 */
function kindOf(o: MyOrder): 'paid' | 'free' | 'pending' | 'failed' | 'cancelled' | 'refunded' {
  if (o.status === 'paid') return o.total === 0 || o.method === 'free' ? 'free' : 'paid'
  if (o.status === 'pending' || o.status === 'cancelled' || o.status === 'refunded') return o.status
  return 'failed'
}

const succeeded = (o: MyOrder) => o.status === 'paid'
const waiting = (o: MyOrder) => o.status === 'pending'

const counts = computed(
  () =>
    ({
      all: orders.value.length,
      success: orders.value.filter(succeeded).length,
      pending: orders.value.filter(waiting).length,
      failed: orders.value.filter((o) => !succeeded(o) && !waiting(o)).length,
    }) as Record<Tab, number>,
)

const active = computed<Tab>(() => {
  const tab = String(route.query.tab ?? 'all')
  return (TABS as readonly string[]).includes(tab) ? (tab as Tab) : 'all'
})

const shown = computed(() => {
  const tab = active.value
  if (tab === 'all') return orders.value
  if (tab === 'success') return orders.value.filter(succeeded)
  if (tab === 'pending') return orders.value.filter(waiting)
  return orders.value.filter((o) => !succeeded(o) && !waiting(o))
})

const STATUS = {
  paid: { kind: 'done', icon: 'check-circle' },
  free: { kind: 'done', icon: 'gift' },
  pending: { kind: 'progress', icon: 'clock' },
  failed: { kind: 'failed', icon: 'x-circle' },
  cancelled: { kind: 'expired', icon: 'ban' },
  refunded: { kind: 'expired', icon: 'refresh' },
} as const

function statusBadge(o: MyOrder) {
  const kind = kindOf(o)
  const spec = STATUS[kind]
  return { kind: spec.kind, icon: spec.icon, text: t(`account.orders.status.${kind}`) }
}

const METHOD = { card: 'credit-card', promptpay: 'qr', free: 'gift' } as const
function methodIcon(m: string | null) {
  return METHOD[m as keyof typeof METHOD] ?? 'credit-card'
}
function methodLabel(m: string | null) {
  return m ? t(`account.orders.method.${m}`) : t('account.orders.method.unset')
}

/** One line under the total, when there is something worth saying about the
 *  receipt — or about why there is none. */
function note(o: MyOrder): { icon: string; text: string } | null {
  const kind = kindOf(o)
  if (kind === 'pending') return { icon: 'clock', text: t('account.orders.notePending') }
  if (kind === 'failed') return { icon: 'info', text: t('account.orders.noteFailed') }
  if (kind === 'cancelled') return { icon: 'info', text: t('account.orders.noteCancelled') }
  if (kind === 'refunded') return { icon: 'info', text: t('account.orders.noteRefunded') }
  if (o.invoice) {
    return {
      icon: 'file-text',
      text: o.invoice.documentNo
        ? t('account.orders.noteTaxIssued', {
            type: t(`account.orders.taxType.${o.invoice.type}`),
            no: o.invoice.documentNo,
          })
        : t('account.orders.noteTax', {
            type: t(`account.orders.taxType.${o.invoice.type}`),
            status: t('account.orders.receiptStatus.processing'),
          }),
    }
  }
  return null
}

/* ---------------- a line ---------------- */

function imageOf(line: MyOrderItem) {
  return line.thumbnailPath ? { src: mediaUrl(line.thumbnailPath), alt: line.title } : null
}

/** Arbitrary but fixed, the same rule the catalog's fallback art uses, so one
 *  course keeps its colours wherever it appears. */
function paletteOf(line: MyOrderItem) {
  return line.categoryId === null ? 0 : line.categoryId % 6
}

/** Null once the course is gone, and then the row is text rather than a link. */
function linkOf(line: MyOrderItem) {
  if (!line.slug) return null
  return path(line.kind === 'package' ? `/packages/${line.slug}` : `/courses/${line.slug}`)
}

/* ---------------- buying it again ---------------- */

const reordering = ref<number | null>(null)
const reorderError = ref('')

/**
 * Puts back what is still buyable. A course withdrawn since, or one already
 * owned, is skipped rather than failing the whole basket — and the count that
 * comes back says how many actually went in, because "added" with nothing in
 * the basket is the kind of lie that costs a sale.
 */
async function reorder(o: MyOrder): Promise<void> {
  if (!auth.isLoggedIn) return
  reordering.value = o.id
  reorderError.value = ''
  let added = 0
  try {
    for (const line of o.items) {
      if (line.kind !== 'course' || !line.courseId || !line.slug) continue
      if (cart.has(line.courseId)) continue
      try {
        if (await cart.add(line.courseId)) added += 1
      } catch {
        // Already owned, or no longer for sale. The others still go in.
      }
    }
    if (added) await router.push(path('/cart'))
    else reorderError.value = t('account.orders.reorderNothing')
  } finally {
    reordering.value = null
  }
}

/* ---------------- the breakdown ---------------- */

const open = ref<MyOrder | null>(null)

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
      <div v-if="loading" class="state-box state-box--plain">
        <p>{{ t('account.orders.loading') }}</p>
      </div>

      <div v-else-if="error" class="state-box state-box--plain">
        <div class="state-ico"><AppIcon name="alert-circle" /></div>
        <h3>{{ t('account.orders.loadFailed') }}</h3>
        <p>{{ error }}</p>
        <div class="state-actions">
          <button type="button" class="btn btn--secondary" @click="load">
            {{ t('course.retry') }}
          </button>
        </div>
      </div>

      <template v-else-if="shown.length">
        <p class="sr-only" aria-live="polite">
          {{ t('account.orders.showing', { count: shown.length }) }}
        </p>

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
                  <span class="sr-only">{{ t('account.orders.order') }}</span>{{ o.orderNo }}
                </h3>
                <p>
                  <span>
                    <AppIcon name="calendar" />
                    <time :datetime="o.createdAt">{{ dateTime(o.createdAt) }}</time>
                  </span>
                  <span>
                    <AppIcon :name="methodIcon(o.method)" />{{ methodLabel(o.method) }}
                  </span>
                  <span>
                    <AppIcon name="book-open" />
                    {{ t('account.orders.itemCount', { count: o.items.length }) }}
                  </span>
                </p>
              </div>
              <AppBadge class="badge--lg acct-order-st" :badge="statusBadge(o)" />
            </header>

            <ul class="acct-oi-list" role="list">
              <li v-for="line in o.items" :key="line.id" class="acct-oi">
                <component
                  :is="linkOf(line) ? RouterLink : 'span'"
                  class="acct-oi-media"
                  :to="linkOf(line) ?? undefined"
                  tabindex="-1"
                  aria-hidden="true"
                >
                  <CourseImage
                    :image="imageOf(line)"
                    :width="192"
                    :height="108"
                    :art-icon="line.categoryIcon ?? 'book-open'"
                    :art-palette="paletteOf(line)"
                  />
                </component>
                <div class="acct-oi-body">
                  <span class="acct-cat">{{ line.categoryName }}</span>
                  <RouterLink
                    v-if="linkOf(line)"
                    class="acct-oi-title"
                    :to="linkOf(line)!"
                  >
                    {{ line.title }}
                  </RouterLink>
                  <span v-else class="acct-oi-title">{{ line.title }}</span>
                  <span v-if="line.titleNow" class="acct-oi-renamed">
                    <AppIcon name="info" />{{ t('account.orders.renamed', { title: line.titleNow }) }}
                  </span>
                  <span v-if="line.couponCode" class="acct-oi-coupon">
                    <AppIcon name="tag" />{{ t('account.orders.coupon', { code: line.couponCode }) }}
                  </span>
                </div>
                <div class="acct-oi-price">
                  <b class="tabular">{{ money(toBaht(line.net), o.currency) }}</b>
                  <s v-if="line.discount" class="tabular">
                    <span class="sr-only">{{ t('account.orders.normalPrice') }}</span>
                    {{ money(toBaht(line.unitPrice), o.currency) }}
                  </s>
                </div>
              </li>
            </ul>

            <footer class="acct-order-foot">
              <div class="acct-order-total">
                <span>{{ t('account.orders.net') }}</span>
                <b class="tabular">{{ money(toBaht(o.total), o.currency) }}</b>
                <small v-if="o.courseDiscount + o.orderDiscount">
                  {{ t('account.orders.saved', { amount: num(toBaht(o.courseDiscount + o.orderDiscount)) }) }}
                </small>
              </div>

              <p v-if="note(o)" class="acct-order-note">
                <AppIcon :name="note(o)!.icon" /><span>{{ note(o)!.text }}</span>
              </p>

              <div class="acct-order-actions">
                <button
                  v-if="!succeeded(o) && !waiting(o)"
                  type="button"
                  class="btn btn--ghost btn--sm"
                  :disabled="reordering === o.id"
                  @click="reorder(o)"
                >
                  <AppIcon name="refresh" />{{ t('account.orders.reorder') }}
                </button>
                <RouterLink
                  v-if="succeeded(o)"
                  class="btn btn--secondary btn--sm"
                  :to="path(`/account/orders/${o.orderNo}/receipt`)"
                  :aria-label="t('account.orders.receiptFor', { id: o.orderNo })"
                >
                  <AppIcon name="download" />{{ t('account.orders.receipt') }}
                </RouterLink>
                <button type="button" class="btn btn--primary btn--sm" @click="open = o">
                  <AppIcon name="file-text" />{{ t('account.orders.detail') }}
                </button>
              </div>
            </footer>
          </article>
        </div>

        <p v-if="reorderError" class="acct-order-reorder-note" role="status">
          <AppIcon name="info" />{{ reorderError }}
        </p>
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

    <!-- The breakdown. Every figure comes off the order as it was charged,
         which is why it can be opened for a failed order too: what someone
         was nearly charged is worth being able to read. -->
    <AppModal
      :open="open !== null"
      :title="t('account.orders.detailFor', { id: open?.orderNo ?? '' })"
      @close="open = null"
    >
      <template v-if="open">
          <dl class="acct-od-meta">
            <div>
              <dt>{{ t('account.orders.order') }}</dt>
              <dd class="tabular">{{ open.orderNo }}</dd>
            </div>
            <div>
              <dt>{{ t('account.orders.placedAt') }}</dt>
              <dd>{{ dateTime(open.createdAt) }}</dd>
            </div>
            <div v-if="open.paidAt">
              <dt>{{ t('account.orders.paidAt') }}</dt>
              <dd>{{ dateTime(open.paidAt) }}</dd>
            </div>
            <div>
              <dt>{{ t('account.orders.methodLabel') }}</dt>
              <dd>{{ methodLabel(open.method) }}</dd>
            </div>
          </dl>

          <ul class="acct-od-lines" role="list">
            <li v-for="line in open.items" :key="line.id">
              <span>{{ line.title }}</span>
              <b class="tabular">{{ money(toBaht(line.net), open.currency) }}</b>
            </li>
          </ul>

          <dl class="acct-od-sums">
            <div>
              <dt>{{ t('account.orders.subtotal') }}</dt>
              <dd class="tabular">{{ money(toBaht(open.subtotal), open.currency) }}</dd>
            </div>
            <div v-if="open.courseDiscount">
              <dt>{{ t('account.orders.courseDiscount') }}</dt>
              <dd class="tabular">−{{ money(toBaht(open.courseDiscount), open.currency) }}</dd>
            </div>
            <div v-if="open.orderDiscount">
              <dt>
                {{ t('account.orders.orderDiscount') }}
                <small v-if="open.orderCouponCode">{{ open.orderCouponCode }}</small>
              </dt>
              <dd class="tabular">−{{ money(toBaht(open.orderDiscount), open.currency) }}</dd>
            </div>
            <div v-if="open.vatAmount">
              <dt>{{ t('account.orders.vat') }}</dt>
              <dd class="tabular">{{ money(toBaht(open.vatAmount), open.currency) }}</dd>
            </div>
            <div class="acct-od-grand">
              <dt>{{ t('account.orders.net') }}</dt>
              <dd class="tabular">{{ money(toBaht(open.total), open.currency) }}</dd>
            </div>
          </dl>

          <p v-if="open.invoice" class="acct-od-invoice">
            <AppIcon name="file-text" />
            <span>
              {{ t('account.orders.taxFor', {
                type: t(`account.orders.taxType.${open.invoice.type}`),
                name: open.invoice.name,
              }) }}
              <br />
              <template v-if="open.invoice.documentNo">
                {{ t('account.orders.taxNo', { no: open.invoice.documentNo }) }}
              </template>
              <template v-else>{{ t('account.orders.receiptStatus.processing') }}</template>
            </span>
          </p>
      </template>

      <template #foot>
        <RouterLink
          v-if="open && succeeded(open)"
          class="btn btn--secondary"
          :to="path(`/account/orders/${open.orderNo}/receipt`)"
        >
          <AppIcon name="download" />{{ t('account.orders.receipt') }}
        </RouterLink>
        <button type="button" class="btn btn--primary" @click="open = null">
          {{ t('common.close') }}
        </button>
      </template>
    </AppModal>
  </AccountShell>
</template>
