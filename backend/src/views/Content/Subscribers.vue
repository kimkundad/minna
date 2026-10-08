<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { useConfirm } from '@/composables/useConfirm'
import { ApiError, content, type Subscriber } from '@/lib/api'

/**
 * The mailing list.
 *
 * Three states, not two: confirmed, waiting to confirm, and gone. Somebody who
 * typed an address and never clicked the link has not agreed to anything, and
 * mailing them is the difference between a newsletter and spam.
 *
 * Taking somebody off records them as unsubscribed rather than deleting the
 * row. If the record goes, the next import from anywhere puts them back — the
 * record of having asked is the point of keeping it.
 */
const { ask } = useConfirm()

const rows = ref<Subscriber[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const counts = ref({ confirmed: 0, pending: 0, unsubscribed: 0 })
const PER_PAGE = 30

const q = ref('')
const state = ref<'' | 'confirmed' | 'pending' | 'unsubscribed'>('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await content.subscribers({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...(state.value ? { state: state.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
    counts.value = {
      confirmed: res.meta.confirmed,
      pending: res.meta.pending,
      unsubscribed: res.meta.unsubscribed,
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the list.'
  } finally {
    loading.value = false
  }
}

async function remove(row: Subscriber) {
  const { ok } = await ask({
    title: `Take ${row.email} off the list?`,
    message:
      'They are recorded as unsubscribed rather than deleted, so an import cannot quietly put them back on.',
    confirmLabel: 'Unsubscribe them',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await content.unsubscribe(row.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not do that.'
  }
}

/** The confirmed addresses as a file, for whoever sends the mail. */
function download() {
  window.open(content.exportSubscribers(), '_blank')
}

function stateOf(row: Subscriber): { text: string; cls: string } {
  if (row.unsubscribedAt) {
    return { text: 'Unsubscribed', cls: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400' }
  }
  if (!row.confirmedAt) {
    return {
      text: 'Not confirmed',
      cls: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
    }
  }
  return {
    text: 'Confirmed',
    cls: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  }
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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
watch(state, () => {
  page.value = 1
  void load()
})
watch(page, load)

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Subscribers" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ counts.confirmed }} confirmed
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {{ counts.pending }} never confirmed · {{ counts.unsubscribed }} unsubscribed.
            Only the confirmed ones have agreed to be mailed.
          </p>
        </div>
        <button
          type="button"
          :disabled="!counts.confirmed"
          class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          @click="download"
        >
          Download the confirmed addresses
        </button>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-2 sm:px-6"
      >
        <input v-model="q" type="search" placeholder="Search an address" :class="inputClass" />
        <select v-model="state" :class="inputClass">
          <option value="">Everyone</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Never confirmed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Address</th>
              <th class="px-5 py-3 font-medium">State</th>
              <th class="px-5 py-3 font-medium">Signed up</th>
              <th class="px-5 py-3 font-medium sm:px-6"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="4" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="4" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Nobody on the list.
              </td>
            </tr>
            <tr v-for="row in rows" :key="row.id" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90 sm:px-6">
                {{ row.email }}
              </td>
              <td class="px-5 py-3.5">
                <span
                  class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                  :class="stateOf(row).cls"
                >
                  {{ stateOf(row).text }}
                </span>
              </td>
              <td class="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                {{ when(row.createdAt) }}
              </td>
              <td class="px-5 py-3.5 text-right text-sm sm:px-6">
                <button
                  v-if="!row.unsubscribedAt"
                  type="button"
                  class="text-error-500 hover:text-error-600"
                  @click="remove(row)"
                >
                  Unsubscribe
                </button>
                <span v-else class="text-xs text-gray-400">
                  left {{ when(row.unsubscribedAt) }}
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
        noun="subscribers"
      />
    </div>

    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
      The public site's signup form does not send here yet, so this fills up only once that is wired
      up.
    </p>
  </admin-layout>
</template>
