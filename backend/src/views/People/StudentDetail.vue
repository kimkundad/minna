<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'
import {
  ApiError,
  member as memberApi,
  type InvoiceInput,
  type MemberBilling,
  type MemberCourseAccess,
  type MemberLearning,
  type MemberPayments,
  type MemberSummary,
  type OrderStatus,
} from '@/lib/api'
import { formatBaht } from '@/lib/money'
import flatPickr from 'vue-flatpickr-component'

/**
 * One student, behind tabs.
 *
 * The tabs follow what someone actually rings up about, which is why there is
 * no shipping tab: nothing here is posted. The order is the order of the
 * questions — who are they, what can they open, what have they done, what did
 * they pay, where does their invoice go.
 *
 * Each tab loads when it is first opened and is kept afterwards. Most calls
 * never leave the first one, and fetching a learning history to answer "what is
 * their email" is work nobody asked for.
 */
const route = useRoute()
const router = useRouter()
const { ask } = useConfirm()
const auth = useAuthStore()

const id = computed(() => Number(route.params.id))
const canRevoke = computed(() => auth.roles.includes('superadmin'))

type TabKey = 'general' | 'courses' | 'learning' | 'payments' | 'billing'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'courses', label: 'Courses and access' },
  { key: 'learning', label: 'Learning' },
  { key: 'payments', label: 'Payments' },
  { key: 'billing', label: 'Billing address' },
]

// In the URL, so a tab can be linked to and survives a reload.
const tab = ref<TabKey>(
  TABS.some((t) => t.key === route.query.tab) ? (route.query.tab as TabKey) : 'general',
)

const error = ref('')

/* ---------------- the person ---------------- */

type Detail = Awaited<ReturnType<typeof memberApi.detail>>['data']

const person = ref<Detail | null>(null)
const summary = ref<MemberSummary | null>(null)
const loading = ref(true)

const fullName = computed(() =>
  person.value ? `${person.value.firstName} ${person.value.lastName}`.trim() : '',
)

const phone = computed(() => {
  if (!person.value?.phoneNational) return '—'
  return `${person.value.phoneCountryCode ?? ''} ${person.value.phoneNational}`.trim()
})

async function loadHeader() {
  loading.value = true
  error.value = ''
  try {
    const [detail, counts] = await Promise.all([memberApi.detail(id.value), memberApi.summary(id.value)])
    person.value = detail.data
    summary.value = counts.data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load that member.'
  } finally {
    loading.value = false
  }
}

/* ---------------- each tab, loaded once ---------------- */

const courses = ref<MemberCourseAccess[] | null>(null)
const learning = ref<MemberLearning | null>(null)
const payments = ref<MemberPayments | null>(null)
const billing = ref<MemberBilling | null>(null)
const billingLoaded = ref(false)
const tabLoading = ref(false)

