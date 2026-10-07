<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import {
  ApiError,
  api,
  essays,
  type Category,
  type EssayQueueRow,
  type EssayStatus,
  type EssaySubmission,
} from '@/lib/api'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'

/**
 * Marking written answers.
 *
 * The queue opens on what is waiting, oldest first: somebody has been waiting
 * longest and that is who should be read next.
 *
 * Opening one shows every draft and every verdict, not just the latest. "You
 * already told me to fix this and I did" is the most common thing a learner
 * needs to show, and a single current body cannot show it.
 */
const auth = useAuthStore()
const { ask } = useConfirm()

const rows = ref<EssayQueueRow[]>([])
const total = ref(0)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')
const notice = ref('')

const page = ref(1)
const q = ref('')
const status = ref<'todo' | EssayStatus>('todo')
const courseId = ref<number | ''>('')
const courses = ref<{ id: number; title: string }[]>([])

const open = ref<EssaySubmission | null>(null)
const comment = ref('')
const reviewing = ref(false)

const STATUS_LABEL: Record<EssayStatus, string> = {
  pending: 'Waiting',
  resubmitted: 'Waiting again',
  revision: 'With the learner',
  passed: 'Passed',
}

const STATUS_STYLE: Record<EssayStatus, string> = {
  pending: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
  resubmitted: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
  revision: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  passed: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
}

