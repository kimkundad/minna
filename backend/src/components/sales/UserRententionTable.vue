<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTheme } from '@/components/layout/ThemeProvider.vue'

const { isDarkMode } = useTheme()

const COLS = 12
const ROWS = 12
const BASE = [84, 61, 52, 45, 40, 37, 34, 31, 29, 27, 25, 23]
const OFFSETS = [0, 4, -3, 6, -2, 3, -5, 7, -1, 5, -3, 2]

const matrix = computed(() => {
  const result: number[][] = []
  for (let s = 0; s < ROWS; s++) {
    const numPeriods = s + 1
    const row: number[] = []
    for (let col = 0; col < COLS; col++) {
      row.push(col < numPeriods ? Math.min(100, Math.max(1, BASE[col] + OFFSETS[s])) : 0)
    }
    result.push(row)
  }
  // Reverse so the fullest row (12 active cells) is at top
  return result.slice().reverse()
})

function getCellColor(value: number): string {
  if (value === 0) return isDarkMode.value ? 'transparent' : 'transparent'
  if (value <= 25) return '#DDE9FF'
  if (value <= 50) return '#9CB9FF'
  if (value <= 75) return '#7592FF'
  return '#465FFF'
}

interface TooltipState {
  col: number
  value: number
  x: number
  y: number
}

const tooltip = ref<TooltipState | null>(null)
const wrapperRef = ref<HTMLElement | null>(null)

function handleMouseEnter(event: MouseEvent, value: number, col: number) {
  if (value === 0) return
  const cell = event.currentTarget as HTMLElement
  const rect = cell.getBoundingClientRect()
  const wRect = wrapperRef.value?.getBoundingClientRect()
  tooltip.value = {
    col,
    value,
    x: rect.left - (wRect?.left ?? 0) + rect.width / 2,
    y: rect.top - (wRect?.top ?? 0),
  }
}

function handleMouseLeave() {
  tooltip.value = null
}

const colLabels = Array.from({ length: COLS }, (_, i) => i + 1)
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-medium text-gray-800 dark:text-white/90">User Retention</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">User engagement over time</p>
      </div>
    </div>

    <!-- Stat row -->
    <div class="mb-6 flex items-center gap-2">
      <h3 class="text-3xl font-medium text-gray-800 dark:text-white/90">24%</h3>
      <span class="text-success-600 flex items-center text-sm font-medium">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M7.9974 2.66602L7.9974 13.3336M4 6.66334L7.99987 2.66602L12 6.66334"
            stroke="#039855"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        3.2%
      </span>
      <span class="text-sm text-gray-500 dark:text-gray-400">Increased vs last week</span>
    </div>

    <!-- Heatmap -->
    <div ref="wrapperRef" class="relative w-full" @mouseleave="handleMouseLeave">
      <!-- Tooltip -->
      <div
        v-if="tooltip"
        class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 shadow-md dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        :style="{ left: `${tooltip.x}px`, top: `${tooltip.y - 6}px` }"
      >
        <span class="font-medium">{{ tooltip.col + 1 }}</span
        >: {{ tooltip.value }}%
      </div>

      <!-- Table -->
      <table
        class="w-full"
        style="table-layout: fixed; border-collapse: separate; border-spacing: 3px"
      >
        <tbody>
          <tr v-for="(row, rowIdx) in matrix" :key="rowIdx">
            <td v-for="(value, colIdx) in row" :key="colIdx" style="padding: 0">
              <div
                class="w-full transition-opacity duration-150"
                :class="value > 0 ? 'hover:opacity-75 cursor-pointer' : 'cursor-default'"
                :style="{
                  height: '17px',
                  backgroundColor: getCellColor(value),
                  borderRadius: '1px',
                }"
                @mouseenter="(e) => handleMouseEnter(e, value, colIdx)"
              />
            </td>
          </tr>
        </tbody>
        <!-- X-axis labels -->
        <tfoot>
          <tr>
            <td
              v-for="label in colLabels"
              :key="label"
              class="text-center text-xs text-gray-400"
              style="padding: 8px 0 0 0"
            >
              {{ label }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
