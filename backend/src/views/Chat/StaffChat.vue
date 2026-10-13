<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { ApiError, chat as chatApi, mediaUrl, type ChatMessage, type ChatThread } from '@/lib/api'
import { openChatStream, type Stream } from '@/lib/chat-stream'
import { UploadError, uploadFile } from '@/lib/upload'
import { ago, dayKey, dayLabel, timeOf } from '@/lib/time'
import { useAuthStore } from '@/stores/auth'
import { useChatUnreadStore } from '@/stores/chatUnread'

/**
 * Teachers and the school, talking.
 *
 * The shape is not symmetrical, and the server is what makes that true: a
 * teacher has exactly one conversation and cannot pick who it is with, while
 * an admin has one per teacher and any admin may answer any of them. So a
 * teacher is shown the conversation and no list — a list of one only raises
 * the question of where the others are.
 *
 * New messages arrive on a Server-Sent Events stream rather than by polling
 * from here. The stream carries only what is newer than what is on screen, so
 * a reconnect after dropped Wi-Fi or an API restart catches up by itself
 * instead of refetching the transcript.
 */
const auth = useAuthStore()
const chatUnread = useChatUnreadStore()
const route = useRoute()
const router = useRouter()

/** A teacher who is not also staff: one conversation, and no list. */
const soloThread = computed(
  () =>
    auth.roles.includes('teacher') && !auth.roles.some((r) => r === 'admin' || r === 'superadmin'),
)

const threads = ref<ChatThread[]>([])
const search = ref('')
const activeId = ref<number | null>(null)
const messages = ref<ChatMessage[]>([])
const hasOlder = ref(false)
const loadingThreads = ref(true)
const loadingMessages = ref(false)
const loadingOlder = ref(false)
const error = ref('')
const sendError = ref('')

const draft = ref('')
const sending = ref(false)
const uploadPct = ref<number | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const scroller = ref<HTMLElement | null>(null)

let stream: Stream | null = null

const active = computed(() => threads.value.find((t) => t.id === activeId.value) ?? null)

/**
 * Teachers and learners are two lists, not one with a column.
 *
 * They are answered differently — a teacher's question is usually answered
 * outright, a learner's is often read and then passed on — and mixing them
 * would make every row something you have to look twice at before you know
 * what kind of reply it wants.
 */
const tab = ref<'teacher' | 'student'>('teacher')

const counts = computed(() => ({
  teacher: threads.value.filter((t) => t.kind === 'teacher').reduce((n, t) => n + t.unread, 0),
  student: threads.value.filter((t) => t.kind === 'student').reduce((n, t) => n + t.unread, 0),
}))

const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return threads.value.filter(
    (t) => t.kind === tab.value && (!q || t.name.toLowerCase().includes(q)),
  )
})

/** Every teacher, for the forwarding picker. Taken from the list we already
 *  have rather than fetched: staff see them all there anyway. */
const teachers = computed(() =>
  threads.value
    .filter((t) => t.kind === 'teacher' && t.withUserId)
    .sort((a, b) => a.name.localeCompare(b.name)),
)

/** Each message with the day heading it sits under, worked out once. */
const timeline = computed(() => {
  let previous = ''
  return messages.value.map((m) => {
    const key = dayKey(m.createdAt)
    const heading = key === previous ? null : dayLabel(m.createdAt)
    previous = key
    return { message: m, heading }
  })
})

/* ---------------- loading ---------------- */

async function loadThreads() {
  try {
    threads.value = (await chatApi.threads()).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load your conversations.'
    return
  } finally {
    loadingThreads.value = false
  }

  const wanted = Number(route.query.thread)
  const pick =
    (wanted ? threads.value.find((t) => t.id === wanted) : undefined) ??
    // Whoever is waiting first, then whoever spoke last. On an empty inbox the
    // list is still shown; there is simply nothing selected.
    threads.value.find((t) => t.unread > 0) ??
    threads.value.find((t) => t.lastMessageAt) ??
    threads.value[0]
  if (pick) await select(pick)
}

/**
 * Following a link to one conversation.
 *
 * A notification points at `?thread=N`, and the bell can be clicked while this
 * page is already open — in which case only the query changes and nothing
 * remounts, so reading it at load is not enough. Without this the link would
 * quietly do nothing, which is worse than not linking at all.
 */
