<script setup lang="ts">
import { ref, computed } from 'vue'

type Section = 'GetStarted' | 'Components'

const props = defineProps({
  sidebarToggle: {
    type: Boolean,
    default: true,
  },
  docsSidebarOpen: {
    type: Boolean,
    default: true,
  },
})

const versions = ['v1.0.1', 'v2.0.8-alpha', 'V3.0.9-beta1']

const getStartedItems = [
  { id: 'Introduction', label: 'Introduction' },
  { id: 'QuickStart', label: 'Quick Start' },
  { id: 'FrameworkGuides', label: 'Framework guides' },
  { id: 'Usage', label: 'Usage' },
  { id: 'Javascript', label: 'Javascript' },
  { id: 'Accessibility', label: 'Accessibility' },
  { id: 'UpgradeGuide', label: 'Upgrade Guide' },
  { id: 'License', label: 'License' },
]

const componentItems = [
  { id: 'Accordion', label: 'Accordion' },
  { id: 'Alert', label: 'Alert' },
  { id: 'Avatar', label: 'Avatar' },
  { id: 'Badge', label: 'Badge' },
  { id: 'Button', label: 'Button' },
  { id: 'Card', label: 'Card' },
  { id: 'Carousel', label: 'Carousel' },
  { id: 'ChatBubble', label: 'Chat Bubble' },
  { id: 'Collapse', label: 'Collapse' },
  { id: 'Indicator', label: 'Indicator' },
  { id: 'ListGroup', label: 'List Group' },
  { id: 'Loading', label: 'Loading' },
  { id: 'Progress', label: 'Progress' },
  { id: 'RadialProgress', label: 'Radial progress' },
  { id: 'Skeleton', label: 'Skeleton' },
  { id: 'Stack', label: 'Stack' },
]

const selected = ref('FrameworkGuides')
const activeVersion = ref('v2.0.8-alpha')
const versionOpen = ref(false)
const openSections = ref<Section[]>(['GetStarted', 'Components'])

const toggleSection = (section: Section) => {
  if (openSections.value.includes(section)) {
    openSections.value = openSections.value.filter((s) => s !== section)
  } else {
    openSections.value.push(section)
  }
}

const isSectionOpen = (section: Section) => openSections.value.includes(section)
</script>

<template>
  <aside
    class="sidebar fixed top-16 xl:top-0 left-0 z-9999 flex h-[calc(100vh-4rem)] xl:h-screen w-[290px] flex-col border-r border-gray-200 bg-gray-50 transition-all duration-300 xl:translate-x-0 dark:border-gray-800 dark:bg-gray-900"
    :class="[
      sidebarToggle ? 'translate-x-0' : '-translate-x-full',
      !docsSidebarOpen ? 'xl:w-0 xl:overflow-hidden xl:border-r-0 xl:min-w-0' : '',
    ]"
  >
    <!-- SIDEBAR HEADER -->
    <div class="px-5 pt-5 pb-7">
      <div class="relative flex items-center justify-between gap-2.5">
        <div class="flex items-center gap-3">
          <router-link to="/" class="shrink-0">
            <img src="/images/logo/logo-icon.svg" alt="Logo" class="h-8 w-8" />
          </router-link>
          <div>
            <span class="text-sm font-normal text-gray-800 dark:text-white/90">TailAdmin Docs</span>
            <span
              class="flex items-center gap-1 rounded text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              {{ activeVersion }}
            </span>
          </div>
        </div>

        <div class="ml-auto">
          <button
            @click="versionOpen = !versionOpen"
            class="inline-flex size-5 items-center justify-center rounded-md border border-gray-200 text-gray-800 dark:border-gray-800 dark:text-gray-400"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12.1668 6.24235L8.00016 2.07568L3.8335 6.24235M3.8335 9.75736L8.00016 13.924L12.1668 9.75736"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <!-- Version Dropdown -->
        <transition
          enter-active-class="transition ease-out duration-100"
          enter-from-class="transform opacity-0 scale-95"
          enter-to-class="transform opacity-100 scale-100"
          leave-active-class="transition ease-in duration-75"
          leave-from-class="transform opacity-100 scale-100"
          leave-to-class="transform opacity-0 scale-95"
        >
          <div
            v-if="versionOpen"
            class="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-lg bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <button
              v-for="version in versions"
              :key="version"
              @click="
                () => {
                  activeVersion = version
                  versionOpen = false
                }
              "
              class="mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-white/90"
              :class="[
                activeVersion === version
                  ? 'bg-gray-100 dark:bg-gray-700'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700',
              ]"
            >
              <span>{{ version }}</span>
              <svg
                v-if="activeVersion === version"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-gray-700 dark:text-gray-300"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        </transition>
      </div>
    </div>
    <!-- SIDEBAR HEADER END -->

    <!-- NAV -->
    <div class="no-scrollbar flex flex-col overflow-y-auto pb-10">
      <nav>
        <!-- Get Started -->
        <div>
          <button
            @click="toggleSection('GetStarted')"
            class="flex w-full items-center justify-between px-5 py-3 text-sm font-normal text-gray-700 dark:text-gray-300"
          >
            Get Started
            <svg
              class="text-gray-400 transition-transform duration-200"
              :class="[isSectionOpen('GetStarted') ? 'rotate-180' : '']"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M3.83325 6.41675L7.99992 10.5834L12.1666 6.41675"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <div class="menu-accordion" :class="[isSectionOpen('GetStarted') ? 'open' : '']">
            <div>
              <ul class="ml-5 flex flex-col gap-3 border-l border-gray-200 dark:border-gray-700">
                <li v-for="item in getStartedItems" :key="item.id">
                  <a
                    href="#"
                    @click.prevent="selected = item.id"
                    class="docs-border-item"
                    :class="[
                      selected === item.id
                        ? 'docs-border-item-active'
                        : 'docs-border-item-inactive',
                    ]"
                  >
                    {{ item.label }}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <!-- Get Started End -->

        <!-- Components -->
        <div>
          <button
            @click="toggleSection('Components')"
            class="flex w-full items-center justify-between px-5 py-3 text-sm font-normal text-gray-700 dark:text-gray-300"
          >
            Components
            <svg
              class="text-gray-400 transition-transform duration-200"
              :class="[isSectionOpen('Components') ? 'rotate-180' : '']"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M3.83325 6.41675L7.99992 10.5834L12.1666 6.41675"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <div class="menu-accordion" :class="[isSectionOpen('Components') ? 'open' : '']">
            <div>
              <ul class="ml-5 flex flex-col gap-3 border-l border-gray-200 dark:border-gray-700">
                <li v-for="item in componentItems" :key="item.id">
                  <a
                    href="#"
                    @click.prevent="selected = item.id"
                    class="docs-border-item"
                    :class="[
                      selected === item.id
                        ? 'docs-border-item-active'
                        : 'docs-border-item-inactive',
                    ]"
                  >
                    {{ item.label }}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <!-- Components End -->
      </nav>
    </div>
    <!-- NAV END -->
  </aside>
</template>
