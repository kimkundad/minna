<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import PayoutDetailsPanel from '@/components/people/PayoutDetailsPanel.vue'
import { ApiError, earnings, type PayoutRow } from '@/lib/api'
import { formatBaht } from '@/lib/money'

/**
 * Who the school owes, and marking it settled.
 *
 * This records that a transfer happened; it does not make one. The money moves
 * through a bank, and a screen that claimed to have sent it would be the only
 * thing in the building saying so.
 *
 * Which is also why the reference is required: it is the only thread between a
 * row here and a transfer in a bank statement, and the first thing anybody
 * reaches for when a teacher says they were not paid.
 */
const rows = ref<PayoutRow[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')

const open = ref<PayoutRow | null>(null)
const reference = ref('')
const saving = ref(false)
const dialogError = ref('')

/**
 * Where to send the money, fetched one teacher at a time.
 *
 * Deliberately not part of the list. Account numbers for every teacher, held
 * in the browser for as long as this tab is open, to render a table nobody
 * asked to read, is a wider spread of the data than the job needs — and the
 * server records each of these reads against the administrator who made it,
 * which only means something if looking was a decision rather than a side
 * effect of opening the page.
 */
const detailsFor = ref<PayoutRow | null>(null)

function showDetails(row: PayoutRow) {
  detailsFor.value = row
}

/** Nothing is kept once the panel closes; the link expires anyway. */
function closeDetails() {
  detailsFor.value = null
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = (await earnings.payouts()).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the payouts.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const totalPayable = computed(() => rows.value.reduce((sum, r) => sum + r.payable, 0))
const totalPending = computed(() => rows.value.reduce((sum, r) => sum + r.pending, 0))
const owing = computed(() => rows.value.filter((r) => r.payable !== 0))

function start(row: PayoutRow) {
  open.value = row
  // A sensible default somebody will usually keep: the month being settled.
  // The month on the admin's own calendar, not UTC's — `toISOString` would
  // still say the month before until seven in the morning in Bangkok.
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  reference.value = `PAY-${month}-${row.userId}`
  dialogError.value = ''
}

async function settle() {
  if (!open.value) return
  if (!reference.value.trim()) {
    dialogError.value = 'Enter the bank reference for this transfer.'
    return
  }
  saving.value = true
  dialogError.value = ''
  try {
    const done = await earnings.pay(open.value.userId, open.value.payable, reference.value.trim())
    notice.value = `Marked ${formatBaht(done.data.amount)} paid to ${open.value.name} across ${done.data.lines} lines.`
    open.value = null
    await load()
  } catch (err) {
    // A 409 means the ledger moved while this was open — usually a refund.
    // Its message carries what the ledger now says.
    dialogError.value = err instanceof ApiError ? err.message : 'Could not record that payout.'
    if (err instanceof ApiError) await load()
  } finally {
    saving.value = false
  }
}

const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]'
const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Teacher payouts" />

    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      role="status"
      class="mb-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/10 dark:text-success-400"
    >
      {{ notice }}
    </p>

    <div class="mb-6 grid grid-cols-2 gap-4">
      <div :class="cardClass">
        <p class="text-xs uppercase tracking-wide text-gray-400">Due now</p>
        <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
          {{ formatBaht(totalPayable) }}
        </p>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {{ owing.length }} teachers past the refund window
        </p>
      </div>
      <div :class="cardClass">
        <p class="text-xs uppercase tracking-wide text-gray-400">Still settling</p>
        <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
          {{ formatBaht(totalPending) }}
        </p>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          inside the 7-day refund window, not owed yet
        </p>
      </div>
    </div>

    <div class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">Teachers</h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Make the transfer in the bank first, then record it here. A refunded sale that was
          already paid shows as a negative line against the next payout.
        </p>
      </div>

      <div class="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
        <table class="min-w-full text-left">
          <thead class="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
            <tr>
              <th class="px-5 py-3 font-medium sm:px-6">Teacher</th>
              <th class="px-5 py-3 text-right font-medium">Due now</th>
              <th class="px-5 py-3 text-right font-medium">Still settling</th>
              <th class="px-5 py-3 text-right font-medium">Lines</th>
              <th class="px-5 py-3 font-medium sm:px-6"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="5" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="5" class="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">
                Nobody is owed anything. Earnings appear once a course sells.
              </td>
            </tr>
            <tr v-for="row in rows" :key="row.userId" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <td class="px-5 py-3.5 sm:px-6">
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">{{ row.name }}</p>
                <p class="mt-0.5 text-xs text-gray-400">{{ row.email }}</p>
              </td>
              <td
                class="px-5 py-3.5 text-right text-sm font-semibold tabular-nums"
                :class="row.payable < 0 ? 'text-error-500' : 'text-gray-800 dark:text-white/90'"
              >
                {{ formatBaht(row.payable) }}
              </td>
              <td class="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {{ formatBaht(row.pending) }}
              </td>
              <td class="px-5 py-3.5 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {{ row.lines }}
              </td>
              <td class="px-5 py-3.5 text-right text-sm sm:px-6">
                <div class="flex items-center justify-end gap-4">
                  <button
                    type="button"
                    class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    @click="showDetails(row)"
                  >
                    Bank details
                  </button>
                  <!-- Nothing to settle, or a balance the school is owed back:
                       neither is a transfer to make from this screen. -->
                  <button
                    v-if="row.payable > 0"
                    type="button"
                    class="text-brand-500 hover:text-brand-600"
                    @click="start(row)"
                  >
                    Record payout
                  </button>
                  <span v-else-if="row.payable < 0" class="text-xs text-gray-400">
                    carries over
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Where the money goes. Opened on purpose, and the opening is recorded. -->
    <div v-if="detailsFor" class="fixed inset-0 z-50 grid place-items-center p-4">
      <div class="absolute inset-0 bg-gray-900/50" @click="closeDetails"></div>
      <div
        role="dialog"
        aria-modal="true"
        class="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900"
      >
        <h3 class="text-lg font-medium text-gray-800 dark:text-white/90">
          {{ detailsFor.name }}
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ detailsFor.email }}</p>

        <PayoutDetailsPanel :user-id="detailsFor.userId" class="mt-5" />

        <div class="mt-6 flex justify-end">
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            @click="closeDetails"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <div v-if="open" class="fixed inset-0 z-50 grid place-items-center p-4">
      <div class="absolute inset-0 bg-gray-900/50" @click="open = null"></div>
      <div
        role="dialog"
        aria-modal="true"
        class="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900"
      >
        <h3 class="text-lg font-medium text-gray-800 dark:text-white/90">
          Record a payout
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {{ open.name }} — {{ formatBaht(open.payable) }} across {{ open.lines }} lines.
        </p>

        <label class="mt-5 mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Bank reference
        </label>
        <input v-model="reference" type="text" maxlength="64" :class="inputClass" />
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Whatever lets somebody find this transfer in the statement later.
        </p>

        <p v-if="dialogError" class="mt-3 text-sm text-error-500">{{ dialogError }}</p>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="rounded-lg px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.03]"
            @click="open = null"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="saving"
            class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            @click="settle"
          >
            {{ saving ? 'Recording…' : 'Mark as paid' }}
          </button>
        </div>
      </div>
    </div>
  </admin-layout>
</template>