/** Only an answer waiting on someone can be marked. */
const canReview = computed(
  () => open.value?.status === 'pending' || open.value?.status === 'resubmitted',
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await essays.queue({
      page: page.value,
      perPage: 20,
      status: status.value,
      ...(q.value ? { q: q.value } : {}),
      ...(courseId.value ? { courseId: Number(courseId.value) } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the queue.'
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
watch([status, courseId], () => {
  page.value = 1
  void load()
})
watch(page, load)

async function openOne(row: EssayQueueRow) {
  error.value = ''
  notice.value = ''
  comment.value = ''
  try {
    open.value = (await essays.one(row.id)).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not open that answer.'
  }
}

async function decide(result: 'passed' | 'revision') {
  if (!open.value) return
  if (!comment.value.trim()) {
    error.value = 'Say why. A verdict with no reason helps nobody.'
    return
  }

  const { ok } = await ask(
    result === 'passed'
      ? {
          title: 'Pass this answer?',
          message: `${open.value.learnerName} is emailed your comment and the answer is marked done.`,
          confirmLabel: 'Pass',
        }
      : {
          title: 'Send it back for changes?',
          message: `${open.value.learnerName} is emailed your comment and can send another draft.`,
          confirmLabel: 'Send back',
        },
  )
  if (!ok) return

  reviewing.value = true
  error.value = ''
  try {
    const res = await essays.review(open.value.id, { result, comment: comment.value.trim() })
    open.value = res.data
    comment.value = ''
    notice.value =
      result === 'passed'
        ? 'Marked as passed. The learner has been emailed.'
        : 'Sent back. The learner has been emailed and can send another draft.'
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not record that verdict.'
  } finally {
    reviewing.value = false
  }
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')
const waitedDays = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'

onMounted(async () => {
  try {
    // The filter lists the courses, not the categories; a teacher only ever
    // sees their own because the API decides that from the token.
    const res = await api.courses({ perPage: 100, sort: 'title' })
    courses.value = res.data.map((c) => ({ id: c.id, title: c.title }))
  } catch {
    // The filter stays empty; the queue still works.
  }
  await load()
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Essay review" />

    <p
      v-if="error"
      role="alert"
      class="mb-5 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="mb-5 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400"
    >
      {{ notice }}
    </p>

    <!-- One answer, with everything that has been said about it. -->
    <div
      v-if="open"
      class="mb-6 rounded-2xl border border-brand-500/40 bg-white p-5 dark:bg-white/[0.03] sm:p-6"
    >
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ open.learnerName }}
            <span
              class="ml-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
              :class="STATUS_STYLE[open.status]"
            >
              {{ STATUS_LABEL[open.status] }}
            </span>
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {{ open.learnerEmail }} · {{ open.courseTitle }}
          </p>
        </div>
        <button type="button" class="text-sm text-gray-500" @click="open = null">Close</button>
      </div>

      <div class="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.02]">
        <p class="text-xs uppercase tracking-wide text-gray-400">The question</p>
        <p class="mt-1 whitespace-pre-line text-sm text-gray-800 dark:text-white/90">
          {{ open.questionText }}
        </p>
      </div>

      <!-- Newest draft first: that is the one being marked. -->
      <div class="mt-5 space-y-4">
        <div
          v-for="v in [...open.versions].reverse()"
          :key="v.id"
          class="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
        >
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-gray-800 dark:text-white/90">
              Draft {{ v.version }}
              <span v-if="v.version === open.currentVersion" class="ml-1 text-xs text-brand-500">
                — latest
              </span>
            </p>
            <p class="text-xs text-gray-400">{{ when(v.submittedAt) }}</p>
          </div>
          <p class="whitespace-pre-line text-sm leading-6 text-gray-700 dark:text-gray-300">
            {{ v.body }}
          </p>
          <p v-if="v.attachmentName" class="mt-2 text-xs text-gray-500">
            Attached: {{ v.attachmentName }}
          </p>

          <!-- The verdict on this draft, if it has had one. -->
          <div
            v-for="r in open.reviews.filter((x) => x.version === v.version)"
            :key="r.id"
            class="mt-3 rounded-lg border-l-4 p-3"
            :class="
              r.result === 'passed'
                ? 'border-success-500 bg-success-50 dark:bg-success-500/10'
                : 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
            "
          >
            <p class="text-xs font-medium uppercase tracking-wide text-gray-500">
              {{ r.result === 'passed' ? 'Passed' : 'Changes asked for' }} ·
              {{ r.reviewerName ?? 'a former instructor' }} · {{ when(r.reviewedAt) }}
            </p>
            <p class="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
              {{ r.comment }}
            </p>
          </div>
        </div>
      </div>

      <!-- The verdict being written. -->
      <div v-if="canReview" class="mt-6">
        <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Your comment<span class="text-error-500">*</span>
        </label>
        <textarea
          v-model="comment"
          rows="4"
          maxlength="2000"
          placeholder="What is right, and what to change"
          class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <p class="mt-1 text-xs text-gray-400">
          {{ comment.length }} / 2,000 · the learner is emailed this, whichever button you press.
        </p>

        <div class="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            :disabled="reviewing"
            class="rounded-lg bg-success-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-success-600 disabled:opacity-60"
            @click="decide('passed')"
          >
            Pass
          </button>
          <button
            type="button"
            :disabled="reviewing"
            class="rounded-lg border border-brand-500 px-4 py-2.5 text-sm font-medium text-brand-500 transition hover:bg-brand-50 disabled:opacity-60 dark:hover:bg-brand-500/10"
            @click="decide('revision')"
          >
            Send back for changes
          </button>
        </div>
      </div>
      <p v-else class="mt-6 text-sm text-gray-500 dark:text-gray-400">
        <template v-if="open.status === 'revision'">
          Waiting for the learner to send another draft.
        </template>
        <template v-else>Passed on {{ when(open.resolvedAt) }}.</template>
      </p>
    </div>

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ total }} answer{{ total === 1 ? '' : 's' }}
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {{ auth.isAdmin ? 'Across every course.' : 'On the courses you teach.' }}
          Oldest first — somebody has been waiting longest.
        </p>
      </div>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-3 sm:px-6"
      >
        <input v-model="q" type="search" placeholder="Search learner or course" :class="inputClass" />
        <select v-model="status" :class="inputClass">
          <option value="todo">Waiting for me</option>
          <option value="revision">With the learner</option>
          <option value="passed">Passed</option>
          <option value="pending">First drafts only</option>
          <option value="resubmitted">Redrafts only</option>
        </select>
        <select v-model="courseId" :class="inputClass">
          <option value="">Any course</option>
          <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[820px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Learner</th>
              <th class="px-5 py-3 font-medium">Course</th>
              <th class="px-5 py-3 font-medium">Draft</th>
              <th class="px-5 py-3 font-medium">Waiting</th>
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
                Nothing to mark.
              </td>
            </tr>
            <tr v-for="r in rows" :key="r.id" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <td class="px-5 py-3.5 sm:px-6">
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">
                  {{ r.learnerName }}
                </p>
                <p class="mt-0.5 text-xs text-gray-400">{{ r.learnerEmail }}</p>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                {{ r.courseTitle }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ r.currentVersion }}
              </td>
              <td class="px-5 py-3.5 text-sm">
                <span
                  :class="
                    waitedDays(r.submittedAt) >= 3 && (r.status === 'pending' || r.status === 'resubmitted')
                      ? 'font-medium text-error-500'
                      : 'text-gray-500 dark:text-gray-400'
                  "
                >
                  {{ waitedDays(r.submittedAt) }} day(s)
                </span>
              </td>
              <td class="px-5 py-3.5">
                <span
                  class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                  :class="STATUS_STYLE[r.status]"
                >
                  {{ STATUS_LABEL[r.status] }}
                </span>
              </td>
              <td class="px-5 py-3.5 text-right text-sm sm:px-6">
                <button type="button" class="text-brand-500 hover:text-brand-600" @click="openOne(r)">
                  {{ r.status === 'pending' || r.status === 'resubmitted' ? 'Mark' : 'View' }}
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
        :per-page="20"
        noun="answers"
      />
    </div>
  </admin-layout>
</template>
