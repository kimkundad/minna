<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import {
  ApiError,
  EARNING_STATUSES,
  earnings,
  type EarningRow,
  type EarningStatus,
  type EarningsSummary,
} from '@/lib/api'
import { formatBaht } from '@/lib/money'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'

const { ask: confirm } = useConfirm()

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

/**
 * Whose earnings these are.
 *
 * With an id in the address this is an administrator looking at one teacher;
 * without one it is a teacher looking at their own. Same screen either way —
 * the page a transfer is settled from and the page the teacher checks it
 * against must not be able to disagree — and the two routes read two
 * different endpoints, so neither request can be turned into the other.
 */
const route = useRoute()
const auth = useAuthStore()
const teacherId = computed(() => Number(route.params.userId) || null)
const viewingSomebodyElse = computed(() => teacherId.value !== null)
/** Only an administrator moves a row, and only on somebody else's page. */
const mayEdit = computed(() => viewingSomebodyElse.value && auth.isAdmin)
const teacher = ref<{ id: number; name: string; email: string } | null>(null)

/** The window the ledger is read through. Empty means everything. */
const from = ref('')
const to = ref('')
const range = computed(() => ({
  ...(from.value ? { from: from.value } : {}),
  ...(to.value ? { to: to.value } : {}),
}))

async function load() {
  loading.value = true
  error.value = ''
  selected.value = new Set()
  try {
    const id = teacherId.value
    if (id) {
      const res = (await earnings.forTeacher(id, range.value)).data
      teacher.value = res.teacher
      summary.value = res.summary
      rows.value = res.lines
    } else {
      const res = (await earnings.mine(range.value)).data
      summary.value = res.summary
      rows.value = res.lines
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the earnings.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
// Following the id rather than the path: the same component serves both
// routes, so Vue keeps it and `onMounted` does not run again.
watch(teacherId, load)

function clearRange() {
  from.value = ''
  to.value = ''
  void load()
}

/* ---------------- the rows an administrator ticked ---------------- */

const selected = ref<Set<number>>(new Set())
const chosen = computed(() => rows.value.filter((r) => selected.value.has(r.id)))

function toggle(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

const allTicked = computed(() => rows.value.length > 0 && chosen.value.length === rows.value.length)

function toggleAll() {
  selected.value = allTicked.value ? new Set() : new Set(rows.value.map((r) => r.id))
}

const bulkStatus = ref<EarningStatus | ''>('')
const saving = ref(false)
const notice = ref('')

async function applyStatus() {
  if (!bulkStatus.value || !chosen.value.length) return
  const want = bulkStatus.value
  const ids = chosen.value.map((r) => r.id)
  // Said out loud, because this is a person's pay and the ledger is what
  // anybody disputing a transfer will be shown.
  const answer = await confirm({
    title: `Change ${ids.length} ${ids.length === 1 ? 'line' : 'lines'} to “${STATUS_WORD[want] ?? want}”?`,
    message:
      want === 'paid'
        ? 'They will read as settled, dated today. Do this when the transfer has actually gone out.'
        : 'This moves money the teacher is owed. It is recorded against your account.',
    confirmLabel: 'Change them',
    ...(want === 'cancelled' ? { tone: 'danger' as const } : {}),
  })
  if (!answer.ok) return

  saving.value = true
  notice.value = ''
  error.value = ''
  try {
    const res = (await earnings.setStatus(ids, want)).data
    notice.value =
      res.changed === res.asked
        ? `${res.changed} changed.`
        : `${res.changed} of ${res.asked} changed — the rest already said that.`
    bulkStatus.value = ''
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change them.'
  } finally {
    saving.value = false
  }
}

/* ---------------- the month's figures, as a spreadsheet ---------------- */

/**
 * The ticked rows, as a file that opens in Excel.
 *
 * CSV rather than a real workbook: it is one function and no dependency, and
 * the byte-order mark is what makes Excel read the Thai in it rather than
 * mojibake — without that, a course title arrives as `à¸ à¸²à¸©à¸²`.
 *
 * Every cell that is two lines on screen becomes two columns here. A
 * spreadsheet is for adding up, and a column holding "ORD-123" above a date
 * cannot be sorted, filtered or summed.
 */
function exportCsv() {
  const lines = chosen.value.length ? chosen.value : rows.value
  if (!lines.length) return

  const header = [
    'Course',
    'Kind',
    'Note',
    'Order',
    'Date',
    'Received',
    'Less VAT',
    'Share %',
    'Yours',
    'Status',
    'Status date',
  ]

  // Money as a plain number, not "฿1,690.00": a spreadsheet cannot add up a
  // string with a currency sign and a comma in it.
  const money = (satang: number) => (satang / 100).toFixed(2)

  const body = lines.map((r) => [
    r.courseTitle ?? '',
    r.kind,
    r.note ?? '',
    r.orderNo,
    isoDay(r.createdAt),
    money(r.gross),
    money(r.base),
    String(r.sharePct),
    money(r.amount),
    STATUS_WORD[r.status] ?? r.status,
    isoDay(r.status === 'pending' ? r.maturesAt : r.paidAt),
  ])

  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [header, ...body].map((row) => row.map(quote).join(',')).join('\r\n')

  const who = teacher.value?.name ?? 'my'
  const stamp = new Date().toISOString().slice(0, 10)
  // The BOM is the whole reason Excel reads this as UTF-8.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `earnings-${who.replace(/[^\w-]+/g, '-')}-${stamp}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** `2026-10-28`, which every spreadsheet reads as a date. */
function isoDay(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

const rate = computed(() => {
  const r = summary.value?.sharePctRange
  if (!r) return null
  return r.min === r.max ? `${r.min}%` : `${r.min}–${r.max}%`
})

const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]'

const labelClass = 'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400'
const inputClass =
  'h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'

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
    <PageBreadcrumb :page-title="viewingSomebodyElse ? 'Teacher earnings' : 'My earnings'" />

    <!-- Whose these are, when they are not your own. -->
    <div
      v-if="viewingSomebodyElse && teacher"
      class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <span class="text-base font-medium text-gray-800 dark:text-white/90">{{ teacher.name }}</span>
      <span class="text-sm text-gray-500 dark:text-gray-400">{{ teacher.email }}</span>
      <RouterLink
        :to="`/teachers/${teacher.id}`"
        class="ml-auto text-sm text-brand-500 hover:text-brand-600"
      >
        Their profile
      </RouterLink>
    </div>

    <p
      v-if="notice"
      class="mb-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/10 dark:text-success-400"
    >
      {{ notice }}
    </p>

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
          The share is taken from what the school actually received for the line — after any
          discount, and before VAT, which is collected for the Revenue Department rather than
          earned. Card fees are the school's.
        </p>

        <!--
          The window. By when the money came in, not when it was paid out:
          that is the question somebody closing off a month is asking, and a
          sale made in March belongs to March whenever the transfer went.
        -->
        <div class="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label :class="labelClass" for="earn-from">From</label>
            <input id="earn-from" v-model="from" type="date" :class="inputClass" />
          </div>
          <div>
            <label :class="labelClass" for="earn-to">To</label>
            <input id="earn-to" v-model="to" type="date" :class="inputClass" />
          </div>
          <button
            type="button"
            :disabled="loading"
            class="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            @click="load"
          >
            Search
          </button>
          <button
            v-if="from || to"
            type="button"
            class="h-10 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            @click="clearRange"
          >
            Clear
          </button>

          <!-- Everything on screen when nothing is ticked, which is what
               somebody closing off a month wants anyway. -->
          <button
            type="button"
            :disabled="!rows.length"
            class="ml-auto h-10 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            @click="exportCsv"
          >
            Export {{ chosen.length ? `${chosen.length} ticked` : 'all' }} to Excel
          </button>
        </div>

        <!-- Only an administrator, and only on somebody else's page. -->
        <div
          v-if="mayEdit"
          class="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]"
        >
          <span class="text-sm text-gray-600 dark:text-gray-300">
            {{ chosen.length }} ticked
          </span>
          <select v-model="bulkStatus" :class="inputClass" class="max-w-56">
            <option value="">Change status to…</option>
            <option v-for="s in EARNING_STATUSES" :key="s" :value="s">
              {{ STATUS_WORD[s] ?? s }}
            </option>
          </select>
          <button
            type="button"
            :disabled="!bulkStatus || !chosen.length || saving"
            class="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            @click="applyStatus"
          >
            {{ saving ? 'Saving…' : 'Apply' }}
          </button>
          <p class="text-xs text-gray-400">
            Recorded against your account. Marking a line paid dates it today.
          </p>
        </div>
      </div>

      <div class="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
        <table class="min-w-full text-left">
          <thead class="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
            <tr>
              <th v-if="mayEdit" class="w-10 px-5 py-3 sm:px-6">
                <input
                  type="checkbox"
                  aria-label="Tick every line"
                  :checked="allTicked"
                  class="h-4 w-4 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
                  @change="toggleAll"
                />
              </th>
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
              <td :colspan="mayEdit ? 8 : 7" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</td>
            </tr>
            <tr v-else-if="!rows.length">
              <td :colspan="mayEdit ? 8 : 7" class="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">
                Nothing yet. Earnings appear here the moment somebody buys one of your courses.
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              :class="row.status === 'cancelled' ? 'opacity-55' : ''"
            >
              <td v-if="mayEdit" class="px-5 py-3.5 sm:px-6">
                <input
                  type="checkbox"
                  :aria-label="`Tick ${row.orderNo}`"
                  :checked="selected.has(row.id)"
                  class="h-4 w-4 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
                  @change="toggle(row.id)"
                />
              </td>
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
