<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'
import AuthModal from '@/components/auth/AuthModal.vue'
import CommerceToasts from '@/components/commerce/CommerceToasts.vue'
import ChatDock from '@/components/chat/ChatDock.vue'
import LocaleGate from '@/components/layout/LocaleGate.vue'

const { t } = useI18n()
const route = useRoute()

/** Each route states which header it needs; solid is the safe default for any
 *  page that does not open with full-bleed media. */
const headerVariant = computed(
  () => (route.meta.headerVariant as 'solid' | 'overlay' | 'compact') ?? 'solid',
)
const headerActive = computed(
  () => (route.meta.headerActive as 'home' | 'courses' | 'blog' | 'about' | null) ?? null,
)

/**
 * The ported CSS keys several rules off the page class being on <body> —
 * `body.has-bottom-bar.page-cart .site-footer`, `body.page-course.has-bottom-bar`
 * and the toast region's offset among them. Putting it only on our root div
 * leaves those unmatched, so it goes on both: the div for anything scoped
 * inside the app, the body for the rules that reach past it.
 */
const pageClass = computed(() => (route.meta.bodyClass as string) ?? '')

let applied: string[] = []
watch(
  pageClass,
  (next) => {
    document.body.classList.remove(...applied)
    applied = next ? next.split(/\s+/).filter(Boolean) : []
    if (applied.length) document.body.classList.add(...applied)
  },
  { immediate: true },
)
onBeforeUnmount(() => document.body.classList.remove(...applied))
</script>

<template>
  <!-- A single root element, not a fragment: Vue's dev server renders a
       multi-root App twice into the mount point, which duplicates the header. -->
  <div class="app-root" :class="pageClass">
    <a class="skip-link" href="#main">{{ t('common.skipToContent') }}</a>
    <SiteHeader :variant="headerVariant" :active="headerActive" />
    <main id="main" tabindex="-1">
      <RouterView />
    </main>
    <SiteFooter />
    <!-- Mounted once, opened from anywhere through the auth channel, so a
         locked lesson and the header raise the same dialog. -->
    <AuthModal />
    <!-- Likewise mounted once: the basket raises a toast from a card, a course
         page or the cart itself, and all three are shown here. -->
    <CommerceToasts />
    <!-- And once more: a lesson, a course page or the header can raise the
         conversation without any of them owning it, and it floats over
         whatever was on screen rather than taking the page away. -->
    <ChatDock />
    <!-- Over everything, on a first visit only. Which language the site is in
         decides whether the page behind it can be read at all, so it is asked
         before anything else and cannot be dismissed. -->
    <LocaleGate />
  </div>
</template>
