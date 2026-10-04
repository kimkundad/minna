<script setup lang="ts">
// User Analytics component
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
        <h3 class="mb-1 text-base font-medium text-gray-800 dark:text-white/90">User Analytics</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">Platform user insights</p>
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
          class="text-gray-500 dark:text-gray-400"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14.109 5.10414C14.4743 4.94178 14.8789 4.85156 15.3045 4.85156C16.932 4.85156 18.2514 6.17095 18.2514 7.79851C18.2514 9.42606 16.932 10.7455 15.3045 10.7455C14.8794 10.7455 14.4753 10.6555 14.1103 10.4935M15.797 13.2207C19.5989 13.4453 20.821 16.009 21.2134 17.6906C21.3993 18.4875 20.7424 19.1487 19.9241 19.1487H17.59M11.7512 7.79855C11.7512 9.4261 10.4318 10.7455 8.80427 10.7455C7.17671 10.7455 5.85732 9.4261 5.85732 7.79855C5.85732 6.171 7.17671 4.8516 8.80427 4.8516C10.4318 4.8516 11.7512 6.171 11.7512 7.79855ZM8.74941 13.205C12.9833 13.205 14.3026 15.9309 14.7132 17.6906C14.8991 18.4875 14.2422 19.1487 13.4239 19.1487H4.07489C3.25661 19.1487 2.59973 18.4875 2.78565 17.6906C3.19623 15.9309 4.51554 13.205 8.74941 13.205Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="text-gray-500 dark:text-white/90">Total Users</span>
      </div>
      <div>
        <h3 class="text-xl font-medium text-gray-800 dark:text-white/90">10,590</h3>
      </div>
    </div>
    <div class="grid grid-cols-1 gap-1 rounded-2xl bg-gray-100 p-1 sm:grid-cols-2 dark:bg-white/3">
      <div
        class="flex flex-col rounded-t-xl bg-white p-5 sm:rounded sm:rounded-tl-xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm text-gray-700 dark:text-gray-400"> Free Users </span>
          <svg
            class="text-brand-500"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M14.109 5.10414C14.4743 4.94178 14.8789 4.85156 15.3045 4.85156C16.932 4.85156 18.2514 6.17095 18.2514 7.79851C18.2514 9.42606 16.932 10.7455 15.3045 10.7455C14.8794 10.7455 14.4753 10.6555 14.1103 10.4935M15.797 13.2207C19.5989 13.4453 20.821 16.009 21.2134 17.6906C21.3993 18.4875 20.7424 19.1487 19.9241 19.1487H17.59M11.7512 7.79855C11.7512 9.4261 10.4318 10.7455 8.80427 10.7455C7.17671 10.7455 5.85732 9.4261 5.85732 7.79855C5.85732 6.171 7.17671 4.8516 8.80427 4.8516C10.4318 4.8516 11.7512 6.171 11.7512 7.79855ZM8.74941 13.205C12.9833 13.205 14.3026 15.9309 14.7132 17.6906C14.8991 18.4875 14.2422 19.1487 13.4239 19.1487H4.07489C3.25661 19.1487 2.59973 18.4875 2.78565 17.6906C3.19623 15.9309 4.51554 13.205 8.74941 13.205Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h2 class="mb-1 text-xl font-medium text-gray-800 dark:text-white/90">15,682</h2>
        <div class="flex items-center gap-1 text-xs">
          <span class="text-sm font-medium text-gray-500 dark:text-gray-400"> 95% </span>
          <span class="text-gray-400">of total user</span>
        </div>
      </div>
      <div
        class="flex flex-col bg-white p-5 sm:rounded sm:rounded-tr-xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div class="mb-4 flex items-center justify-between">
          <span class="text-sm text-gray-700 dark:text-gray-400"> Paid Users </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15.1 11.9814C15.1 11.4015 14.6298 10.9313 14.0499 10.9313H13.5C12.8373 10.9313 12.3 11.4686 12.3 12.1313V12.3434C12.3 12.8437 12.6102 13.2913 13.0786 13.467L14.3214 13.9331C14.7898 14.1087 15.1 14.5565 15.1 15.0567V15.2687C15.1 15.9315 14.5627 16.4687 13.9 16.4687H13.3501C12.7702 16.4687 12.3 15.9986 12.3 15.4186M13.7 16.4687V17.4M13.7 9.99998V10.9313M8.33789 16.6H5.14531C4.48257 16.6 3.94531 16.0627 3.94531 15.4V14.3512C3.94531 12.3629 5.55709 10.7512 7.54531 10.7512H8.35938M12.8748 5.47565C12.8748 7.06384 11.5873 8.35134 9.99912 8.35134C8.41096 8.35134 7.12344 7.06384 7.12344 5.47565C7.12344 3.88746 8.41096 2.59998 9.99912 2.59998C11.5873 2.59998 12.8748 3.88746 12.8748 5.47565Z"
              stroke="#FD853A"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h2 class="mb-1 text-xl font-medium text-gray-800 dark:text-white/90">305</h2>
        <div class="flex items-center gap-1 text-xs">
          <span class="text-sm font-medium text-gray-500 dark:text-gray-400"> 5% </span>
          <span class="text-gray-400">of total user</span>
        </div>
      </div>
      <div
        class="flex flex-col bg-white p-5 sm:rounded sm:rounded-bl-xl dark:border-gray-800 dark:bg-gray-900"
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
        <h2 class="mb-1 text-xl font-medium text-gray-800 dark:text-white/90">4,925</h2>
        <div class="flex items-center gap-1 text-xs">
          <span class="text-success-600 text-sm font-medium"> +5,238 </span>
          <span class="text-gray-400">from last month</span>
        </div>
      </div>
      <div
        class="flex flex-col rounded-b-xl bg-white p-5 sm:rounded sm:rounded-br-xl dark:border-gray-800 dark:bg-gray-900"
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
        <h2 class="mb-1 text-xl font-medium text-gray-800 dark:text-white/90">12,489</h2>
        <div class="flex items-center gap-1 text-xs">
          <span class="text-success-600 text-sm font-medium"> +12,495 </span>
          <span class="text-gray-400">from last year</span>
        </div>
      </div>
    </div>
  </div>
</template>
