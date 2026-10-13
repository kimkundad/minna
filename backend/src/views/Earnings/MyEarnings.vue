<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { ApiError, earnings, type EarningRow, type EarningsSummary } from '@/lib/api'
import { formatBaht } from '@/lib/money'

/**
 * What this teacher has earned.
 *
 * Every figure is a stored one. Nothing on this screen is worked out from a
 * course's price today, because a rate may be renegotiated and a sale from
 * March must still read as March — which is why each row carries the share it
 * was calculated at.
 *
 * The three states are worth keeping apart rather than adding up into one
 * number. `pending` is inside the refund window and might yet vanish;
 * `payable` is settled and waiting for a transfer; `paid` has gone out. A
 * single "balance" would hide which of those a teacher is looking at.
 */
const summary = ref<EarningsSummary | null>(null)
const rows = ref<EarningRow[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = (await earnings.mine()).data
    summary.value = res.summary
    rows.value = res.lines
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load your earnings.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const rate = computed(() => {
  const r = summary.value?.sharePctRange
  if (!r) return null
  return r.min === r.max ? `${r.min}%` : `${r.min}–${r.max}%`
})

const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]'

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400',
  payable: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
  paid: 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400',
}
const STATUS_WORD: Record<string, string> = {
  pending: 'In the refund window',
  payable: 'Ready to pay',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

function day(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="My earnings" />

    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>

    <div v-if="summary" class="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div :class="cardClass">
        <p class="text-xs uppercase tracking-wide text-gray-400">Ready to pay</p>
        <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
          {{ formatBaht(summary.payable) }}
        </p>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">in the next payout</p>
      </div>
      <div :class="cardClass">
        <p class="text-xs uppercase tracking-wide text-gray-400">Still settling</p>
        <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
          {{ formatBaht(summary.pending) }}
        </p>
        <!-- Said plainly, because a number that can go down needs a reason. -->
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          inside the 7-day refund window
        </p>
      </div>
      <div :class="cardClass">
        <p class="text-xs uppercase tracking-wide text-gray-400">This month</p>
        <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
          {{ formatBaht(summary.thisMonth) }}
        </p>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">earned since the 1st</p>
      </div>
      <div :class="cardClass">
        <p class="text-xs uppercase tracking-wide text-gray-400">Paid in all</p>
        <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
          {{ formatBaht(summary.paidAllTime) }}
        </p>
        <p v-if="rate" class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          your share is {{ rate }}
        </p>
      </div>
    </div>

    <div class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">Every sale</h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Your share is taken from what the school actually received for the line — after any
          discount, and before VAT, which is collected for the Revenue Department rather than
          earned. Card fees are the school's.
        </p>
      </div>

      <div class="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
        <table class="min-w-full text-left">
          <thead class="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
            <tr>
              <th class="px-5 py-3 font-medium sm:px-6">Course</th>
              <th class="px-5 py-3 font-medium">Order</th>
              <th class="px-5 py-3 text-right font-medium">Received</th>
              <th class="px-5 py-3 text-right font-medium">Less VAT</th>
              <th class="px-5 py-3 text-right font-medium">Share</th>
              <th class="px-5 py-3 text-right font-medium">Yours</th>
              <th class="px-5 py-3 font-medium sm:px-6">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="7" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="7" class="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">
                Nothing yet. Earnings appear here the moment somebody buys one of your courses.
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              :class="row.status === 'cancelled' ? 'opacity-55' : ''"
            >
              <td class="px-5 py-3.5 text-sm text-gray-800 sm:px-6 dark:text-white/90">
                {{ row.courseTitle ?? '—' }}
                <p v-if="row.kind !== 'royalty'" class="mt-0.5 text-xs text-error-500">
                  {{ row.kind === 'refund' ? 'Refunded' : 'Adjustment' }}
                  <template v-if="row.note"> · {{ row.note }}</template>
                </p>
              </td>
              <td class="px-5 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                {{ row.orderNo }}
                <p class="mt-0.5 font-sans">{{ day(row.createdAt) }}</p>
              </td>
              <td class="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {{ formatBaht(row.gross) }}
              </td>
              <td class="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {{ formatBaht(row.base) }}
              </td>
              <td class="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {{ row.sharePct }}%
              </td>
              <td
                class="px-5 py-3.5 text-right text-sm font-semibold tabular-nums"
                :class="row.amount < 0 ? 'text-error-500' : 'text-gray-800 dark:text-white/90'"
              >
                {{ formatBaht(row.amount) }}
              </td>
              <td class="px-5 py-3.5 sm:px-6">
                <span
                  class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                  :class="STATUS_STYLE[row.status]"
                >
                  {{ STATUS_WORD[row.status] ?? row.status }}
                </span>
                <p
                  v-if="row.status === 'pending'"
                  class="mt-0.5 text-xs text-gray-400"
                >
                  ready {{ day(row.maturesAt) }}
                </p>
                <p v-else-if="row.paidAt" class="mt-0.5 text-xs text-gray-400">
                  {{ day(row.paidAt) }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </admin-layout>
</template>
