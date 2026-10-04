<script setup lang="ts">
import MultiUserIcon from '@/icons/MultiUserIcon.vue'
import FilesIcon from '@/icons/FilesIcon.vue'
import DollarIcon from '@/icons/DollarIcon.vue'
import UserMoneyIcon from '@/icons/UserMoneyIcon.vue'

const statsData = [
  {
    label: 'Users',
    value: '10,590',
    icon: MultiUserIcon,
    iconClass: 'size-6 text-brand-400',
    change: '+3.52%',
    changeType: 'up',
    changeColor: 'success',
  },
  {
    label: 'Projects',
    value: '15,682',
    icon: FilesIcon,
    iconClass: 'size-6 text-blue-400',
    change: '+3.52%',
    changeType: 'up',
    changeColor: 'success',
  },
  {
    label: 'Revenue',
    value: '$90,369',
    icon: DollarIcon,
    iconClass: 'size-6 text-success-500',
    change: '+14.8%',
    changeType: 'up',
    changeColor: 'success',
  },
  {
    label: 'Paid Users',
    value: '520',
    icon: UserMoneyIcon,
    iconClass: 'size-6 text-orange-400',
    change: '-9.05%',
    changeType: 'down',
    changeColor: 'error',
  },
]
</script>

<template>
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
    <div
      v-for="stat in statsData"
      :key="stat.label"
      class="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3"
    >
      <div class="mb-4 flex items-center justify-between">
        <span class="text-sm font-medium text-gray-500 dark:text-gray-400">
          {{ stat.label }}
        </span>
        <component v-if="stat.icon" :is="stat.icon" :class="stat.iconClass" />
      </div>
      <h2 class="mb-2 text-3xl font-semibold text-gray-800 dark:text-white/90">
        {{ stat.value }}
      </h2>
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-500 dark:text-gray-400"> Last 30 Days </span>
        <span
          class="flex items-center text-sm font-medium"
          :class="{
            'text-success-600 dark:text-success-500': stat.changeColor === 'success',
            'text-error-600 dark:text-error-500': stat.changeColor === 'error',
          }"
        >
          <svg
            v-if="stat.changeType === 'up'"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M7.9974 2.66602L7.9974 13.3336M4 6.66334L7.99987 2.66602L12 6.66334"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg
            v-else
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M7.9974 13.3339L7.9974 2.66634M4 9.33652L7.99987 13.3338L12 9.33652"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ stat.change }}
        </span>
      </div>
    </div>
  </div>
</template>
