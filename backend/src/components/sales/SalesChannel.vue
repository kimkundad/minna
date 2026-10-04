<script setup lang="ts">
import VueApexCharts from 'vue3-apexcharts'
import type { ApexOptions } from 'apexcharts'

const darkCount = 14
const lightCount = 14
const grayCount = 14

const chartOptions: ApexOptions = {
  colors: [
    ...Array(darkCount).fill('#465FFF'),
    ...Array(lightCount).fill('#36BFFA'),
    ...Array(grayCount).fill('#E4E7EC'),
  ],
  chart: {
    fontFamily: 'Outfit, sans-serif',
    type: 'bar',
    height: 32,
    sparkline: { enabled: true },
    toolbar: { show: false },
    animations: { enabled: false },
  },
  plotOptions: {
    bar: {
      horizontal: false,
      distributed: true,
      columnWidth: '70%',
      borderRadius: 1,
      borderRadiusApplication: 'around',
    },
  },
  dataLabels: { enabled: false },
  xaxis: {
    labels: { show: false },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: { show: false },
  grid: {
    show: false,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  },
  tooltip: { enabled: false },
  legend: { show: false },
}

const chartSeries = [{ data: Array(darkCount + lightCount + grayCount).fill(100) }]
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
    <div class="mb-4 flex items-center justify-between gap-2">
      <div>
        <h3 class="text-lg font-medium text-gray-800 dark:text-white/90">Sales by Channel</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">Channel performance overview</p>
      </div>
    </div>
    <div class="mb-6 flex items-center gap-2">
      <h3 class="text-3xl font-medium text-gray-800 dark:text-white/90">75</h3>
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
    <VueApexCharts :options="chartOptions" :series="chartSeries" type="bar" height="32" />
    <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-800">
      <div class="flex gap-6 border-b border-gray-200 px-4 py-3 dark:border-gray-800 flex-wrap">
        <div class="flex items-center gap-1.5">
          <span class="bg-brand-500 inline-block size-2 rounded-full"></span>
          <span class="text-sm text-gray-700 dark:text-gray-400">Website</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="bg-blue-light-400 inline-block size-2 rounded-full"></span>
          <span class="text-sm text-gray-700 dark:text-gray-400">Email</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="inline-block size-2 rounded-full bg-gray-200 dark:bg-gray-700"></span>
          <span class="text-sm text-gray-700 dark:text-gray-400">Social Media</span>
        </div>
      </div>
      <div class="p-4">
        <table class="w-full">
          <thead>
            <tr>
              <th class="pb-2 text-left text-sm font-normal text-gray-400">Channels</th>
              <th class="pb-2 text-left text-sm font-normal text-gray-400">Metric</th>
              <th class="pb-2 text-right text-sm font-normal text-gray-400">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="py-2 text-sm text-gray-700 dark:text-gray-400">Website</td>
              <td class="py-2 text-sm text-gray-700 dark:text-gray-400">35</td>
              <td class="py-2 text-right text-sm text-gray-700 dark:text-gray-400">
                <span class="flex items-center justify-end gap-1.5 text-success-600">
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
                  5.2%
                </span>
              </td>
            </tr>
            <tr>
              <td class="py-2 text-sm text-gray-700 dark:text-gray-400">Email</td>
              <td class="py-2 text-sm text-gray-700 dark:text-gray-400">25</td>
              <td class="py-2 text-right text-sm text-gray-700 dark:text-gray-400">
                <span class="text-error-600 flex items-center justify-end gap-1.5 font-medium">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M7.9974 13.3336L7.9974 2.66602M4 9.33619L7.99987 13.3335L12 9.33619"
                      stroke="#D92D20"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  5.2%
                </span>
              </td>
            </tr>
            <tr>
              <td class="py-2 text-sm text-gray-700 dark:text-gray-400">Social Media</td>
              <td class="py-2 text-sm text-gray-700 dark:text-gray-400">59</td>
              <td class="py-2 text-right text-sm text-gray-700 dark:text-gray-400">
                <span class="text-success-600 flex items-center justify-end gap-1.5 font-medium">
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
                  5.2%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
