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
                        <router-link
                          :to="subItem.path"
                          :target="subItem.target"
                          :class="[
                            'menu-dropdown-item',
                            {
                              'menu-dropdown-item-active': isActive(subItem.path),
                              'menu-dropdown-item-inactive': !isActive(subItem.path),
                            },
                          ]"
                        >
                          {{ subItem.name }}
                          <span class="flex items-center gap-1 ml-auto">
                            <span
                              v-if="subItem.new"
                              :class="[
                                'menu-dropdown-badge',
                                {
                                  'menu-dropdown-badge-active': isActive(subItem.path),
                                  'menu-dropdown-badge-inactive': !isActive(subItem.path),
                                },
                              ]"
                            >
                              new
                            </span>
                            <span
                              v-if="subItem.pro"
                              :class="[
                                'menu-dropdown-badge-pro',
                                {
                                  'menu-dropdown-badge-pro-active': isActive(subItem.path),
                                  'menu-dropdown-badge-pro-inactive': !isActive(subItem.path),
                                },
                              ]"
                            >
                              pro
                            </span>
                          </span>
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
      <SidebarWidget v-if="isExpanded || isHovered || isMobileOpen" />
    </div>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

import {
  CartIcon,
  GridIcon,
  CalenderIcon,
  UserCircleIcon,
  TaskIcon,
  ChatIcon,
  MailIcon,
  PieChartIcon,
  ChevronDownIcon,
  PageIcon,
  TableIcon,
  ListIcon,
  PlugInIcon,
  MoreDots,
  BotIcon,
  CallIcon,
  LayoutIcon,
} from '../../icons'
import SidebarWidget from './SidebarWidget.vue'
import BoxCubeIcon from '@/icons/BoxCubeIcon.vue'
import { useSidebar } from '@/composables/useSidebar'

const route = useRoute()

const { isExpanded, isMobileOpen, isHovered, openSubmenu } = useSidebar()

