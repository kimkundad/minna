<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { ApiError, notifications as notifyApi, type AppNotification } from '@/lib/api'

/**
 * Everything that has needed somebody here, rather than the handful the bell
 * has room for.
 *
 * The rows are shown as they were written. A notification is a record of what
 * was said at the time; re-rendering it from the event behind it would let a
 * course renamed since quietly rewrite the sentence somebody was shown.
 *
 * Reading does not require opening. Some kinds have nowhere to go, and a list
 * that can only be cleared by visiting every link is a list that grows.
 */
const router = useRouter()

const rows = ref<AppNotification[]>([])
const unread = ref(0)
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const unreadOnly = ref(false)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await notifyApi.list({ limit: 20, page: page.value, unreadOnly: unreadOnly.value })
    rows.value = res.data
    unread.value = res.meta.unread
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load your notifications.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// A different filter is a different question, so it starts from the first page.
watch(unreadOnly, () => {
  page.value = 1
  void load()
})
watch(page, load)

async function read(row: AppNotification) {
  if (row.readAt) return
  row.readAt = new Date().toISOString()
  unread.value = Math.max(0, unread.value - 1)
  await notifyApi.read(row.id).catch(() => {})
  // The unread filter is a queue: something read has left it.
  if (unreadOnly.value) void load()
}

async function open(row: AppNotification) {
  await read(row)
  if (row.link) await router.push(row.link)
}

async function readAll() {
  const now = new Date().toISOString()
  for (const r of rows.value) r.readAt ??= now
  unread.value = 0
  await notifyApi.readAll().catch(() => {})
  await load()
}

/** The glyph and colour per kind. Anything unknown gets the bell. */
const LOOK: Record<string, { tone: string; path: string }> = {
  'essay.submitted': {
    tone: 'bg-brand-50 text-brand-500 dark:bg-brand-500/10',
    path: 'M8 2h5l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 0v5h5',
  },
  'teacher.applied': {
    tone: 'bg-warning-50 text-warning-500 dark:bg-warning-500/10',
    path: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-1v6m3-3h-6',
  },
  'chat.message': {
    tone: 'bg-brand-50 text-brand-500 dark:bg-brand-500/10',
    path: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 3.6 11.5a8.4 8.4 0 0 1 8.4-8.4 8.4 8.4 0 0 1 9 8.4Z',
  },
  'order.paid': {
    tone: 'bg-success-50 text-success-500 dark:bg-success-500/10',
    path: 'M20 6 9 17l-5-5',
  },
}
const look = (type: string) =>
  LOOK[type] ?? {
    tone: 'bg-gray-100 text-gray-500 dark:bg-white/[0.06]',
    path: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z',
  }

function when(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const tabClass = (on: boolean) =>
  on
    ? 'rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white'
    : 'rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'

const empty = computed(() => !loading.value && !error.value && !rows.value.length)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Notifications" />

    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
        <button type="button" :class="tabClass(!unreadOnly)" @click="unreadOnly = false">All</button>
        <button type="button" :class="tabClass(unreadOnly)" @click="unreadOnly = true">
          Unread
          <span v-if="unread" class="ml-1 text-xs text-brand-500">{{ unread }}</span>
        </button>
      </div>

      <button
        v-if="unread"
        type="button"
        class="text-sm font-medium text-brand-500 hover:text-brand-600"
        @click="readAll"
      >
        Mark all read
      </button>
    </div>

    <div class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <p v-if="loading" class="px-5 py-10 text-center text-sm text-gray-500 sm:px-6">Loading…</p>

      <p v-else-if="empty" class="px-5 py-12 text-center text-sm text-gray-500 sm:px-6">
        <template v-if="unreadOnly">
          All caught up — nothing is waiting to be read.
        </template>
        <template v-else>
          Nothing yet. Work that needs you turns up here.
        </template>
      </p>

      <ul v-else class="divide-y divide-gray-100 dark:divide-gray-800">
        <li
          v-for="row in rows"
          :key="row.id"
          class="flex gap-4 p-5 sm:px-6"
          :class="row.readAt ? '' : 'bg-brand-50/40 dark:bg-brand-500/5'"
        >
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            :class="look(row.type).tone"
            aria-hidden="true"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path :d="look(row.type).path" />
            </svg>
          </span>

          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-gray-800 dark:text-white/90">{{ row.title }}</p>
            <p v-if="row.body" class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {{ row.body }}
            </p>
            <p class="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-gray-400">
              <time :datetime="row.createdAt">{{ when(row.createdAt) }}</time>
              <button
                v-if="row.link"
                type="button"
                class="font-medium text-brand-500 hover:text-brand-600"
                @click="open(row)"
              >
                Open →
              </button>
              <!-- Separate from opening on purpose: a row with nowhere to go
                   still has to be clearable. -->
              <button
                v-if="!row.readAt"
                type="button"
                class="font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                @click="read(row)"
              >
                Mark read
              </button>
            </p>
          </div>

          <span
            v-if="!row.readAt"
            class="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500"
            aria-hidden="true"
          ></span>
        </li>
      </ul>
    </div>

    <div v-if="totalPages > 1" class="mt-5 flex items-center justify-center gap-4">
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400"
        :disabled="page <= 1"
        @click="page -= 1"
      >
        Previous
      </button>
      <span class="text-sm tabular-nums text-gray-500">
        Page {{ page }} of {{ totalPages }} · {{ total }} in all
      </span>
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400"
        :disabled="page >= totalPages"
        @click="page += 1"
      >
        Next
      </button>
    </div>
  </admin-layout>
</template>
