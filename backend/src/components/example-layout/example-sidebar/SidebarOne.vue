<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSidebar } from '@/composables/useSidebar'
import {
  LayoutDashboardIcon,
  BotIcon,
  CartIcon,
  CalenderIcon,
  UserCircleIcon,
  TaskIcon,
  ListIcon,
  TableIcon,
  PageIcon,
  MoreDots,
} from '@/icons'
import MinusAltIcon from '@/icons/MinusAltIcon.vue'
import PlusAltIcon from '@/icons/PlusAltIcon.vue'

const route = useRoute()
const router = useRouter()
const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar()

const selected = ref<string>('Dashboard')
const subSelected = ref<string>('')

const isActive = (path: string) => route.path === path

const handleMenuToggle = (name: string) => {
  selected.value = selected.value === name ? '' : name
}

const handleSubMenuToggle = (name: string) => {
  subSelected.value = subSelected.value === name ? '' : name
}

const showContent = computed(() => isExpanded.value || isHovered.value || isMobileOpen.value)

// Auto-expand active menu of sidebars
const updateSidebarState = () => {
  if (!showContent.value) {
    selected.value = ''
    subSelected.value = ''
    return
  }

  const path = route.path

  // Dashboard group
  if (['/', '/analytics', '/marketing', '/stocks', '/saas', '/logistics', '/ai'].includes(path)) {
    selected.value = 'Dashboard'
  } else if (
    [
      '/inventory-management',
      '/product-development',
      '/finance',
      '/human-resources',
      '/supply-chain',
    ].includes(path)
  ) {
    selected.value = 'Dashboard'
    subSelected.value = 'CRM'
  }
  // AI Assistant group
  else if (
    ['/text-generator', '/image-generator', '/code-generator', '/video-generator'].includes(path)
  ) {
    selected.value = 'AI'
  }
  // E-commerce group
  else if (
    ['/products-list', '/add-product', '/billing', '/transactions', '/single-transaction'].includes(
      path,
    )
  ) {
    selected.value = 'E-commerce'
  } else if (['/invoices', '/single-invoice', '/create-invoice'].includes(path)) {
    selected.value = 'E-commerce'
    subSelected.value = 'Invoices'
  }
  // Task group
  else if (['/task-list', '/task-kanban'].includes(path)) {
    selected.value = 'Task'
  }
  // Forms group
  else if (['/form-elements', '/form-layout'].includes(path)) {
    selected.value = 'Forms'
  }
  // Tables group
  else if (['/basic-tables', '/data-tables'].includes(path)) {
    selected.value = 'Tables'
  }
  // Pages group
  else if (
    [
      '/file-manager',
      '/pricing-tables',
      '/faq',
      '/api-keys',
      '/integrations',
      '/blank',
      '/coming-soon',
      '/maintenance',
      '/success',
    ].includes(path)
  ) {
    selected.value = 'Pages'
  } else if (['/error-404', '/error-500', '/error-503'].includes(path)) {
    selected.value = 'Pages'
    subSelected.value = 'ErrorPages'
  } else {
    // default/reset
    // selected.value = ''
  }
}

watch([showContent, () => route.path], updateSidebarState)
onMounted(updateSidebarState)

// Close sidebar on mobile route change
watch(
  () => route.path,
  () => {
    if (isMobileOpen.value) {
      toggleMobileSidebar()
    }
  },
)
</script>

