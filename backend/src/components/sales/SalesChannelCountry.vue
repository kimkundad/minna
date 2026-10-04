<script setup lang="ts">
import CountryMapTwo from './CountryMapTwo.vue'

const countries = [
  {
    name: 'USA',
    flag: '/images/flag/flag-01.png',
    amount: '$20,594',
    percentage: '79%',
  },
  {
    name: 'France',
    flag: '/images/flag/flag-02.png',
    amount: '$20,594',
    percentage: '779%',
  },
  {
    name: 'Japan',
    flag: '/images/flag/flag-03.png',
    amount: '$15,230',
    percentage: '68%',
  },
  {
    name: 'Germany',
    flag: '/images/flag/flag-04.png',
    amount: '$16,450',
    percentage: '72%',
  },
]
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <div>
        <h3 class="text-lg font-medium text-gray-800 dark:text-white/90">Sales by Country</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">Country-wise sales overview</p>
      </div>
    </div>
    <div class="h-[180px] w-full p-3 relative">
      <CountryMapTwo />
    </div>
    <ul class="space-y-4 pt-3">
      <li
        v-for="country in countries"
        :key="country.name"
        class="grid grid-cols-4 justify-between gap-4"
      >
        <div class="col-span-2">
          <div class="flex items-center gap-2.5">
            <img :src="country.flag" class="size-4 rounded-full" :alt="country.name" />
            <span class="text-sm font-medium text-gray-800 dark:text-white/90">
              {{ country.name }}
            </span>
          </div>
        </div>
        <div class="col-span-1">
          <span class="text-sm text-gray-700 dark:text-gray-400">
            {{ country.amount }}
          </span>
        </div>
        <div class="col-span-1 text-right">
          <span class="text-sm text-gray-700 dark:text-gray-400">
            {{ country.percentage }}
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>
