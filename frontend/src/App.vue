<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'

const { t } = useI18n()
const route = useRoute()

/** Each route states which header it needs; solid is the safe default for any
 *  page that does not open with full-bleed media. */
const headerVariant = computed(
  () => (route.meta.headerVariant as 'solid' | 'overlay' | 'compact') ?? 'solid',
)
const headerActive = computed(
  () => (route.meta.headerActive as 'home' | 'courses' | 'about' | null) ?? null,
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
  </div>
</template>