watch(
  () => route.query.thread,
  async (value) => {
    const id = Number(value)
    if (!id || id === activeId.value) return
    let row = threads.value.find((t) => t.id === id)
    // Started since this list was fetched — which is the ordinary case for an
    // admin following a notice about a teacher who had never written before.
    if (!row) {
      await refreshList()
      row = threads.value.find((t) => t.id === id)
    }
    if (row) await select(row)
  },
)

/**
 * Identity in the list, which is not the thread id.
 *
 * A teacher nobody has written to yet has no thread, and so no id — the list
 * still shows them, because the point of it is to be able to start. So rows
 * are keyed by who they are with, and only a teacher's own single row (which
 * is with the school, not a person) falls back to the thread.
 */
const keyOf = (row: ChatThread) => row.withUserId ?? row.id

async function select(row: ChatThread) {
  // Made on first use: writing to somebody is what starts the conversation,
  // so opening their name is where the thread comes from.
  if (!row.id) {
    if (!row.withUserId) return
    try {
      row.id = (await chatApi.open(row.withUserId)).data.id
    } catch (err) {
      sendError.value = err instanceof ApiError ? err.message : 'Could not start that conversation.'
      return
    }
  }

  const id = row.id
  if (activeId.value === id) return
  // A notification can point at either side, so the list follows what was
  // opened rather than leaving the reader on a tab their conversation is not
  // in.
  tab.value = row.kind
  activeId.value = id
  messages.value = []
  hasOlder.value = false
  sendError.value = ''
  loadingMessages.value = true
  stream?.close()
  stream = null

  // The thread is in the address bar so a reload, or a link from a
  // notification, comes back to the same conversation.
  if (Number(route.query.thread) !== id) {
    await router.replace({ query: { ...route.query, thread: String(id) } })
  }

  try {
    const res = await chatApi.messages(id)
    messages.value = res.data
    hasOlder.value = res.meta.hasMore
  } catch (err) {
    sendError.value = err instanceof ApiError ? err.message : 'Could not open that conversation.'
    return
  } finally {
    loadingMessages.value = false
  }

  await toBottom()
  await markRead()
  listen()
}

async function older() {
  const first = messages.value[0]
  if (!first || !activeId.value || loadingOlder.value) return
  loadingOlder.value = true
  const box = scroller.value
  const before = box?.scrollHeight ?? 0
  try {
    const res = await chatApi.messages(activeId.value, { before: first.id })
    messages.value = [...res.data, ...messages.value]
    hasOlder.value = res.meta.hasMore
    // Hold the reader's place: without this, prepending jumps them to the top
    // of everything that was just inserted.
    await nextTick()
    if (box) box.scrollTop = box.scrollHeight - before
  } catch {
    /* leave what is on screen; they can try again */
  } finally {
    loadingOlder.value = false
  }
}

/* ---------------- live ---------------- */

function listen() {
  if (!activeId.value) return
  stream = openChatStream(activeId.value, {
    // The newest already on screen, so the stream sends only what follows.
    after: messages.value.length ? messages.value[messages.value.length - 1].id : 0,
    onMessage: (raw) => {
      const message = raw as ChatMessage
      if (message.threadId !== activeId.value) return
      // Our own are already on screen, put there by the POST's answer.
      if (messages.value.some((m) => m.id === message.id)) return
      const atBottom = nearBottom()
      messages.value.push(message)
      bumpList(message)
      if (atBottom) void toBottom()
      // Arriving in a conversation nobody is looking at still counts.
      if (!message.mine && !atBottom) void chatUnread.refresh()
      // Having it on screen in front of somebody is what reading is — but only
      // if they are actually at the bottom, looking.
      if (atBottom && !message.mine) void markRead()
    },
    onReconnect: () => {
      // A gap of unknown length. The list is cheap and says whether another
      // conversation moved while this one was open.
      void refreshList()
    },
  })
}

function nearBottom(): boolean {
  const box = scroller.value
  if (!box) return true
  return box.scrollHeight - box.scrollTop - box.clientHeight < 120
}

