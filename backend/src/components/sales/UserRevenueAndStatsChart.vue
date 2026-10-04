<script setup lang="ts">
import { ref } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import type { ApexOptions } from 'apexcharts'

type ViewType = 'daily' | 'weekly' | 'monthly'

const selected = ref<ViewType>('monthly')

const series = ref<ApexAxisChartSeries>([
  {
    name: 'Online Sales',
    data: [
      [new Date('2026-01-01').getTime(), 13000],
      [new Date('2026-02-01').getTime(), 13800],
      [new Date('2026-03-01').getTime(), 13200],
      [new Date('2026-04-01').getTime(), 14200],
      [new Date('2026-05-01').getTime(), 13900],
      [new Date('2026-06-01').getTime(), 15240],
      [new Date('2026-07-01').getTime(), 15600],
      [new Date('2026-08-01').getTime(), 17000],
      [new Date('2026-09-01').getTime(), 16500],
      [new Date('2026-10-01').getTime(), 17500],
      [new Date('2026-11-01').getTime(), 17200],
      [new Date('2026-12-01').getTime(), 18000],
    ],
  },
  {
    name: 'Offline Sales',
    data: [
      [new Date('2026-01-01').getTime(), 8500],
      [new Date('2026-02-01').getTime(), 9200],
      [new Date('2026-03-01').getTime(), 8800],
      [new Date('2026-04-01').getTime(), 9800],
      [new Date('2026-05-01').getTime(), 9400],
      [new Date('2026-06-01').getTime(), 10490],
      [new Date('2026-07-01').getTime(), 10800],
      [new Date('2026-08-01').getTime(), 11500],
      [new Date('2026-09-01').getTime(), 10800],
      [new Date('2026-10-01').getTime(), 11800],
      [new Date('2026-11-01').getTime(), 11200],
      [new Date('2026-12-01').getTime(), 11800],
    ],
  },
])

const chartOptions = ref<ApexOptions>({
  legend: {
    show: true,
    position: 'top',
    horizontalAlign: 'left',
    markers: {
      size: 5,
      shape: 'circle',
    },
    itemMargin: {
      horizontal: 10,
    },
  },
  colors: ['#465FFF', '#9CB9FF'],
  chart: {
    fontFamily: 'Outfit, sans-serif',
    type: 'area',
    height: 250,
    toolbar: { show: false },
    zoom: { enabled: false },
  },
  fill: {
    type: 'gradient',
    gradient: {
      shadeIntensity: 1,
      opacityFrom: 0.45,
      opacityTo: 0,
      stops: [0, 100],
    },
  },
  stroke: {
    curve: 'smooth',
    width: [2, 2],
  },
  markers: {
    size: 0,
  },
  grid: {
    xaxis: {
      lines: { show: false },
    },
    yaxis: {
      lines: { show: true },
    },
  },
  dataLabels: {
    enabled: false,
  },
  tooltip: {
    x: {
      format: 'MMM dd, yyyy',
    },
    y: [
      {
        formatter: (val: number) => val.toLocaleString(),
      },
      {
        formatter: (val: number) => '$' + val.toLocaleString(),
      },
    ],
  },
  xaxis: {
    type: 'datetime',
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false },
    labels: {
      format: 'MMM',
      datetimeUTC: false,
    },
    crosshairs: {
      show: true,
      position: 'back',
      stroke: {
        color: '#465FFF',
        width: 1,
        dashArray: 4,
      },
    },
  },
  yaxis: {
    min: 0,
    max: 20000,
    tickAmount: 4,
    labels: {
      formatter: (val: number) => {
        if (val === 0) return '0'
        return (val / 1000).toFixed(0) + 'K'
      },
    },
    title: {
      style: {
        fontSize: '0px',
      },
    },
  },
})
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
    <!-- Header -->
    <div class="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 class="text-lg font-medium text-gray-800 dark:text-white/90">
          Users & Revenue Statistics
        </h3>
        <p class="text-theme-sm mt-1 text-gray-500 dark:text-gray-400">
          Visualize month-to-month progress and engagement.
        </p>
      </div>

      <!-- Toggle -->
      <div
        class="inline-flex h-11 w-fit items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900"
      >
        <button
          v-for="view in ['daily', 'weekly', 'monthly'] as ViewType[]"
          :key="view"
          @click="selected = view"
          :class="[
            'text-theme-sm h-10 rounded-md px-3 py-2.5 font-medium transition-colors capitalize',
            selected === view
              ? 'shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white',
          ]"
        >
          {{ view }}
        </button>
      </div>
    </div>

    <!-- Chart -->
    <div class="custom-scrollbar max-w-full overflow-x-auto">
      <div class="-ml-4 min-w-[1000px] pl-2 xl:min-w-full">
        <VueApexCharts :options="chartOptions" :series="series" type="area" height="250" />
      </div>
    </div>
  </div>
</template>
