<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { ApiError, quizzes, type QuizOverviewRow } from '@/lib/api'

/**
 * Every course and the state of its test.
 *
 * It lists courses rather than quizzes, because the rows worth seeing are the
 * ones with no quiz at all — a list of quizzes could not show them, and
 * "which courses still need a test" is why anyone opens this.
 */
const rows = ref<QuizOverviewRow[]>([])
const total = ref(0)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')

const page = ref(1)
const q = ref('')
const has = ref<'' | 'with' | 'without'>('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await quizzes.list({
      page: page.value,
      perPage: 20,
      ...(q.value ? { q: q.value } : {}),
      ...(has.value ? { has: has.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the quizzes.'
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
watch(has, () => {
  page.value = 1
  void load()
})
watch(page, load)

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Quizzes" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ total }} course{{ total === 1 ? '' : 's' }}
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          A course has one test. Courses without one are listed too — those are the ones worth
          seeing.
        </p>
      </div>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-2 sm:px-6"
      >
        <input v-model="q" type="search" placeholder="Search course" :class="inputClass" />
        <select v-model="has" :class="inputClass">
          <option value="">Every course</option>
          <option value="without">Still needs a test</option>
          <option value="with">Has a test</option>
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
        <table class="w-full min-w-[780px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Course</th>
              <th class="px-5 py-3 font-medium">Test</th>
              <th class="px-5 py-3 font-medium">Questions</th>
              <th class="px-5 py-3 font-medium">Pass mark</th>
              <th class="px-5 py-3 font-medium sm:px-6"></th>
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
                No courses match.
              </td>
            </tr>
            <tr
              v-for="r in rows"
              :key="r.courseId"
              class="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
            >
              <td class="px-5 py-3.5 sm:px-6">
                <RouterLink
                  :to="'/courses/' + r.courseId"
                  class="text-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90"
                >
                  {{ r.courseTitle }}
                </RouterLink>
                <p class="mt-0.5 text-xs capitalize text-gray-400">{{ r.courseStatus }}</p>
              </td>
              <td class="px-5 py-3.5 text-sm">
                <span v-if="r.quizId" class="text-gray-700 dark:text-gray-300">{{ r.title }}</span>
                <span v-else class="text-warning-600 dark:text-warning-400">None yet</span>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                <template v-if="r.quizId">
                  {{ r.questionCount }}
                  <span v-if="r.essayCount" class="text-xs">
                    · {{ r.essayCount }} marked by a person
                  </span>
                </template>
                <span v-else>—</span>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ r.quizId ? r.passPct + '%' : '—' }}
              </td>
              <td class="px-5 py-3.5 text-right text-sm sm:px-6">
                <RouterLink
                  :to="'/courses/' + r.courseId + '/quiz'"
                  class="text-brand-500 hover:text-brand-600"
                >
                  {{ r.quizId ? 'Edit test' : 'Add a test' }}
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <TablePager
        v-model:page="page"
        :total-pages="totalPages"
        :total="total"
        :per-page="20"
        noun="courses"
      />
    </div>
  </admin-layout>
</template>
