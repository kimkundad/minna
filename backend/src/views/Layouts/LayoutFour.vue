<script setup lang="ts">
import { useSidebar } from '@/composables/useSidebar'
import Backdrop from '@/components/layout/Backdrop.vue'
import SidebarFour from '@/components/example-layout/example-sidebar/SidebarFour.vue'
import HeaderAlt from '@/components/example-layout/example-header/HeaderAlt.vue'

const { isExpanded, isMobileOpen } = useSidebar()
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-black">
    <SidebarFour />
    <Backdrop />
    <div
      class="flex-1 transition-all duration-300 ease-in-out"
      :class="[isExpanded || isMobileOpen ? 'xl:ml-[290px]' : 'ml-0']"
    >
      <HeaderAlt />
      <main class="flex-1 p-4 md:p-6 pb-20 w-full mx-auto max-w-screen-2xl">
        <div class="space-y-6">
          <div class="grid auto-rows-min gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <div
              class="h-40 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="h-40 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="h-40 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="h-40 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
          </div>
          <div class="grid auto-rows-min gap-6 lg:grid-cols-3">
            <div
              class="min-h-dvh rounded-xl border border-gray-200 bg-gray-50 lg:col-span-1 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="min-h-dvh rounded-xl border border-gray-200 bg-gray-50 lg:col-span-1 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="min-h-dvh rounded-xl border border-gray-200 bg-gray-50 lg:col-span-1 dark:border-gray-800 dark:bg-white/3"
            ></div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
