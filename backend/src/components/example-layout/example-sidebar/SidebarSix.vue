<script setup lang="ts">
import { ref, computed, markRaw } from 'vue'
import { useSidebar } from '@/composables/useSidebar'
import PlugInIcon from '@/icons/PlugInIcon.vue'
import {
  SettingsAlt,
  ChartAltIcon,
  BellAltIcon,
  EmailAltIcon,
  BoxcubeAltIcon,
  CalendarAltIcon,
  UserAltIcon,
  DashboardAltIcon,
} from '@/icons'
import InboxAltIcon from '@/icons/InboxAltIcon.vue'

interface NavItemType {
  id: string
  label: string
  icon: any
}

const navItems: NavItemType[] = [
  { id: 'dashboard', label: 'Dashboard', icon: markRaw(DashboardAltIcon) },
  { id: 'calendar', label: 'Calendar', icon: markRaw(CalendarAltIcon) },
  { id: 'profiles', label: 'Profiles', icon: markRaw(UserAltIcon) },
  { id: 'settings', label: 'Settings', icon: markRaw(SettingsAlt) },
  { id: 'notification', label: 'Notifications', icon: markRaw(BellAltIcon) },
  { id: 'email', label: 'Email', icon: markRaw(EmailAltIcon) },
  { id: 'inbox', label: 'Inbox', icon: markRaw(InboxAltIcon) },
  { id: 'analytics', label: 'User Analytics', icon: markRaw(ChartAltIcon) },
  { id: 'integrations', label: 'Integrations', icon: markRaw(PlugInIcon) },
  { id: 'components', label: 'Components', icon: markRaw(BoxcubeAltIcon) },
]

const { isExpanded, isMobileOpen, toggleMobileSidebar } = useSidebar()
const activeNav = ref('dashboard')

const isVisible = computed(() => isMobileOpen.value || isExpanded.value)

const handleNavClick = (id: string) => {
  activeNav.value = id
  if (isMobileOpen.value) {
    toggleMobileSidebar()
  }
}
</script>

<template>
  <aside
    class="fixed top-16 xl:top-0 left-0 transition-all duration-300 z-9999 flex h-[calc(100vh-4rem)] xl:h-screen w-[92px] flex-col items-center border-r border-gray-200 bg-gray-50 pt-7 pb-5 dark:border-gray-800 dark:bg-gray-900"
    :class="[
      isMobileOpen ? 'translate-x-0' : '-translate-x-full',
      isExpanded ? 'xl:translate-x-0' : 'xl:-translate-x-full',
    ]"
  >
    <!-- Logo -->
    <router-link
      to="/"
      class="bg-brand-500 mb-8 flex size-8 shrink-0 items-center justify-center rounded-xl xl:mb-16"
    >
      <img src="/images/logo/logo-icon.svg" alt="Logo" class="h-8 w-8" />
    </router-link>

    <!-- Nav Icons -->
    <nav class="flex flex-1 flex-col items-center gap-1">
      <div v-for="item in navItems" :key="item.id" class="group relative">
        <button
          @click="handleNavClick(item.id)"
          class="nav-icon-item transition-all"
          :class="[activeNav === item.id ? 'nav-icon-item-active' : 'nav-icon-item-inactive']"
          :aria-label="item.label"
        >
          <span class="[&_svg]:size-5">
            <component :is="item.icon" />
          </span>
        </button>
        <span
          class="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-lg bg-gray-800 px-3 py-1.5 text-sm whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        >
          {{ item.label }}
        </span>
      </div>
    </nav>
  </aside>
</template>
