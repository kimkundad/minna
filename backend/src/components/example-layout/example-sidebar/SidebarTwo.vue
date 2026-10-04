<script setup lang="ts">
import { ref, watch, computed, markRaw } from 'vue'
import { useSidebar } from '@/composables/useSidebar'
import {
  UserCircleIcon,
  DashboardAltIcon,
  ChartAltIcon,
  SettingsAlt,
  MoreDots,
  BellAltIcon,
  ChevronDownIcon,
  BoltAltIcon,
  BarChartIcon,
  HeadphoneAltIcon,
} from '@/icons'
import CubeAltIcon from '@/icons/CubeAltIcon.vue'

interface SubItem {
  id: string
  label: string
}

interface NavItem {
  id: string
  label: string
  icon?: any
  children?: SubItem[]
}

interface NavGroup {
  group: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    group: 'General',
    items: [
      {
        id: 'Dashboard',
        label: 'Dashboard',
        icon: markRaw(DashboardAltIcon),
        children: [
          { id: 'inventoryManagement', label: 'Inventory Management' },
          { id: 'productDevelopment', label: 'Product Development' },
          { id: 'finance', label: 'Finance' },
          { id: 'humanResources', label: 'Human Resources' },
          { id: 'supplyChain', label: 'Supply Chain' },
        ],
      },
      { id: 'profile', label: 'Public Profiles', icon: markRaw(UserCircleIcon) },
      { id: 'settings', label: 'Settings', icon: markRaw(SettingsAlt) },
      { id: 'notifications', label: 'Notifications', icon: markRaw(BellAltIcon) },
      { id: 'analytics', label: 'User Analytics', icon: markRaw(BarChartIcon) },
    ],
  },
  {
    group: 'Projects',
    items: [
      {
        id: 'designEngineering',
        label: 'Design Engineering',
        icon: markRaw(BoltAltIcon),
      },
      { id: 'marketing', label: 'Sales & Marketing', icon: markRaw(ChartAltIcon) },
      { id: 'saas', label: 'SaaS', icon: markRaw(CubeAltIcon) },
      {
        id: 'customerSupport',
        label: 'Customer Support',
        icon: markRaw(HeadphoneAltIcon),
      },
    ],
  },
  {
    group: 'API Reference',
    items: [
      { id: 'fileConventions', label: 'File Conventions' },
      { id: 'versionControl', label: 'Version Control' },
      { id: 'fileOrganization', label: 'File Organization' },
      { id: 'backupProcedures', label: 'Backup Procedures' },
    ],
  },
]

const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar()
const selected = ref('Dashboard')
const openDropdown = ref<string | null>('Dashboard')

const showContent = computed(() => isExpanded.value || isHovered.value || isMobileOpen.value)

// Auto-expand / collapse dropdown based on sidebar visibility
watch(showContent, (val) => {
  if (!val) {
    openDropdown.value = null
  } else {
    // Re-open Dashboard by default when sidebar becomes visible
    openDropdown.value = 'Dashboard'
  }
})

const handleItemClick = (item: NavItem) => {
  selected.value = item.id
  if (item.children) {
    openDropdown.value = openDropdown.value === item.id ? null : item.id
  }
  if (isMobileOpen.value) {
    toggleMobileSidebar()
  }
}

const handleSubItemClick = (childId: string) => {
  selected.value = childId
  if (isMobileOpen.value) {
    toggleMobileSidebar()
  }
}
</script>

<template>
  <aside
    class="fixed top-16 xl:top-0 left-0 z-9999 flex h-[calc(100vh-4rem)] xl:h-screen flex-col overflow-y-auto border-r border-gray-200 bg-gray-50 px-5 transition-all duration-300 ease-in-out xl:translate-x-0 dark:border-gray-800 dark:bg-gray-900"
    :class="[
      isMobileOpen ? 'translate-x-0' : '-translate-x-full',
      isExpanded || isMobileOpen ? 'w-[290px]' : isHovered ? 'w-[290px]' : 'w-[90px]',
    ]"
    @mouseenter="!isExpanded && setIsHovered(true)"
    @mouseleave="setIsHovered(false)"
  >
    <!-- SIDEBAR HEADER -->
    <div
      class="sidebar-header flex items-center gap-2 pt-8 pb-7"
      :class="[!showContent ? 'xl:justify-center' : 'justify-between']"
    >
      <router-link to="/">
        <template v-if="showContent">
          <img class="dark:hidden" src="/images/logo/logo.svg" alt="Logo" />
          <img class="hidden dark:block" src="/images/logo/logo-dark.svg" alt="Logo" />
        </template>
        <img v-else src="/images/logo/logo-icon.svg" alt="Logo" />
      </router-link>
    </div>
    <!-- /SIDEBAR HEADER -->

    <!-- Sidebar Menu -->
    <div class="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
      <nav>
        <div v-for="group in navGroups" :key="group.group">
          <h3 class="mb-3 text-xs leading-[20px] text-gray-500 dark:text-gray-400">
            <template v-if="showContent">
              <span class="ml-3">{{ group.group }}</span>
            </template>
            <MoreDots v-else class="size-6 mx-auto" />
          </h3>

          <ul class="mb-7 flex flex-col gap-1">
            <li v-for="item in group.items" :key="item.id">
              <a
                href="#"
                @click.prevent="handleItemClick(item)"
                class="group flex items-center gap-2 rounded-full px-3 py-2 text-sm font-normal"
                :class="[
                  selected === item.id
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800',
                ]"
              >
                <span
                  class="[&_svg]:size-5 shrink-0"
                  :class="[
                    selected === item.id
                      ? 'text-gray-800 dark:text-white/90'
                      : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-white/90',
                  ]"
                >
                  <component :is="item.icon" v-if="item.icon" />
                </span>
                <span
                  v-if="showContent"
                  class="menu-item-text"
                  :class="[
                    selected === item.id
                      ? 'text-gray-800 dark:text-white/90'
                      : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-white/90',
                  ]"
                >
                  {{ item.label }}
                </span>
                <ChevronDownIcon
                  v-if="item.children && showContent"
                  class="ml-auto w-5 h-5 transition-transform duration-200"
                  :class="[
                    openDropdown === item.id
                      ? 'rotate-180 dark:text-white/90'
                      : 'text-gray-500 group-hover:text-gray-800 dark:group-hover:text-white/90',
                  ]"
                />
              </a>

              <!-- Accordion dropdown -->
              <div
                v-if="item.children"
                class="menu-accordion"
                :class="[
                  openDropdown === item.id && showContent ? 'open' : '',
                  !showContent ? 'hidden' : '',
                ]"
              >
                <div>
                  <ul
                    class="menu-dropdown mt-3 ml-9 flex flex-col space-y-2 border-l border-gray-200 pl-5 dark:border-gray-800"
                  >
                    <li v-for="child in item.children" :key="child.id">
                      <a
                        href="#"
                        @click.prevent="handleSubItemClick(child.id)"
                        class="text-sm hover:text-gray-800 dark:hover:text-white/90"
                        :class="[
                          selected === child.id
                            ? 'text-gray-800 dark:text-white/90'
                            : 'text-gray-500 dark:text-gray-400',
                        ]"
                      >
                        {{ child.label }}
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </nav>
    </div>
    <!-- /Sidebar Menu -->
  </aside>
</template>
