<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  ApiError,
  api,
  coupons as couponsApi,
  type Coupon,
  type CouponInput,
  type CouponRedemption,
  type CouponStatus,
  type CourseRow,
} from '@/lib/api'
import { formatBaht, toBahtInput, toSatang } from '@/lib/money'

/**
 * Coupons.
 *
 * The one screen in the admin where a mistake costs money directly, so it is
 * built to show consequences rather than fields: what the discount comes to,
 * how many times it has been spent, how much it has given away, and whether it
 * would work if a customer typed it right now.
 *
 * That last one is `status`, and it is not the same as `active`. A coupon can be
 * switched on and still do nothing because it expired last month or hit its
 * limit — the API works that out, because the checkout uses the same rules.
 *
 * Amounts are satang in the API and baht in the boxes. `lib/money` is the only
 * place that converts.
 */
const { ask } = useConfirm()

const rows = ref<Coupon[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const PER_PAGE = 20

const q = ref('')
const scope = ref<'' | 'course' | 'order'>('')
const status = ref<'' | CouponStatus>('')

/** Courses to attach a course coupon to. Loaded once, not per row. */
const courseOptions = ref<CourseRow[]>([])

/* ---------------- the form ---------------- */

/**
 * Baht in the boxes, satang on the wire. A percent coupon's `value` is not
 * money at all, so it is kept as its own field rather than run through the
 * conversion — 10 percent is 10, not 1000.
 */
interface CouponForm {
  code: string
  scope: 'course' | 'order'
  courseId: number | null
  discountType: 'percent' | 'fixed'
  percent: number | null
  fixedBaht: string
  maxDiscountBaht: string
  minSubtotalBaht: string
  startsAt: string
  expiresAt: string
  usageLimit: number | null
  active: boolean
}

const editing = ref<number | 'new' | null>(null)
const form = ref<CouponForm>(blank())
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)

function blank(): CouponForm {
  return {
    code: '',
    scope: 'order',
    courseId: null,
    discountType: 'percent',
    percent: 10,
    fixedBaht: '',
    maxDiscountBaht: '',
    minSubtotalBaht: '',
    startsAt: '',
    expiresAt: '',
    usageLimit: null,
    active: true,
  }
}

/** `datetime-local` wants `2026-10-08T14:30`, with no zone and no seconds. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Back out again, as an instant rather than a wall-clock time: the API stores
 *  a moment, and an admin in Bangkok setting 23:59 means 23:59 their time. */
function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function openNew() {
  editing.value = 'new'
  form.value = blank()
  formError.value = ''
  fieldErrors.value = {}
}

function openEdit(row: Coupon) {
  editing.value = row.id
  form.value = {
    code: row.code,
    scope: row.scope,
    courseId: row.courseId,
    discountType: row.discountType,
    percent: row.discountType === 'percent' ? row.value : 10,
    fixedBaht: row.discountType === 'fixed' ? toBahtInput(row.value) : '',
    maxDiscountBaht: toBahtInput(row.maxDiscount),
    minSubtotalBaht: toBahtInput(row.minSubtotal),
    startsAt: toLocalInput(row.startsAt),
    expiresAt: toLocalInput(row.expiresAt),
    usageLimit: row.usageLimit,
    active: row.active,
  }
  formError.value = ''
  fieldErrors.value = {}
}

function close() {
  editing.value = null
}

/** Switching scope clears the field that no longer applies, so the API never
 *  has to refuse a combination the form itself could have prevented. */
function onScopeChange() {
  if (form.value.scope === 'order') form.value.courseId = null
  else form.value.minSubtotalBaht = ''
}

function onTypeChange() {
  if (form.value.discountType === 'fixed') form.value.maxDiscountBaht = ''
}

