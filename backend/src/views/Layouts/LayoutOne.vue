<script setup lang="ts">
import { useSidebar } from '@/composables/useSidebar'
import HeaderSix from '@/components/example-layout/example-header/HeaderSix.vue'
import Backdrop from '@/components/layout/Backdrop.vue'
import SidebarOne from '@/components/example-layout/example-sidebar/SidebarOne.vue'

const { isExpanded, isHovered, isMobileOpen } = useSidebar()
</script>

<template>
  <div class="min-h-screen xl:flex bg-white dark:bg-black">
    <SidebarOne />
    <Backdrop />
    <div
      class="flex-1 transition-all duration-300 ease-in-out"
      :class="[
        isExpanded || isHovered ? 'xl:ml-[290px]' : 'xl:ml-[90px]',
        isMobileOpen ? 'ml-0' : '',
      ]"
    >
      <HeaderSix />
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

          <div class="grid auto-rows-min gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <div
              class="col-span-2 min-h-dvh rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="col-span-1 min-h-dvh rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
