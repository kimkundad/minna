<template>
  <aside
    :class="[
      'fixed flex flex-col mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-99999 border-r border-gray-200',
      {
        'xl:w-[290px]': isExpanded || isMobileOpen || isHovered,
        'xl:w-[90px]': !isExpanded && !isHovered,
        'translate-x-0 w-[290px]': isMobileOpen,
        '-translate-x-full': !isMobileOpen,
        'xl:translate-x-0': true,
      },
    ]"
    @mouseenter="!isExpanded && (isHovered = true)"
    @mouseleave="isHovered = false"
  >
    <div
      :class="['pt-8 pb-7 flex', !isExpanded && !isHovered ? 'xl:justify-center' : 'justify-start']"
    >
      <router-link to="/">
        <img
          v-if="isExpanded || isHovered || isMobileOpen"
          class="dark:hidden"
          src="/images/logo/logo.svg"
          alt="Logo"
          width="150"
          height="40"
        />
        <img
          v-if="isExpanded || isHovered || isMobileOpen"
          class="hidden dark:block"
          src="/images/logo/logo-dark.svg"
          alt="Logo"
          width="150"
          height="40"
        />
        <img v-else src="/images/logo/logo-icon.svg" alt="Logo" width="32" height="32" />
      </router-link>
    </div>
    <div class="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
      <nav class="mb-6">
        <div class="flex flex-col gap-4">
          <div v-for="(menuGroup, groupIndex) in menuGroups" :key="groupIndex">
            <h2
              :class="[
                'mb-4 text-xs uppercase flex leading-[20px] text-gray-400',
                !isExpanded && !isHovered ? 'lg:justify-center' : 'justify-start',
              ]"
            >
              <template v-if="isExpanded || isHovered || isMobileOpen">
                {{ menuGroup.title }}
              </template>
              <MoreDots v-else />
            </h2>
            <ul class="flex flex-col gap-1">
              <li v-for="(item, index) in menuGroup.items" :key="item.name">
                <button
                  v-if="item.subItems"
                  @click="toggleSubmenu(groupIndex, index)"
                  :class="[
                    'menu-item group w-full',
                    {
                      'menu-item-active': isSubmenuOpen(groupIndex, index),
                      'menu-item-inactive': !isSubmenuOpen(groupIndex, index),
                    },
                    !isExpanded && !isHovered ? 'xl:justify-center' : 'xl:justify-start',
                  ]"
                >
                  <span
                    :class="[
                      isSubmenuOpen(groupIndex, index)
                        ? 'menu-item-icon-active'
                        : 'menu-item-icon-inactive',
                    ]"
                  >
                    <component :is="item.icon" />
                  </span>

                  <span
                    v-if="isExpanded || isHovered || isMobileOpen"
                    class="menu-item-text flex items-center gap-2"
                  >
                    {{ item.name }}
                    <span
                      class="absolute right-10"
                      v-if="item.new"
                      :class="[
                        'menu-dropdown-badge',
                        {
                          'menu-dropdown-badge-active': isActive(item),
                          'menu-dropdown-badge-inactive': !isActive(item),
                        },
                      ]"
                      >new</span
                    >
                  </span>

                  <ChevronDownIcon
                    v-if="isExpanded || isHovered || isMobileOpen"
                    :class="[
                      'ml-auto w-5 h-5 transition-transform duration-200',
                      { 'rotate-180 text-brand-500': isSubmenuOpen(groupIndex, index) },
                    ]"
                  />
                </button>
                <span
                  v-else-if="item.soon"
                  class="menu-item group menu-item-inactive cursor-not-allowed opacity-50"
                >
                  <span class="menu-item-icon-inactive"><component :is="item.icon" /></span>
                  <span
                    v-if="isExpanded || isHovered || isMobileOpen"
                    class="menu-item-text flex w-full items-center gap-2"
                  >
                    {{ item.name }}
                    <span class="ml-auto text-xs uppercase tracking-wide">soon</span>
                  </span>
                </span>
                <router-link
                  v-else-if="item.path"
                  :to="item.path"
                  :class="[
                    'menu-item group',
                    {
                      'menu-item-active': isActive(item.path),
                      'menu-item-inactive': !isActive(item.path),
                    },
                  ]"
                >
                  <span
                    :class="[
                      isActive(item.path) ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                    ]"
                  >
                    <component :is="item.icon" />
                  </span>
                  <span
                    v-if="isExpanded || isHovered || isMobileOpen"
                    class="menu-item-text flex items-center gap-2"
                  >
                    {{ item.name }}
                    <span
                      v-if="item.new"
                      class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-brand-500 text-white"
                      >new</span
                    >
                  </span>
                </router-link>
                <transition
                  @enter="startTransition"
                  @after-enter="endTransition"
                  @before-leave="startTransition"
                  @after-leave="endTransition"
                >
                  <div
                    v-show="
                      isSubmenuOpen(groupIndex, index) && (isExpanded || isHovered || isMobileOpen)
                    "
                  >
                    <ul class="mt-2 space-y-1 ml-9">
                      <li v-for="subItem in item.subItems" :key="subItem.name">
                        <span
                          v-if="subItem.soon"
                          class="menu-dropdown-item menu-dropdown-item-inactive cursor-not-allowed opacity-50"
                        >
                          {{ subItem.name }}
                          <span class="ml-auto text-xs uppercase tracking-wide">soon</span>
                        </span>
                        <router-link
                          v-else
                          :to="subItem.path"
                          :class="[
                            'menu-dropdown-item',
                            {
                              'menu-dropdown-item-active': isActive(subItem.path),
                              'menu-dropdown-item-inactive': !isActive(subItem.path),
                            },
                          ]"
                        >
                          {{ subItem.name }}
                        </router-link>
                      </li>
                    </ul>
                  </div>
                </transition>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

