<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import SiteDrawer from '@/components/layout/SiteDrawer.vue'
import SearchOverlay from '@/components/layout/SearchOverlay.vue'
import LocaleSwitcher from '@/components/layout/LocaleSwitcher.vue'
import { mediaUrl } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { openAuth } from '@/components/auth/authChannel'
import { useCartStore } from '@/stores/cart'
import { useCategoriesStore } from '@/stores/categories'
import { useNotificationsStore } from '@/stores/notifications'
import { useChatDockStore } from '@/stores/chatDock'
import { relative } from '@/lib/format'
import BrandLogo from './BrandLogo.vue'

/**
 * Markup mirrors the prototype's `U.renderHeader` solid variant exactly —
 * same elements, classes and nesting — with the behaviour moved into Vue:
 *
 *   #site-header.site-header--solid
 *   └── .hdr
 *       ├── .container.hdr-inner  (burger · brand · nav-pill · hdr-actions)
 *       └── .mega#mega-cat        (sibling of .hdr-inner, not inside it)
 *
 * The mega panel sitting outside .hdr-inner is what lets it span the full
 * header width, so the nesting is load-bearing rather than incidental.
 */
const props = withDefaults(
  defineProps<{
    variant?: 'solid' | 'overlay' | 'compact'
    active?: 'home' | 'courses' | 'blog' | 'about' | null
    /** Compact only: what the back link says and where it goes. */
    backLabel?: string
    backTo?: string
    title?: string
    subtitle?: string
  }>(),
  { variant: 'solid', active: null },
)

const auth = useAuthStore()

/** Whoever is actually signed in. Initials stand in until they upload a
 *  picture, which is what every other avatar on the site does. */
const isLoggedIn = computed(() => auth.isLoggedIn)
const user = computed(() => {
  const u = auth.user
  return {
    name: auth.displayName,
    initials: `${u?.firstName?.[0] ?? ''}${u?.lastName?.[0] ?? ''}`.trim(),
  }
})

const accountMenuOpen = ref(false)

async function signOut() {
  accountMenuOpen.value = false
  await auth.logout()
}

/* ---------------- what happened while they were away ---------------- */

const notifs = useNotificationsStore()
const unread = computed(() => notifs.unread)

const dock = useChatDockStore()
const chatUnread = computed(() => dock.unread)
const bellOpen = ref(false)

/** Opening it is when the list is worth having, so that is when it is asked for. */
function toggleBell() {
  bellOpen.value = !bellOpen.value
  if (bellOpen.value) void notifs.load()
}

/** A click on a row is usually a navigation as well, so the panel goes with it. */
function onNotification(id: number) {
  bellOpen.value = false
  void notifs.markRead(id)
}

const NOTIF_LOOK: Record<string, { icon: string; tone: string }> = {
  'order.paid': { icon: 'check-circle', tone: 'success' },
  'order.failed': { icon: 'x-circle', tone: 'danger' },
  'essay.reviewed': { icon: 'file-text', tone: 'cyan' },
  'entitlement.expiring': { icon: 'hourglass', tone: 'warning' },
}
const notifIcon = (type: string) => NOTIF_LOOK[type]?.icon ?? 'bell'
const notifTone = (type: string) => NOTIF_LOOK[type]?.tone ?? 'cyan'

const memberPhoto = computed(() =>
  auth.user?.avatarPath ? mediaUrl(auth.user.avatarPath) : null,
)

const { t } = useI18n()
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const megaOpen = ref(false)
const drawerOpen = ref(false)
const searchOpen = ref(false)
const stuck = ref(false)

/** The categories the admin keeps, with the count of published courses behind
 *  each. Shared with the drawer, so the two menus cannot disagree. */
const categoryStore = useCategoriesStore()
const categories = computed(() => categoryStore.tiles)

/** The real basket, so the badge and the cart page cannot disagree. */
const cart = useCartStore()
const cartCount = computed(() => cart.count)

