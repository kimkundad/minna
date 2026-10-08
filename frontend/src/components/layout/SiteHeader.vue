<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import SiteDrawer from '@/components/layout/SiteDrawer.vue'
import SearchOverlay from '@/components/layout/SearchOverlay.vue'
import LocaleSwitcher from '@/components/layout/LocaleSwitcher.vue'
import { data, store } from '@/vendor'
import { useAuthStore } from '@/stores/auth'
import { openAuth } from '@/components/auth/authChannel'
import { useCartStore } from '@/stores/cart'
import logoUrl from '@/assets/img/logo.png'

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

interface FixtureUser {
  loggedIn: boolean
  name: string
  initials: string
}

const auth = useAuthStore()

/**
 * Identity comes from our own API; the avatar and the notification count still
 * come from the fixture store, which is where that data lives until the API
 * serves it. Signing in flips both, so the two never disagree about whether
 * anyone is here.
 */
const fixtureUser = computed(
  () => (store as unknown as { user: () => FixtureUser }).user(),
)
const isLoggedIn = computed(() => auth.isLoggedIn)
const user = computed(() => ({
  name: auth.displayName || fixtureUser.value.name,
  initials: fixtureUser.value.initials,
}))

const accountMenuOpen = ref(false)

async function signOut() {
  accountMenuOpen.value = false
  await auth.logout()
}

/** Guests have no notifications to count, so the badge never shows for them. */
const unread = computed(() =>
  isLoggedIn.value ? (store as unknown as { unreadCount: () => number }).unreadCount() : 0,
)

const memberPhoto = computed(() => {
  const photo = data.memberPhoto
  if (!photo) return null
  return photo.startsWith('assets/') ? `/${photo}` : photo
})

const { t } = useI18n()
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const megaOpen = ref(false)
const drawerOpen = ref(false)
const searchOpen = ref(false)
const stuck = ref(false)

/** Each tile shows how many published courses sit in that category, which is
 *  why this reads the catalog rather than the raw category list. */
const categories = computed(() => {
  const published = (store as unknown as { catalog: () => { category: string }[] }).catalog()
  return data.categories.map((c) => ({
    ...c,
    count: published.filter((x) => x.category === c.id).length,
  }))
})

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
  if (!accountMenuOpen.value) return
  if ((e.target as HTMLElement | null)?.closest('.menu-anchor')) return
  accountMenuOpen.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !megaOpen.value) return
  megaOpen.value = false
  megaTrigger.value?.focus()
}

const megaTrigger = ref<HTMLButtonElement | null>(null)

watch(() => route.fullPath, () => {
  megaOpen.value = false
  accountMenuOpen.value = false
})

onMounted(() => {
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
          <img class="brand-logo" :src="logoUrl" width="85" height="35" alt="" decoding="async" />
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

          <!-- Signed in: a notification bell and the member's own menu. Signed
               out: the two auth buttons. Never both. -->
          <div v-if="isLoggedIn" class="menu-anchor hdr-bell">
            <button
              type="button"
              class="icon-btn"
              aria-haspopup="true"
              aria-expanded="false"
              :aria-label="
                unread ? t('header.notificationsUnread', { count: unread }) : t('common.notifications')
              "
            >
              <AppIcon name="bell" />
              <span v-if="unread" class="count-badge">{{ unread }}</span>
            </button>
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
                  <small>{{ c.th }}</small>
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
