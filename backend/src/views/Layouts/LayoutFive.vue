<script setup lang="ts">
import { useSidebar } from '@/composables/useSidebar'
import HeaderAlt from '@/components/example-layout/example-header/HeaderAlt.vue'
import Backdrop from '@/components/layout/Backdrop.vue'
import SidebarFive from '@/components/example-layout/example-sidebar/SidebarFive.vue'

const { isExpanded, isMobileOpen } = useSidebar()
</script>

<template>
  <div class="min-h-screen xl:flex bg-white dark:bg-gray-950">
    <SidebarFive :sidebar-toggle="isMobileOpen" :docs-sidebar-open="isExpanded" />
    <Backdrop />
    <div
      class="flex-1 min-w-0 flex flex-col transition-all duration-300"
      :class="[isExpanded ? 'xl:ml-[290px]' : 'xl:ml-0']"
    >
      <HeaderAlt />
      <main class="flex-1 p-4 md:p-6 pb-20 w-full mx-auto max-w-screen-2xl">
        <div class="space-y-6">
          <div class="grid auto-rows-min gap-6 lg:grid-cols-3">
            <div
              class="aspect-video rounded-xl border border-gray-200 bg-gray-50 lg:col-span-1 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="rounded-xl border border-gray-200 bg-gray-50 lg:col-span-2 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="min-h-[30dvh] rounded-xl border border-gray-200 bg-gray-50 lg:col-span-full dark:border-gray-800 dark:bg-white/3"
            ></div>
          </div>
          <div class="grid auto-rows-min gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <div
              class="h-80 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="h-80 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="h-80 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
            <div
              class="h-80 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"
            ></div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
