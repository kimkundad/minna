
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'

/** The small sign-in prompt that stands in for the notes and Q&A panels when
 *  nobody is signed in. Both buttons are inert for now: signing in is not
 *  wired up yet, as on the course page. */
defineProps<{ title: string; text: string }>()

const { t } = useI18n()
</script>

<template>
  <div class="lp-gate">
    <span class="lp-gate-ico"><AppIcon name="lock" /></span>
    <div class="lp-gate-body">
      <b>{{ title }}</b>
      <p>{{ text }}</p>
    </div>
    <div class="lp-gate-actions">
      <button type="button" class="btn btn--primary btn--sm">
        <AppIcon name="log-in" />{{ t('common.login') }}
      </button>
      <button type="button" class="btn btn--secondary btn--sm">{{ t('common.register') }}</button>
    </div>
  </div>
</template>