function toInput(f: CouponForm): CouponInput {
  return {
    code: f.code.trim(),
    scope: f.scope,
    courseId: f.scope === 'course' ? f.courseId : null,
    discountType: f.discountType,
    value: f.discountType === 'percent' ? (f.percent ?? 0) : (toSatang(f.fixedBaht) ?? 0),
    maxDiscount: f.discountType === 'percent' ? toSatang(f.maxDiscountBaht) : null,
    minSubtotal: f.scope === 'order' ? toSatang(f.minSubtotalBaht) : null,
    startsAt: fromLocalInput(f.startsAt),
    expiresAt: fromLocalInput(f.expiresAt),
    usageLimit: f.usageLimit && f.usageLimit > 0 ? f.usageLimit : null,
    active: f.active,
  }
}

/** What the coupon will actually take off, spelled out under the form. The
 *  figures are easy to get wrong in satang and obvious in a sentence. */
const effect = computed(() => {
  const f = form.value
  const where = f.scope === 'course'
    ? (courseOptions.value.find((c) => c.id === f.courseId)?.title ?? 'one course')
    : 'the whole basket'

  if (f.discountType === 'percent') {
    const cap = toSatang(f.maxDiscountBaht)
    return `${f.percent ?? 0}% off ${where}${cap ? `, up to ${formatBaht(cap)}` : ''}.`
  }
  const amount = toSatang(f.fixedBaht)
  return `${amount ? formatBaht(amount) : '฿0.00'} off ${where}.`
})

async function save() {
  saving.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    if (editing.value === 'new') await couponsApi.create(toInput(form.value))
    else if (editing.value != null) await couponsApi.update(editing.value, toInput(form.value))
    close()
    await load()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      formError.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      formError.value = 'Could not save. Try again.'
    }
  } finally {
    saving.value = false
  }
}

