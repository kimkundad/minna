<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import {
  ApiError,
  api,
  type Category,
  type CourseRow,
  type CourseStatus,
} from '@/lib/api'
import { formatBaht, formatDuration } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'

/**
 * The course list.
 *
 * Paged on the server. A catalog grows without limit and the day it has four
 * hundred courses is not the day to discover the page loads all of them.
 *
 * A teacher sees only the courses they are on — the API decides that from the
 * token, not from anything sent here.
 */
const auth = useAuthStore()

const rows = ref<CourseRow[]>([])
const total = ref(0)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')

const page = ref(1)
const q = ref('')
const status = ref<CourseStatus | ''>('')
const categoryId = ref<number | ''>('')
const sort = ref<'newest' | 'title' | 'price' | 'popularity'>('newest')

const categories = ref<Category[]>([])

const STATUS_STYLE: Record<CourseStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
  pending: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
  approved: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  rejected: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400',
  ended: 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.courses({
      page: page.value,
      perPage: 20,
      sort: sort.value,
      ...(q.value ? { q: q.value } : {}),
      ...(status.value ? { status: status.value } : {}),
      ...(categoryId.value ? { categoryId: Number(categoryId.value) } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load courses.'
  } finally {
    loading.value = false
  }
}

/** Typing shouldn't fire a request per keystroke. */
let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})

watch([status, categoryId, sort], () => {
  page.value = 1
  void load()
})

watch(page, load)

const pageLabel = computed(() => `Page ${page.value} of ${totalPages.value}`)

onMounted(async () => {
  try {
    categories.value = (await api.categories()).data
  } catch {
    // The filter stays empty; the list still works without it.
  }
  await load()
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Courses" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ total }} course{{ total === 1 ? '' : 's' }}
          </h3>
          <p v-if="!auth.isAdmin" class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Courses you teach.
          </p>
        </div>
        <RouterLink
          to="/courses/new"
          class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
        >
          Add course
        </RouterLink>
      </div>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-2 sm:px-6 xl:grid-cols-4"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Search title or slug"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <select
          v-model="status"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="ended">Ended</option>
        </select>
        <select
          v-model="categoryId"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any category</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select
          v-model="sort"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="newest">Newest first</option>
          <option value="title">Title A–Z</option>
          <option value="price">Price, low to high</option>
          <option value="popularity">Most popular</option>
        </select>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 my-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[880px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Course</th>
              <th class="px-5 py-3 font-medium">Category</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium">Price</th>
              <th class="px-5 py-3 font-medium">Length</th>
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
                No courses match.
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
            >
              <td class="px-5 py-3.5 sm:px-6">
                <RouterLink
                  :to="`/courses/${row.id}`"
                  class="text-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90"
                >
                  {{ row.title }}
                </RouterLink>
                <p class="mt-0.5 font-mono text-xs text-gray-400">{{ row.slug }}</p>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ row.categoryName ?? '—' }}
              </td>
              <td class="px-5 py-3.5">
                <span
                  class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize"
                  :class="STATUS_STYLE[row.status]"
                >
                  {{ row.status }}
                </span>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90">
                {{ formatBaht(row.price) }}
                <span
                  v-if="row.normalPrice"
                  class="ml-1 text-xs text-gray-400 line-through"
                >{{ formatBaht(row.normalPrice) }}</span>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ formatDuration(row.durationSeconds) }}
              </td>
              <td class="px-5 py-3.5 text-right text-sm sm:px-6">
                <RouterLink :to="`/courses/${row.id}`" class="text-brand-500 hover:text-brand-600">
                  Edit
                </RouterLink>
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
