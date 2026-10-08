<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { useConfirm } from '@/composables/useConfirm'
import { ApiError, content, type ContactMessage } from '@/lib/api'

/**
 * Enquiries from the contact form.
 *
 * "Read" here means somebody has dealt with it, not that it was opened — which
 * is why it can be turned back off. Opening one by accident should not be able
 * to lose it.
 *
 * There is no reply box. The reply goes from a real mailbox, where the thread
 * and the signature live; a half-built mail client here would just be a worse
 * one. The address is a mailto link instead.
 */
const { ask } = useConfirm()

const rows = ref<ContactMessage[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const unread = ref(0)
const PER_PAGE = 20

const q = ref('')
const unreadOnly = ref(false)
const open = ref<number | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await content.messages({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...(unreadOnly.value ? { unreadOnly: true } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
    unread.value = res.meta.unread
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the enquiries.'
  } finally {
    loading.value = false
  }
}

/** Opening one marks it dealt with, which is the usual case; the toggle is
 *  there for when it was opened by mistake. */
async function openMessage(row: ContactMessage) {
  open.value = open.value === row.id ? null : row.id
  if (open.value === row.id && !row.readAt) await setRead(row, true)
}

async function setRead(row: ContactMessage, read: boolean) {
  try {
    const res = await content.setMessageRead(row.id, read)
    const i = rows.value.findIndex((r) => r.id === row.id)
    if (i >= 0) rows.value[i] = res.data
    unread.value += read ? -1 : 1
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change that.'
  }
}

async function remove(row: ContactMessage) {
  const { ok } = await ask({
    title: `Delete the enquiry from ${row.name}?`,
    message: 'This cannot be undone, and there is no copy of it anywhere else.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await content.deleteMessage(row.id)
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
watch(unreadOnly, () => {
  page.value = 1
  void load()
})
watch(page, load)

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Enquiries" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ total }} enquiries<span v-if="unread" class="text-warning-600 dark:text-warning-400">
            · {{ unread }} not dealt with</span
          >
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          From the contact form. Reply from your own mailbox — the address is a link.
        </p>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <div
        class="flex flex-wrap items-center gap-4 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Search name, address, subject or message"
          :class="`${inputClass} flex-1 min-w-60`"
        />
        <label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            v-model="unreadOnly"
            type="checkbox"
            class="h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20 dark:border-gray-700"
          />
          Only what is not dealt with
        </label>
      </div>

      <ul class="divide-y divide-gray-100 dark:divide-gray-800">
        <li v-if="loading" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</li>
        <li v-else-if="!rows.length" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
          No enquiries.
        </li>
        <li
          v-for="row in rows"
          :key="row.id"
          class="px-5 py-3.5 sm:px-6"
          :class="!row.readAt ? 'bg-warning-50/40 dark:bg-warning-500/5' : ''"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <button
              type="button"
              class="min-w-0 flex-1 text-left"
              @click="openMessage(row)"
            >
              <p class="text-sm">
                <span
                  class="text-gray-800 dark:text-white/90"
                  :class="!row.readAt ? 'font-semibold' : ''"
                >
                  {{ row.subject }}
                </span>
              </p>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ row.name }} · {{ row.email }} · {{ when(row.createdAt) }}
              </p>
            </button>
            <div class="shrink-0 whitespace-nowrap text-sm">
              <a
                :href="`mailto:${row.email}?subject=${encodeURIComponent(`Re: ${row.subject}`)}`"
                class="text-brand-500 hover:text-brand-600"
              >
                Reply
              </a>
              <button
                type="button"
                class="ml-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                @click="setRead(row, !row.readAt)"
              >
                {{ row.readAt ? 'Not dealt with' : 'Dealt with' }}
              </button>
              <button
                type="button"
                class="ml-4 text-error-500 hover:text-error-600"
                @click="remove(row)"
              >
                Delete
              </button>
            </div>
          </div>

          <p
            v-if="open === row.id"
            class="mt-3 whitespace-pre-line rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-white/[0.02] dark:text-gray-300"
          >
            {{ row.message || 'They left the message blank.' }}
          </p>
        </li>
      </ul>

      <TablePager
        v-model:page="page"
        :total-pages="totalPages"
        :total="total"
        :per-page="PER_PAGE"
        noun="enquiries"
      />
    </div>

    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
      The public site's contact form does not send here yet, so this fills up only once that is
      wired up.
    </p>
  </admin-layout>
</template>
