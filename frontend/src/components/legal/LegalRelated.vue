<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'

/** The pair of cross-links each legal page closes with. Every one of the three
 *  points at the other two, so nobody reaches a dead end halfway down. */
defineProps<{ links: { to: string; icon: string; label: string }[] }>()

const route = useRoute()
const { t } = useI18n()
const locale = computed(() => String(route.params.locale ?? 'th'))
</script>

<template>
  <h3 class="lg-h3">{{ t('legal.related') }}</h3>
  <div class="lg-more">
    <RouterLink v-for="l in links" :key="l.to" :to="`/${locale}${l.to}`">
      <span><AppIcon :name="l.icon" /></span>{{ l.label }}
    </RouterLink>
  </div>
</template>
