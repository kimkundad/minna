<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { notifications as notifyApi, type AppNotification } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

/**
 * What has happened that needs somebody here.
 *
 * Only this app's own: a learner's receipt belongs to the public site and
 * would be a dead link in a bell that cannot open it.
 *
 * Fetched when the menu opens and when the tab comes back to the front, not on
 * a timer — an admin left open overnight should not spend the night asking,
 * and a count that is a minute stale has cost nobody anything.
 */
const router = useRouter()
const auth = useAuthStore()

const open = ref(false)
const rows = ref<AppNotification[]>([])
const unread = ref(0)
const loading = ref(false)
const loaded = ref(false)
const root = ref<HTMLElement | null>(null)

const waiting = computed(() => unread.value > 0)

async function load() {
  if (!auth.isLoggedIn) {
    rows.value = []
    unread.value = 0
    return
  }
  loading.value = true
  try {
    const res = await notifyApi.list({ limit: 20 })
    rows.value = res.data
    unread.value = res.meta.unread
    loaded.value = true
  } catch {
    // The bell goes quiet rather than wrong. Nothing here is load-bearing.
  } finally {
    loading.value = false
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) void load()
}

/**
 * Marked read on screen first, then on the server: the click is usually a
 * navigation too, and waiting for the round trip would leave the badge
 * counting something the reader has already dealt with.
 */
async function openOne(row: AppNotification) {
  open.value = false
  if (!row.readAt) {
    row.readAt = new Date().toISOString()
    unread.value = Math.max(0, unread.value - 1)
    void notifyApi.read(row.id).catch(() => {})
  }
  if (row.link) await router.push(row.link)
}

async function readAll() {
  const now = new Date().toISOString()
  for (const r of rows.value) r.readAt ??= now
  unread.value = 0
  await notifyApi.readAll().catch(() => {})
}

function onDocumentClick(e: MouseEvent) {
  if (!open.value) return
  if (root.value?.contains(e.target as Node)) return
  open.value = false
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
function onVisible() {
  if (document.visibilityState === 'visible') void load()
}

/**
 * How often the bell asks whether anything has happened.
 *
 * It used to ask only when it was mounted, which meant somebody sitting on the
 * dashboard heard nothing until they happened to change page. That was tolerable
 * while notifications were about work that could wait an hour; a message
 * somebody is waiting for an answer to is not that.
 */
const EVERY_MS = 60_000
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', onVisible)
  void load()
  timer = setInterval(() => {
    // A background tab is not being read, and `visibilitychange` catches up
    // the moment it comes back.
    if (document.visibilityState === 'visible') void load()
  }, EVERY_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVisible)
})

watch(() => auth.isLoggedIn, () => void load())

/** The glyph and colour for each kind. Anything unknown gets the bell. */
const LOOK: Record<string, { tone: string; path: string }> = {
  'essay.submitted': {
    tone: 'bg-brand-50 text-brand-500 dark:bg-brand-500/10',
    path: 'M8 2h5l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 0v5h5',
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
  LOOK[type] ?? { tone: 'bg-gray-100 text-gray-500 dark:bg-white/[0.06]', path: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z' }

/** "3 นาทีที่แล้ว" without pulling in a date library for one line. */
function ago(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  if (seconds < 60) return 'เมื่อสักครู่'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} นาทีที่แล้ว`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ชม. ที่แล้ว`
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="relative" ref="root">
    <button
      type="button"
      class="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
      :aria-label="waiting ? `${unread} รายการใหม่` : 'การแจ้งเตือน'"
      :aria-expanded="open"
      @click="toggle"
    >
      <span
        v-if="waiting"
        class="absolute right-0 top-0.5 z-1 flex h-2 w-2 rounded-full bg-orange-400"
      >
        <span
          class="absolute -z-1 inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"
        ></span>
      </span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Z" />
        <path d="M18 16V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute -right-[240px] mt-[17px] flex max-h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg sm:w-[361px] lg:right-0 dark:border-gray-800 dark:bg-gray-dark"
      role="dialog"
      aria-label="การแจ้งเตือน"
    >
      <div class="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
        <h5 class="text-lg font-semibold text-gray-800 dark:text-white/90">การแจ้งเตือน</h5>
        <button
          v-if="unread"
          type="button"
          class="text-sm text-brand-500 hover:text-brand-600"
          @click="readAll"
        >
          อ่านทั้งหมดแล้ว
        </button>
      </div>

      <p v-if="loading && !loaded" class="px-2 py-6 text-center text-sm text-gray-500">
        กำลังโหลด…
      </p>

      <p v-else-if="!rows.length" class="px-2 py-8 text-center text-sm text-gray-500">
        ยังไม่มีการแจ้งเตือน<br />
        <span class="text-xs text-gray-400">งานที่รอคุณจะมาแจ้งที่นี่</span>
      </p>

      <ul v-else class="custom-scrollbar flex flex-col overflow-y-auto">
        <li v-for="row in rows" :key="row.id">
          <button
            type="button"
            class="flex w-full gap-3 rounded-lg border-b border-gray-100 p-3 text-left hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5"
            :class="row.readAt ? '' : 'bg-brand-50/40 dark:bg-brand-500/5'"
            @click="openOne(row)"
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
            <span class="block min-w-0 flex-1">
              <span class="block text-theme-sm font-medium text-gray-800 dark:text-white/90">
                {{ row.title }}
              </span>
              <span v-if="row.body" class="mt-0.5 block truncate text-theme-sm text-gray-500 dark:text-gray-400">
                {{ row.body }}
              </span>
              <span class="mt-1 block text-theme-xs text-gray-400">{{ ago(row.createdAt) }}</span>
            </span>
            <!-- A dot rather than the word "new": the row is already tinted,
                 and two ways of saying it is unread is one too many. -->
            <span
              v-if="!row.readAt"
              class="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500"
              aria-hidden="true"
            ></span>
          </button>
        </li>
      </ul>

      <!-- Twenty fit in a panel; the rest live on a page of their own. -->
      <RouterLink
        v-if="rows.length"
        to="/notifications"
        class="mt-3 flex justify-center rounded-lg border border-gray-300 bg-white p-3 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
        @click="open = false"
      >
        See all notifications
      </RouterLink>
    </div>
  </div>
</template>
