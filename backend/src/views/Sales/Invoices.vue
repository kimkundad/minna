<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  ApiError,
  invoices as invoicesApi,
  type InvoiceDetail,
  type InvoiceInput,
  type InvoiceRow,
  type InvoiceStatus,
  type OrderStatus,
} from '@/lib/api'
import { formatMoney } from '@/lib/money'

/**
 * Full tax invoices (ใบกำกับภาษีเต็มรูปแบบ).
 *
 * Not a CRUD screen, on purpose. Everyone who buys gets a receipt by email; a
 * full tax invoice is only for a buyer who asked for one at checkout, and it
 * carries their registered name, thirteen-digit tax ID, branch and address.
 * Once it has a document number it has gone into somebody else's books, so from
 * then on it can be read and nothing else — a typo is fixed by cancelling the
 * document and issuing another, not by editing this row.
 *
 * Which leaves two real jobs: send out the ones that are issued, and look at
 * the ones still waiting on payment.
 */
const { ask } = useConfirm()

const rows = ref<InvoiceRow[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const PER_PAGE = 20

const q = ref('')
const status = ref<'' | InvoiceStatus>('')
const type = ref<'' | 'corporate' | 'individual'>('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await invoicesApi.list({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...(status.value ? { status: status.value } : {}),
      ...(type.value ? { type: type.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load invoices.'
  } finally {
    loading.value = false
  }
}

/* ---------------- one invoice ---------------- */

const open = ref<InvoiceDetail | null>(null)
const openLoading = ref(false)
const working = ref(false)

async function show(row: InvoiceRow) {
  openLoading.value = true
  open.value = null
  editing.value = false
  try {
    open.value = (await invoicesApi.get(row.id)).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load that invoice.'
  } finally {
    openLoading.value = false
  }
}

function closeInvoice() {
  open.value = null
  editing.value = false
}

async function issue(invoice: InvoiceDetail) {
  const { ok } = await ask({
    title: `Issue a document number for ${invoice.name}?`,
    message: [
      'This takes the next number in the sequence and stamps the invoice as issued.',
      'After that its details cannot be changed — correcting one means cancelling the document and issuing another.',
    ].join('\n'),
    confirmLabel: 'Issue',
  })
  if (!ok) return

  working.value = true
  error.value = ''
  try {
    open.value = (await invoicesApi.issue(invoice.id)).data
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not issue that invoice.'
  } finally {
    working.value = false
  }
}

/* ---------------- correcting one ---------------- */

const editing = ref(false)
const form = ref<InvoiceInput>(blankForm())
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})

function blankForm(): InvoiceInput {
  return {
    type: 'corporate',
    name: '',
    taxId: '',
    branchType: 'head',
    branchCode: '00000',
    address: '',
  }
}

function startEdit(invoice: InvoiceDetail) {
  form.value = {
    type: invoice.type,
    name: invoice.name,
    taxId: invoice.taxId,
    branchType: invoice.branchType,
    branchCode: invoice.branchCode,
    address: invoice.address,
  }
  formError.value = ''
  fieldErrors.value = {}
  editing.value = true
}

/** A head office is 00000 by law, so it is filled in rather than asked for. */
function onBranchTypeChange() {
  form.value.branchCode = form.value.branchType === 'head' ? '00000' : ''
}

function onTypeChange() {
  if (form.value.type === 'individual') {
    form.value.branchType = null
    form.value.branchCode = null
  } else {
    form.value.branchType = 'head'
    form.value.branchCode = '00000'
  }
}

async function saveEdit() {
  if (!open.value) return
  working.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    open.value = (await invoicesApi.amend(open.value.id, form.value)).data
    editing.value = false
    await load()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      formError.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      formError.value = 'Could not save. Try again.'
    }
  } finally {
    working.value = false
  }
}

/* ---------------- presentation ---------------- */

/** The same words the Orders screen uses, so one order does not read as two
 *  different things on two screens. */
const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
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

/** 0105536091238 → 0-1055-36091-23-8, which is how it is printed. */
function groupTaxId(value: string): string {
  if (value.length !== 13) return value
  return `${value[0]}-${value.slice(1, 5)}-${value.slice(5, 10)}-${value.slice(10, 12)}-${value[12]}`
}

function branchLabel(row: InvoiceRow): string {
  if (row.type === 'individual') return '—'
  if (row.branchType === 'head') return 'Head office (00000)'
  return row.branchCode ? `Branch ${row.branchCode}` : 'Branch'
}

/**
 * What is holding the document up, in the cases where something is.
 *
 * An unpaid order is the ordinary one and needs no explanation; a paid order
 * with no number is the one somebody has to do something about.
 */
