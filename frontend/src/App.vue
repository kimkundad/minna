<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SiteHeader from '@/components/layout/SiteHeader.vue'
import SiteFooter from '@/components/layout/SiteFooter.vue'

const { t } = useI18n()
</script>

<template>
  <a class="skip-link" href="#main">{{ t('common.skipToContent') }}</a>
  <SiteHeader />
  <main id="main" tabindex="-1">
    <RouterView />
  </main>
  <SiteFooter />
</template>
