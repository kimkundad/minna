<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useSidebar } from '@/composables/useSidebar'

const versions = ['v1.0.1', 'v2.0.8-alpha', 'V3.0.9-beta1']

const navSections = [
  {
    id: 'GetStarted',
    label: 'Get Started',
    items: [
      { id: 'QuickStart', label: 'Quick Start' },
      { id: 'InstallationGuide', label: 'Installation Guide' },
      { id: 'Tutorials', label: 'Tutorials' },
      { id: 'Configuration', label: 'Configuration' },
      { id: 'BestPractices', label: 'Best Practices' },
      { id: 'FAQ', label: 'FAQ' },
    ],
  },
  {
    id: 'DeveloperFeatures',
    label: 'Developer Features',
    items: [
      { id: 'Plugins', label: 'Plugins' },
      { id: 'CustomHooks', label: 'Custom Hooks' },
      { id: 'StateManagement', label: 'State Management' },
      { id: 'PerformanceTips', label: 'Performance Tips' },
    ],
  },
  {
    id: 'SDKDocumentation',
    label: 'SDK Documentation',
    items: [
      { id: 'SDKGettingStarted', label: 'Getting Started' },
      { id: 'SDKAuthentication', label: 'Authentication' },
      { id: 'ErrorHandling', label: 'Error Handling' },
      { id: 'RateLimits', label: 'Rate Limits' },
    ],
  },
  {
    id: 'APIReference',
    label: 'API Reference',
    items: [
      { id: 'RESTAPI', label: 'REST API' },
      { id: 'GraphQL', label: 'GraphQL' },
      { id: 'Webhooks', label: 'Webhooks' },
      { id: 'SDKMethods', label: 'SDK Methods' },
    ],
  },
  {
    id: 'IntegrationGuides',
    label: 'Integration Guides',
    items: [
      { id: 'OAuthSetup', label: 'OAuth Setup' },
      { id: 'ThirdPartyServices', label: 'Third-party Services' },
      { id: 'DatabaseIntegration', label: 'Database Integration' },
    ],
  },
  {
    id: 'TutorialsSection',
    label: 'Tutorials',
    items: [
      { id: 'BuildingDashboard', label: 'Building a Dashboard' },
      { id: 'CRUDOperations', label: 'CRUD Operations' },
      { id: 'AuthFlow', label: 'Authentication Flow' },
    ],
  },
  {
    id: 'ReleaseNotes',
    label: 'Release Notes',
    items: [
      { id: 'v200', label: 'v2.0.0' },
      { id: 'v150', label: 'v1.5.0' },
      { id: 'v100', label: 'v1.0.0' },
    ],
  },
]

const { isExpanded, isMobileOpen, toggleMobileSidebar } = useSidebar()
const isVisible = computed(() => isExpanded.value || isMobileOpen.value)

const versionOpen = ref(false)
const activeVersion = ref('v2.0.8-alpha')
const selected = ref('InstallationGuide')
const openSection = ref('GetStarted')

const versionDropdownRef = ref<HTMLElement | null>(null)

const handleClickOutside = (e: MouseEvent) => {
  if (versionDropdownRef.value && !versionDropdownRef.value.contains(e.target as Node)) {
    versionOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

const handleItemClick = (id: string) => {
  selected.value = id
  if (isMobileOpen.value) {
    toggleMobileSidebar()
  }
}

const toggleSection = (id: string) => {
  openSection.value = openSection.value === id ? '' : id
}
</script>

<template>
  <aside
    class="sidebar fixed top-16 xl:top-0 left-0 z-9999 flex h-[calc(100vh-4rem)] xl:h-screen w-[290px] flex-col border-r border-gray-200 bg-gray-50 transition-all duration-300 dark:border-gray-800 dark:bg-gray-900 -translate-x-full xl:translate-x-0"
    :class="[isMobileOpen ? 'translate-x-0' : '', !isExpanded ? 'xl:-translate-x-full' : '']"
  >
    <!-- SIDEBAR HEADER -->
    <div class="px-5 pt-5 pb-7">
      <div ref="versionDropdownRef" class="relative flex items-center justify-between gap-2.5">
        <div class="flex items-center gap-3">
          <router-link to="/" class="shrink-0">
            <img src="/images/logo/logo-icon.svg" alt="Logo" class="h-8 w-8" />
          </router-link>
          <div>
            <span class="text-sm font-normal text-gray-800 dark:text-white/90">TailAdmin Docs</span>
            <span
              class="flex items-center gap-1 rounded text-xs font-normal text-gray-500 dark:text-gray-400"
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
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-normal text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              :class="[activeVersion === version ? 'bg-gray-100 dark:bg-gray-700' : '']"
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
    <!-- SIDEBAR HEADER -->

    <!-- SEARCH -->
    <div class="px-5 pb-5">
      <div class="relative">
        <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12.944 12.945L15.9366 15.9376M14.8125 8.43695C14.8125 11.9569 11.9583 14.8104 8.4375 14.8104C4.91669 14.8104 2.0625 11.9569 2.0625 8.43695C2.0625 4.91698 4.91669 2.06348 8.4375 2.06348C11.9583 2.06348 14.8125 4.91698 14.8125 8.43695Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search the docs"
          class="dark:bg-dark-900 shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-9 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pr-3 pl-9 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-3 focus:outline-hidden dark:border-gray-800 dark:bg-white/3 dark:text-white/90 dark:placeholder:text-white/30"
        />
      </div>
    </div>
    <!-- SEARCH -->

    <!-- NAV -->
    <div class="no-scrollbar flex flex-col overflow-y-auto px-5 pb-10">
      <nav class="space-y-1">
        <div v-for="section in navSections" :key="section.id">
          <button
            @click="toggleSection(section.id)"
            class="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm font-normal text-gray-800 dark:text-white/90"
            :class="[
              openSection === section.id
                ? 'bg-gray-100 dark:bg-gray-800'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800',
            ]"
          >
            {{ section.label }}
            <svg
              class="transition-transform duration-200"
              :class="[openSection === section.id ? 'rotate-180' : '']"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3.8335 5.9165L8.00016 10.0832L12.1668 5.9165"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <div class="menu-accordion" :class="[openSection === section.id ? 'open' : '']">
            <div>
              <ul class="flex flex-col gap-2 px-5 py-2">
                <li v-for="item in section.items" :key="item.id">
                  <a
                    href="#"
                    @click.prevent="handleItemClick(item.id)"
                    class="text-sm transition-colors"
                    :class="[
                      selected === item.id
                        ? 'text-brand-500'
                        : 'text-gray-500 hover:text-brand-500 dark:text-gray-400 dark:hover:text-brand-400',
                    ]"
                  >
                    {{ item.label }}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </nav>
    </div>
    <!-- NAV -->
  </aside>
</template>