const menuGroups = [
  {
    title: 'Menu',
    items: [
      {
        icon: GridIcon,
        name: 'Dashboard',
        subItems: [
          { name: 'Ecommerce', path: '/' },
          { name: 'Analytics', path: '/analytics' },
          { name: 'Marketing', path: '/marketing' },
          { name: 'CRM', path: '/crm' },
          { name: 'Stocks', path: '/stocks' },
          { name: 'SaaS', path: '/saas' },
          { name: 'Logistics', path: '/logistics' },
          { name: 'AI', path: '/ai', new: true },
          { name: 'Sales', path: '/sales', new: true },
          { name: 'Finance', path: '/finance', new: true },
        ],
      },
      {
        icon: BotIcon,
        name: 'AI Assistant',
        new: true,
        subItems: [
          { name: 'Text Generator', path: '/text-generator' },
          { name: 'Image Generator', path: '/image-generator' },
          { name: 'Code Generator', path: '/code-generator' },
          { name: 'Video Generator', path: '/video-generator' },
        ],
      },
      {
        icon: CartIcon,
        name: 'E-commerce',
        new: true,
        subItems: [
          { name: 'Products', path: '/products-list' },
          { name: 'Add Product', path: '/add-product' },
          { name: 'Billing', path: '/billing' },
          { name: 'Invoices', path: '/invoices' },
          { name: 'Single Invoice', path: '/single-invoice' },
          { name: 'Create Invoice', path: '/create-invoice' },
          { name: 'Transactions', path: '/transactions' },
          { name: 'Single Transaction', path: '/single-transaction' },
        ],
      },
      {
        icon: CalenderIcon,
        name: 'Calendar',
        path: '/calendar',
      },
      {
        icon: UserCircleIcon,
        name: 'User Profile',
        path: '/profile',
      },
      {
        name: 'Task',
        icon: TaskIcon,
        subItems: [
          { name: 'List', path: '/task-list', pro: false },
          { name: 'Kanban', path: '/task-kanban', pro: false },
        ],
      },
      {
        name: 'Forms',
        icon: ListIcon,
        subItems: [
          { name: 'Form Elements', path: '/form-elements', pro: false },
          { name: 'Form Layout', path: '/form-layout', pro: false },
        ],
      },
      {
        name: 'Tables',
        icon: TableIcon,
        subItems: [
          { name: 'Basic Tables', path: '/basic-tables', pro: false },
          { name: 'Data Tables', path: '/data-tables', pro: false },
        ],
      },
      {
        name: 'Pages',
        icon: PageIcon,
        subItems: [
          { name: 'File Manager', path: '/file-manager' },
          { name: 'Pricing Tables', path: '/pricing-tables' },
          { name: 'FAQ', path: '/faq' },
          { name: 'Black Page', path: '/blank', pro: false },
          { name: 'API Keys', path: '/api-keys', new: true },
          { name: 'Integrations', path: '/integrations', new: true },
          { name: '404 Page', path: '/error-404', pro: false },
          { name: '500 Page', path: '/error-500', pro: false },
          { name: '503 Page', path: '/error-503', pro: false },
          { name: 'Coming Soon', path: '/coming-soon', pro: false },
          { name: 'Maintenance', path: '/maintenance', pro: false },
          { name: 'Success', path: '/success', pro: false },
        ],
      },
      {
        name: 'Layouts',
        icon: LayoutIcon,
        new: true,
        subItems: [
          { name: 'Layout One', path: '/layout-one', target: '_blank' },
          { name: 'Layout Two', path: '/layout-two', target: '_blank' },
          { name: 'Layout Three', path: '/layout-three', target: '_blank' },
          { name: 'Layout Four', path: '/layout-four', target: '_blank' },
          { name: 'Layout Five', path: '/layout-five', target: '_blank' },
          { name: 'Layout Six', path: '/layout-six', target: '_blank' },
        ],
      },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        icon: ChatIcon,
        name: 'Chat',
        path: '/chat',
      },
      {
        icon: MailIcon,
        name: 'Email',
        subItems: [
          { name: 'Inbox', path: '/inbox', pro: false },
          { name: 'Details', path: '/inbox-details', pro: false },
        ],
      },
      {
        icon: CallIcon,
        name: 'Support Ticket',
        new: true,
        subItems: [
          { name: 'Ticket List', path: '/support-tickets' },
          { name: 'Ticket Reply', path: '/support-ticket-reply' },
        ],
      },
    ],
  },
  {
    title: 'Others',
    items: [
      {
        icon: PieChartIcon,
        name: 'Charts',
        subItems: [
          { name: 'Line Chart', path: '/line-chart', pro: false },
          { name: 'Bar Chart', path: '/bar-chart', pro: false },
          { name: 'Doughnut Chart', path: '/doughnut-chart', pro: false },
        ],
      },
      {
        icon: BoxCubeIcon,
        name: 'UI Elements',
        subItems: [
          { name: 'Alerts', path: '/alerts', pro: false },
          { name: 'Avatars', path: '/avatars', pro: false },
          { name: 'Badge', path: '/badge', pro: false },
          { name: 'Breadcrumb', path: '/breadcrumb', pro: true },
          { name: 'Buttons', path: '/buttons', pro: false },
          { name: 'Buttons Group', path: '/buttons-group', pro: true },
          { name: 'Cards', path: '/cards', pro: true },
          { name: 'Carousel', path: '/carousel', pro: true },
          { name: 'Dropdowns', path: '/dropdowns', pro: true },
          { name: 'Images', path: '/images', pro: false },
          { name: 'Links', path: '/links', pro: true },
          { name: 'List', path: '/list', pro: true },
          { name: 'Modals', path: '/modals', pro: true },
          { name: 'Notifications', path: '/notifications', pro: true },
          { name: 'Pagination', path: '/pagination', pro: true },
          { name: 'Popovers', path: '/popovers', pro: true },
          { name: 'Progress Bars', path: '/progress-bar', pro: true },
          { name: 'Ribbons', path: '/ribbons', pro: true },
          { name: 'Spinners', path: '/spinners', pro: true },
          { name: 'Tabs', path: '/tabs', pro: true },
          { name: 'Tooltips', path: '/tooltips', pro: true },
          { name: 'Videos', path: '/videos', pro: false },
        ],
      },
      {
        icon: PlugInIcon,
        name: 'Authentication',
        subItems: [
          { name: 'Sign In', path: '/signin', pro: false },
          { name: 'Sign Up', path: '/signup', pro: false },
          { name: 'Reset Password', path: '/reset-password', pro: true },
          { name: 'Two Step Verification', path: '/two-step-verification', pro: true },
        ],
      },
      // ... Add other menu items here
    ],
  },
]

const isActive = (path) => route.path === path

const toggleSubmenu = (groupIndex, itemIndex) => {
  const key = `${groupIndex}-${itemIndex}`
  openSubmenu.value = openSubmenu.value === key ? null : key
}

const isAnySubmenuRouteActive = computed(() => {
  return menuGroups.some((group) =>
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
      menuGroups[groupIndex].items[itemIndex].subItems?.some((subItem) => isActive(subItem.path)))
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
