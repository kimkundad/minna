<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  ApiError,
  orders as ordersApi,
  type OrderDetail,
  type OrderRow,
  type OrderStatus,
  type PaymentMethod,
} from '@/lib/api'
import { formatBaht } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'

/**
 * Orders.
 *
 * Read-only apart from one button, and that button moves money: a refund tells
 * Stripe first, and only once Stripe agrees does it revoke the access the order
 * granted. The entitlements are revoked rather than deleted, so what the
 * student watched and was marked on survives the refund.
 *
 * Nothing here is editable. An order is a record of what was charged; changing
 * it after the fact would make the receipt a lie.
 */
const { ask } = useConfirm()
const route = useRoute()
const router = useRouter()

const rows = ref<OrderRow[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const PER_PAGE = 20

// Seeded from the URL so a link from the coupon screen lands on one order.
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const status = ref<'' | OrderStatus>('')
const method = ref<'' | PaymentMethod>('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await ordersApi.list({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...(status.value ? { status: status.value } : {}),
      ...(method.value ? { method: method.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load orders.'
  } finally {
    loading.value = false
  }
}

/* ---------------- one order ---------------- */

const open = ref<OrderDetail | null>(null)
const openLoading = ref(false)
const auth = useAuthStore()
const refunding = ref(false)
const cancelling = ref(false)
const markingPaid = ref(false)

async function show(row: OrderRow) {
  openLoading.value = true
  open.value = null
  try {
    open.value = (await ordersApi.get(row.id)).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load that order.'
  } finally {
    openLoading.value = false
  }
}

function closeOrder() {
  open.value = null
}

/**
 * Records money that arrived some other way — a bank transfer, a payment made
 * at the desk, a webhook that never came — and opens the course.
 *
 * Only a superadmin sees this, and only on an order that is not paid. The
 * button is hidden rather than disabled for everybody else: an administrator
 * cannot do it, and showing a control that always refuses teaches them to
 * ignore controls.
 */
async function markPaid(order: OrderDetail) {
  const { ok, reason } = await ask({
    title: `Mark ${order.orderNo} as paid?`,
    message: [
      `This records ${formatBaht(order.total)} as received and opens the course to the student straight away.`,
      'Only do this when the money has actually arrived. Nothing here checks that it has.',
    ].join('\n'),
    confirmLabel: 'Mark as paid',
    reason: {
      label: 'Why (recorded in the audit log)',
      placeholder: 'Bank transfer, slip checked',
      required: true,
    },
  })
  if (!ok) return

  markingPaid.value = true
  error.value = ''
  try {
    open.value = (await ordersApi.markPaid(order.id, reason ?? '')).data
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not mark that order paid.'
  } finally {
    markingPaid.value = false
  }
}

async function refund(order: OrderDetail) {
  const { ok, reason } = await ask({
    title: `Refund ${order.orderNo}?`,
    message: [
      `${formatBaht(order.total)} goes back to the card, and the access this order granted is revoked.`,
      'What the student watched and was marked on is kept. This cannot be undone from here.',
    ].join('\n'),
    confirmLabel: 'Refund',
    tone: 'danger',
    reason: { label: 'Why (recorded in the audit log)', placeholder: 'Bought the wrong course', required: true },
  })
  if (!ok) return

  refunding.value = true
  error.value = ''
  try {
    open.value = (await ordersApi.refund(order.id, reason)).data
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not refund that order.'
  } finally {
    refunding.value = false
  }
}

/**
 * Closing an order nobody ever paid.
 *
 * The dead rows: a transfer that never arrived, a PromptPay code gone stale, a
 * customer who changed their mind. Nothing moves — no money was taken and no
 * access was granted — so this only stops the row sitting in the list looking
 * like work. A paid order is refunded instead, which the API enforces.
 */
async function cancel(order: OrderDetail) {
  const { ok, reason } = await ask({
    title: `Cancel ${order.orderNo}?`,
    message: [
      'Nothing was paid and nothing was granted, so nothing is returned or taken away.',
      'The order stops appearing as work waiting to be done.',
    ].join('\n'),
    confirmLabel: 'Cancel the order',
    reason: {
      label: 'Why (recorded in the audit log)',
      placeholder: 'Customer paid again on a new order',
      required: true,
    },
  })
  if (!ok) return

  cancelling.value = true
  error.value = ''
  try {
    open.value = (await ordersApi.cancel(order.id, reason)).data
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not cancel that order.'
  } finally {
    cancelling.value = false
  }
}

/* ---------------- presentation ---------------- */

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

const STATUS_CLASS: Record<OrderStatus, string> = {
  pending: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
  paid: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  failed: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400',
  refunded: 'bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-400',
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  card: 'Card',
  promptpay: 'PromptPay',
  free: 'Free',
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function when(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '—'
}

function phoneOf(buyer: NonNullable<OrderDetail['buyer']>): string {
  if (!buyer.phoneNational) return '—'
  return `${buyer.phoneCountryCode ?? ''} ${buyer.phoneNational}`.trim()
}

/** The Stripe dashboard, for the half of a payment question this screen cannot
 *  answer — a chargeback, a card decline reason, the payout it landed in. */
function stripeUrl(ref: string): string {
  return `https://dashboard.stripe.com/payments?query=${encodeURIComponent(ref)}`
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    // Kept in the URL so a search can be shared or reloaded.
    void router.replace({ query: value ? { q: value } : {} })
    void load()
  }, 300)
})
watch([status, method], () => {
  page.value = 1
  void load()
})
watch(page, load)

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Orders" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">{{ total }} orders</h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          What was charged, and for what. Nothing here can be edited — only refunded.
        </p>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-3 sm:px-6"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Order number, name or email"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <select
          v-model="status"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any status</option>
          <option value="paid">Paid</option>
          <option value="pending">Awaiting payment</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          v-model="method"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any method</option>
          <option value="card">Card</option>
          <option value="promptpay">PromptPay</option>
          <option value="free">Free</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[960px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Order</th>
              <th class="px-5 py-3 font-medium">Customer</th>
              <th class="px-5 py-3 font-medium">Bought</th>
              <th class="px-5 py-3 font-medium">Total</th>
              <th class="px-5 py-3 font-medium">Method</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium sm:px-6">Placed</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="7" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="7" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                No orders match.
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              @click="show(row)"
            >
              <td class="px-5 py-3.5 font-mono text-sm text-brand-500 sm:px-6">{{ row.orderNo }}</td>
              <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90">
                {{ row.firstName }} {{ row.lastName }}
                <span class="block text-xs text-gray-500 dark:text-gray-400">{{ row.email }}</span>
              </td>
              <td class="max-w-xs px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                <span class="line-clamp-2">{{ row.itemSummary ?? '—' }}</span>
              </td>
              <td class="whitespace-nowrap px-5 py-3.5 text-sm font-medium text-gray-800 dark:text-white/90">
                {{ formatBaht(row.total) }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ row.paymentMethod ? METHOD_LABEL[row.paymentMethod] : '—' }}
              </td>
              <td class="px-5 py-3.5">
                <span
                  class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                  :class="STATUS_CLASS[row.status]"
                >
                  {{ STATUS_LABEL[row.status] }}
                </span>
              </td>
              <td class="whitespace-nowrap px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 sm:px-6">
                {{ when(row.createdAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <TablePager
        v-model:page="page"
        :total-pages="totalPages"
        :total="total"
        :per-page="PER_PAGE"
        noun="orders"
      />
    </div>

    <!-- One order, below the table rather than over it: support reads it while
         still looking at the list they found it in. -->
    <div
      v-if="openLoading || open"
      class="mt-6 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <p v-if="openLoading" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</p>

      <template v-else-if="open">
        <div class="flex flex-wrap items-start justify-between gap-4 px-5 py-4 sm:px-6">
          <div>
            <h3 class="font-mono text-base font-medium text-gray-800 dark:text-white/90">
              {{ open.orderNo }}
            </h3>
            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Placed {{ when(open.createdAt) }}<span v-if="open.paidAt">, paid {{ when(open.paidAt) }}</span>
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span
              class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="STATUS_CLASS[open.status]"
            >
              {{ STATUS_LABEL[open.status] }}
            </span>
            <!-- Hidden for an administrator rather than disabled: they cannot
                 do it, and a control that always refuses teaches people to
                 ignore controls. -->
            <button
              v-if="auth.isSuperadmin && open.status !== 'paid' && open.status !== 'refunded'"
              type="button"
              :disabled="markingPaid"
              class="rounded-lg border border-success-500/40 px-4 py-2 text-sm font-medium text-success-600 transition hover:bg-success-50 disabled:opacity-60 dark:hover:bg-success-500/10"
              data-mark-paid
              @click="markPaid(open)"
            >
              {{ markingPaid ? 'Marking…' : 'Mark as paid' }}
            </button>
            <!-- Never paid, so there is nothing to give back — only a row to
                 close. The API refuses this on a paid order; refunding is what
                 undoes a payment. -->
            <button
              v-if="open.status === 'pending' || open.status === 'failed'"
              type="button"
              :disabled="cancelling"
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              @click="cancel(open)"
            >
              {{ cancelling ? 'Cancelling…' : 'Cancel order' }}
            </button>
            <button
              v-if="open.status === 'paid'"
              type="button"
              :disabled="refunding"
              class="rounded-lg border border-error-500/40 px-4 py-2 text-sm font-medium text-error-500 transition hover:bg-error-50 disabled:opacity-60 dark:hover:bg-error-500/10"
              @click="refund(open)"
            >
              {{ refunding ? 'Refunding…' : 'Refund' }}
            </button>
            <!-- A copy of what the buyer can already print from their own
                 account, for when they ring up having lost it. Opened in its
                 own tab so the list and the filters are still here afterwards. -->
            <router-link
              :to="`/orders/${open.id}/receipt`"
              target="_blank"
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Receipt
            </router-link>
            <button
              type="button"
              class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="closeOrder"
            >
              Close
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-6 border-t border-gray-100 px-5 py-5 dark:border-gray-800 sm:px-6 lg:grid-cols-3">
          <div>
            <h4 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Customer</h4>
            <p v-if="open.buyer" class="text-sm text-gray-800 dark:text-white/90">
              {{ open.buyer.firstName }} {{ open.buyer.lastName }}
            </p>
            <p v-if="open.buyer" class="text-sm text-gray-500 dark:text-gray-400">
              {{ open.buyer.email }}
            </p>
            <p v-if="open.buyer" class="text-sm text-gray-500 dark:text-gray-400">
              {{ phoneOf(open.buyer) }}
            </p>
            <router-link
              v-if="open.buyer"
              :to="`/students?q=${open.buyer.email}`"
              class="mt-1 inline-block text-sm text-brand-500 hover:text-brand-600"
            >
              Open their account
            </router-link>
          </div>

          <div>
            <h4 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Payment</h4>
            <p class="text-sm text-gray-800 dark:text-white/90">
              {{ open.paymentMethod ? METHOD_LABEL[open.paymentMethod] : '—' }}
              <!-- A free order has no provider, so there is nothing to say "via". -->
              <template v-if="open.provider !== 'none'">via {{ open.provider }}</template>
            </p>
            <a
              v-if="open.providerRef"
              :href="stripeUrl(open.providerRef)"
              target="_blank"
              rel="noreferrer"
              class="mt-1 inline-block break-all font-mono text-xs text-brand-500 hover:text-brand-600"
            >
              {{ open.providerRef }}
            </a>
            <p v-else class="text-sm text-gray-500 dark:text-gray-400">No payment reference.</p>
          </div>

          <div>
            <h4 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Totals</h4>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Subtotal</dt>
                <dd class="text-gray-800 dark:text-white/90">{{ formatBaht(open.subtotal) }}</dd>
              </div>
              <div v-if="open.courseDiscount" class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Course coupons</dt>
                <dd class="text-gray-800 dark:text-white/90">−{{ formatBaht(open.courseDiscount) }}</dd>
              </div>
              <div v-if="open.orderDiscount" class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">
                  Basket coupon
                  <span v-if="open.orderCouponCode" class="font-mono text-xs">
                    {{ open.orderCouponCode }}
                  </span>
                </dt>
                <dd class="text-gray-800 dark:text-white/90">−{{ formatBaht(open.orderDiscount) }}</dd>
              </div>
              <div v-if="open.vatAmount" class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">VAT included</dt>
                <dd class="text-gray-800 dark:text-white/90">{{ formatBaht(open.vatAmount) }}</dd>
              </div>
              <div class="flex justify-between gap-4 border-t border-gray-100 pt-1 font-medium dark:border-gray-800">
                <dt class="text-gray-800 dark:text-white/90">Total</dt>
                <dd class="text-gray-800 dark:text-white/90">{{ formatBaht(open.total) }}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div class="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
          <table class="w-full min-w-[640px] text-left">
            <thead class="border-b border-gray-100 dark:border-gray-800">
              <tr class="text-xs uppercase tracking-wide text-gray-400">
                <th class="px-5 py-3 font-medium sm:px-6">Item</th>
                <th class="px-5 py-3 font-medium">Access</th>
                <th class="px-5 py-3 font-medium">Coupon</th>
                <th class="px-5 py-3 font-medium">Price</th>
                <th class="px-5 py-3 font-medium sm:px-6">Discount</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="item in open.items" :key="item.id">
                <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90 sm:px-6">
                  <!-- The title as it was sold. Editing the course later never
                       changes what somebody's receipt says. -->
                  {{ item.titleSnapshot }}
                  <router-link
                    v-if="item.courseId"
                    :to="`/courses/${item.courseId}`"
                    class="ml-2 text-xs text-brand-500 hover:text-brand-600"
                  >
                    open
                  </router-link>
                </td>
                <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                  {{ item.accessType === 'lifetime' ? 'Lifetime' : `${item.accessDurationDays} days` }}
                </td>
                <td class="px-5 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {{ item.couponCode ?? '—' }}
                </td>
                <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90">
                  {{ formatBaht(item.unitPrice) }}
                </td>
                <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 sm:px-6">
                  {{ item.discount ? `−${formatBaht(item.discount)}` : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </admin-layout>
</template>
