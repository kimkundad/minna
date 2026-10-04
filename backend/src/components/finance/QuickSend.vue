<template>
  <div
    class="rounded-2xl border border-gray-200 bg-white p-6 md:col-span-1 dark:border-gray-800 dark:bg-white/3"
  >
    <h3 class="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Quick send</h3>

    <!-- User Avatars -->
    <div class="relative mb-4">
      <!-- Previous Arrow -->
      <button
        v-if="!atStart"
        type="button"
        @click="scrollPrev"
        class="absolute top-1/2 left-0 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 transition-all hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12.5 15L7.5 10L12.5 5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <!-- Left Mask -->
      <div
        v-if="!atStart"
        class="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-16 bg-gradient-to-r from-white via-white/80 to-transparent dark:from-[#1C2434] dark:via-[#1C2434]/80"
      ></div>

      <div
        ref="scrollContainer"
        @scroll="checkScroll"
        class="no-scrollbar flex items-center gap-3 overflow-x-hidden scroll-smooth px-0.5 py-1"
      >
        <button
          v-for="user in users"
          :key="user.id"
          type="button"
          @click="selectedUser = user.id"
          :class="[
            'relative flex size-10 shrink-0 items-center justify-center rounded-full p-0.5 transition-all',
            selectedUser === user.id
              ? 'ring-1 ring-brand-500'
              : 'bg-gray-100 ring-0 hover:ring-1 hover:ring-brand-500 dark:bg-gray-800',
          ]"
        >
          <img
            class="size-full rounded-full object-cover"
            :src="user.avatar"
            :alt="`User ${user.id}`"
          />
        </button>
      </div>

      <!-- Right Mask -->
      <div
        v-if="!atEnd"
        class="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-16 bg-gradient-to-l from-white via-white/80 to-transparent dark:from-[#1C2434] dark:via-[#1C2434]/80"
      ></div>

      <!-- Next Arrow -->
      <button
        v-if="!atEnd"
        type="button"
        @click="scrollNext"
        class="absolute top-1/2 right-0 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 transition-all hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M7.5 15L12.5 10L7.5 5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <form class="space-y-3" @submit.prevent>
      <!-- Send From -->
      <div>
        <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Send From
        </label>
        <div class="relative" v-click-outside="() => (isSendFromOpen = false)">
          <button
            type="button"
            @click="isSendFromOpen = !isSendFromOpen"
            class="flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-normal text-gray-700 shadow-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <span>{{ selectedSendFrom }}</span>
            <svg
              :class="[
                'text-gray-700 transition-transform dark:text-gray-400',
                { 'rotate-180': isSendFromOpen },
              ]"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4.79102 8.021L9.99935 13.2293L15.2077 8.021"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <div
            v-if="isSendFromOpen"
            class="absolute left-0 z-10 mt-2 w-full rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            <button
              type="button"
              @click="handleSendFromSelect('Visa •••• •••• 3657')"
              class="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Visa •••• •••• 3657
            </button>
            <button
              type="button"
              @click="handleSendFromSelect('Master •••• •••• 4912')"
              class="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Master •••• •••• 4912
            </button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <!-- Currency -->
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Currency
          </label>
          <div class="relative" v-click-outside="() => (isCurrencyOpen = false)">
            <button
              type="button"
              @click="isCurrencyOpen = !isCurrencyOpen"
              class="flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-normal text-gray-700 shadow-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <span>{{ selectedCurrency }}</span>
              <svg
                :class="['transition-transform', { 'rotate-180': isCurrencyOpen }]"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 7.5L10 12.5L15 7.5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <div
              v-if="isCurrencyOpen"
              class="absolute left-0 z-10 mt-2 w-full rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            >
              <button
                type="button"
                @click="handleCurrencySelect('$ USD')"
                class="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              >
                $ USD
              </button>
              <button
                type="button"
                @click="handleCurrencySelect('€ EUR')"
                class="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              >
                € EUR
              </button>
            </div>
          </div>
        </div>
        <!-- Amount -->
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Amount
          </label>
          <input
            type="text"
            placeholder="0.00"
            class="focus:border-brand-500 focus:ring-brand-500 h-10 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 shadow-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
      </div>

      <button
        type="submit"
        class="flex h-10 w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3.5 text-sm font-normal text-white shadow-sm transition-colors hover:bg-brand-600"
      >
        Send Money
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import vClickOutside from '../common/v-click-outside.vue'

const users = [
  { id: 17, avatar: '/images/user/user-17.jpg' },
  { id: 18, avatar: '/images/user/user-18.jpg' },
  { id: 19, avatar: '/images/user/user-19.jpg' },
  { id: 20, avatar: '/images/user/user-20.jpg' },
  { id: 21, avatar: '/images/user/user-21.jpg' },
  { id: 22, avatar: '/images/user/user-22.jpg' },
  { id: 23, avatar: '/images/user/user-23.jpg' },
  { id: 24, avatar: '/images/user/user-24.jpg' },
  { id: 25, avatar: '/images/user/user-25.jpg' },
  { id: 26, avatar: '/images/user/user-26.jpg' },
]

const selectedUser = ref(17)
const atStart = ref(true)
const atEnd = ref(false)
const scrollContainer = ref<HTMLDivElement | null>(null)

const isSendFromOpen = ref(false)
const selectedSendFrom = ref('Visa •••• •••• 3657')

const isCurrencyOpen = ref(false)
const selectedCurrency = ref('$ USD')

const checkScroll = () => {
  if (scrollContainer.value) {
    const { scrollLeft, clientWidth, scrollWidth } = scrollContainer.value
    atStart.value = scrollLeft <= 5
    atEnd.value = scrollLeft + clientWidth >= scrollWidth - 5
  }
}

const scrollNext = () => {
  scrollContainer.value?.scrollBy({ left: 120, behavior: 'smooth' })
}

const scrollPrev = () => {
  scrollContainer.value?.scrollBy({ left: -120, behavior: 'smooth' })
}

const handleSendFromSelect = (value: string) => {
  selectedSendFrom.value = value
  isSendFromOpen.value = false
}

const handleCurrencySelect = (value: string) => {
  selectedCurrency.value = value
  isCurrencyOpen.value = false
}

onMounted(() => {
  checkScroll()
  window.addEventListener('resize', checkScroll)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScroll)
})
</script>
