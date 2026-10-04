<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'

const { t } = useI18n()
const route = useRoute()

/** Each route states which header it needs; solid is the safe default for any
 *  page that does not open with full-bleed media. */
const headerVariant = computed(
  () => (route.meta.headerVariant as 'solid' | 'overlay') ?? 'solid',
)
const headerActive = computed(
  () => (route.meta.headerActive as 'home' | 'courses' | 'about' | null) ?? null,
)

/** Mirrors the prototype's body class, which its CSS keys a few page-specific
 *  rules off. */
const pageClass = computed(() => (route.meta.bodyClass as string) ?? '')
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
