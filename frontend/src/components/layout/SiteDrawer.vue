<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import { data, store } from '@/vendor'
import FlagIcon from '@/components/ui/FlagIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { openAuth } from '@/components/auth/authChannel'
import { LOCALES, LOCALE_META, storeLocale, type AppLocale } from '@/locales'
import logoUrl from '@/assets/img/logo.png'

/**
 * The navigation drawer behind the burger, for widths where the pill nav and
 * the header actions are hidden.
 *
 * Markup mirrors the prototype's `U.openDrawer` — .drawer-root > .layer-backdrop
 * + .drawer, with .drawer-head, .drawer-user, .drawer-nav and .drawer-sep —
 * because components.css already styles exactly those classes.
 *
 * It differs from the prototype in two places on purpose: the brand is Minna's,
 * and there is no certificates entry, since this project does not issue them.
 */
const props = defineProps<{
  open: boolean
  active?: 'home' | 'courses' | 'about' | null
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

interface FixtureUser {
  loggedIn: boolean
  name: string
  initials: string
}

const fixtureUser = computed(() => (store as unknown as { user: () => FixtureUser }).user())
const isLoggedIn = computed(() => auth.isLoggedIn)
const user = computed(() => ({
  name: auth.displayName || fixtureUser.value.name,
  initials: fixtureUser.value.initials,
}))

const memberPhoto = computed(() => {
  const photo = data.memberPhoto
  if (!photo) return null
  return photo.startsWith('assets/') ? `/${photo}` : photo
})

const cartCount = computed(() => (store as unknown as { cartCount: () => number }).cartCount())

const categories = computed(() => data.categories)

/** Collapsed by default: the full category list is longer than the menu above
 *  it, and opening the drawer should not mean scrolling past it. */
const catsOpen = ref(false)

const dialog = ref<HTMLElement | null>(null)
let returnTo: HTMLElement | null = null

function close() {
  emit('close')
}

async function signOut() {
  close()
  await auth.logout()
}

function startAuth(step: 'login' | 'register') {
  close()
  openAuth({ step })
}

/** Switching language keeps you on the page you were reading: only the locale
 *  segment of the URL changes. Navigating closes the drawer by itself. */
function chooseLocale(next: AppLocale) {
  if (next === locale.value) {
    close()
    return
  }
  storeLocale(next)
  const rest = route.path.replace(/^\/[^/]+/, '')
  router.push({ path: `/${next}${rest}`, query: route.query, hash: route.hash })
}

/* --- focus trap, Escape, and locking the page behind the drawer --- */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  if (e.key !== 'Tab' || !dialog.value) return

  const items = Array.from(dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (!items.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement

  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    document.body.classList.toggle('is-locked', isOpen)
    if (isOpen) {
      returnTo = document.activeElement as HTMLElement | null
      catsOpen.value = false
      nextTick(() => dialog.value?.querySelector<HTMLElement>('[data-close]')?.focus())
    } else {
      // Hand focus back to the burger, so a keyboard user is not dropped at the
      // top of the document.
      returnTo?.focus?.()
      returnTo = null
    }
  },
)

/** Navigating from inside the drawer has to shut it, or it covers the page it
 *  was just asked for. */
watch(() => route.fullPath, close)

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('is-locked')
})
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="drawer-root" data-floating-layer>
      <div class="layer-backdrop" @click="close" />
      <div
        ref="dialog"
        class="drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="t('header.mainMenu')"
        tabindex="-1"
      >
        <div class="drawer-head">
          <RouterLink class="brand" :to="path('')" :aria-label="t('header.brandHome')">
            <img class="brand-logo" :src="logoUrl" width="85" height="35" alt="" decoding="async" />
          </RouterLink>
          <button
            type="button"
            class="icon-btn icon-btn--ghost"
            data-close
            :aria-label="t('header.closeMenu')"
            @click="close"
          >
            <AppIcon name="x" />
          </button>
        </div>

        <RouterLink v-if="isLoggedIn" class="drawer-user" :to="path('/account')">
          <AppAvatar
            :name="user.name"
            :initials="user.initials"
            :photo="memberPhoto"
            :color="0"
            size="md"
          />
          <span>
            <b style="display: block">{{ user.name }}</b>
            <span class="text-sm text-muted">{{ auth.user?.email }}</span>
          </span>
        </RouterLink>

        <nav class="drawer-nav" :aria-label="t('header.mainMenu')">
          <RouterLink :to="path('')" :aria-current="props.active === 'home' ? 'page' : undefined">
            <AppIcon name="home" />{{ t('common.home') }}
          </RouterLink>
          <RouterLink
            :to="path('/courses')"
            :aria-current="props.active === 'courses' ? 'page' : undefined"
          >
            <AppIcon name="book-open" />{{ t('common.courses') }}
          </RouterLink>

          <button
            type="button"
            class="dn-item"
            :aria-expanded="catsOpen"
            aria-controls="drawer-cats"
            @click="catsOpen = !catsOpen"
          >
            <AppIcon name="grid" />{{ t('common.categories') }}
            <span style="margin-left: auto"><AppIcon name="chevron-down" /></span>
          </button>
          <div class="drawer-sub" id="drawer-cats" :hidden="!catsOpen">
            <RouterLink
              v-for="c in categories"
              :key="c.id"
              :to="`${path('/courses')}?category=${c.id}`"
            >
              <AppIcon :name="c.icon" />{{ c.name }}
            </RouterLink>
          </div>

          <RouterLink
            :to="path('/about')"
            :aria-current="props.active === 'about' ? 'page' : undefined"
          >
            <AppIcon name="info" />{{ t('common.about') }}
          </RouterLink>
          <RouterLink :to="path('/cart')">
            <AppIcon name="cart" />{{ t('common.cart') }} ({{ cartCount }})
          </RouterLink>

          <div class="drawer-sep" />

          <div class="drawer-locales" role="radiogroup" :aria-label="t('language.chooseTitle')">
            <button
              v-for="l in LOCALES"
              :key="l"
              type="button"
              role="radio"
              :aria-checked="l === locale"
              :aria-label="LOCALE_META[l].name"
              @click="chooseLocale(l)"
            >
              <FlagIcon :locale="l" :size="40" />
            </button>
          </div>

          <div class="drawer-sep" />

          <template v-if="isLoggedIn">
            <RouterLink :to="path('/account/learning')">
              <AppIcon name="graduation" />{{ t('account.nav.learning') }}
            </RouterLink>
            <RouterLink :to="path('/account/package')">
              <AppIcon name="package" />{{ t('account.nav.package') }}
            </RouterLink>
            <RouterLink :to="path('/account/orders')">
              <AppIcon name="receipt" />{{ t('account.nav.orders') }}
            </RouterLink>
            <RouterLink :to="path('/account/profile')">
              <AppIcon name="settings" />{{ t('account.nav.profile') }}
            </RouterLink>
            <button type="button" class="dn-item" style="color: var(--c-danger)" @click="signOut">
              <AppIcon name="log-out" />{{ t('auth.logout') }}
            </button>
          </template>

          <div v-else style="display: grid; gap: 10px; margin-top: 8px">
            <button
              type="button"
              class="btn btn--primary btn--block"
              @click="startAuth('login')"
            >
              {{ t('common.login') }}
            </button>
            <button
              type="button"
              class="btn btn--secondary btn--block"
              @click="startAuth('register')"
            >
              {{ t('common.register') }}
            </button>
          </div>
        </nav>
      </div>
    </div>
  </Teleport>
</template>
