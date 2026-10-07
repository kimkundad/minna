<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import {
  ApiError,
  api,
  people,
  type ApplicationStatus,
  type Category,
  type TeacherApplication,
} from '@/lib/api'

/**
 * The queue of people asking to teach.
 *
 * Approving grants the teacher role to the account that applied and sends them
 * word. The subject they typed is free text, so the decision is also where it
 * gets mapped onto a real category — the applicant did not know our category
 * tree and should not have had to guess at it.
 */
const rows = ref<TeacherApplication[]>([])
const total = ref(0)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')

const page = ref(1)
const q = ref('')
// A queue opens on what is waiting, not on everything ever decided.
const status = ref<ApplicationStatus | ''>('pending')

const categories = ref<Category[]>([])

/** The application open for a decision, read in full. */
const open = ref<TeacherApplication | null>(null)
const decisionCategory = ref<number | ''>('')
const note = ref('')
const deciding = ref(false)

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  pending: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
  approved: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  rejected: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await people.applications({
      page: page.value,
      perPage: 20,
      ...(q.value ? { q: q.value } : {}),
      ...(status.value ? { status: status.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load applications.'
  } finally {
    loading.value = false
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
watch(status, () => {
  page.value = 1
  void load()
})
watch(page, load)

async function openOne(row: TeacherApplication) {
  error.value = ''
  note.value = ''
  try {
    const full = (await people.application(row.id)).data
    open.value = full
    decisionCategory.value = full.categoryId ?? ''
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not read that application.'
  }
}

async function decide(decision: 'approved' | 'rejected') {
  if (!open.value) return
  const who = open.value.email
  const confirmText =
    decision === 'approved'
      ? `Approve ${who}? Their account gets the teacher role and they are emailed.`
      : `Reject ${who}?`
  if (!window.confirm(confirmText)) return

  deciding.value = true
  error.value = ''
  try {
    const res = await people.decide(open.value.id, {
      decision,
      ...(decisionCategory.value ? { categoryId: Number(decisionCategory.value) } : {}),
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    })
    // Worth saying out loud: an approval with no matching account grants
    // nothing, and the operator should not assume it did.
    if (decision === 'approved' && !res.granted) {
      error.value =
        'Approved, but no account matched that email address, so no teacher role was granted.'
    }
    open.value = null
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not record that decision.'
  } finally {
    deciding.value = false
  }
}

const pageLabel = computed(() => `Page ${page.value} of ${totalPages.value}`)
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—')

onMounted(async () => {
  try {
    categories.value = (await api.categories()).data
  } catch {
    // The mapping select stays empty; a decision can still be made without it.
  }
  await load()
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Teacher applications" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ total }} application{{ total === 1 ? '' : 's' }}
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Approving grants the teacher role and emails the applicant.
        </p>
      </div>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-2 sm:px-6"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Search name, email or subject"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <select
          v-model="status"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="pending">Waiting</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 my-4 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <!-- One application, in full, with the decision attached. -->
      <div
        v-if="open"
        class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
      >
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 class="text-base font-medium text-gray-800 dark:text-white/90">{{ open.name }}</h4>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ open.email }}<span v-if="open.phone"> · {{ open.phone }}</span>
            </p>
          </div>
          <button type="button" class="text-sm text-gray-500" @click="open = null">Close</button>
        </div>

        <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt class="text-xs uppercase tracking-wide text-gray-400">Wants to teach</dt>
            <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">{{ open.subject || '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-gray-400">Best time to reach them</dt>
            <dd class="mt-1 text-sm text-gray-800 dark:text-white/90">
              {{ open.contactTime || '—' }}
            </dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-xs uppercase tracking-wide text-gray-400">Experience</dt>
            <dd class="mt-1 whitespace-pre-line text-sm text-gray-800 dark:text-white/90">
              {{ open.experience || '—' }}
            </dd>
          </div>
          <div v-if="open.reason" class="sm:col-span-2">
            <dt class="text-xs uppercase tracking-wide text-gray-400">Why us</dt>
            <dd class="mt-1 whitespace-pre-line text-sm text-gray-800 dark:text-white/90">
              {{ open.reason }}
            </dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-xs uppercase tracking-wide text-gray-400">Account</dt>
            <dd class="mt-1 text-sm">
              <span v-if="open.account" class="text-gray-800 dark:text-white/90">
                {{ open.account.email }} ({{ open.account.status }})
              </span>
              <span v-else class="text-warning-600 dark:text-warning-400">
                No account matches this address — approving will not grant anything.
              </span>
            </dd>
          </div>
        </dl>

        <template v-if="open.status === 'pending'">
          <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                File under category
              </label>
              <select
                v-model="decisionCategory"
                class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="">— not decided —</option>
                <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Note for the record
              </label>
              <input
                v-model="note"
                maxlength="500"
                placeholder="Why this decision"
                class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>

          <div class="mt-5 flex gap-3">
            <button
              type="button"
              :disabled="deciding"
              class="rounded-lg bg-success-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-success-600 disabled:opacity-60"
              @click="decide('approved')"
            >
              Approve
            </button>
            <button
              type="button"
              :disabled="deciding"
              class="rounded-lg border border-error-500 px-4 py-2.5 text-sm font-medium text-error-500 transition hover:bg-error-50 disabled:opacity-60 dark:hover:bg-error-500/10"
              @click="decide('rejected')"
            >
              Reject
            </button>
          </div>
        </template>
        <p v-else class="mt-5 text-sm text-gray-500 dark:text-gray-400">
          Already {{ open.status }} on {{ when(open.approvedAt) }}.
        </p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[820px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Applicant</th>
              <th class="px-5 py-3 font-medium">Wants to teach</th>
              <th class="px-5 py-3 font-medium">Category</th>
              <th class="px-5 py-3 font-medium">Applied</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium sm:px-6"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="6" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="6" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Nothing here.
              </td>
            </tr>
            <tr v-for="a in rows" :key="a.id" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <td class="px-5 py-3.5 sm:px-6">
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">{{ a.name }}</p>
                <p class="mt-0.5 text-xs text-gray-400">{{ a.email }}</p>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                {{ a.subject || '—' }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ a.categoryName ?? '—' }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ when(a.createdAt) }}
              </td>
              <td class="px-5 py-3.5">
                <span
                  class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize"
                  :class="STATUS_STYLE[a.status]"
                >
                  {{ a.status }}
                </span>
              </td>
              <td class="px-5 py-3.5 text-right text-sm sm:px-6">
                <button type="button" class="text-brand-500 hover:text-brand-600" @click="openOne(a)">
                  {{ a.status === 'pending' ? 'Review' : 'View' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="totalPages > 1"
        class="flex items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6"
      >
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ pageLabel }}</p>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="page <= 1"
            class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
            @click="page -= 1"
          >
            Previous
          </button>
          <button
            type="button"
            :disabled="page >= totalPages"
            class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
            @click="page += 1"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </admin-layout>
</template>
