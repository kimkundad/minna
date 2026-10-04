<template>
  <div
    class="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3"
  >
    <div class="mb-6 flex flex-col justify-between gap-5 sm:flex-row">
      <div>
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          Cashflow Overview
        </h3>
      </div>
      <div class="flex gap-2">
        <!-- Year Dropdown -->
        <div class="relative" v-click-outside="() => setIsYearOpen(false)">
          <button
            @click="setIsYearOpen(!isYearOpen)"
            class="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2.5 text-sm font-medium text-gray-700 shadow-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          >
            <span>{{ selectedYear }}</span>
            <svg
              :class="['transition-transform', { 'rotate-180': isYearOpen }]"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4.3125 7.21875L9 11.9063L13.6875 7.21875"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <div
            v-if="isYearOpen"
            class="absolute right-0 z-50 mt-1.5 w-38 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            <button
              v-for="year in years"
              :key="year"
              @click="handleYearSelect(year)"
              :class="[
                'w-full rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5',
                selectedYear === year
                  ? 'bg-gray-100 font-medium dark:bg-white/5'
                  : 'font-normal',
              ]"
            >
              {{ year }}
            </button>
          </div>
        </div>

        <!-- Timeframe Dropdown -->
        <div class="relative" v-click-outside="() => setIsTimeframeOpen(false)">
          <button
            @click="setIsTimeframeOpen(!isTimeframeOpen)"
            class="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2.5 text-sm font-medium text-gray-700 shadow-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          >
            <span>{{ selectedTimeframe }}</span>
            <svg
              :class="['transition-transform', { 'rotate-180': isTimeframeOpen }]"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4.3125 7.21875L9 11.9063L13.6875 7.21875"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <div
            v-if="isTimeframeOpen"
            class="absolute right-0 z-50 mt-1.5 w-38 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            <button
              v-for="tf in timeframeOptions"
              :key="tf"
              @click="handleTimeframeSelect(tf)"
              :class="[
                'w-full rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5',
                selectedTimeframe === tf
                  ? 'bg-gray-100 font-medium dark:bg-white/5'
                  : 'font-normal',
              ]"
            >
              {{ tf }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p class="mb-1.5 text-sm text-gray-500 dark:text-gray-400">
          Total Revenue
        </p>
        <div class="flex items-center gap-3">
          <h4 class="text-2xl font-medium text-gray-800 dark:text-white/90">
            $9,758.00
          </h4>
          <span
            class="flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-600 dark:bg-success-500/10 dark:text-success-500"
          >
            +7.96%
          </span>
        </div>
      </div>

      <div class="flex items-center gap-5">
        <button
          @click="incomeHidden = !incomeHidden"
          :class="[
            'flex cursor-pointer items-center gap-2 select-none transition-opacity duration-200 hover:opacity-80',
            { 'opacity-40': incomeHidden },
          ]"
        >
          <span class="block size-2.5 rounded-full bg-brand-500"></span>
          <span class="text-sm font-normal text-gray-800 dark:text-white/90">
            Income
          </span>
        </button>
        <button
          @click="expenseHidden = !expenseHidden"
          :class="[
            'flex cursor-pointer items-center gap-2 select-none transition-opacity duration-200 hover:opacity-80',
            { 'opacity-40': expenseHidden },
          ]"
        >
          <span class="block size-2.5 rounded-full bg-brand-300"></span>
          <span class="text-sm font-normal text-gray-800 dark:text-white/90">
            Expense
          </span>
        </button>
      </div>
    </div>

    <div class="-ml-4 h-[250px]">
      <apexchart
        :options="chartOptions"
        :series="visibleSeries"
        type="bar"
        height="250"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import vClickOutside from '../common/v-click-outside.vue'
import { useTheme } from '../layout/ThemeProvider.vue'
import type { ApexOptions } from 'apexcharts'

const { isDarkMode } = useTheme()

const years = ['2025', '2024', '2023', '2022', '2021', '2020']
const timeframeOptions = ['3 Month', '6 Month', '1 Year']

const isYearOpen = ref(false)
const selectedYear = ref(years[0])
const isTimeframeOpen = ref(false)
const selectedTimeframe = ref(timeframeOptions[0])

const incomeHidden = ref(false)
const expenseHidden = ref(false)

const setIsYearOpen = (value: boolean) => {
  isYearOpen.value = value
}

const handleYearSelect = (year: string) => {
  selectedYear.value = year
  isYearOpen.value = false
}

const setIsTimeframeOpen = (value: boolean) => {
  isTimeframeOpen.value = value
}

const handleTimeframeSelect = (tf: string) => {
  selectedTimeframe.value = tf
  isTimeframeOpen.value = false
}

const series = [
  {
    name: 'Income',
    data: [
      9500, 6400, 14000, 7500, 9500, 10200, 7000, 11600, 9200, 12500, 7600,
      6400,
    ],
  },
  {
    name: 'Expense',
    data: [
      6200, 4100, 9200, 5000, 6300, 6800, 4600, 7600, 6000, 8200, 5000, 4100,
    ],
  },
]

const visibleSeries = computed(() => {
  return series.filter((s) => {
    if (s.name === 'Income') return !incomeHidden.value
    if (s.name === 'Expense') return !expenseHidden.value
    return true
  })
})

const chartOptions = computed<ApexOptions>(() => ({
  colors: ['#465FFF', '#9CB9FF'],
  chart: {
    type: 'bar',
    height: 250,
    stacked: true,
    toolbar: {
      show: false,
    },
    zoom: {
      enabled: false,
    },
    fontFamily: 'Outfit, sans-serif',
  },
  plotOptions: {
    bar: {
      horizontal: false,
      columnWidth: '40%',
      borderRadius: 6,
      borderRadiusApplication: 'end',
      borderRadiusWhenStacked: 'last',
    },
  },
  fill: {
    opacity: 1,
  },
  dataLabels: {
    enabled: false,
  },
  xaxis: {
    categories: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
    axisBorder: {
      show: false,
    },
    axisTicks: {
      show: false,
    },
    labels: {
      style: {
        colors: '#98A2B3',
        fontSize: '12px',
      },
    },
  },
  yaxis: {
    labels: {
      style: {
        colors: '#98A2B3',
        fontSize: '12px',
      },
      formatter: (value: number) => {
        if (value >= 1000) return `${value / 1000}K`
        return value.toString()
      },
    },
  },
  grid: {
    xaxis: {
      lines: {
        show: false,
      },
    },
    yaxis: {
      lines: {
        show: true,
      },
    },
    borderColor: isDarkMode.value ? '#2E3545' : '#E9EDF5',
    strokeDashArray: 0,
  },
  legend: {
    show: false,
  },
  tooltip: {
    enabled: true,
    x: {
      show: false,
    },
    y: {
      formatter: (value: number) => `$${value}`,
    },
  },
}))
</script>