function heldBy(row: InvoiceRow): string | null {
  if (row.documentNo) return null
  if (row.orderStatus === 'paid') return 'Paid, but never numbered — issue it below.'
  if (row.orderStatus === 'pending') return 'Waiting for payment.'
  return `The order was ${row.orderStatus}.`
}

const openHeld = computed(() => (open.value ? heldBy(open.value) : null))

let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
watch([status, type], () => {
  page.value = 1
  void load()
})
watch(page, load)

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Invoices" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ total }} tax invoices
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Only buyers who asked for one at checkout are here. Everyone else gets a receipt by email.
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
          placeholder="Name, tax ID, document or order number"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <select
          v-model="status"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any state</option>
          <option value="issued">Issued</option>
          <option value="requested">Not yet issued</option>
        </select>
        <select
          v-model="type"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Anyone</option>
          <option value="corporate">A company</option>
          <option value="individual">A person</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[1000px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Document</th>
              <th class="px-5 py-3 font-medium">Issued to</th>
              <th class="px-5 py-3 font-medium">Tax ID</th>
              <th class="px-5 py-3 font-medium">Branch</th>
              <th class="px-5 py-3 font-medium">Order</th>
              <th class="px-5 py-3 font-medium">Amount</th>
              <th class="px-5 py-3 font-medium sm:px-6">Issued</th>
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
                No tax invoices yet.
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              @click="show(row)"
            >
              <td class="px-5 py-3.5 sm:px-6">
                <span v-if="row.documentNo" class="font-mono text-sm text-brand-500">
                  {{ row.documentNo }}
                </span>
                <span
                  v-else
                  class="inline-flex rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-medium text-warning-600 dark:bg-warning-500/15 dark:text-warning-400"
                >
                  Not yet issued
                </span>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90">
                {{ row.name }}
                <span class="block text-xs text-gray-500 dark:text-gray-400">
                  {{ row.type === 'corporate' ? 'A company' : 'A person' }} · {{ row.buyerEmail }}
                </span>
              </td>
              <td class="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                {{ groupTaxId(row.taxId) }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ branchLabel(row) }}
              </td>
              <td class="px-5 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                {{ row.orderNo }}
              </td>
              <td class="whitespace-nowrap px-5 py-3.5 text-sm text-gray-800 dark:text-white/90">
                {{ formatMoney(row.orderTotal, row.currency) }}
              </td>
              <td class="whitespace-nowrap px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 sm:px-6">
                {{ when(row.issuedAt) }}
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
        noun="invoices"
      />
    </div>

    <div
      v-if="openLoading || open"
      class="mt-6 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <p v-if="openLoading" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</p>

      <template v-else-if="open">
        <div class="flex flex-wrap items-start justify-between gap-4 px-5 py-4 sm:px-6">
          <div>
            <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
              <span v-if="open.documentNo" class="font-mono">{{ open.documentNo }}</span>
              <span v-else>Not yet issued</span>
            </h3>
            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              <template v-if="open.issuedAt">Issued {{ when(open.issuedAt) }} · </template>
              Asked for {{ when(open.createdAt) }}
            </p>
          </div>
          <div class="flex items-center gap-3">
            <!-- Both only while the number is unspent; afterwards the document
                 exists in somebody else's books and this row is a copy of it. -->
            <button
              v-if="!open.documentNo && !editing"
              type="button"
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              @click="startEdit(open)"
            >
              Correct the details
            </button>
            <button
              v-if="!open.documentNo && open.orderStatus === 'paid' && !editing"
              type="button"
              :disabled="working"
              class="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
              @click="issue(open)"
            >
              {{ working ? 'Issuing…' : 'Issue a number' }}
            </button>
            <button
              type="button"
              class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="closeInvoice"
            >
              Close
            </button>
          </div>
        </div>

        <p
          v-if="openHeld"
          class="mx-5 mb-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-white/[0.02] dark:text-gray-300 sm:mx-6"
        >
          {{ openHeld }}
        </p>

        <!-- Reading it -->
        <div
          v-if="!editing"
          class="grid grid-cols-1 gap-6 border-t border-gray-100 px-5 py-5 dark:border-gray-800 sm:px-6 lg:grid-cols-3"
        >
          <div>
            <h4 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Issued to
            </h4>
            <p class="text-sm text-gray-800 dark:text-white/90">{{ open.name }}</p>
            <p class="font-mono text-sm text-gray-500 dark:text-gray-400">
              {{ groupTaxId(open.taxId) }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ branchLabel(open) }}</p>
            <p class="mt-2 whitespace-pre-line text-sm text-gray-500 dark:text-gray-400">
              {{ open.address }}
            </p>
          </div>

          <div>
            <h4 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Who bought it
            </h4>
            <p class="text-sm text-gray-800 dark:text-white/90">
              {{ open.buyerFirstName }} {{ open.buyerLastName }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ open.buyerEmail }}</p>
            <!-- The account and the invoice name are often different: a staff
                 member buying on the company's behalf is the usual case. -->
            <router-link
              :to="`/orders?q=${open.orderNo}`"
              class="mt-1 inline-block font-mono text-sm text-brand-500 hover:text-brand-600"
            >
              {{ open.orderNo }}
            </router-link>
          </div>

          <div>
            <h4 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Amount</h4>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between gap-4">
                <!-- Not "Paid": this panel is shown for orders that have not
                     been, and a figure labelled paid against a pending order is
                     the kind of thing that gets repeated down a phone line. -->
                <dt class="text-gray-500 dark:text-gray-400">Order total</dt>
                <dd class="text-gray-800 dark:text-white/90">{{ formatMoney(open.orderTotal, open.currency) }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">VAT inside</dt>
                <dd class="text-gray-800 dark:text-white/90">{{ formatMoney(open.orderVat, open.currency) }}</dd>
              </div>
              <div v-if="open.paidAt" class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Paid on</dt>
                <dd class="text-gray-800 dark:text-white/90">{{ when(open.paidAt) }}</dd>
              </div>
              <div v-else class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">Order status</dt>
                <dd class="text-gray-800 dark:text-white/90">{{ ORDER_STATUS_LABEL[open.orderStatus] }}</dd>
              </div>
            </dl>
          </div>
        </div>

        <!-- Correcting it -->
        <form
          v-else
          class="border-t border-gray-100 px-5 py-5 dark:border-gray-800 sm:px-6"
          @submit.prevent="saveEdit"
        >
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Issued to
              </label>
              <select
                v-model="form.type"
                class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                @change="onTypeChange"
              >
                <option value="corporate">A company</option>
                <option value="individual">A person</option>
              </select>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {{ form.type === 'corporate' ? 'Registered company name' : 'Full name' }}
                <span class="text-error-500">*</span>
              </label>
              <input
                v-model="form.name"
                required
                maxlength="255"
                class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <p v-if="fieldErrors.name" class="mt-1 text-sm text-error-500">
                {{ fieldErrors.name }}
              </p>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {{ form.type === 'corporate' ? '13-digit tax ID' : '13-digit national ID' }}
                <span class="text-error-500">*</span>
              </label>
              <input
                v-model="form.taxId"
                required
                inputmode="numeric"
                maxlength="20"
                class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 font-mono text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <p v-if="fieldErrors.taxId" class="mt-1 text-sm text-error-500">
                {{ fieldErrors.taxId }}
              </p>
            </div>

            <div v-if="form.type === 'corporate'">
              <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Premises<span class="text-error-500">*</span>
              </label>
              <div class="flex gap-3">
                <select
                  v-model="form.branchType"
                  class="h-11 flex-1 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  @change="onBranchTypeChange"
                >
                  <option value="head">Head office</option>
                  <option value="branch">A branch</option>
                </select>
                <input
                  v-model="form.branchCode"
                  :readonly="form.branchType === 'head'"
                  inputmode="numeric"
                  maxlength="5"
                  placeholder="00001"
                  class="h-11 w-28 rounded-lg border border-gray-300 bg-transparent px-4 font-mono text-sm text-gray-800 read-only:bg-gray-100 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:read-only:bg-white/5"
                />
              </div>
              <p v-if="fieldErrors.branchCode" class="mt-1 text-sm text-error-500">
                {{ fieldErrors.branchCode }}
              </p>
              <p v-else-if="fieldErrors.branchType" class="mt-1 text-sm text-error-500">
                {{ fieldErrors.branchType }}
              </p>
            </div>

            <div class="sm:col-span-2">
              <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Address on the invoice<span class="text-error-500">*</span>
              </label>
              <textarea
                v-model="form.address"
                required
                rows="3"
                maxlength="1000"
                class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              ></textarea>
              <p v-if="fieldErrors.address" class="mt-1 text-sm text-error-500">
                {{ fieldErrors.address }}
              </p>
            </div>
          </div>

          <p v-if="formError" role="alert" class="mt-3 text-sm text-error-500">{{ formError }}</p>

          <div class="mt-4 flex gap-3">
            <button
              type="submit"
              :disabled="working"
              class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {{ working ? 'Saving…' : 'Save' }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              @click="editing = false"
            >
              Cancel
            </button>
          </div>
        </form>
      </template>
    </div>
  </admin-layout>
</template>