/**
 * Whether the view should stay stuck to the newest message.
 *
 * True on opening a conversation, and true again whenever somebody scrolls
 * back down to the end. Reading something further up turns it off, so a
 * message arriving does not yank them away from what they were reading.
 */
const pinned = ref(true)

function onScroll() {
  pinned.value = nearBottom()
}

/**
 * Down to the newest, and keep it there while the view is still settling.
 *
 * One scroll after `nextTick` is not enough: the bubbles are laid out then,
 * but the pictures in them are not — their signed links arrive afterwards, and
 * each one that loads makes the transcript taller under what was the bottom.
 * `stick` runs again on every image load for as long as the view is pinned.
 */
async function toBottom() {
  pinned.value = true
  await nextTick()
  stick()
  // One more after the browser has laid out and painted, which is when a
  // freshly rendered transcript finally knows how tall it is.
  requestAnimationFrame(stick)
}

function stick() {
  const box = scroller.value
  if (box) box.scrollTop = box.scrollHeight
}

/** An attachment finished loading and changed the height under the reader. */
function onMediaLoad() {
  if (pinned.value) stick()
}

async function markRead() {
  if (!activeId.value) return
  const row = threads.value.find((t) => t.id === activeId.value)
  // Down by what this conversation was holding, not to zero: an admin reading
  // one teacher has not read the other five.
  if (row?.unread) chatUnread.clearFor(row.unread)
  if (row) row.unread = 0
  await chatApi.read(activeId.value).catch(() => {})
}

async function refreshList() {
  try {
    const fresh = (await chatApi.threads()).data
    void chatUnread.refresh()
    // The open conversation is being read right now, so its own count stays at
    // zero whatever the list says.
    for (const row of fresh) if (row.id === activeId.value) row.unread = 0
    threads.value = fresh
  } catch {
    /* the list is a convenience; the open conversation still works */
  }
}

/**
 * How often the list is asked whether anything happened elsewhere.
 *
 * The event stream carries one conversation — the open one — because holding
 * one per teacher would be a connection each on every admin's screen. So the
 * other rows learn they have something waiting by asking, and this is the
 * interval at which somebody writing to another teacher shows up in the list.
 * One small query; the open conversation is still instant.
 */
const LIST_EVERY_MS = 12_000
let listTimer: ReturnType<typeof setInterval> | null = null

/** Keeps the list in step without refetching it on every message. */
function bumpList(message: ChatMessage) {
  const row = threads.value.find((t) => t.id === message.threadId)
  if (!row) return
  row.lastMessage = message.body?.trim() || message.attachment?.name || 'ไฟล์แนบ'
  row.lastMessageAt = message.createdAt
  if (!message.mine && message.threadId !== activeId.value) row.unread += 1
  threads.value = [...threads.value].sort((a, b) =>
    (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
  )
}

/* ---------------- saying something ---------------- */

async function say() {
  const text = draft.value.trim()
  if (!text || !activeId.value || sending.value) return
  sending.value = true
  sendError.value = ''
  try {
    const sent = (await chatApi.say(activeId.value, { body: text })).data
    draft.value = ''
    messages.value.push(sent)
    bumpList(sent)
    await toBottom()
  } catch (err) {
    sendError.value = err instanceof ApiError ? err.message : 'That did not send.'
  } finally {
    sending.value = false
  }
}

function onKey(event: KeyboardEvent) {
  // Enter sends, Shift+Enter makes a line — which is what every chat does, and
  // having it the other way round is the sort of thing people notice once.
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void say()
  }
}

async function attach(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !activeId.value) return

  const threadId = activeId.value
  const image = file.type.startsWith('image/')
  sendError.value = ''
  uploadPct.value = 0
  try {
    const placed = await uploadFile(file, {
      purpose: 'chat-file',
      threadId,
      onProgress: (fraction) => {
        uploadPct.value = Math.round(fraction * 100)
      },
    })
    const sent = (
      await chatApi.say(threadId, {
        body: draft.value.trim() || undefined,
        attachmentPath: placed.path,
        attachmentName: file.name,
        attachmentKind: image ? 'image' : 'file',
        attachmentSize: placed.size,
      })
    ).data
    draft.value = ''
    if (threadId === activeId.value) {
      messages.value.push(sent)
      await toBottom()
    }
    bumpList(sent)
  } catch (err) {
    sendError.value =
      err instanceof UploadError || err instanceof ApiError
        ? err.message
        : 'That file did not send.'
  } finally {
    uploadPct.value = null
  }
}

