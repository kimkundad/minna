<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'
import { ApiError, lessonQuestions, type LessonQuestionRow } from '@/lib/api'

/**
 * Questions students asked on a lesson.
 *
 * A queue, not a list: unanswered first and oldest at the top, so working down
 * the page is the right order to work in. A question left for a week is worse
 * than one answered badly.
 *
 * Answering marks the thread answered, which is how it leaves the queue. The
 * answer is marked as coming from an instructor, because the public page gives
 * those more weight than another student's.
 */
const { ask } = useConfirm()
const auth = useAuthStore()

const rows = ref<LessonQuestionRow[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const unanswered = ref(0)
const PER_PAGE = 20

const q = ref('')
const unansweredOnly = ref(true)

/** Which thread has its reply box open, and what is typed in it. */
const replyingTo = ref<number | null>(null)
const replyText = ref('')
const sending = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await lessonQuestions.list({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...(unansweredOnly.value ? { unansweredOnly: true } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
    unanswered.value = res.meta.unanswered
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the questions.'
  } finally {
    loading.value = false
  }
}

function startReply(row: LessonQuestionRow) {
  replyingTo.value = replyingTo.value === row.id ? null : row.id
  replyText.value = ''
}

async function send(row: LessonQuestionRow) {
  if (!replyText.value.trim()) return
  sending.value = true
  error.value = ''
  try {
    await lessonQuestions.answer(row.id, replyText.value.trim())
    replyingTo.value = null
    replyText.value = ''
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not send that.'
  } finally {
    sending.value = false
  }
}

async function removeThread(row: LessonQuestionRow) {
  const { ok } = await ask({
    title: 'Delete this question?',
    message:
      'Its answers go with it, and the student is not told. Use this for spam, not for a question you would rather not answer.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await lessonQuestions.remove(row.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that.'
  }
}

async function removeReply(id: number) {
  const { ok } = await ask({
    title: 'Delete this answer?',
    message: 'If it is the only one, the question goes back to the unanswered queue.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await lessonQuestions.remove(id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that.'
  }
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

/** How long it has been waiting, which is the thing that decides the order. */
function waitedFor(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
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
watch(unansweredOnly, () => {
  page.value = 1
  void load()
})
watch(page, load)

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Lesson Q&A" />

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
          <span v-if="unanswered" class="text-warning-600 dark:text-warning-400">
            {{ unanswered }} waiting for an answer
          </span>
          <span v-else>Nothing waiting</span>
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Oldest first. A question left for a week is worse than one answered badly.
        </p>
      </div>

      <div
        class="flex flex-wrap items-center gap-4 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Search the questions"
          :class="`${inputClass} min-w-60 flex-1`"
        />
        <label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            v-model="unansweredOnly"
            type="checkbox"
            class="h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20 dark:border-gray-700"
          />
          Only what is unanswered
        </label>
      </div>

      <ul class="divide-y divide-gray-100 dark:divide-gray-800">
        <li v-if="loading" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</li>
        <li v-else-if="!rows.length" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
          {{ unansweredOnly ? 'Nothing is waiting for an answer.' : 'Nobody has asked anything.' }}
        </li>

        <li
          v-for="row in rows"
          :key="row.id"
          class="px-5 py-4 sm:px-6"
          :class="!row.answeredAt ? 'bg-warning-50/40 dark:bg-warning-500/5' : ''"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <p class="whitespace-pre-line text-sm text-gray-800 dark:text-white/90">
                {{ row.body }}
              </p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                <router-link :to="`/students/${row.userId}`" class="hover:text-brand-500">
                  {{ row.firstName }} {{ row.lastName }}
                </router-link>
                ·
                <router-link
                  v-if="row.courseId"
                  :to="`/courses/${row.courseId}/curriculum`"
                  class="hover:text-brand-500"
                >
                  {{ row.courseTitle }}</router-link
                ><span v-else>{{ row.courseTitle ?? '—' }}</span>
                <template v-if="row.lessonTitle"> · {{ row.lessonTitle }}</template>
                · asked {{ waitedFor(row.createdAt) }}
              </p>
            </div>
            <div class="shrink-0 whitespace-nowrap text-sm">
              <button
                type="button"
                class="text-brand-500 hover:text-brand-600"
                @click="startReply(row)"
              >
                {{ replyingTo === row.id ? 'Cancel' : 'Answer' }}
              </button>
              <button
                v-if="auth.roles.includes('admin') || auth.roles.includes('superadmin')"
                type="button"
                class="ml-4 text-error-500 hover:text-error-600"
                @click="removeThread(row)"
              >
                Delete
              </button>
            </div>
          </div>

          <!-- The answers already on it -->
          <ul v-if="row.replies.length" class="mt-3 space-y-2 border-l-2 border-gray-100 pl-4 dark:border-gray-800">
            <li v-for="r in row.replies" :key="r.id" class="group">
              <p class="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
                {{ r.body }}
              </p>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ r.firstName }} {{ r.lastName }}
                <span
                  v-if="r.isInstructor"
                  class="ml-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
                >
                  teacher
                </span>
                · {{ when(r.createdAt) }}
                <button
                  v-if="auth.roles.includes('admin') || auth.roles.includes('superadmin')"
                  type="button"
                  class="ml-2 text-error-500 opacity-0 transition group-hover:opacity-100 hover:underline"
                  @click="removeReply(r.id)"
                >
                  delete
                </button>
              </p>
            </li>
          </ul>

          <form v-if="replyingTo === row.id" class="mt-3" @submit.prevent="send(row)">
            <textarea
              v-model="replyText"
              rows="3"
              maxlength="5000"
              autofocus
              placeholder="Answer them here. It appears under their question with your name on it."
              class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            ></textarea>
            <div class="mt-2 flex gap-3">
              <button
                type="submit"
                :disabled="sending || !replyText.trim()"
                class="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                {{ sending ? 'Sending…' : 'Send the answer' }}
              </button>
            </div>
          </form>
        </li>
      </ul>

      <TablePager
        v-model:page="page"
        :total-pages="totalPages"
        :total="total"
        :per-page="PER_PAGE"
        noun="questions"
      />
    </div>

    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
      The public lesson pages do not have a question box yet, so this fills up only once that is
      wired up.
    </p>
  </admin-layout>
</template>
