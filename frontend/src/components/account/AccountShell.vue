<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import { useAuthStore } from '@/stores/auth'
import { openAuth } from '@/components/auth/authChannel'
import { mediaUrl } from '@/lib/api'
import { initialsOf } from '@/lib/course'

/**
 * The frame all five account pages sit in: a compact hero carrying the
 * breadcrumb, the title and — below 960px — the pill tabs, then a 300px
 * sidebar beside the content column.
 *
 * It is one component rather than five copies because the menu is the part
 * most likely to change, and a menu that disagrees with itself from page to
 * page is worse than no menu.
 *
 * Signed out, the sidebar and tabs would only list things that cannot be
 * opened, so the shell drops to a single column and shows the gate instead.
 */
const props = defineProps<{
  page: 'overview' | 'learning' | 'messages' | 'notifications' | 'orders' | 'package' | 'profile'
}>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/**
 * The real session, not the prototype's.
 *
 * This decides whether the shell shows the account or the sign-in gate, so
 * reading it from the fixture store meant somebody genuinely signed in was shown
 * the gate — every page inside this shell was unreachable.
 */
const auth = useAuthStore()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const loggedIn = computed(() => auth.isLoggedIn)

const user = computed(() => {
  const u = auth.user
  if (!u) return null
  const name = auth.displayName
  return {
    name,
    initials: initialsOf(name),
    // The one role worth saying out loud here. Admin and teacher have their own
    // screens; this is the member's own corner of the public site.
    roleLabel: u.roles.includes('teacher') ? t('auth.memberTeacher') : t('auth.memberStudent'),
  }
})

/** Their own uploaded photo, or nothing — in which case the avatar draws their
 *  initials, which is the same thing the header does. */
const photo = computed(() =>
  auth.user?.avatarPath ? mediaUrl(auth.user.avatarPath) : null,
)

/**
 * Certificates and CE are not part of Minna, so that entry is absent here —
 * not hidden, not disabled: there is no page behind it.
 *
 * Nor is "my package". Packages are not on sale — the API refuses to put one
 * in a basket — so nobody can have one, and a menu item leading to a page that
 * can only ever say "you have no package" is a question the site asks itself.
 * It comes back with them.
 */
/**
 * The admin's address, for the accounts that may open it.
 *
 * Null for a student, and null when the address is not configured — a link
 * that lands on nothing is worse than no link.
 */
const adminUrl = computed(() => {
  if (!auth.isTeacher && !auth.isAdmin) return null
  const url = String(import.meta.env.VITE_ADMIN_URL ?? '').trim()
  return url || null
})

const MENU = [
  { key: 'overview', icon: 'home', to: '/account', label: 'account.nav.overview' },
  { key: 'learning', icon: 'book-open', to: '/account/learning', label: 'account.nav.learning' },
  // Above the bell: one is work waiting for them, the other is somebody
  // waiting for them.
  { key: 'messages', icon: 'message-square', to: '/account/messages', label: 'account.nav.messages' },
  { key: 'notifications', icon: 'bell', to: '/account/notifications', label: 'account.nav.notifications' },
  { key: 'orders', icon: 'receipt', to: '/account/orders', label: 'account.nav.orders' },
  { key: 'profile', icon: 'settings', to: '/account/profile', label: 'account.nav.profile' },
] as const

const title = computed(() => t(`account.page.${props.page}.title`))
const description = computed(() => t(`account.page.${props.page}.desc`))

async function logout() {
  await auth.logout()
  void router.push(path(''))
}
</script>

<template>
  <div id="acct-root" class="acct">
    <div class="page-hero acct-hero">
      <div class="container">
        <nav :aria-label="t('common.breadcrumb')">
          <ol class="crumbs">
            <li>
              <RouterLink v-slot="{ href, navigate }" :to="path('')" custom>
                <a :href="href" @click="navigate">{{ t('common.home') }}</a>
              </RouterLink>
            </li>
            <li aria-hidden="true"><AppIcon name="chevron-right" /></li>
            <li>
              <RouterLink v-slot="{ href, navigate }" :to="path('/account')" custom>
                <a :href="href" @click="navigate">{{ t('account.title') }}</a>
              </RouterLink>
            </li>
            <li aria-hidden="true"><AppIcon name="chevron-right" /></li>
            <li><span aria-current="page">{{ title }}</span></li>
          </ol>
        </nav>

        <h1 id="acct-h1" tabindex="-1">{{ title }}</h1>
        <p class="acct-hero-desc">{{ description }}</p>

        <nav v-if="loggedIn" class="acct-tabs-nav" :aria-label="t('account.menu')">
          <div class="tabs tabs--pill acct-tabs">
            <RouterLink
              v-for="item in MENU"
              :key="item.key"
              class="tab"
              :to="path(item.to)"
              :aria-current="item.key === page ? 'page' : undefined"
            >
              <AppIcon :name="item.icon" />
              <span>{{ t(item.label) }}</span>
            </RouterLink>
          </div>
        </nav>
      </div>
    </div>

    <div
      class="container acct-layout"
      :class="{ 'acct-layout--solo': !loggedIn }"
    >
      <aside v-if="loggedIn" class="acct-side" :aria-label="t('account.title')">
        <div class="acct-side-card">
          <div class="acct-user">
            <AppAvatar
              size="lg"
              :name="user?.name"
              :initials="user?.initials"
              :photo="photo"
              :color="0"
            />
            <div class="acct-user-txt">
              <b>{{ user?.name }}</b>
              <span><AppIcon name="graduation" />{{ user?.roleLabel }}</span>
            </div>
          </div>

          <nav class="acct-nav" :aria-label="t('account.menu')">
            <ul role="list">
              <li v-for="item in MENU" :key="item.key">
                <RouterLink
                  :to="path(item.to)"
                  :aria-current="item.key === page ? 'page' : undefined"
                >
                  <AppIcon :name="item.icon" />
                  <span>{{ t(item.label) }}</span>
                </RouterLink>
              </li>
            </ul>
            <!--
              The way across to the admin, for the accounts that have one.

              It is a different app on a different address, and nothing else on
              the public site points at it — so a teacher approved this morning
              had no way of finding where their courses live.
            -->
            <template v-if="adminUrl">
              <div class="acct-nav-sep" aria-hidden="true"></div>
              <a class="acct-nav-cross" :href="adminUrl" rel="noopener">
                <AppIcon name="graduation" />
                <span>{{ t('account.nav.teaching') }}</span>
                <AppIcon name="external" />
              </a>
            </template>

            <div class="acct-nav-sep" aria-hidden="true"></div>
            <button type="button" class="acct-nav-out" @click="logout">
              <AppIcon name="log-out" />
              <span>{{ t('account.logout') }}</span>
            </button>
          </nav>
        </div>
      </aside>

      <div class="acct-main" id="acct-content">
        <slot v-if="loggedIn" />

        <div v-else class="acct-gate">
          <div class="state-box">
            <div class="state-ico"><AppIcon name="user" /></div>
            <h3>{{ t('account.gate.title') }}</h3>
            <p>{{ t('account.gate.text') }}</p>
            <div class="state-actions">
              <button type="button" class="btn btn--primary" @click="openAuth({ step: 'login' })">
                <AppIcon name="log-in" />{{ t('common.login') }}
              </button>
              <button
                type="button"
                class="btn btn--secondary"
                @click="openAuth({ step: 'register' })"
              >
                {{ t('common.register') }}
              </button>
            </div>
          </div>
          <p class="acct-gate-alt">
            <AppIcon name="sparkles" />{{ t('account.gate.alt') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
