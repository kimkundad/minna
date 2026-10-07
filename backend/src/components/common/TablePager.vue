<script setup lang="ts">
import { computed } from 'vue'

/**
 * The pager under every table in the admin.
 *
 * Numbered, not just previous and next: with only arrows the only way to reach
 * page nine is to press next eight times, and there is no way to tell where you
 * are without counting. The window around the current page keeps the control a
 * fixed width however many pages there are.
 *
 * It also says how many rows there are in total, because "showing 21–40 of 312"
 * is usually the thing someone actually wanted to know.
 */
const props = defineProps<{
  page: number
  totalPages: number
  total: number
  perPage: number
  /** What the rows are, for the summary line: "courses", "students". */
  noun?: string
}>()

const emit = defineEmits<{ 'update:page': [number] }>()

const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.perPage + 1))
const to = computed(() => Math.min(props.page * props.perPage, props.total))

/**
 * Up to seven slots: first, last, the three around the current page, and a gap
 * where numbers were left out. The gap is rendered as text rather than a
 * button, so nothing in the control is clickable and inert.
 */
const slots = computed<(number | 'gap')[]>(() => {
  const { page, totalPages } = props
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

  const out: (number | 'gap')[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(totalPages - 1, page + 1)

  if (start > 2) out.push('gap')
  for (let n = start; n <= end; n++) out.push(n)
  if (end < totalPages - 1) out.push('gap')

  out.push(totalPages)
  return out
})

function go(n: number) {
  if (n < 1 || n > props.totalPages || n === props.page) return
  emit('update:page', n)
}

const btn =
  'min-w-9 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5'
const current =
  'min-w-9 rounded-lg border border-brand-500 bg-brand-500 px-3 py-2 text-sm font-medium text-white'
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6"
  >
    <p class="text-sm text-gray-500 dark:text-gray-400">
      <template v-if="props.total">
        Showing {{ from }}–{{ to }} of {{ props.total }} {{ props.noun ?? 'rows' }}
      </template>
      <template v-else>No {{ props.noun ?? 'rows' }}</template>
    </p>

    <nav v-if="props.totalPages > 1" class="flex flex-wrap items-center gap-2" aria-label="Pages">
      <button
        type="button"
        :class="btn"
        :disabled="props.page <= 1"
        @click="go(props.page - 1)"
      >
        Previous
      </button>

      <template v-for="(slot, i) in slots" :key="`${slot}-${i}`">
        <span v-if="slot === 'gap'" class="px-1 text-sm text-gray-400">…</span>
        <button
          v-else
          type="button"
          :class="slot === props.page ? current : btn"
          :aria-current="slot === props.page ? 'page' : undefined"
          @click="go(slot)"
        >
          {{ slot }}
        </button>
      </template>

      <button
        type="button"
        :class="btn"
        :disabled="props.page >= props.totalPages"
        @click="go(props.page + 1)"
      >
        Next
      </button>
    </nav>
  </div>
</template>
