<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { data, store } from '@/vendor'
import logoUrl from '@/assets/img/logo.svg'

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
  defineProps<{ variant?: 'solid' | 'overlay'; active?: 'home' | 'courses' | 'about' | null }>(),
  { variant: 'solid', active: null },
)

const { t } = useI18n()
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const megaOpen = ref(false)
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

const cartCount = computed(() =>
  (store as unknown as { cartCount: () => number }).cartCount(),
)

/** The header gains .is-stuck once the page scrolls, which the CSS uses to
 *  drop in a background and a shadow. */
function onScroll() {
  stuck.value = window.scrollY > 8
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
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
        >
          <AppIcon name="menu" />
        </button>

        <RouterLink class="brand" :to="path('')" :aria-label="t('header.brandHome')">
          <img class="brand-logo" :src="logoUrl" width="87" height="35" alt="" decoding="async" />
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
            :to="path('/about')"
            :aria-current="props.active === 'about' ? 'page' : undefined"
          >
            {{ t('common.about') }}
          </RouterLink>
        </nav>

        <div class="hdr-actions">
          <button type="button" class="icon-btn" :aria-label="t('header.searchCourses')">
            <AppIcon name="search" />
          </button>

          <RouterLink
            class="icon-btn"
            :to="path('/cart')"
            :aria-label="t('header.cartItems', { count: cartCount })"
          >
            <AppIcon name="cart" />
            <span v-if="cartCount" class="count-badge">{{ cartCount }}</span>
          </RouterLink>

          <div class="hdr-auth">
            <button type="button" class="btn btn--ghost btn--sm">{{ t('common.login') }}</button>
            <button type="button" class="btn btn--primary btn--sm">
              {{ t('common.register') }}
            </button>
          </div>

          <button
            type="button"
            class="icon-btn hdr-profile-m"
            :aria-label="t('header.loginOrRegister')"
          >
            <AppIcon name="user" />
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
  </header>
</template>