/** The header gains .is-stuck once the page scrolls, which the CSS uses to
 *  drop in a background and a shadow. */
function onScroll() {
  stuck.value = window.scrollY > 8
}

/**
 * The category panel closes the way people expect a menu to: on Escape, on a
 * click outside it, and on navigating away. Without the last one it stays open
 * over the page you just asked it for.
 */
function onDocumentClick(e: MouseEvent) {
  if (!megaOpen.value) return
  const target = e.target as HTMLElement | null
  if (target?.closest('#mega-cat') || target?.closest('[aria-controls="mega-cat"]')) return
  megaOpen.value = false
}

function onDocumentClickAccount(e: MouseEvent) {
  // One handler for both drop-downs: a click inside either leaves both alone,
  // a click anywhere else closes both.
  const inside = (e.target as HTMLElement | null)?.closest('.menu-anchor')
  if (inside) return
  accountMenuOpen.value = false
  bellOpen.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // Escape shuts whatever is open, which is what people expect of it.
  bellOpen.value = false
  accountMenuOpen.value = false
  if (!megaOpen.value) return
  megaOpen.value = false
  megaTrigger.value?.focus()
}

const megaTrigger = ref<HTMLButtonElement | null>(null)

watch(() => route.fullPath, () => {
  megaOpen.value = false
  accountMenuOpen.value = false
  bellOpen.value = false
})

// The badge is worth having before the bell is opened; the list is not. The
// same goes for the chat button beside it: the count is the reason to press
// it, so it cannot wait until the panel has been raised once.
watch(
  () => auth.isLoggedIn,
  (now) => {
    if (now) {
      void notifs.load()
      void dock.refreshUnread()
    } else {
      notifs.clear()
      dock.clearUnread()
    }
  },
  { immediate: true },
)