/* ---------------- the table ---------------- */

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await couponsApi.list({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...(scope.value ? { scope: scope.value } : {}),
      ...(status.value ? { status: status.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load coupons.'
  } finally {
    loading.value = false
  }
}

async function loadCourses() {
  try {
    courseOptions.value = (await api.courses({ perPage: 100 })).data
  } catch {
    // The select falls back to empty; an order coupon needs no course anyway.
  }
}

/** Off and on, without opening the form: the thing most often wanted in a
 *  hurry when a code is being passed around somewhere it should not be. */
async function toggle(row: Coupon) {
  try {
    await couponsApi.update(row.id, {
      code: row.code,
      scope: row.scope,
      courseId: row.courseId,
      discountType: row.discountType,
      value: row.value,
      maxDiscount: row.maxDiscount,
      minSubtotal: row.minSubtotal,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      usageLimit: row.usageLimit,
      active: !row.active,
    })
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change that coupon.'
  }
}

async function remove(row: Coupon) {
  // The API refuses outright once a coupon has been redeemed, and says why.
  const { ok } = await ask({
    title: `Delete ${row.code}?`,
    message: row.usedCount
      ? 'This coupon has been used, so it cannot be deleted — switch it off instead.'
      : 'Nobody has used it yet, so nothing else is affected. This cannot be undone.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await couponsApi.remove(row.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that coupon.'
  }
}

/* ---------------- who spent it ---------------- */

const showingUses = ref<Coupon | null>(null)
const uses = ref<CouponRedemption[]>([])
const usesLoading = ref(false)

async function showUses(row: Coupon) {
  showingUses.value = row
  usesLoading.value = true
  uses.value = []
  try {
    uses.value = (await couponsApi.redemptions(row.id, { perPage: 50 })).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the redemptions.'
  } finally {
    usesLoading.value = false
  }
}

/* ---------------- presentation ---------------- */

const STATUS_LABEL: Record<CouponStatus, string> = {
  live: 'Live',
  scheduled: 'Scheduled',
  expired: 'Expired',
  used_up: 'Used up',
  off: 'Off',
}

const STATUS_CLASS: Record<CouponStatus, string> = {
  live: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  scheduled: 'bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400',
  used_up: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
  off: 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-500',
}

function discountLabel(row: Coupon): string {
  if (row.discountType === 'percent') {
    return row.maxDiscount ? `${row.value}% (max ${formatBaht(row.maxDiscount)})` : `${row.value}%`
  }
  return formatBaht(row.value)
}

function usageLabel(row: Coupon): string {
  return row.usageLimit ? `${row.usedCount} / ${row.usageLimit}` : String(row.usedCount)
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

/** The dates as one column: a coupon usually has neither, one or the other. */
function windowLabel(row: Coupon): string {
  if (!row.startsAt && !row.expiresAt) return 'Always'
  if (row.startsAt && row.expiresAt) return `${when(row.startsAt)} → ${when(row.expiresAt)}`
  return row.startsAt ? `From ${when(row.startsAt)}` : `Until ${when(row.expiresAt)}`
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
watch([scope, status], () => {
  page.value = 1
  void load()
})
watch(page, load)

onMounted(async () => {
  await Promise.all([load(), loadCourses()])
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Coupons" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ total }} coupons
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Checkout works the discount out from these, so a change here takes effect at once.
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
          @click="openNew"
        >
          Add coupon
        </button>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <form
        v-if="editing !== null"
        class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
        @submit.prevent="save"
      >
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Code<span class="text-error-500">*</span>
            </label>
            <input
              v-model="form.code"
              required
              minlength="3"
              maxlength="50"
              placeholder="SUMMER26"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 font-mono text-sm uppercase text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p class="mt-1 text-xs text-gray-400">Stored upper-case; customers may type it either way.</p>
            <p v-if="fieldErrors.code" class="mt-1 text-sm text-error-500">{{ fieldErrors.code }}</p>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Applies to
            </label>
            <select
              v-model="form.scope"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              @change="onScopeChange"
            >
              <option value="order">The whole basket</option>
              <option value="course">One course</option>
            </select>
          </div>

          <div v-if="form.scope === 'course'">
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Course<span class="text-error-500">*</span>
            </label>
            <select
              v-model="form.courseId"
              required
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option :value="null" disabled>— choose —</option>
              <option v-for="c in courseOptions" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
            <p v-if="fieldErrors.courseId" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.courseId }}
            </p>
          </div>

          <div v-else>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Minimum basket (฿)
            </label>
            <input
              v-model="form.minSubtotalBaht"
              type="text"
              inputmode="decimal"
              placeholder="No minimum"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p class="mt-1 text-xs text-gray-400">Measured after any course coupons come off.</p>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Discount
            </label>
            <select
              v-model="form.discountType"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              @change="onTypeChange"
            >
              <option value="percent">A percentage</option>
              <option value="fixed">A fixed amount</option>
            </select>
          </div>

          <div v-if="form.discountType === 'percent'">
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Percent off<span class="text-error-500">*</span>
            </label>
            <input
              v-model.number="form.percent"
              type="number"
              required
              min="1"
              max="100"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p v-if="fieldErrors.value" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.value }}
            </p>
          </div>

          <div v-else>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Amount off (฿)<span class="text-error-500">*</span>
            </label>
            <input
              v-model="form.fixedBaht"
              type="text"
              inputmode="decimal"
              required
              placeholder="200.00"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p v-if="fieldErrors.value" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.value }}
            </p>
          </div>

          <div v-if="form.discountType === 'percent'">
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Most it can take off (฿)
            </label>
            <input
              v-model="form.maxDiscountBaht"
              type="text"
              inputmode="decimal"
              placeholder="No ceiling"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Starts
            </label>
            <input
              v-model="form.startsAt"
              type="datetime-local"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Expires
            </label>
            <input
              v-model="form.expiresAt"
              type="datetime-local"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p v-if="fieldErrors.expiresAt" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.expiresAt }}
            </p>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Times it may be used
            </label>
            <input
              v-model.number="form.usageLimit"
              type="number"
              min="1"
              placeholder="No limit"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p class="mt-1 text-xs text-gray-400">Counted when an order is paid, not when it is typed.</p>
          </div>

          <div class="flex items-end">
            <label class="flex cursor-pointer items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
              <input
                v-model="form.active"
                type="checkbox"
                class="h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20 dark:border-gray-700"
              />
              Switched on
            </label>
          </div>
        </div>

        <p class="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
          {{ effect }}
        </p>

        <p v-if="formError" role="alert" class="mt-3 text-sm text-error-500">{{ formError }}</p>

        <div class="mt-4 flex gap-3">
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {{ saving ? 'Saving…' : editing === 'new' ? 'Create' : 'Save' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            @click="close"
          >
            Cancel
          </button>
        </div>
      </form>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-3 sm:px-6"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Search code"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <select
          v-model="scope"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any scope</option>
          <option value="order">The whole basket</option>
          <option value="course">One course</option>
        </select>
        <select
          v-model="status"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any state</option>
          <option value="live">Live</option>
          <option value="scheduled">Scheduled</option>
          <option value="expired">Expired</option>
          <option value="used_up">Used up</option>
          <option value="off">Off</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[1000px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Code</th>
              <th class="px-5 py-3 font-medium">Discount</th>
              <th class="px-5 py-3 font-medium">Applies to</th>
              <th class="px-5 py-3 font-medium">When</th>
              <th class="px-5 py-3 font-medium">Used</th>
              <th class="px-5 py-3 font-medium">Given away</th>
              <th class="px-5 py-3 font-medium">State</th>
              <th class="px-5 py-3 font-medium sm:px-6"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="8" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="8" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                No coupons match.
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
            >
              <td class="px-5 py-3.5 font-mono text-sm text-gray-800 dark:text-white/90 sm:px-6">
                {{ row.code }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90">
                {{ discountLabel(row) }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                <template v-if="row.scope === 'course'">{{ row.courseTitle ?? 'a course' }}</template>
                <template v-else>
                  The basket<span v-if="row.minSubtotal"> over {{ formatBaht(row.minSubtotal) }}</span>
                </template>
              </td>
              <td class="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                {{ windowLabel(row) }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                <button
                  v-if="row.usedCount"
                  type="button"
                  class="text-brand-500 hover:text-brand-600"
                  @click="showUses(row)"
                >
                  {{ usageLabel(row) }}
                </button>
                <span v-else>{{ usageLabel(row) }}</span>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ row.discountGiven ? formatBaht(row.discountGiven) : '—' }}
              </td>
              <td class="px-5 py-3.5">
                <span
                  class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                  :class="STATUS_CLASS[row.status]"
                >
                  {{ STATUS_LABEL[row.status] }}
                </span>
              </td>
              <td class="whitespace-nowrap px-5 py-3.5 text-right text-sm sm:px-6">
                <button
                  type="button"
                  class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  @click="toggle(row)"
                >
                  {{ row.active ? 'Switch off' : 'Switch on' }}
                </button>
                <button
                  type="button"
                  class="ml-4 text-brand-500 hover:text-brand-600"
                  @click="openEdit(row)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="ml-4 text-error-500 hover:text-error-600"
                  @click="remove(row)"
                >
                  Delete
                </button>
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
        noun="coupons"
      />
    </div>

    <!-- Who spent it. Opened from the usage count, because that is the moment
         the question comes up. -->
    <div
      v-if="showingUses"
      class="mt-6 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          Who used {{ showingUses.code }}
        </h3>
        <button
          type="button"
          class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          @click="showingUses = null"
        >
          Close
        </button>
      </div>
      <div class="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
        <table class="w-full min-w-[640px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Order</th>
              <th class="px-5 py-3 font-medium">Customer</th>
              <th class="px-5 py-3 font-medium">Discount</th>
              <th class="px-5 py-3 font-medium sm:px-6">When</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="usesLoading">
              <td colspan="4" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!uses.length">
              <td colspan="4" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Nobody has used it yet.
              </td>
            </tr>
            <tr v-for="use in uses" :key="use.id">
              <td class="px-5 py-3.5 text-sm sm:px-6">
                <router-link :to="`/orders?q=${use.orderNo}`" class="font-mono text-brand-500 hover:text-brand-600">
                  {{ use.orderNo }}
                </router-link>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90">
                {{ use.firstName }} {{ use.lastName }}
                <span class="block text-xs text-gray-500 dark:text-gray-400">{{ use.email }}</span>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ formatBaht(use.discountAmount) }}
              </td>
              <td class="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 sm:px-6">
                {{ when(use.redeemedAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </admin-layout>
</template>
