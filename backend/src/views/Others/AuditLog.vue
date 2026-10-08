<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { ApiError, audit as auditApi, type AuditFilters, type AuditRow } from '@/lib/api'
import { formatBaht } from '@/lib/money'

/**
 * The audit log.
 *
 * Read-only, and there is no endpoint that would let this screen be anything
 * else. A log an operator can edit is not evidence of anything, and the people
 * most likely to want a row gone are the ones it is about.
 *
 * The hard part is not listing rows, it is making them legible. An entry reads
 * `coupon.updated` with a JSON blob of changes; what somebody needs is "Minna
 * changed SUMMER26: 10% → 15%". That translation is most of this file.
 */
const rows = ref<AuditRow[]>([])
const filters = ref<AuditFilters | null>(null)
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const PER_PAGE = 30

const q = ref('')

/**
 * Sign-ins are hidden by default.
 *
 * They are more than half the rows and all of them say the same thing. The log
 * is opened to find out who changed something, and a page of "signed in"
 * between every real entry is how a log stops being read. They are one choice
 * away when somebody is actually investigating an account.
 */
const group = ref('-auth')
const actorId = ref<number | ''>('')
const since = ref('')

/**
 * Actions grouped by what they are about, because nobody thinks in
 * `coupon.created` — they think "show me the coupon changes".
 */
const GROUPS: { key: string; label: string; prefixes: string[] }[] = [
  { key: 'money', label: 'Money', prefixes: ['order.', 'invoice.', 'coupon.'] },
  { key: 'catalog', label: 'Courses', prefixes: ['course.', 'module.', 'lesson.', 'category.', 'quiz.'] },
  { key: 'people', label: 'People', prefixes: ['member.', 'application.', 'entitlement.'] },
  { key: 'access', label: 'Sign-ins', prefixes: ['auth.'] },
  { key: 'settings', label: 'Settings', prefixes: ['settings.', 'upload.'] },
]

/**
 * The group, as prefixes for the API.
 *
 * Actions are named `thing.verb`, so a group is a list of prefixes rather than
 * a list of action names — which keeps the query string short and means a new
 * action joins its group without anything being changed here.
 */