onMounted(() => {
  void categoryStore.load()
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('click', onDocumentClickAccount)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('click', onDocumentClickAccount)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <header
    id="site-header"
    class="site-header"
    :class="[`site-header--${props.variant}`, { 'is-stuck': stuck }]"
  >
    <div class="hdr">
      <div class="container hdr-inner">
        <button
          type="button"
          class="icon-btn icon-btn--ghost hdr-burger"
          :aria-label="t('header.openMenu')"
          aria-haspopup="dialog"
          :aria-expanded="drawerOpen"
          @click="drawerOpen = true"
        >
          <AppIcon name="menu" />
        </button>

        <RouterLink class="brand" :to="path('')" :aria-label="t('header.brandHome')">
          <BrandLogo class="brand-logo" />
        </RouterLink>

        <nav class="nav-pill" :aria-label="t('header.mainMenu')">
          <RouterLink :to="path('')" :aria-current="props.active === 'home' ? 'page' : undefined">
            {{ t('common.home') }}
          </RouterLink>
          <RouterLink
            :to="path('/courses')"
            :aria-current="props.active === 'courses' ? 'page' : undefined"
          >
            {{ t('common.courses') }}
          </RouterLink>
          <button
            type="button"
            :aria-expanded="megaOpen"
            aria-controls="mega-cat"
            @click="megaOpen = !megaOpen"
          >
            {{ t('common.categories') }}<AppIcon name="chevron-down" />
          </button>
          <RouterLink
            :to="path('/blog')"
            :aria-current="props.active === 'blog' ? 'page' : undefined"
          >
            {{ t('common.articles') }}
          </RouterLink>
          <RouterLink
            :to="path('/about')"
            :aria-current="props.active === 'about' ? 'page' : undefined"
          >
            {{ t('common.about') }}
          </RouterLink>
        </nav>

        <div class="hdr-actions">
          <button
            type="button"
            class="icon-btn"
            :aria-label="t('header.searchCourses')"
            aria-haspopup="dialog"
            :aria-expanded="searchOpen"
            @click="searchOpen = true"
          >
            <AppIcon name="search" />
          </button>

          <LocaleSwitcher />

          <RouterLink
            class="icon-btn"
            data-cart-link
            :to="path('/cart')"
            :aria-label="t('header.cartItems', { count: cartCount })"
          >
            <AppIcon name="cart" />
            <!-- Marked, because the notifications bell carries one of these too
                 and "the count badge" is two different numbers. -->
            <span v-if="cartCount" class="count-badge" data-cart-count>{{ cartCount }}</span>
          </RouterLink>

          <!--
            Writing to the school, from wherever they are.

            Beside the bell because that is where somebody looks for "things
            between me and this school". It was four levels in, under My
            account › Messages, which is a long way to go to ask a question
            and a place people did not find.

            It raises the panel rather than opening the page: the panel is
            mounted in the shell and floats over whatever they were reading,
            so asking does not cost them their place.
          -->
          <button
            v-if="isLoggedIn"
            type="button"
            class="icon-btn hdr-chat"
            :aria-label="
              chatUnread
                ? t('header.messagesUnread', { count: chatUnread })
                : t('header.messages')
            "
            @click="dock.open()"
          >
            <AppIcon name="message-square" />
            <span v-if="chatUnread" class="count-badge" data-chat-count>{{ chatUnread }}</span>
          </button>

          <!-- Signed in: a notification bell and the member's own menu. Signed
               out: the two auth buttons. Never both. -->
          <div v-if="isLoggedIn" class="menu-anchor hdr-bell">
            <button
              type="button"
              class="icon-btn"
              aria-haspopup="true"
              :aria-expanded="bellOpen"
              :aria-label="
                unread ? t('header.notificationsUnread', { count: unread }) : t('common.notifications')
              "
              @click="toggleBell"
            >
              <AppIcon name="bell" />
              <span v-if="unread" class="count-badge">{{ unread }}</span>
            </button>

            <div v-if="bellOpen" class="menu notif-panel" role="dialog" :aria-label="t('common.notifications')">
              <div class="notif-head">
                <h2>{{ t('common.notifications') }}</h2>
                <button
                  v-if="unread"
                  type="button"
                  class="link"
                  style="font-size: 13.5px; font-weight: 600"
                  @click="notifs.markAllRead()"
                >
                  {{ t('notifications.readAll') }}
                </button>
              </div>

              <div v-if="notifs.loading && !notifs.loaded" class="notif-item">
                <div class="notif-body"><p class="notif-desc">{{ t('notifications.loading') }}</p></div>
              </div>

              <div v-else-if="!notifs.newest.length" class="notif-item">
                <span class="notif-ico" aria-hidden="true"><AppIcon name="bell" /></span>
                <div class="notif-body">
                  <p class="notif-title">{{ t('notifications.emptyTitle') }}</p>
                  <p class="notif-desc">{{ t('notifications.emptyText') }}</p>
                </div>
              </div>

              <div v-else class="notif-list">
                <component
                  :is="n.link ? RouterLink : 'div'"
                  v-for="n in notifs.newest"
                  :key="n.id"
                  class="notif-item"
                  :class="{ 'is-unread': !n.readAt }"
                  :to="n.link ? path(n.link.replace(/^\/[a-z]{2}(?=\/)/, '')) : undefined"
                  @click="onNotification(n.id)"
                >
                  <span class="notif-ico" :class="`notif-ico--${notifTone(n.type)}`" aria-hidden="true">
                    <AppIcon :name="notifIcon(n.type)" />
                  </span>
                  <div class="notif-body">
                    <p class="notif-title">{{ n.title }}</p>
                    <p v-if="n.body" class="notif-desc">{{ n.body }}</p>
                    <p class="notif-meta"><span>{{ relative(n.createdAt) }}</span></p>
                  </div>
                </component>
              </div>

              <!-- Eight fit in a panel; the rest live on a page of their own. -->
              <RouterLink
                v-if="notifs.items.length"
                class="notif-all"
                :to="path('/account/notifications')"
                @click="bellOpen = false"
              >
                {{ t('notifications.seeAll') }}<AppIcon name="arrow-right" />
              </RouterLink>
            </div>
          </div>
          <div v-if="isLoggedIn" class="menu-anchor">
            <button
              type="button"
              class="avatar-btn"
              aria-haspopup="true"
              :aria-expanded="accountMenuOpen"
              @click="accountMenuOpen = !accountMenuOpen"
            >
              <AppAvatar
                :name="user.name"
                :initials="user.initials"
                :photo="memberPhoto"
                :color="0"
                size="md"
              />
              <span class="ab-name">{{ user.name }}</span>
              <AppIcon name="chevron-down" />
            </button>

            <div v-if="accountMenuOpen" class="menu" role="menu">
              <RouterLink class="menu-item" role="menuitem" :to="path('/account')">
                <AppIcon name="user" />{{ t('footer.accountOverview') }}
              </RouterLink>
              <RouterLink class="menu-item" role="menuitem" :to="path('/account/learning')">
                <AppIcon name="book-open" />{{ t('footer.myCourses') }}
              </RouterLink>
              <RouterLink class="menu-item" role="menuitem" :to="path('/account/orders')">
                <AppIcon name="receipt" />{{ t('footer.orders') }}
              </RouterLink>
              <RouterLink class="menu-item" role="menuitem" :to="path('/account/profile')">
                <AppIcon name="settings" />{{ t('footer.accountTitle') }}
              </RouterLink>
              <button type="button" class="menu-item" role="menuitem" @click="signOut">
                <AppIcon name="log-out" />{{ t('auth.logout') }}
              </button>
            </div>
          </div>

          <div v-else class="hdr-auth">
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              @click="openAuth({ step: 'login' })"
            >
              {{ t('common.login') }}
            </button>
            <button
              type="button"
              class="btn btn--primary btn--sm"
              @click="openAuth({ step: 'register' })"
            >
              {{ t('common.register') }}
            </button>
          </div>

          <button
            type="button"
            class="icon-btn hdr-profile-m"
            :aria-label="isLoggedIn ? t('header.myAccount') : t('header.loginOrRegister')"
            @click="isLoggedIn ? (accountMenuOpen = !accountMenuOpen) : openAuth({ step: 'login' })"
          >
            <AppAvatar
              v-if="isLoggedIn"
              :name="user.name"
              :initials="user.initials"
              :photo="memberPhoto"
              :color="0"
              size="sm"
            />
            <AppIcon v-else name="user" />
            <span v-if="unread" class="dot-badge" />
          </button>
        </div>
      </div>

      <div class="mega" id="mega-cat" :hidden="!megaOpen">
        <div class="container">
          <div class="mega-panel">
            <div class="mega-head">
              <h2>
                {{ t('header.categoriesTitle') }}
                <span class="text-muted" style="font-weight: 500; font-size: 14px">
                  {{ t('header.categoryCount', { count: categories.length }) }}
                </span>
              </h2>
              <RouterLink class="link-arrow" :to="path('/courses')">
                {{ t('course.viewAllCourses') }} <AppIcon name="arrow-right" />
              </RouterLink>
            </div>
            <div class="mega-grid">
              <RouterLink
                v-for="c in categories"
                :key="c.id"
                class="cat-tile"
                :to="`${path('/courses')}?category=${c.id}`"
              >
                <span class="ct-ico"><AppIcon :name="c.icon" /></span>
                <span style="min-width: 0">
                  <b>{{ c.name }}</b>
                  <small>{{
                    c.parentName ?? t('header.categoryCount', { count: c.childCount })
                  }}</small>
                </span>
                <span v-if="c.count" class="ct-count">{{ c.count }}</span>
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SearchOverlay :open="searchOpen" @close="searchOpen = false" />
    <SiteDrawer :open="drawerOpen" :active="props.active" @close="drawerOpen = false" />
  </header>
</template>