<template>
  <aside
    class="fixed flex flex-col top-16 xl:top-0 px-5 left-0 bg-white dark:bg-gray-900 h-[calc(100vh-4rem)] xl:h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 dark:border-gray-800"
    :class="[
      isExpanded || isMobileOpen ? 'w-[290px]' : isHovered ? 'w-[290px]' : 'w-[90px]',
      isMobileOpen ? 'translate-x-0' : '-translate-x-full',
      'xl:translate-x-0',
    ]"
    @mouseenter="!isExpanded && setIsHovered(true)"
    @mouseleave="setIsHovered(false)"
  >
    <!-- SIDEBAR HEADER -->
    <div
      class="sidebar-header shrink-0 flex items-center gap-2 pt-8 pb-7"
      :class="[!isExpanded && !isHovered ? 'xl:justify-center' : 'justify-between']"
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

    <div class="flex-1 min-h-0 overflow-y-auto pb-4 duration-300 ease-linear no-scrollbar">
      <nav>
        <!-- Menu Group -->
        <div>
          <h3 class="mb-4 text-xs leading-[20px] text-gray-400 uppercase">
            <template v-if="showContent"> MENU </template>
            <MoreDots v-else class="size-6 mx-auto" />
          </h3>

          <ul class="mb-6 flex flex-col gap-1">
            <!-- ===== Dashboard ===== -->
            <li>
              <button
                @click="handleMenuToggle('Dashboard')"
                class="menu-item group cursor-pointer w-full transition-colors"
                :class="[selected === 'Dashboard' ? 'menu-item-active' : 'menu-item-inactive']"
              >
                <LayoutDashboardIcon
                  :class="[
                    selected === 'Dashboard' ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                  ]"
                />
                <span v-if="showContent" class="menu-item-text">Dashboard</span>
                <template v-if="showContent">
                  <MinusAltIcon
                    v-if="selected === 'Dashboard'"
                    class="ml-auto w-5 h-5 text-brand-500"
                  />
                  <PlusAltIcon v-else class="ml-auto w-5 h-5" />
                </template>
              </button>

              <!-- Dashboard Dropdown -->
              <div
                v-if="showContent"
                class="menu-accordion"
                :class="{ open: selected === 'Dashboard' }"
              >
                <div>
                  <ul
                    class="menu-dropdown mt-2 ml-6 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                  >
                    <li>
                      <router-link
                        to="/"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Ecommerce
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/analytics"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/analytics')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Analytics
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/marketing"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/marketing')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Marketing
                      </router-link>
                    </li>
                    <!-- CRM nested submenu -->
                    <li>
                      <button
                        @click="handleSubMenuToggle('CRM')"
                        class="menu-dropdown-item group flex items-center justify-between w-full"
                        :class="[
                          isActive('/crm')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        CRM
                        <MinusAltIcon v-if="subSelected === 'CRM'" class="w-5 h-5 text-brand-500" />
                        <PlusAltIcon v-else class="w-5 h-5" />
                      </button>
                      <div class="menu-accordion" :class="{ open: subSelected === 'CRM' }">
                        <div>
                          <ul
                            class="mt-2 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                          >
                            <li>
                              <router-link
                                to="/inventory-management"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/inventory-management')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                Inventory Management
                              </router-link>
                            </li>
                            <li>
                              <router-link
                                to="/product-development"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/product-development')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                Product Development
                              </router-link>
                            </li>
                            <li>
                              <router-link
                                to="/finance"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/finance')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                Finance
                              </router-link>
                            </li>
                            <li>
                              <router-link
                                to="/human-resources"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/human-resources')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                Human Resources
                              </router-link>
                            </li>
                            <li>
                              <router-link
                                to="/supply-chain"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/supply-chain')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                Supply Chain
                              </router-link>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </li>
                    <li>
                      <router-link
                        to="/stocks"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/stocks')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Stocks
                        <span class="absolute right-3 flex items-center gap-1">
                          <span class="menu-dropdown-badge menu-dropdown-badge-inactive">
                            New
                          </span>
                        </span>
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/saas"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/saas')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        SaaS
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/logistics"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/logistics')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Logistics
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/ai"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/ai')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        AI
                      </router-link>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
            <!-- ===== /Dashboard ===== -->

            <!-- ===== AI Assistant ===== -->
            <li>
              <button
                @click="handleMenuToggle('AI')"
                class="menu-item group cursor-pointer w-full transition-colors"
                :class="[selected === 'AI' ? 'menu-item-active' : 'menu-item-inactive']"
              >
                <BotIcon
                  :class="[selected === 'AI' ? 'menu-item-icon-active' : 'menu-item-icon-inactive']"
                />
                <span v-if="showContent" class="menu-item-text">AI Assistant</span>
                <template v-if="showContent">
                  <MinusAltIcon v-if="selected === 'AI'" class="ml-auto w-5 h-5 text-brand-500" />
                  <PlusAltIcon v-else class="ml-auto w-5 h-5" />
                </template>
              </button>

              <div v-if="showContent" class="menu-accordion" :class="{ open: selected === 'AI' }">
                <div>
                  <ul
                    class="menu-dropdown mt-2 ml-6 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                  >
                    <li>
                      <router-link
                        to="/text-generator"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/text-generator')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Text Generator
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/image-generator"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/image-generator')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Image Generator
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/code-generator"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/code-generator')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Code Generator
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/video-generator"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/video-generator')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Video Generator
                      </router-link>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
            <!-- ===== /AI Assistant ===== -->

            <!-- ===== E-commerce ===== -->
            <li>
              <button
                @click="handleMenuToggle('E-commerce')"
                class="menu-item group cursor-pointer w-full transition-colors"
                :class="[selected === 'E-commerce' ? 'menu-item-active' : 'menu-item-inactive']"
              >
                <CartIcon
                  :class="[
                    selected === 'E-commerce' ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                  ]"
                />
                <span v-if="showContent" class="menu-item-text">E-commerce</span>
                <template v-if="showContent">
                  <MinusAltIcon
                    v-if="selected === 'E-commerce'"
                    class="ml-auto w-5 h-5 text-brand-500"
                  />
                  <PlusAltIcon v-else class="ml-auto w-5 h-5" />
                </template>
              </button>

              <div
                v-if="showContent"
                class="menu-accordion"
                :class="{ open: selected === 'E-commerce' }"
              >
                <div>
                  <ul
                    class="menu-dropdown mt-2 ml-6 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                  >
                    <li>
                      <router-link
                        to="/products-list"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/products-list')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Products
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/add-product"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/add-product')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Add Product
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/billing"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/billing')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Billing
                      </router-link>
                    </li>
                    <!-- Invoices nested submenu -->
                    <li>
                      <button
                        @click="handleSubMenuToggle('Invoices')"
                        class="menu-dropdown-item group flex items-center justify-between w-full transition-colors"
                        :class="[
                          isActive('/invoices')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Invoices
                        <MinusAltIcon
                          v-if="subSelected === 'Invoices'"
                          class="w-4 h-4 text-brand-500"
                        />
                        <PlusAltIcon v-else class="w-4 h-4" />
                      </button>
                      <div class="menu-accordion" :class="{ open: subSelected === 'Invoices' }">
                        <div>
                          <ul
                            class="mt-2 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                          >
                            <li>
                              <router-link
                                to="/invoices"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/invoices')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                Invoices List
                              </router-link>
                            </li>
                            <li>
                              <router-link
                                to="/single-invoice"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/single-invoice')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                Single Invoice
                              </router-link>
                            </li>
                            <li>
                              <router-link
                                to="/create-invoice"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/create-invoice')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                Create Invoice
                              </router-link>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </li>
                    <li>
                      <router-link
                        to="/transactions"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/transactions')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Transactions
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/single-transaction"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/single-transaction')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Single Transaction
                      </router-link>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
            <!-- ===== /E-commerce ===== -->

            <!-- ===== Calendar ===== -->
            <li>
              <router-link
                to="/calendar"
                class="menu-item group"
                :class="[isActive('/calendar') ? 'menu-item-active' : 'menu-item-inactive']"
              >
                <CalenderIcon
                  :class="[
                    isActive('/calendar') ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                  ]"
                />
                <span v-if="showContent" class="menu-item-text">Calendar</span>
              </router-link>
            </li>
            <!-- ===== /Calendar ===== -->

            <!-- ===== User Profile ===== -->
            <li>
              <router-link
                to="/profile"
                class="menu-item group"
                :class="[isActive('/profile') ? 'menu-item-active' : 'menu-item-inactive']"
              >
                <UserCircleIcon
                  :class="[
                    isActive('/profile') ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                  ]"
                />
                <span v-if="showContent" class="menu-item-text">User Profile</span>
              </router-link>
            </li>
            <!-- ===== /User Profile ===== -->

            <!-- ===== Task ===== -->
            <li>
              <button
                @click="handleMenuToggle('Task')"
                class="menu-item group cursor-pointer w-full transition-colors"
                :class="[selected === 'Task' ? 'menu-item-active' : 'menu-item-inactive']"
              >
                <TaskIcon
                  :class="[
                    selected === 'Task' ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                  ]"
                />
                <span v-if="showContent" class="menu-item-text">Task</span>
                <template v-if="showContent">
                  <MinusAltIcon v-if="selected === 'Task'" class="ml-auto w-5 h-5 text-brand-500" />
                  <PlusAltIcon v-else class="ml-auto w-5 h-5" />
                </template>
              </button>

              <div v-if="showContent" class="menu-accordion" :class="{ open: selected === 'Task' }">
                <div>
                  <ul
                    class="menu-dropdown mt-2 ml-6 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                  >
                    <li>
                      <router-link
                        to="/task-list"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/task-list')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        List
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/task-kanban"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/task-kanban')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Kanban
                      </router-link>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
            <!-- ===== /Task ===== -->

            <!-- ===== Forms ===== -->
            <li>
              <button
                @click="handleMenuToggle('Forms')"
                class="menu-item group cursor-pointer w-full transition-colors"
                :class="[selected === 'Forms' ? 'menu-item-active' : 'menu-item-inactive']"
              >
                <ListIcon
                  :class="[
                    selected === 'Forms' ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                  ]"
                />
                <span v-if="showContent" class="menu-item-text">Forms</span>
                <template v-if="showContent">
                  <MinusAltIcon
                    v-if="selected === 'Forms'"
                    class="ml-auto w-5 h-5 text-brand-500"
                  />
                  <PlusAltIcon v-else class="ml-auto w-5 h-5" />
                </template>
              </button>

              <div
                v-if="showContent"
                class="menu-accordion"
                :class="{ open: selected === 'Forms' }"
              >
                <div>
                  <ul
                    class="menu-dropdown mt-2 ml-6 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                  >
                    <li>
                      <router-link
                        to="/form-elements"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/form-elements')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Form Elements
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/form-layout"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/form-layout')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Form Layout
                      </router-link>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
            <!-- ===== /Forms ===== -->

            <!-- ===== Tables ===== -->
            <li>
              <button
                @click="handleMenuToggle('Tables')"
                class="menu-item group cursor-pointer w-full transition-colors"
                :class="[selected === 'Tables' ? 'menu-item-active' : 'menu-item-inactive']"
              >
                <TableIcon
                  :class="[
                    selected === 'Tables' ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                  ]"
                />
                <span v-if="showContent" class="menu-item-text">Tables</span>
                <template v-if="showContent">
                  <MinusAltIcon
                    v-if="selected === 'Tables'"
                    class="ml-auto w-5 h-5 text-brand-500"
                  />
                  <PlusAltIcon v-else class="ml-auto w-5 h-5" />
                </template>
              </button>

              <div
                v-if="showContent"
                class="menu-accordion"
                :class="{ open: selected === 'Tables' }"
              >
                <div>
                  <ul
                    class="menu-dropdown mt-2 ml-6 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                  >
                    <li>
                      <router-link
                        to="/basic-tables"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/basic-tables')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Basic Tables
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/data-tables"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/data-tables')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Data Tables
                      </router-link>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
            <!-- ===== /Tables ===== -->

            <!-- ===== Pages ===== -->
            <li>
              <button
                @click="handleMenuToggle('Pages')"
                class="menu-item group cursor-pointer w-full transition-colors"
                :class="[selected === 'Pages' ? 'menu-item-active' : 'menu-item-inactive']"
              >
                <PageIcon
                  :class="[
                    selected === 'Pages' ? 'menu-item-icon-active' : 'menu-item-icon-inactive',
                  ]"
                />
                <span v-if="showContent" class="menu-item-text">Pages</span>
                <template v-if="showContent">
                  <MinusAltIcon
                    v-if="selected === 'Pages'"
                    class="ml-auto w-5 h-5 text-brand-500"
                  />
                  <PlusAltIcon v-else class="ml-auto w-5 h-5" />
                </template>
              </button>

              <div
                v-if="showContent"
                class="menu-accordion"
                :class="{ open: selected === 'Pages' }"
              >
                <div>
                  <ul
                    class="menu-dropdown mt-2 ml-6 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                  >
                    <li>
                      <router-link
                        to="/file-manager"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/file-manager')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        File Manager
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/pricing-tables"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/pricing-tables')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Pricing Tables
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/faq"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/faq')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        FAQ
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/api-keys"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/api-keys')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        API Keys
                        <span class="absolute right-3 flex items-center gap-1">
                          <span class="menu-dropdown-badge menu-dropdown-badge-inactive">
                            New
                          </span>
                        </span>
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/integrations"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/integrations')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Integrations
                        <span class="absolute right-3 flex items-center gap-1">
                          <span class="menu-dropdown-badge menu-dropdown-badge-inactive">
                            New
                          </span>
                        </span>
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/blank"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/blank')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Blank Page
                      </router-link>
                    </li>
                    <!-- Error Pages nested submenu -->
                    <li>
                      <button
                        @click="handleSubMenuToggle('ErrorPages')"
                        class="menu-dropdown-item group flex items-center justify-between w-full transition-colors"
                        :class="[
                          isActive('/error-404') || isActive('/error-500') || isActive('/error-503')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Error Pages
                        <MinusAltIcon
                          v-if="subSelected === 'ErrorPages'"
                          class="w-4 h-4 text-brand-500"
                        />
                        <PlusAltIcon v-else class="w-4 h-4" />
                      </button>
                      <div class="menu-accordion" :class="{ open: subSelected === 'ErrorPages' }">
                        <div>
                          <ul
                            class="mt-2 flex flex-col gap-1 border-l border-gray-200 pl-4 dark:border-gray-800"
                          >
                            <li>
                              <router-link
                                to="/error-404"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/error-404')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                404 Error
                              </router-link>
                            </li>
                            <li>
                              <router-link
                                to="/error-500"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/error-500')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                500 Error
                              </router-link>
                            </li>
                            <li>
                              <router-link
                                to="/error-503"
                                class="menu-dropdown-item group text-xs!"
                                :class="[
                                  isActive('/error-503')
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive',
                                ]"
                              >
                                503 Error
                              </router-link>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </li>
                    <li>
                      <router-link
                        to="/coming-soon"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/coming-soon')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Coming Soon
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/maintenance"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/maintenance')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Maintenance
                      </router-link>
                    </li>
                    <li>
                      <router-link
                        to="/success"
                        class="menu-dropdown-item group"
                        :class="[
                          isActive('/success')
                            ? 'menu-dropdown-item-active'
                            : 'menu-dropdown-item-inactive',
                        ]"
                      >
                        Success
                      </router-link>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
            <!-- ===== /Pages ===== -->
          </ul>
        </div>
      </nav>
    </div>
  </aside>
</template>