import {
  GridIcon,
  DocsIcon,
  UserGroupIcon,
  CartIcon,
  TaskIcon,
  PageIcon,
  SettingsIcon,
  ChevronDownIcon,
  MoreDots,
} from '../../icons'
import { useSidebar } from '@/composables/useSidebar'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const { isExpanded, isMobileOpen, isHovered, openSubmenu } = useSidebar()

/**
 * The admin's real sections. Every entry that is not built yet is marked
 * `soon`, which renders it disabled rather than leaving it out: the shape of
 * the system is useful to see, and a link that 404s is worse than one that
 * says it is not ready.
 *
 * `roles` limits an entry to those roles. A teacher signs in to the same app
 * but only owns their own courses and the essays waiting on them, so they see
 * that and nothing else.
 */
const allGroups = [
  {
    title: 'Overview',
    items: [{ icon: GridIcon, name: 'Dashboard', path: '/' }],
  },
  {
    title: 'Catalog',
    roles: ['superadmin', 'admin', 'teacher'],
    items: [
      {
        icon: DocsIcon,
        name: 'Courses',
        subItems: [
          { name: 'All courses', path: '/courses' },
          { name: 'Categories', path: '/categories', roles: ['superadmin', 'admin'] },
          // Held until the terms are agreed with the customer: what a package
          // costs, how long it lasts and what happens to access when it ends.
          // The tables and the pricing are built; only the decision is missing.
          { name: 'Packages', path: '/packages', soon: true, roles: ['superadmin', 'admin'] },
        ],
      },
      {
        icon: TaskIcon,
        name: 'Learning',
        subItems: [
          { name: 'Quizzes', path: '/quizzes' },
          { name: 'Essay review', path: '/essay-review' },
          { name: 'Lesson Q&A', path: '/lesson-questions', soon: true },
        ],
      },
    ],
  },
  {
    title: 'People',
    roles: ['superadmin', 'admin'],
    items: [
      // Three entries, not one list with a filter: they are three different
      // jobs. Students is where you look up a customer, Teachers is who is
      // producing the courses, Administrators is who can get in at all.
      {
        icon: UserGroupIcon,
        name: 'Students',
        subItems: [
          { name: 'All students', path: '/students' },
          { name: 'Access rights', path: '/entitlements', soon: true },
        ],
      },
      {
        icon: DocsIcon,
        name: 'Teachers',
        subItems: [
          { name: 'All teachers', path: '/teachers' },
          { name: 'Applications', path: '/teacher-applications' },
        ],
      },
      { icon: SettingsIcon, name: 'Administrators', path: '/admins', roles: ['superadmin'] },
    ],
  },
  {
    title: 'Sales',
    roles: ['superadmin', 'admin'],
    items: [
      {
        icon: CartIcon,
        name: 'Orders',
        subItems: [
          { name: 'Orders', path: '/orders', soon: true },
          { name: 'Invoices', path: '/invoices', soon: true },
          { name: 'Coupons', path: '/coupons', soon: true },
        ],
      },
    ],
  },
  {
    title: 'Content',
    roles: ['superadmin', 'admin'],
    items: [
      {
        icon: PageIcon,
        name: 'Site',
        subItems: [
          { name: 'Articles', path: '/posts', soon: true },
          { name: 'Testimonials', path: '/testimonials', soon: true },
          { name: 'Enquiries', path: '/contact-messages', soon: true },
          { name: 'Subscribers', path: '/subscribers', soon: true },
        ],
      },
      { icon: SettingsIcon, name: 'Settings', path: '/settings', soon: true },
    ],
  },
]

/** What this signed-in person may see. Hiding a menu entry is presentation,
 *  not security — the router guard and the API decide what is allowed. */
const menuGroups = computed(() =>
  allGroups
    .filter((group) => !group.roles || group.roles.some((r) => auth.roles.includes(r)))
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.roles || item.roles.some((r) => auth.roles.includes(r)))
        .map((item) => ({
          ...item,
          subItems: item.subItems?.filter(
            (sub) => !sub.roles || sub.roles.some((r) => auth.roles.includes(r)),
          ),
        })),
    }))
    .filter((group) => group.items.length > 0),
)

const isActive = (path) => route.path === path

const toggleSubmenu = (groupIndex, itemIndex) => {
  const key = `${groupIndex}-${itemIndex}`
  openSubmenu.value = openSubmenu.value === key ? null : key
}

const isAnySubmenuRouteActive = computed(() => {
  return menuGroups.value.some((group) =>
    group.items.some(
      (item) => item.subItems && item.subItems.some((subItem) => isActive(subItem.path)),
    ),
  )
})

const isSubmenuOpen = (groupIndex, itemIndex) => {
  const key = `${groupIndex}-${itemIndex}`
  return (
    openSubmenu.value === key ||
    (isAnySubmenuRouteActive.value &&
      menuGroups.value[groupIndex].items[itemIndex].subItems?.some((subItem) => isActive(subItem.path)))
  )
}

const startTransition = (el) => {
  el.style.height = 'auto'
  const height = el.scrollHeight
  el.style.height = '0px'
  el.offsetHeight // force reflow
  el.style.height = height + 'px'
}

const endTransition = (el) => {
  el.style.height = ''
}
</script>