const groupParams = computed<{ prefix?: string; notPrefix?: string }>(() => {
  if (!group.value) return {}
  if (group.value === '-auth') return { notPrefix: 'auth.' }
  const g = GROUPS.find((x) => x.key === group.value)
  return g ? { prefix: g.prefixes.join(',') } : {}
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await auditApi.list({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...groupParams.value,
      ...(actorId.value ? { actorId: Number(actorId.value) } : {}),
      ...(since.value ? { since: new Date(since.value).toISOString() } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the log.'
  } finally {
    loading.value = false
  }
}

async function loadFilters() {
  try {
    filters.value = (await auditApi.filters()).data
  } catch {
    // The dropdowns fall back to empty; the list still works.
  }
}

/* ---------------- making a row readable ---------------- */

/**
 * The action as a sentence fragment, with its subject.
 *
 * Driven by a table rather than by splitting on the dot, because "member.
 * password_set" is "set a password for" and no amount of string handling gets
 * there.
 */
const VERBS: Record<string, string> = {
  'auth.registered': 'registered',
  'auth.signed_in': 'signed in',
  'auth.signed_out': 'signed out',
  'category.created': 'created the category',
  'category.updated': 'edited the category',
  'category.deleted': 'deleted the category',
  'course.created': 'created the course',
  'course.updated': 'edited the course',
  'course.deleted': 'deleted the course',
  'module.created': 'added the module',
  'module.updated': 'edited the module',
  'module.deleted': 'deleted the module',
  'lesson.created': 'added the lesson',
  'lesson.updated': 'edited the lesson',
  'lesson.deleted': 'deleted the lesson',
  'quiz.saved': 'saved the quiz',
  'quiz.deleted': 'deleted the quiz',
  'quiz.question_added': 'added a question to',
  'quiz.question_updated': 'edited a question in',
  'quiz.question_deleted': 'deleted a question from',
  'quiz.reordered': 'reordered the questions in',
  'coupon.created': 'created the coupon',
  'coupon.updated': 'edited the coupon',
  'coupon.deleted': 'deleted the coupon',
  'order.created': 'started the order',
  'order.paid': 'paid for',
  'order.failed': 'could not pay for',
  'order.refunded': 'refunded',
  'invoice.issued': 'issued the tax invoice',
  'invoice.amended': 'corrected the tax invoice for',
  'member.created': 'created the account',
  'member.roles_changed': 'changed the roles of',
  'member.password_set': 'set the password for',
  'member.password_reset_sent': 'sent a password reset to',
  'member.status_changed': 'changed the status of',
  'member.billing_added': 'saved billing details for',
  'member.billing_updated': 'edited billing details for',
  'member.billing_removed': 'removed billing details for',
  'entitlement.revoked': 'ended access to',
  'entitlement.restored': 'restored access to',
  'application.approved': 'approved the teacher application from',
  'application.rejected': 'turned down the teacher application from',
  'settings.updated': 'changed the settings',
  'upload.ticket_issued': 'uploaded a file for',
}

function verb(action: string): string {
  return VERBS[action] ?? action.replace(/[._]/g, ' ')
}

/** Red for anything that destroys or moves money. */
const LOUD = /\.(deleted|refunded|revoked|rejected|password_set|removed)$/

function actionClass(action: string): string {
  if (LOUD.test(action)) return 'text-error-500'
  if (action.startsWith('auth.')) return 'text-gray-400'
  return 'text-gray-600 dark:text-gray-300'
}

/**
 * A changed value, printed the way a person would say it.
 *
 * Money is the one that matters: these are stored in satang, so a price change
 * shows as 169000 → 99000 unless something converts it.
 */
const MONEY_KEYS = /(price|amount|discount|subtotal|total|vat|minSubtotal|maxDiscount)/i

function valueOf(key: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  if (typeof raw === 'boolean') return raw ? 'yes' : 'no'
  if (typeof raw === 'number' && MONEY_KEYS.test(key)) return formatBaht(raw)
  if (Array.isArray(raw)) return raw.length ? raw.join(', ') : '—'
  if (typeof raw === 'object') return JSON.stringify(raw)
  const text = String(raw)
  // Dates arrive as ISO strings and read terribly in a diff.
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return DATE.format(new Date(text))
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

function fieldLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
function when(iso: string): string {
  return DATE.format(new Date(iso))
}

const ROLE_CLASS: Record<string, string> = {
  superadmin: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  admin: 'bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-400',
  teacher: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  student: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300',
  system: 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400',
}

/** Where the thing an entry is about lives, when there is a screen for it. */
function subjectLink(row: AuditRow): string | null {
  if (!row.subjectId) return null
  switch (row.subjectType) {
    case 'course':
      return `/courses/${row.subjectId}`
    case 'user':
      return `/students/${row.subjectId}`
    case 'order':
      return row.summary ? `/orders?q=${row.summary.split(' ')[0]}` : '/orders'
    case 'coupon':
      return row.summary ? `/coupons?q=${row.summary.split(' ')[0]}` : '/coupons'
    case 'invoice':
      return '/invoices'
    default:
      return null
  }
}

const expanded = ref<number | null>(null)

let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
watch([group, actorId, since], () => {
  page.value = 1
  void load()
})
watch(page, load)

onMounted(async () => {
  await loadFilters()
  await load()
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Audit log" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ total }} entries
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Who did what, and what it changed. Nothing here can be edited or deleted.
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
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-2 sm:px-6 xl:grid-cols-4"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Search what happened, or who"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <select
          v-model="group"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="-auth">Changes only</option>
          <option value="">Everything, sign-ins included</option>
          <option v-for="g in GROUPS" :key="g.key" :value="g.key">{{ g.label }}</option>
        </select>
        <select
          v-model="actorId"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Anyone</option>
          <option v-for="a in filters?.actors ?? []" :key="a.id ?? 0" :value="a.id ?? 0">
            {{ a.email ?? 'unknown' }} ({{ a.count }})
          </option>
        </select>
        <input
          v-model="since"
          type="datetime-local"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>

      <ul class="divide-y divide-gray-100 dark:divide-gray-800">
        <li v-if="loading" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
          Loading…
        </li>
        <li v-else-if="!rows.length" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
          Nothing matches.
        </li>
        <li
          v-for="row in rows"
          :key="row.id"
          class="px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-white/[0.02] sm:px-6"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <!-- The sentence. Who, what, to what. -->
              <p class="text-sm">
                <span class="font-medium text-gray-800 dark:text-white/90">
                  {{ row.actorEmail ?? 'The system' }}
                </span>
                <span
                  class="mx-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="ROLE_CLASS[row.actorRole] ?? ROLE_CLASS.system"
                >
                  {{ row.actorRole }}
                </span>
                <span :class="actionClass(row.action)">{{ verb(row.action) }}</span>
                <router-link
                  v-if="row.summary && subjectLink(row)"
                  :to="subjectLink(row)!"
                  class="ml-1 text-brand-500 hover:text-brand-600"
                >
                  {{ row.summary }}
                </router-link>
                <span v-else-if="row.summary" class="ml-1 text-gray-700 dark:text-gray-300">
                  {{ row.summary }}
                </span>
              </p>

              <!-- What changed, spelled out rather than as JSON -->
              <ul v-if="row.changes" class="mt-1.5 space-y-0.5">
                <li
                  v-for="(pair, key) in row.changes"
                  :key="key"
                  class="text-xs text-gray-500 dark:text-gray-400"
                >
                  <span class="text-gray-400">{{ fieldLabel(key) }}:</span>
                  <span class="line-through decoration-gray-300">{{ valueOf(key, pair[0]) }}</span>
                  <span class="mx-1">→</span>
                  <span class="text-gray-700 dark:text-gray-200">{{ valueOf(key, pair[1]) }}</span>
                </li>
              </ul>
            </div>

            <div class="shrink-0 text-right">
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ when(row.createdAt) }}</p>
              <button
                type="button"
                class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                @click="expanded = expanded === row.id ? null : row.id"
              >
                {{ expanded === row.id ? 'less' : 'more' }}
              </button>
            </div>
          </div>

          <!-- The forensic detail, hidden until asked for: it is only wanted
               when somebody is working out whether an account was misused. -->
          <dl
            v-if="expanded === row.id"
            class="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg bg-gray-50 px-4 py-3 text-xs dark:bg-white/[0.02] sm:grid-cols-2"
          >
            <div class="flex gap-2">
              <dt class="text-gray-400">Action</dt>
              <dd class="font-mono text-gray-700 dark:text-gray-300">{{ row.action }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="text-gray-400">Subject</dt>
              <dd class="font-mono text-gray-700 dark:text-gray-300">
                {{ row.subjectType ?? '—' }}{{ row.subjectId ? ` #${row.subjectId}` : '' }}
              </dd>
            </div>
            <div class="flex gap-2">
              <dt class="text-gray-400">From</dt>
              <dd class="font-mono text-gray-700 dark:text-gray-300">{{ row.ip ?? '—' }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="shrink-0 text-gray-400">Browser</dt>
              <dd class="truncate text-gray-700 dark:text-gray-300" :title="row.userAgent ?? ''">
                {{ row.userAgent ?? '—' }}
              </dd>
            </div>
          </dl>
        </li>
      </ul>

      <TablePager
        v-model:page="page"
        :total-pages="totalPages"
        :total="total"
        :per-page="PER_PAGE"
        noun="entries"
      />
    </div>
  </admin-layout>
</template>