/* ---------------- attachments ---------------- */

/**
 * Signed links, fetched once each and kept for the life of the page.
 *
 * They last five minutes, which is longer than it takes to look at a picture;
 * a stale one shows a broken image and the next visit asks again. Worth it to
 * avoid a request per bubble per scroll.
 */
const links = ref<Record<number, string>>({})

async function link(message: ChatMessage): Promise<void> {
  if (!message.attachment || links.value[message.id] || !activeId.value) return
  try {
    links.value[message.id] = (await chatApi.fileUrl(activeId.value, message.id)).data.url
  } catch {
    /* nothing to show; the name is still there */
  }
}

/**
 * Every attachment on screen needs its link.
 *
 * Deep, and that is the point: this ref holds an array that is pushed into
 * when a message is sent or arrives on the stream, and a shallow watch only
 * fires when the whole array is replaced. Without `deep` a picture you had
 * just sent sat there as its own filename until the next time the
 * conversation was opened.
 */
watch(
  messages,
  (rows) => {
    for (const m of rows) if (m.attachment) void link(m)
  },
  { deep: true, immediate: true },
)

async function download(message: ChatMessage) {
  await link(message)
  const url = links.value[message.id]
  if (url) window.open(url, '_blank', 'noopener')
}

function size(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/* ---------------- passing a question on ---------------- */

/**
 * The relay, which is the reason the two sides are kept apart at all.
 *
 * The admin reads the learner's question, picks the teacher who can answer it,
 * and sends the words across. Who asked does not travel — the server is what
 * guarantees that, not this dialog, but the dialog says so plainly because an
 * admin about to paste a name into the note deserves to be told it defeats
 * the point.
 */
const relaying = ref<ChatMessage | null>(null)
const relayTo = ref<number | null>(null)
const relayNote = ref('')
const relaySending = ref(false)
const relayError = ref('')
const relayedIds = ref<Set<number>>(new Set())

function startRelay(message: ChatMessage) {
  relaying.value = message
  relayTo.value = teachers.value[0]?.withUserId ?? null
  relayNote.value = ''
  relayError.value = ''
}

async function relay() {
  const message = relaying.value
  if (!message || !relayTo.value || relaySending.value) return
  relaySending.value = true
  relayError.value = ''
  try {
    await chatApi.forward({
      messageId: message.id,
      teacherId: relayTo.value,
      note: relayNote.value.trim() || undefined,
    })
    // Remembered for this page only. The record of it lives in the teacher's
    // thread; this is just so an admin can see what they have already done.
    relayedIds.value = new Set([...relayedIds.value, message.id])
    relaying.value = null
    await refreshList()
  } catch (err) {
    relayError.value = err instanceof ApiError ? err.message : 'Could not pass that on.'
  } finally {
    relaySending.value = false
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
}

function pickFrom(event: Event) {
  const key = Number((event.target as HTMLSelectElement).value)
  const row = threads.value.find((t) => keyOf(t) === key)
  if (row) void select(row)
}

/* ---------------- lifecycle ---------------- */

function onVisible() {
  // Back to the tab after a while: the stream may have been throttled shut,
  // and the list is the cheapest way to find out what was missed.
  if (document.visibilityState === 'visible') void refreshList()
}

onMounted(async () => {
  // A teacher's thread is made on first visit. They have no list to start it
  // from, so asking for it is the start.
  if (soloThread.value) await chatApi.open().catch(() => {})
  document.addEventListener('visibilitychange', onVisible)
  await loadThreads()

  // A teacher has only the one conversation, and it is on the stream already.
  if (!soloThread.value) {
    listTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshList()
    }, LIST_EVERY_MS)
  }
})

