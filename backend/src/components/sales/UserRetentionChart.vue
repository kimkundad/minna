<script setup lang="ts">
import { computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { useTheme } from '@/components/layout/ThemeProvider.vue'

const { isDarkMode } = useTheme()

const series = computed(() => {
  const base = [84, 61, 52, 45, 40, 37, 34, 31, 29, 27, 25, 23]
  const offsets = [0, 4, -3, 6, -2, 3, -5, 7, -1, 5, -3, 2]
  const result = []

  for (let s = 0; s < 12; s++) {
    const numPeriods = s + 1
    const rowData: { x: string; y: number }[] = []
    for (let col = 0; col < 12; col++) {
      rowData.push({
        x: (col + 1).toString(),
        y: col < numPeriods ? Math.min(100, Math.max(1, base[col] + offsets[s])) : 0,
      })
    }
    result.push({
      name: `R${12 - s}`,
      data: rowData,
    })
  }
  return result
})

const chartOptions = computed<ApexOptions>(() => {
  const strokeColor = isDarkMode.value ? '#1D2939' : '#ffffff'

  return {
    chart: {
      type: 'heatmap',
      fontFamily: 'Outfit, sans-serif',
      background: 'transparent',
      toolbar: { show: false },
    },
    dataLabels: { enabled: false },
    plotOptions: {
      heatmap: {
        radius: 3,
        enableShades: false,
        colorScale: {
          ranges: [
            { from: 0, to: 0, color: isDarkMode.value ? '#1D2939' : '#F9FAFB' },
            { from: 1, to: 25, color: '#DDE9FF' },
            { from: 26, to: 50, color: '#9CB9FF' },
            { from: 51, to: 75, color: '#7592FF' },
            { from: 76, to: 100, color: '#465FFF' },
          ],
        },
      },
    },
    stroke: {
      width: 2,
      colors: [strokeColor],
    },
    xaxis: {
      type: 'category',
      categories: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { fontSize: '12px', colors: ['#98A2B3'] },
      },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        show: false,
        style: { fontSize: '12px', colors: ['#98A2B3'] },
      },
    },
    grid: {
      show: false,
      padding: { left: 10, right: 0 },
    },
    legend: { show: false },
  }
})
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
    <div class="mb-4 flex items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-medium text-gray-800 dark:text-white/90">User Retention</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">User engagement over time</p>
      </div>
    </div>
    <div class="flex items-center gap-2 mb-4">
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
    <div class="-ml-5 -mt-5">
      <VueApexCharts :options="chartOptions" :series="series" type="heatmap" :height="280" />
    </div>
  </div>
</template>
