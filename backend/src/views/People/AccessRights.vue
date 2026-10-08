<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { ApiError, access, type AccessByCourse, type AccessRow } from '@/lib/api'

/**
 * Who can open what.
 *
 * The other direction from the student page, which answers "what can this
 * person open". This one answers "who can open this course" — the question
 * asked before a course changes, or when somebody wants to know how many people
 * a decision would affect.
 *
 * Read-only. Ending somebody's access is done from their own page, where the
 * rest of their history is visible and the decision can be made with it in
 * front of you rather than from a list of three hundred rows.
 */
const rows = ref<AccessRow[]>([])
const courses = ref<AccessByCourse[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const PER_PAGE = 30

const q = ref('')
const courseId = ref<number | ''>('')
const status = ref<'' | 'active' | 'revoked' | 'expired'>('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await access.list({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...(courseId.value ? { courseId: Number(courseId.value) } : {}),
      ...(status.value ? { status: status.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the list.'
  } finally {
    loading.value = false
  }
}

async function loadCourses() {
  try {
    courses.value = (await access.byCourse()).data
  } catch {
    courses.value = []
  }
}

function stateOf(row: AccessRow): { text: string; cls: string } {
  if (row.status === 'revoked') {
    return { text: 'Ended', cls: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400' }
  }
  if (row.expired) {
    return { text: 'Expired', cls: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400' }
  }
  return {
    text: 'Active',
    cls: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  }
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
function day(iso: string | null): string {
  return iso ? DAY.format(new Date(iso)) : '—'
}

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'

let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
watch([courseId, status], () => {
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
    <PageBreadcrumb page-title="Access rights" />

    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>

    <!-- How many people each course reaches, which is the thing most often
         wanted before anything is filtered. -->
    <div v-if="courses.length" class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <button
        v-for="c in courses"
        :key="c.courseId"
        type="button"
        class="rounded-2xl border p-5 text-left transition hover:shadow-sm"
        :class="
          courseId === c.courseId
            ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10'
            : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'
        "
        @click="courseId = courseId === c.courseId ? '' : c.courseId"
      >
        <p class="line-clamp-1 text-sm text-gray-600 dark:text-gray-300">{{ c.title }}</p>
        <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{{ c.active }}</p>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          can open it now<template v-if="c.expired"> · {{ c.expired }} expired</template>
          <template v-if="c.revoked"> · {{ c.revoked }} ended</template>
        </p>
      </button>
    </div>

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ total }} access records
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Read-only. Ending somebody's access is done from their own page, with the rest of their
          history in front of you.
        </p>
      </div>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-3 sm:px-6"
      >
        <input v-model="q" type="search" placeholder="Search name or email" :class="inputClass" />
        <select v-model="courseId" :class="inputClass">
          <option value="">Any course</option>
          <option v-for="c in courses" :key="c.courseId" :value="c.courseId">{{ c.title }}</option>
        </select>
        <select v-model="status" :class="inputClass">
          <option value="">Any state</option>
          <option value="active">Can open it now</option>
          <option value="expired">Expired</option>
          <option value="revoked">Ended by hand</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[880px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Who</th>
              <th class="px-5 py-3 font-medium">Course</th>
              <th class="px-5 py-3 font-medium">From</th>
              <th class="px-5 py-3 font-medium">Until</th>
              <th class="px-5 py-3 font-medium sm:px-6">State</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="5" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="5" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Nobody has access to anything yet.
              </td>
            </tr>
            <tr v-for="row in rows" :key="row.id" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <td class="px-5 py-3.5 sm:px-6">
                <router-link
                  :to="`/students/${row.userId}?tab=courses`"
                  class="text-sm text-gray-800 hover:text-brand-500 dark:text-white/90"
                >
                  {{ row.firstName }} {{ row.lastName }}
                </router-link>
                <span class="block text-xs text-gray-500 dark:text-gray-400">{{ row.email }}</span>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ row.courseTitle }}
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
              <td class="px-5 py-3.5 sm:px-6">
                <span
                  class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                  :class="stateOf(row).cls"
                >
                  {{ stateOf(row).text }}
                </span>
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
        noun="records"
      />
    </div>
  </admin-layout>
</template>