onBeforeUnmount(() => {
  stream?.close()
  if (listTimer) clearInterval(listTimer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Messages" />

    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>

    <div
      class="flex h-[calc(100vh-13rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <!-- The list, for whoever has more than one conversation. -->
      <aside
        v-if="!soloThread"
        class="hidden w-72 shrink-0 flex-col border-r border-gray-200 xl:flex dark:border-gray-800"
      >
        <div class="space-y-3 border-b border-gray-200 p-4 dark:border-gray-800">
          <!-- Two lists, because the two are answered differently. -->
          <div class="inline-flex w-full rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
            <button
              v-for="side in (['teacher', 'student'] as const)"
              :key="side"
              type="button"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition"
              :class="
                tab === side
                  ? 'bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              "
              @click="tab = side"
            >
              {{ side === 'teacher' ? 'ผู้สอน' : 'ผู้เรียน' }}
              <span
                v-if="counts[side]"
                class="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-medium text-white"
              >
                {{ counts[side] }}
              </span>
            </button>
          </div>

          <label class="sr-only" for="chat-search">Search</label>
          <input
            id="chat-search"
            v-model="search"
            type="search"
            :placeholder="tab === 'teacher' ? 'Search teachers…' : 'Search learners…'"
            class="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
          />
        </div>

        <div class="flex-1 overflow-y-auto">
          <p v-if="loadingThreads" class="p-4 text-sm text-gray-500">Loading…</p>
          <p v-else-if="!shown.length" class="p-4 text-sm text-gray-500">
            <template v-if="search">Nobody by that name.</template>
            <!-- Different silences. No teachers means none have been taken on;
                 no learners means none have asked anything yet. -->
            <template v-else-if="tab === 'teacher'">No teachers yet.</template>
            <template v-else>No learner has written in yet.</template>
          </p>

          <ul v-else class="divide-y divide-gray-100 dark:divide-gray-800">
            <li v-for="row in shown" :key="keyOf(row)">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                :class="row.id === activeId ? 'bg-brand-50/60 dark:bg-brand-500/10' : ''"
                @click="select(row)"
              >
                <img
                  v-if="row.avatarPath"
                  :src="mediaUrl(row.avatarPath)"
                  :alt="row.name"
                  class="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <span
                  v-else
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                  aria-hidden="true"
                >
                  {{ initials(row.name) }}
                </span>

                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline justify-between gap-2">
                    <!-- Unread is said three ways — weight, colour and a
                         number — because the one that carries it at a glance
                         down a list of twenty is the weight, not the pill. -->
                    <span
                      class="truncate text-sm"
                      :class="
                        row.unread
                          ? 'font-semibold text-gray-900 dark:text-white'
                          : 'font-medium text-gray-800 dark:text-white/90'
                      "
                    >
                      {{ row.name }}
                    </span>
                    <span
                      v-if="row.lastMessageAt"
                      class="shrink-0 text-xs"
                      :class="row.unread ? 'font-medium text-brand-500' : 'text-gray-400'"
                    >
                      {{ ago(row.lastMessageAt) }}
                    </span>
                  </span>
                  <span class="mt-0.5 flex items-center justify-between gap-2">
                    <span
                      class="truncate text-xs"
                      :class="
                        row.unread
                          ? 'font-medium text-gray-700 dark:text-gray-200'
                          : 'text-gray-500 dark:text-gray-400'
                      "
                    >
                      {{ row.lastMessage ?? 'No messages yet' }}
                    </span>
                    <span
                      v-if="row.unread"
                      class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-medium text-white"
                    >
                      {{ row.unread }}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <!-- The conversation. -->
      <section class="flex min-w-0 flex-1 flex-col">
        <header
          v-if="active"
          class="flex items-center gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800"
        >
          <img
            v-if="active.avatarPath"
            :src="mediaUrl(active.avatarPath)"
            :alt="active.name"
            class="h-10 w-10 rounded-full object-cover"
          />
          <span
            v-else
            class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
            aria-hidden="true"
          >
            {{ initials(active.name) }}
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-gray-800 dark:text-white/90">
              {{ active.name }}
            </p>
            <p v-if="active.subtitle" class="truncate text-xs text-gray-500 dark:text-gray-400">
              {{ active.subtitle }}
            </p>
          </div>

          <!-- On a narrow screen the list is hidden, so this is the way across. -->
          <select
            v-if="!soloThread && threads.length > 1"
            class="ml-auto h-9 rounded-lg border border-gray-200 bg-transparent px-2 text-sm text-gray-700 xl:hidden dark:border-gray-700 dark:text-gray-300"
            :value="active ? String(keyOf(active)) : ''"
            @change="pickFrom"
          >
            <option v-for="row in threads" :key="keyOf(row)" :value="String(keyOf(row))">
              {{ row.unread ? `${row.name} (${row.unread})` : row.name }}
            </option>
          </select>
        </header>

        <div ref="scroller" class="flex-1 overflow-y-auto px-5 py-4" @scroll.passive="onScroll">
          <p v-if="loadingMessages" class="py-10 text-center text-sm text-gray-500">Loading…</p>

          <template v-else-if="active">
            <div v-if="hasOlder" class="mb-4 text-center">
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-500/10"
                :disabled="loadingOlder"
                @click="older"
              >
                {{ loadingOlder ? 'Loading…' : 'Show earlier messages' }}
              </button>
            </div>

            <p v-if="!messages.length" class="py-10 text-center text-sm text-gray-500">
              Nothing here yet. Say hello.
            </p>

            <div v-for="entry in timeline" :key="entry.message.id">
              <p
                v-if="entry.heading"
                class="my-4 text-center text-xs font-medium text-gray-400 dark:text-gray-500"
              >
                {{ entry.heading }}
              </p>

              <div
                class="mb-3 flex gap-2.5"
                :class="entry.message.mine ? 'justify-end' : 'justify-start'"
              >
                <div class="max-w-[22rem] sm:max-w-md">
                  <!-- Only the other side is named: who you are is not news. -->
                  <p
                    v-if="!entry.message.mine"
                    class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {{ entry.message.name }}
                  </p>

                  <div
                    class="rounded-2xl px-4 py-2.5"
                    :class="
                      entry.message.mine
                        ? 'rounded-br-sm bg-brand-500 text-white'
                        : 'rounded-bl-sm bg-gray-100 text-gray-800 dark:bg-white/[0.06] dark:text-white/90'
                    "
                  >
                    <!-- A picture is shown; anything else is offered. -->
                    <template v-if="entry.message.attachment?.kind === 'image'">
                      <img
                        v-if="links[entry.message.id]"
                        :src="links[entry.message.id]"
                        :alt="entry.message.attachment.name"
                        class="mb-1 max-h-72 w-auto max-w-full cursor-zoom-in rounded-xl object-contain"
                        @load="onMediaLoad"
                        @click="download(entry.message)"
                      />
                      <!-- The signed link is still on its way. A shape the
                           size of a picture, rather than the filename: this
                           is a photograph being loaded, not a document. -->
                      <span
                        v-else
                        class="mb-1 flex h-40 w-56 animate-pulse items-center justify-center rounded-xl bg-black/10 text-xs dark:bg-white/10"
                        :title="entry.message.attachment.name"
                        >…</span
                      >
                    </template>

                    <button
                      v-else-if="entry.message.attachment"
                      type="button"
                      class="mb-1 flex items-center gap-2 text-left text-sm underline-offset-2 hover:underline"
                      @click="download(entry.message)"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path
                          d="M8 2h5l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 0v5h5"
                        />
                      </svg>
                      <span class="min-w-0">
                        <span class="block truncate">{{ entry.message.attachment.name }}</span>
                        <span class="block text-xs opacity-70">
                          {{ size(entry.message.attachment.sizeBytes) }}
                        </span>
                      </span>
                    </button>

                    <p v-if="entry.message.body" class="text-sm break-words whitespace-pre-wrap">
                      {{ entry.message.body }}
                    </p>
                  </div>

                  <p
                    class="mt-1 flex items-center gap-3 text-xs text-gray-400"
                    :class="entry.message.mine ? 'justify-end' : ''"
                  >
                    <time :datetime="entry.message.createdAt">
                      {{ timeOf(entry.message.createdAt) }}
                    </time>

                    <!-- A learner's words, on their way to the teacher who can
                         answer them. The only route between the two sides, and
                         it goes through a person on purpose. -->
                    <button
                      v-if="active?.kind === 'student' && !entry.message.mine"
                      type="button"
                      class="font-medium text-brand-500 hover:text-brand-600"
                      @click="startRelay(entry.message)"
                    >
                      {{ relayedIds.has(entry.message.id) ? 'ส่งต่ออีกครั้ง' : 'ส่งต่อให้ผู้สอน' }}
                    </button>

                    <span v-if="entry.message.forwarded" class="text-gray-400">
                      ส่งต่อจากผู้เรียน
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </template>

          <p v-else-if="!loadingThreads" class="py-10 text-center text-sm text-gray-500">
            Pick a teacher on the left to start.
          </p>
        </div>

        <footer v-if="active" class="border-t border-gray-200 p-4 dark:border-gray-800">
          <p v-if="sendError" role="alert" class="mb-2 text-sm text-error-500">{{ sendError }}</p>
          <p v-if="uploadPct !== null" class="mb-2 text-xs text-gray-500">
            Sending file… {{ uploadPct }}%
          </p>

          <div class="flex items-end gap-2">
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
              @change="attach"
            />
            <button
              type="button"
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-white/[0.04]"
              :disabled="uploadPct !== null"
              aria-label="Attach a file"
              @click="fileInput?.click()"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="m21.4 11.1-8.5 8.5a5 5 0 0 1-7-7l8.5-8.5a3 3 0 0 1 4.3 4.3l-8.5 8.5a1 1 0 0 1-1.5-1.5l7.8-7.8"
                />
              </svg>
            </button>

            <label class="sr-only" for="chat-draft">Message</label>
            <textarea
              id="chat-draft"
              v-model="draft"
              rows="1"
              placeholder="Write a message…"
              class="max-h-32 min-h-11 flex-1 resize-y rounded-lg border border-gray-200 bg-transparent px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
              @keydown="onKey"
            ></textarea>

            <button
              type="button"
              class="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
              :disabled="sending || !draft.trim()"
              @click="say"
            >
              {{ sending ? 'Sending…' : 'Send' }}
            </button>
          </div>
        </footer>
      </section>
    </div>

    <!-- Passing a learner's question to a teacher. -->
    <div v-if="relaying" class="fixed inset-0 z-50 grid place-items-center p-4">
      <div class="absolute inset-0 bg-gray-900/50" @click="relaying = null"></div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="relay-title"
        class="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900"
      >
        <h3 id="relay-title" class="text-lg font-medium text-gray-800 dark:text-white/90">
          ส่งต่อให้ผู้สอน
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          ผู้สอนจะเห็นเฉพาะคำถาม ไม่เห็นว่าใครถาม
        </p>

        <blockquote
          class="mt-4 max-h-40 overflow-y-auto rounded-xl bg-gray-50 p-3 text-sm whitespace-pre-wrap text-gray-700 dark:bg-white/[0.04] dark:text-gray-300"
        >
          {{ relaying.body || relaying.attachment?.name || 'ไฟล์แนบ' }}
        </blockquote>
        <p v-if="relaying.attachment" class="mt-2 text-xs text-gray-500">
          ไฟล์แนบจะไม่ถูกส่งไปด้วย — รูปอาจมีชื่อผู้เรียนติดอยู่ ถ้าจำเป็นให้แนบเองหลังจากดูแล้ว
        </p>

        <label class="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300" for="relay-to">
          ผู้สอน
        </label>
        <select
          id="relay-to"
          v-model="relayTo"
          class="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:text-white/90"
        >
          <option v-for="t in teachers" :key="t.withUserId ?? 0" :value="t.withUserId">
            {{ t.name }}
          </option>
        </select>

        <label
          class="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300"
          for="relay-note"
        >
          หมายเหตุถึงผู้สอน (ไม่บังคับ)
        </label>
        <textarea
          id="relay-note"
          v-model="relayNote"
          rows="2"
          maxlength="500"
          placeholder="เช่น ช่วยอธิบายข้อนี้เพิ่มหน่อย"
          class="mt-1 w-full resize-y rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 dark:border-gray-700 dark:text-white/90"
        ></textarea>
        <p class="mt-1 text-xs text-gray-400">อย่าใส่ชื่อผู้เรียนลงในหมายเหตุ</p>

        <p v-if="relayError" role="alert" class="mt-3 text-sm text-error-500">{{ relayError }}</p>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
            @click="relaying = null"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            :disabled="relaySending || !relayTo"
            @click="relay"
          >
            {{ relaySending ? 'กำลังส่ง…' : 'ส่งต่อ' }}
          </button>
        </div>
      </div>
    </div>
  </admin-layout>
</template>
