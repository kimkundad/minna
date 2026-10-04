<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import { data } from '@/vendor'
import { assetUrl, call, useStoreTick } from './account'

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
const props = defineProps<{ page: 'overview' | 'learning' | 'orders' | 'package' | 'profile' }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const tick = useStoreTick()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const loggedIn = computed(() => {
  void tick.value
  return call<boolean>('isLoggedIn')
})

const user = computed(() => {
  void tick.value
  return loggedIn.value
    ? call<{ name: string; initials: string; memberTypeLabel: string }>('user')
    : null
})

/** The member's portrait is kept out of the saved profile in the fixture data,
 *  so it comes from the dataset rather than from the bucket. */
const photo = computed(() => assetUrl(data.memberPhoto))

/** Certificates and CE are not part of Minna, so that entry is absent here —
 *  not hidden, not disabled: there is no page behind it. */
const MENU = [
  { key: 'overview', icon: 'home', to: '/account', label: 'account.nav.overview' },
  { key: 'learning', icon: 'book-open', to: '/account/learning', label: 'account.nav.learning' },
  { key: 'orders', icon: 'receipt', to: '/account/orders', label: 'account.nav.orders' },
  { key: 'package', icon: 'package', to: '/account/package', label: 'account.nav.package' },
  { key: 'profile', icon: 'settings', to: '/account/profile', label: 'account.nav.profile' },
] as const

const title = computed(() => t(`account.page.${props.page}.title`))
const description = computed(() => t(`account.page.${props.page}.desc`))

function logout() {
  call('logout')
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
              <span><AppIcon name="stethoscope" />{{ user?.memberTypeLabel }}</span>
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
              <button type="button" class="btn btn--primary">
                <AppIcon name="log-in" />{{ t('common.login') }}
              </button>
              <button type="button" class="btn btn--secondary">
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