async function loadTab(key: TabKey) {
  if (key === 'general') return
  if (key === 'courses' && courses.value) return
  if (key === 'learning' && learning.value) return
  if (key === 'payments' && payments.value) return
  if (key === 'billing' && billingLoaded.value) return

  tabLoading.value = true
  error.value = ''
  try {
    if (key === 'courses') courses.value = (await memberApi.courses(id.value)).data
    else if (key === 'learning') learning.value = (await memberApi.learning(id.value)).data
    else if (key === 'payments') payments.value = (await memberApi.payments(id.value)).data
    else if (key === 'billing') {
      billing.value = (await memberApi.billing(id.value)).data
      billingLoaded.value = true
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load that tab.'
  } finally {
    tabLoading.value = false
  }
}

function openTab(key: TabKey) {
  tab.value = key
  void router.replace({ query: key === 'general' ? {} : { tab: key } })
  void loadTab(key)
}

/* ---------------- access ---------------- */

/**
 * Moving when a course runs out for somebody.
 *
 * Almost always to hand back a few days: they were ill, or a module went up
 * late, and giving the time back costs the school nothing. The buttons add to
 * whichever is later — today or the current expiry — because adding a week to
 * a date that has already passed would give somebody a week that is already
 * over.
 */
/**
 * The calendar in the dialog.
 *
 * `dateFormat` is what the model holds and `altFormat` is what is shown: the
 * stored value stays `YYYY-MM-DD` for the code that adds days to it, while the
 * admin reads "8 November 2026" rather than a row of numbers that could be
 * either way round.
 *
 * No `minDate`. Pulling an expiry back to a date already past is unusual, but
 * it is a real thing to want — ending access at the point a refund covered,
 * say — and the API handles it honestly rather than refusing.
 */
const EXPIRY_PICKER = {
  dateFormat: 'Y-m-d',
  altInput: true,
  altFormat: 'j F Y',
} as const

const expiryFor = ref<MemberCourseAccess | null>(null)
const expiryDate = ref('')
const expiryLifetime = ref(false)
const savingExpiry = ref(false)

/** `YYYY-MM-DD` on the school's own clock, which is what a date input wants. */
const YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function editExpiry(row: MemberCourseAccess): void {
  expiryFor.value = row
  expiryLifetime.value = row.expiresAt === null
  expiryDate.value = row.expiresAt ? YMD.format(new Date(row.expiresAt)) : ''
  error.value = ''
}

function addDays(days: number): void {
  const current = expiryDate.value ? new Date(`${expiryDate.value}T00:00:00+07:00`) : null
  // From today if it has already run out: a week added to last month is a week
  // nobody gets.
  const from = current && current.getTime() > Date.now() ? current : new Date()
  expiryDate.value = YMD.format(new Date(from.getTime() + days * 86_400_000))
  expiryLifetime.value = false
}

async function saveExpiry(): Promise<void> {
  const row = expiryFor.value
  if (!row || savingExpiry.value) return
  if (!expiryLifetime.value && !expiryDate.value) return

  savingExpiry.value = true
  error.value = ''
  try {
    // End of day in Bangkok: somebody told "until the 9th" expects the 9th to
    // work, not to have ended at midnight as it began.
    const at = expiryLifetime.value ? null : `${expiryDate.value}T23:59:59+07:00`
    await memberApi.setAccessExpiry(id.value, row.id, at)
    courses.value = (await memberApi.courses(id.value)).data
    summary.value = (await memberApi.summary(id.value)).data
    expiryFor.value = null
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change that date.'
  } finally {
    savingExpiry.value = false
  }
}

async function toggleAccess(row: MemberCourseAccess) {
  const revoking = row.status !== 'revoked'
  const { ok } = await ask({
    title: revoking ? `End access to “${row.title}”?` : `Restore access to “${row.title}”?`,
    message: revoking
      ? 'They lose the course straight away and no money goes back. What they watched and were marked on is kept — use a refund on the order if the money should go back too.'
      : 'They get the course back on the terms it was granted on.',
    confirmLabel: revoking ? 'End access' : 'Restore',
    tone: revoking ? 'danger' : 'primary',
  })
  if (!ok) return

  try {
    await memberApi.toggleAccess(id.value, row.id)
    courses.value = (await memberApi.courses(id.value)).data
    summary.value = (await memberApi.summary(id.value)).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change that access.'
  }
}

/* ---------------- billing ---------------- */

const editingBilling = ref(false)
const billingForm = ref<InvoiceInput>(blankBilling())
const billingErrors = ref<Record<string, string>>({})
const billingError = ref('')
const savingBilling = ref(false)

function blankBilling(): InvoiceInput {
  return {
    type: 'corporate',
    name: '',
    taxId: '',
    branchType: 'head',
    branchCode: '00000',
    address: '',
  }
}

function startBilling() {
  billingForm.value = billing.value
    ? {
        type: billing.value.type,
        name: billing.value.name,
        taxId: billing.value.taxId,
        branchType: billing.value.branchType,
        branchCode: billing.value.branchCode,
        address: billing.value.address,
      }
    : blankBilling()
  billingErrors.value = {}
  billingError.value = ''
  editingBilling.value = true
}

/** A head office is 00000 by law, so it is filled in rather than asked for. */
function onBranchTypeChange() {
  billingForm.value.branchCode = billingForm.value.branchType === 'head' ? '00000' : ''
}

function onBillingTypeChange() {
  if (billingForm.value.type === 'individual') {
    billingForm.value.branchType = null
    billingForm.value.branchCode = null
  } else {
    billingForm.value.branchType = 'head'
    billingForm.value.branchCode = '00000'
  }
}

async function saveBilling() {
  savingBilling.value = true
  billingError.value = ''
  billingErrors.value = {}
  try {
    billing.value = (await memberApi.saveBilling(id.value, billingForm.value)).data
    editingBilling.value = false
  } catch (err) {
    if (err instanceof ApiError) {
      billingErrors.value = err.fields
      billingError.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      billingError.value = 'Could not save. Try again.'
    }
  } finally {
    savingBilling.value = false
  }
}

async function removeBilling() {
  const { ok } = await ask({
    title: 'Remove their saved billing details?',
    message:
      'Tax invoices already issued keep what they say. The customer will be asked again at their next checkout.',
    confirmLabel: 'Remove',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await memberApi.clearBilling(id.value)
    billing.value = null
    editingBilling.value = false
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not remove that.'
  }
}

/* ---------------- presentation ---------------- */

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const DAY = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

function when(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '—'
}
function day(iso: string | null): string {
  return iso ? DAY.format(new Date(iso)) : '—'
}

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
  pending: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
  paid: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  failed: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400',
  refunded: 'bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-400',
}

/** Active, revoked by hand, or simply run out — three different answers. */
function accessLabel(row: MemberCourseAccess): { text: string; cls: string } {
  if (row.status === 'revoked') {
    return { text: 'Ended', cls: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400' }
  }
  if (row.expired) {
    return { text: 'Expired', cls: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400' }
  }
  return { text: 'Active', cls: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400' }
}

function progressPct(row: MemberCourseAccess): number {
  return row.lessonsTotal ? Math.round((row.lessonsDone / row.lessonsTotal) * 100) : 0
}

/** 0105536091238 → 0-1055-36091-23-8, which is how it is printed. */
function groupTaxId(value: string): string {
  if (value.length !== 13) return value
  return `${value[0]}-${value.slice(1, 5)}-${value.slice(5, 10)}-${value.slice(10, 12)}-${value[12]}`
}

const ESSAY_LABEL: Record<string, string> = {
  pending: 'Waiting to be marked',
  resubmitted: 'Rewritten, waiting again',
  revision: 'Sent back for a rewrite',
  passed: 'Passed',
}

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'

watch(id, async () => {
  courses.value = null
  learning.value = null
  payments.value = null
  billing.value = null
  billingLoaded.value = false
  await loadHeader()
  await loadTab(tab.value)
})

onMounted(async () => {
  await loadHeader()
  await loadTab(tab.value)
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb :page-title="fullName || 'Student'" />

    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <p v-if="loading" class="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">Loading…</p>

      <template v-else-if="person">
        <!-- Who, and the four numbers worth knowing before any tab is opened -->
        <div class="flex flex-wrap items-start justify-between gap-6 px-5 py-5 sm:px-6">
          <div class="flex items-center gap-4">
            <span
              class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg font-medium text-brand-500 dark:bg-brand-500/15"
            >
              {{ (person.firstName[0] ?? '?').toUpperCase() }}
            </span>
            <div>
              <h2 class="text-lg font-medium text-gray-800 dark:text-white/90">{{ fullName }}</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">{{ person.email }}</p>
              <p class="mt-1 flex flex-wrap items-center gap-2">
                <span
                  v-for="r in person.roles"
                  :key="r"
                  class="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/5 dark:text-gray-300"
                >
                  {{ r }}
                </span>
                <span
                  v-if="person.status === 'suspended'"
                  class="inline-flex rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-medium text-error-600 dark:bg-error-500/15 dark:text-error-400"
                >
                  Suspended
                </span>
              </p>
            </div>
          </div>

          <dl v-if="summary" class="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Courses now</dt>
              <dd class="text-lg font-medium text-gray-800 dark:text-white/90">
                {{ summary.activeCourses }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Paid orders</dt>
              <dd class="text-lg font-medium text-gray-800 dark:text-white/90">
                {{ summary.paidOrders }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Spent</dt>
              <dd class="text-lg font-medium text-gray-800 dark:text-white/90">
                {{ formatBaht(summary.lifetimeSpend) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Essays waiting</dt>
              <dd
                class="text-lg font-medium"
                :class="
                  summary.essaysWaiting
                    ? 'text-warning-600 dark:text-warning-400'
                    : 'text-gray-800 dark:text-white/90'
                "
              >
                {{ summary.essaysWaiting }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- Tabs -->
        <div class="border-b border-gray-100 px-5 dark:border-gray-800 sm:px-6">
          <!-- A real tablist: a screen reader announces it as one, and it is
               the only way to tell these apart from the sidebar's own nav. -->
          <nav
            class="-mb-px flex gap-6 overflow-x-auto"
            role="tablist"
            aria-label="Student details"
          >
            <button
              v-for="t in TABS"
              :key="t.key"
              type="button"
              role="tab"
              :aria-selected="tab === t.key"
              :data-tab="t.key"
              class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition"
              :class="
                tab === t.key
                  ? 'border-brand-500 text-brand-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              "
              @click="openTab(t.key)"
            >
              {{ t.label }}
            </button>
          </nav>
        </div>

        <p v-if="tabLoading" class="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">
          Loading…
        </p>

        <!-- 1. General -->
        <div v-else-if="tab === 'general'" class="px-5 py-5 sm:px-6">
          <dl class="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">First name</dt>
              <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">{{ person.firstName }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Last name</dt>
              <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">{{ person.lastName }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Email</dt>
              <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">
                {{ person.email }}
                <span
                  v-if="!person.emailVerifiedAt"
                  class="ml-1 text-xs text-warning-600 dark:text-warning-400"
                >
                  not verified
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Phone</dt>
              <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">{{ phone }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Date of birth</dt>
              <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">
                {{ day(person.birthdate) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Site language</dt>
              <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">{{ person.locale }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Joined</dt>
              <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">
                {{ when(person.createdAt) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Accepted the terms</dt>
              <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">
                {{ when(person.privacyAcceptedAt) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-gray-400">Last changed</dt>
              <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">
                {{ when(person.updatedAt) }}
              </dd>
            </div>
          </dl>

          <p class="mt-6 text-sm text-gray-500 dark:text-gray-400">
            Suspending an account, changing its roles or setting a password is done from
            <router-link to="/students" class="text-brand-500 hover:text-brand-600">
              the students list</router-link
            >.
          </p>
        </div>

        <!-- 2. Courses and access -->
        <div v-else-if="tab === 'courses'" class="overflow-x-auto">
          <table v-if="courses?.length" class="w-full min-w-[840px] text-left">
            <thead class="border-b border-gray-100 dark:border-gray-800">
              <tr class="text-xs uppercase tracking-wide text-gray-400">
                <th class="px-5 py-3 font-medium sm:px-6">Course</th>
                <th class="px-5 py-3 font-medium">Progress</th>
                <th class="px-5 py-3 font-medium">From</th>
                <th class="px-5 py-3 font-medium">Until</th>
                <th class="px-5 py-3 font-medium">State</th>
                <th v-if="canRevoke" class="px-5 py-3 font-medium sm:px-6"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="row in courses" :key="row.id">
                <td class="px-5 py-3.5 text-sm sm:px-6">
                  <router-link
                    :to="`/courses/${row.courseId}`"
                    class="text-gray-800 hover:text-brand-500 dark:text-white/90"
                  >
                    {{ row.title }}
                  </router-link>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">
                    Last opened {{ when(row.lastWatchedAt) }}
                  </span>
                </td>
                <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                  <div class="flex items-center gap-2">
                    <span class="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                      <span
                        class="block h-full rounded-full bg-brand-500"
                        :style="{ width: `${progressPct(row)}%` }"
                      ></span>
                    </span>
                    {{ row.lessonsDone }}/{{ row.lessonsTotal }}
                  </div>
                </td>
                <td class="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                  <router-link
                    v-if="row.orderNo"
                    :to="`/orders?q=${row.orderNo}`"
                    class="font-mono text-brand-500 hover:text-brand-600"
                  >
                    {{ row.orderNo }}
                  </router-link>
                  <span v-else>{{ row.source }}</span>
                  <span class="block">{{ day(row.grantedAt) }}</span>
                </td>
                <td class="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                  {{ row.expiresAt ? day(row.expiresAt) : 'Lifetime' }}
                </td>
                <td class="px-5 py-3.5">
                  <span
                    class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                    :class="accessLabel(row).cls"
                  >
                    {{ accessLabel(row).text }}
                  </span>
                </td>
                <td v-if="canRevoke" class="whitespace-nowrap px-5 py-3.5 text-right text-sm sm:px-6">
                  <!-- Handing back a few days is the ordinary support job and
                       the common one, so it reads first. -->
                  <button
                    type="button"
                    class="text-brand-500 hover:underline"
                    @click="editExpiry(row)"
                  >
                    Change expiry
                  </button>
                  <span class="px-2 text-gray-300 dark:text-gray-700">·</span>
                  <button
                    type="button"
                    class="hover:underline"
                    :class="row.status === 'revoked' ? 'text-brand-500' : 'text-error-500'"
                    @click="toggleAccess(row)"
                  >
                    {{ row.status === 'revoked' ? 'Restore' : 'End access' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">
            They have no courses. Access appears here as soon as an order is paid.
          </p>
        </div>

        <!-- 3. Learning -->
        <div v-else-if="tab === 'learning'" class="px-5 py-5 sm:px-6">
          <p v-if="learning?.lastSeen" class="mb-5 text-sm text-gray-500 dark:text-gray-400">
            Last seen in
            <span class="text-gray-800 dark:text-white/90">{{ learning.lastSeen.courseTitle }}</span>
            <template v-if="learning.lastSeen.lessonTitle">
              — {{ learning.lastSeen.lessonTitle }}</template
            >, {{ when(learning.lastSeen.lastWatchedAt) }}.
          </p>

          <h4 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Quiz attempts
          </h4>
          <div v-if="learning?.attempts.length" class="mb-8 overflow-x-auto">
            <table class="w-full min-w-[720px] text-left">
              <thead class="border-b border-gray-100 dark:border-gray-800">
                <tr class="text-xs uppercase tracking-wide text-gray-400">
                  <th class="py-2 pr-4 font-medium">Quiz</th>
                  <th class="py-2 pr-4 font-medium">Attempt</th>
                  <th class="py-2 pr-4 font-medium">Score</th>
                  <th class="py-2 pr-4 font-medium">Result</th>
                  <th class="py-2 font-medium">Finished</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr v-for="a in learning.attempts" :key="a.id">
                  <td class="py-2.5 pr-4 text-sm text-gray-800 dark:text-white/90">
                    {{ a.quizTitle }}
                    <span class="block text-xs text-gray-500 dark:text-gray-400">
                      {{ a.courseTitle ?? '—' }}
                    </span>
                  </td>
                  <td class="py-2.5 pr-4 text-sm text-gray-500 dark:text-gray-400">
                    #{{ a.attemptNo }}
                  </td>
                  <td class="py-2.5 pr-4 text-sm text-gray-800 dark:text-white/90">
                    {{ a.scorePct === null ? '—' : `${a.scorePct}%` }}
                  </td>
                  <td class="py-2.5 pr-4 text-sm">
                    <span v-if="!a.finished" class="text-gray-400">Not finished</span>
                    <span v-else-if="a.passed" class="text-success-600 dark:text-success-400">
                      Passed
                    </span>
                    <span v-else class="text-error-500">Failed</span>
                  </td>
                  <td class="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ when(a.submittedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="mb-8 text-sm text-gray-500 dark:text-gray-400">
            They have not taken a quiz.
          </p>

          <h4 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Essays</h4>
          <div v-if="learning?.essays.length" class="overflow-x-auto">
            <table class="w-full min-w-[720px] text-left">
              <thead class="border-b border-gray-100 dark:border-gray-800">
                <tr class="text-xs uppercase tracking-wide text-gray-400">
                  <th class="py-2 pr-4 font-medium">Question</th>
                  <th class="py-2 pr-4 font-medium">Version</th>
                  <th class="py-2 pr-4 font-medium">State</th>
                  <th class="py-2 font-medium">Handed in</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr v-for="e in learning.essays" :key="e.id">
                  <td class="max-w-md py-2.5 pr-4 text-sm text-gray-800 dark:text-white/90">
                    <span class="line-clamp-2">{{ e.prompt }}</span>
                    <span class="block text-xs text-gray-500 dark:text-gray-400">
                      {{ e.courseTitle ?? '—' }} · {{ e.quizTitle }}
                    </span>
                  </td>
                  <td class="py-2.5 pr-4 text-sm text-gray-500 dark:text-gray-400">
                    v{{ e.currentVersion }}
                  </td>
                  <td class="py-2.5 pr-4 text-sm text-gray-500 dark:text-gray-400">
                    {{ ESSAY_LABEL[e.status] ?? e.status }}
                  </td>
                  <td class="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ when(e.submittedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="text-sm text-gray-500 dark:text-gray-400">
            They have not handed in an essay.
          </p>
        </div>

        <!-- 4. Payments -->
        <div v-else-if="tab === 'payments'">
          <div class="overflow-x-auto">
            <table v-if="payments?.orders.length" class="w-full min-w-[880px] text-left">
              <thead class="border-b border-gray-100 dark:border-gray-800">
                <tr class="text-xs uppercase tracking-wide text-gray-400">
                  <th class="px-5 py-3 font-medium sm:px-6">Order</th>
                  <th class="px-5 py-3 font-medium">Bought</th>
                  <th class="px-5 py-3 font-medium">Total</th>
                  <th class="px-5 py-3 font-medium">Tax invoice</th>
                  <th class="px-5 py-3 font-medium">Status</th>
                  <th class="px-5 py-3 font-medium sm:px-6">Placed</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr v-for="o in payments.orders" :key="o.id">
                  <td class="px-5 py-3.5 sm:px-6">
                    <router-link
                      :to="`/orders?q=${o.orderNo}`"
                      class="font-mono text-sm text-brand-500 hover:text-brand-600"
                    >
                      {{ o.orderNo }}
                    </router-link>
                  </td>
                  <td class="max-w-xs px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                    <span class="line-clamp-2">{{ o.itemSummary ?? '—' }}</span>
                  </td>
                  <td
                    class="whitespace-nowrap px-5 py-3.5 text-sm font-medium text-gray-800 dark:text-white/90"
                  >
                    {{ formatBaht(o.total) }}
                  </td>
                  <td class="px-5 py-3.5 text-xs">
                    <router-link
                      v-if="o.invoiceDocumentNo"
                      :to="`/invoices?q=${o.invoiceDocumentNo}`"
                      class="font-mono text-brand-500 hover:text-brand-600"
                    >
                      {{ o.invoiceDocumentNo }}
                    </router-link>
                    <span v-else-if="o.invoiceId" class="text-warning-600 dark:text-warning-400">
                      Asked for, not issued
                    </span>
                    <span v-else class="text-gray-400">Receipt only</span>
                  </td>
                  <td class="px-5 py-3.5">
                    <span
                      class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                      :class="ORDER_STATUS_CLASS[o.status]"
                    >
                      {{ ORDER_STATUS_LABEL[o.status] }}
                    </span>
                  </td>
                  <td
                    class="whitespace-nowrap px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 sm:px-6"
                  >
                    {{ when(o.createdAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">
              They have never ordered anything.
            </p>
          </div>
          <p
            v-if="payments?.orders.length"
            class="border-t border-gray-100 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:px-6"
          >
            {{ formatBaht(payments.lifetimeSpend) }} taken in all, refunds excluded.
          </p>
        </div>

        <!-- 5. Billing address -->
        <div v-else-if="tab === 'billing'" class="px-5 py-5 sm:px-6">
          <p class="mb-5 text-sm text-gray-500 dark:text-gray-400">
            Their saved details for a full tax invoice, so they are not retyped at every checkout.
            Tax invoices already issued keep what they said at the time — changing this does not
            change them.
          </p>

          <!-- Reading -->
          <template v-if="!editingBilling">
            <dl v-if="billing" class="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <div>
                <dt class="text-xs uppercase tracking-wide text-gray-400">Issued to</dt>
                <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">
                  {{ billing.name }}
                  <span class="block text-xs text-gray-500 dark:text-gray-400">
                    {{ billing.type === 'corporate' ? 'A company' : 'A person' }}
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide text-gray-400">
                  {{ billing.type === 'corporate' ? 'Tax ID' : 'National ID' }}
                </dt>
                <dd class="mt-1 font-mono text-sm text-gray-800 dark:text-white/90">
                  {{ groupTaxId(billing.taxId) }}
                </dd>
              </div>
              <div v-if="billing.type === 'corporate'">
                <dt class="text-xs uppercase tracking-wide text-gray-400">Premises</dt>
                <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">
                  {{ billing.branchType === 'head' ? 'Head office' : 'Branch' }}
                  ({{ billing.branchCode }})
                </dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-xs uppercase tracking-wide text-gray-400">Address</dt>
                <dd class="mt-1 whitespace-pre-line text-sm text-gray-800 dark:text-white/90">
                  {{ billing.address }}
                </dd>
              </div>
            </dl>
            <p v-else class="text-sm text-gray-500 dark:text-gray-400">
              Nothing saved. They will be asked at checkout if they want a tax invoice.
            </p>

            <div class="mt-5 flex gap-3">
              <button
                type="button"
                class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
                @click="startBilling"
              >
                {{ billing ? 'Edit' : 'Add details' }}
              </button>
              <button
                v-if="billing"
                type="button"
                class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-error-500 transition hover:bg-error-50 dark:border-gray-700 dark:hover:bg-error-500/10"
                @click="removeBilling"
              >
                Remove
              </button>
            </div>
          </template>

          <!-- Editing -->
          <form v-else class="max-w-3xl" @submit.prevent="saveBilling">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label :class="labelClass">Issued to</label>
                <select v-model="billingForm.type" :class="inputClass" @change="onBillingTypeChange">
                  <option value="corporate">A company</option>
                  <option value="individual">A person</option>
                </select>
              </div>

              <div>
                <label :class="labelClass">
                  {{ billingForm.type === 'corporate' ? 'Registered company name' : 'Full name' }}
                  <span class="text-error-500">*</span>
                </label>
                <input v-model="billingForm.name" required maxlength="255" :class="inputClass" />
                <p v-if="billingErrors.name" class="mt-1 text-sm text-error-500">
                  {{ billingErrors.name }}
                </p>
              </div>

              <div>
                <label :class="labelClass">
                  {{ billingForm.type === 'corporate' ? '13-digit tax ID' : '13-digit national ID' }}
                  <span class="text-error-500">*</span>
                </label>
                <input
                  v-model="billingForm.taxId"
                  required
                  inputmode="numeric"
                  maxlength="20"
                  :class="`${inputClass} font-mono`"
                />
                <p v-if="billingErrors.taxId" class="mt-1 text-sm text-error-500">
                  {{ billingErrors.taxId }}
                </p>
              </div>

              <div v-if="billingForm.type === 'corporate'">
                <label :class="labelClass">Premises<span class="text-error-500">*</span></label>
                <div class="flex gap-3">
                  <select
                    v-model="billingForm.branchType"
                    :class="`${inputClass} flex-1`"
                    @change="onBranchTypeChange"
                  >
                    <option value="head">Head office</option>
                    <option value="branch">A branch</option>
                  </select>
                  <input
                    v-model="billingForm.branchCode"
                    :readonly="billingForm.branchType === 'head'"
                    inputmode="numeric"
                    maxlength="5"
                    placeholder="00001"
                    class="h-11 w-28 rounded-lg border border-gray-300 bg-transparent px-4 font-mono text-sm text-gray-800 read-only:bg-gray-100 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:read-only:bg-white/5"
                  />
                </div>
                <p v-if="billingErrors.branchCode" class="mt-1 text-sm text-error-500">
                  {{ billingErrors.branchCode }}
                </p>
                <p v-else-if="billingErrors.branchType" class="mt-1 text-sm text-error-500">
                  {{ billingErrors.branchType }}
                </p>
              </div>

              <div class="sm:col-span-2">
                <label :class="labelClass">Address<span class="text-error-500">*</span></label>
                <textarea
                  v-model="billingForm.address"
                  required
                  rows="3"
                  maxlength="1000"
                  class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                ></textarea>
                <p v-if="billingErrors.address" class="mt-1 text-sm text-error-500">
                  {{ billingErrors.address }}
                </p>
              </div>
            </div>

            <p v-if="billingError" role="alert" class="mt-3 text-sm text-error-500">
              {{ billingError }}
            </p>

            <div class="mt-4 flex gap-3">
              <button
                type="submit"
                :disabled="savingBilling"
                class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                {{ savingBilling ? 'Saving…' : 'Save' }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                @click="editingBilling = false"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </template>
    </div>

    <!-- Changing when a course runs out. -->
    <div v-if="expiryFor" class="fixed inset-0 z-50 grid place-items-center p-4">
      <div class="absolute inset-0 bg-gray-900/50" @click="expiryFor = null"></div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expiry-title"
        class="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900"
      >
        <h3 id="expiry-title" class="text-lg font-medium text-gray-800 dark:text-white/90">
          Change expiry
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {{ expiryFor.title }} — currently
          {{ expiryFor.expiresAt ? day(expiryFor.expiresAt) : 'lifetime' }}.
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="n in [7, 30, 90, 365]"
            :key="n"
            type="button"
            class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            @click="addDays(n)"
          >
            +{{ n }} days
          </button>
        </div>

        <label
          class="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300"
          for="expiry-date"
        >
          Runs out at the end of
        </label>
        <!-- A calendar rather than the browser's own box, which shows
             `mm/dd/yyyy` and reads as an American date to everyone here. The
             value underneath is still `YYYY-MM-DD`; only the display differs. -->
        <div class="relative mt-1">
          <flat-pickr
            id="expiry-date"
            v-model="expiryDate"
            :config="EXPIRY_PICKER"
            :disabled="expiryLifetime"
            placeholder="Pick a date"
            class="h-11 w-full appearance-none rounded-lg border border-gray-200 bg-transparent px-3 pr-10 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden disabled:opacity-50 dark:border-gray-700 dark:text-white/90"
          />
          <span
            class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M8 3v4M16 3v4M3 11h18" />
            </svg>
          </span>
        </div>

        <label class="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input v-model="expiryLifetime" type="checkbox" class="h-4 w-4 rounded" />
          Never runs out
        </label>

        <p class="mt-3 text-xs text-gray-400">
          Recorded in the audit log with the date it had before.
        </p>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
            @click="expiryFor = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            :disabled="savingExpiry || (!expiryLifetime && !expiryDate)"
            @click="saveExpiry"
          >
            {{ savingExpiry ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </admin-layout>
</template>
