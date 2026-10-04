<script setup lang="ts">
// Project Analytics component
import DropdownMenu from '../common/DropdownMenu.vue'
const menuItems = [
  { label: 'View More', onClick: () => console.log('View More clicked') },
  { label: 'Delete', onClick: () => console.log('Delete clicked') },
]
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
    <div class="mb-5 flex justify-between">
      <div>
        <h3 class="mb-1 text-base font-medium text-gray-800 dark:text-white/90">
          Projects Analytics
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">View detailed project insights</p>
      </div>
      <div>
        <DropdownMenu :menu-items="menuItems">
          <template #icon>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M10.2441 6C10.2441 5.0335 11.0276 4.25 11.9941 4.25H12.0041C12.9706 4.25 13.7541 5.0335 13.7541 6C13.7541 6.9665 12.9706 7.75 12.0041 7.75H11.9941C11.0276 7.75 10.2441 6.9665 10.2441 6ZM10.2441 18C10.2441 17.0335 11.0276 16.25 11.9941 16.25H12.0041C12.9706 16.25 13.7541 17.0335 13.7541 18C13.7541 18.9665 12.9706 19.75 12.0041 19.75H11.9941C11.0276 19.75 10.2441 18.9665 10.2441 18ZM11.9941 10.25C11.0276 10.25 10.2441 11.0335 10.2441 12C10.2441 12.9665 11.0276 13.75 11.9941 13.75H12.0041C12.9706 13.75 13.7541 12.9665 13.7541 12C13.7541 11.0335 12.9706 10.25 12.0041 10.25H11.9941Z"
                fill="currentColor"
              />
            </svg>
          </template>
        </DropdownMenu>
      </div>
    </div>
    <div class="mb-3 flex justify-between gap-4">
      <div class="flex gap-1">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3.12012 16.5216V6.47998C3.12012 5.68469 3.76482 5.03998 4.56012 5.03998H8.64012C9.09337 5.03998 9.52017 5.25338 9.79212 5.61598L11.0881 7.34398C11.3601 7.70658 11.7869 7.91998 12.2401 7.91998H18.2401C19.0354 7.91998 19.6801 8.56469 19.6801 9.35998V11.5404M19.6801 11.5404C20.5438 11.6866 21.101 12.5919 20.7882 13.4521L18.9555 18.4921C18.7485 19.0612 18.2077 19.44 17.6022 19.44H4.56664C3.74345 19.44 3.12642 18.7623 3.12538 17.9999M19.6801 11.5404C19.6008 11.527 19.5189 11.52 19.4349 11.52H6.39936C5.79383 11.52 5.25299 11.8988 5.04606 12.4679L3.21332 17.5079C3.15361 17.672 3.12561 17.8379 3.12538 17.9999M3.12538 17.9999V16.5216"
            stroke="#667085"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="text-gray-500 dark:text-white/90"> Total Projects </span>
      </div>
      <div>
        <h3 class="text-xl font-medium text-gray-800 dark:text-white/90">15,682</h3>
      </div>
    </div>
    <div class="grid grid-cols-1 gap-1 rounded-2xl bg-gray-100 p-1 sm:grid-cols-2 dark:bg-white/3">
      <div
        class="flex flex-col rounded-t-xl bg-white p-5 sm:rounded sm:rounded-tl-xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm text-gray-700 dark:text-gray-400"> Today </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10.678 2.29169L3.9873 11.696H9.32126L9.32126 17.7084L16.012 8.30404L10.678 8.30404V2.29169Z"
              stroke="#9B8AFB"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h2 class="mb-1 text-xl font-medium text-gray-800 dark:text-white/90">120</h2>
        <span class="text-xs text-gray-400">Project created</span>
      </div>
      <div
        class="flex flex-col rounded rounded-tr-xl bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
      >
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm text-gray-700 dark:text-gray-400"> Yesterday </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M13.3337 10H10.0003L10.0002 5.41669M17.7087 10C17.7087 14.2572 14.2575 17.7084 10.0003 17.7084C5.74313 17.7084 2.29199 14.2572 2.29199 10C2.29199 5.74283 5.74313 2.29169 10.0003 2.29169C14.2575 2.29169 17.7087 5.74283 17.7087 10Z"
              stroke="#53B1FD"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h2 class="mb-1 text-xl font-medium text-gray-800 dark:text-white/90">392</h2>
        <span class="text-xs text-gray-400">Project created</span>
      </div>
      <div
        class="flex flex-col rounded rounded-bl-xl bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
      >
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm text-gray-700 dark:text-gray-400"> This Month </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6.66634 2.29169V3.75002M13.333 2.29169V3.75002M3.33301 7.50002H16.6663M4.58301 17.0834H15.4163C16.1067 17.0834 16.6663 16.5237 16.6663 15.8334V5.00002C16.6663 4.30966 16.1067 3.75002 15.4163 3.75002H4.58301C3.89265 3.75002 3.33301 4.30966 3.33301 5.00002V15.8334C3.33301 16.5237 3.89265 17.0834 4.58301 17.0834Z"
              stroke="#12B76A"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h2 class="mb-1 text-xl font-medium text-gray-800 dark:text-white/90">3,835</h2>
        <div class="flex items-center gap-1 text-xs">
          <span class="text-success-600 text-sm font-medium"> +2,093 </span>
          <span class="text-gray-400">from last month</span>
        </div>
      </div>
      <div
        class="flex flex-col rounded rounded-br-xl bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
      >
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm text-gray-700 dark:text-gray-400"> This Year </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12.7517 7.22333L10.0137 9.96127M12.7517 7.22333L14.805 7.90777L16.6303 6.08247L14.5768 5.39799L13.8924 3.34453L12.0671 5.16982L12.7517 7.22333ZM9.56299 5.33265C7.1792 5.55321 5.31283 7.55865 5.31283 10C5.31283 12.5889 7.41149 14.6875 10.0003 14.6875C12.4511 14.6875 14.4626 12.8067 14.6702 10.4098M17.5908 8.64977C17.6682 9.08819 17.7087 9.53935 17.7087 10C17.7087 14.2572 14.2575 17.7084 10.0003 17.7084C5.74313 17.7084 2.29199 14.2572 2.29199 10C2.29199 5.74283 5.74313 2.29169 10.0003 2.29169C10.4462 2.29169 10.8832 2.32955 11.3084 2.40222"
              stroke="#F670C7"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h2 class="mb-1 text-xl font-medium text-gray-800 dark:text-white/90">12,958</h2>
        <div class="flex items-center gap-1 text-xs">
          <span class="text-success-600 text-sm font-medium"> +8,532 </span>
          <span class="text-gray-400">from last year</span>
        </div>
      </div>
    </div>
  </div>
</template>
