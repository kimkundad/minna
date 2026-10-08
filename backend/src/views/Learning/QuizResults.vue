<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { ApiError, quizResults, type QuizResultDetail, type QuizResultRow } from '@/lib/api'

/**
 * How the quizzes are going.
 *
 * The figure that earns this screen is the wrong-answer rate per question. A
 * question everybody fails is usually a question that is badly worded, not a
 * class that cannot answer it — and nothing else in the system would ever point
 * that out.
 *
 * Only finished attempts are counted. One abandoned halfway has no score, and
 * counting it would drag every average down for a reason that is not about the
 * teaching.
 */
const rows = ref<QuizResultRow[]>([])
const loading = ref(true)
const error = ref('')

const open = ref<QuizResultDetail | null>(null)
const openLoading = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = (await quizResults.list()).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the results.'
  } finally {
    loading.value = false
  }
}

async function show(row: QuizResultRow) {
  openLoading.value = true
  open.value = null
  try {
    open.value = (await quizResults.get(row.quizId)).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load that quiz.'
  } finally {
    openLoading.value = false
  }
}

function passRate(row: QuizResultRow): number | null {
  return row.people ? Math.round((row.passed / row.people) * 100) : null
}

/** Red above half wrong, amber above a third: the thresholds at which a
 *  question is worth rereading rather than a class worth retraining. */
function wrongClass(pct: number | null): string {
  if (pct === null) return 'text-gray-400'
  if (pct >= 50) return 'text-error-500 font-medium'
  if (pct >= 33) return 'text-warning-600 dark:text-warning-400'
  return 'text-gray-500 dark:text-gray-400'
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

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Quiz results" />

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
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ rows.length }} quizzes
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Finished attempts only. Open one to see which questions are being failed.
        </p>
      </div>

      <div class="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
        <table class="w-full min-w-[860px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Quiz</th>
              <th class="px-5 py-3 font-medium">Took it</th>
              <th class="px-5 py-3 font-medium">Attempts</th>
              <th class="px-5 py-3 font-medium">Average</th>
              <th class="px-5 py-3 font-medium">Passed</th>
              <th class="px-5 py-3 font-medium sm:px-6">Last one</th>
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
                No quizzes yet.
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.quizId"
              class="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              @click="show(row)"
            >
              <td class="px-5 py-3.5 sm:px-6">
                <p class="text-sm text-gray-800 dark:text-white/90">{{ row.title }}</p>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {{ row.courseTitle ?? '—' }} · pass at {{ row.passPct }}%
                </p>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90">{{ row.people }}</td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ row.attempts }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90">
                {{ row.averageScore === null ? '—' : `${row.averageScore}%` }}
              </td>
              <td class="px-5 py-3.5 text-sm">
                <span v-if="passRate(row) === null" class="text-gray-400">—</span>
                <span
                  v-else
                  :class="
                    passRate(row)! >= 60
                      ? 'text-success-600 dark:text-success-400'
                      : 'text-warning-600 dark:text-warning-400'
                  "
                >
                  {{ row.passed }} of {{ row.people }} ({{ passRate(row) }}%)
                </span>
              </td>
              <td class="whitespace-nowrap px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 sm:px-6">
                {{ when(row.lastAttemptAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
              {{ open.quiz.title }}
            </h3>
            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {{ open.summary.people }} people · {{ open.summary.attempts }} attempts ·
              average {{ open.summary.averageScore ?? '—' }}%
            </p>
          </div>
          <div class="flex items-center gap-3">
            <router-link
              v-if="open.quiz.courseId"
              :to="`/courses/${open.quiz.courseId}/quiz`"
              class="text-sm text-brand-500 hover:text-brand-600"
            >
              Edit the quiz
            </router-link>
            <button
              type="button"
              class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="open = null"
            >
              Close
            </button>
          </div>
        </div>

        <!-- The point of the screen -->
        <div class="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
          <table class="w-full min-w-[720px] text-left">
            <thead class="border-b border-gray-100 dark:border-gray-800">
              <tr class="text-xs uppercase tracking-wide text-gray-400">
                <th class="px-5 py-3 font-medium sm:px-6">Question</th>
                <th class="px-5 py-3 font-medium">Answered</th>
                <th class="px-5 py-3 font-medium sm:px-6">Got it wrong</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="q in open.questions" :key="q.id">
                <td class="max-w-xl px-5 py-3.5 text-sm text-gray-800 dark:text-white/90 sm:px-6">
                  <span class="line-clamp-2">{{ q.text }}</span>
                  <span class="block text-xs text-gray-400">{{ q.type }}</span>
                </td>
                <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                  {{ q.answered }}
                </td>
                <td class="px-5 py-3.5 text-sm sm:px-6">
                  <span v-if="q.wrongPct === null" class="text-gray-400">nobody reached it</span>
                  <span v-else :class="wrongClass(q.wrongPct)">
                    {{ q.wrong }} of {{ q.answered }} ({{ q.wrongPct }}%)
                    <span v-if="q.wrongPct >= 50" class="ml-1 text-xs font-normal">
                      — worth rereading the wording
                    </span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="border-t border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h4 class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Who took it
          </h4>
          <div v-if="open.attempts.length" class="overflow-x-auto">
            <table class="w-full min-w-[640px] text-left">
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr v-for="a in open.attempts" :key="a.id">
                  <td class="py-2.5 pr-4 text-sm text-gray-800 dark:text-white/90">
                    <router-link
                      :to="`/students/${a.userId}?tab=learning`"
                      class="hover:text-brand-500"
                    >
                      {{ a.firstName }} {{ a.lastName }}
                    </router-link>
                    <span class="block text-xs text-gray-500 dark:text-gray-400">{{ a.email }}</span>
                  </td>
                  <td class="py-2.5 pr-4 text-sm text-gray-500 dark:text-gray-400">
                    attempt #{{ a.attemptNo }}
                  </td>
                  <td class="py-2.5 pr-4 text-sm text-gray-800 dark:text-white/90">
                    {{ a.scorePct === null ? '—' : `${a.scorePct}%` }}
                  </td>
                  <td class="py-2.5 pr-4 text-sm">
                    <span v-if="a.passed" class="text-success-600 dark:text-success-400">Passed</span>
                    <span v-else class="text-error-500">Failed</span>
                  </td>
                  <td class="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ when(a.submittedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="text-sm text-gray-500 dark:text-gray-400">Nobody has finished it yet.</p>
        </div>
      </template>
    </div>
  </admin-layout>
</template>
