<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { toasts, dismissToast } from './useCommerce'

/**
 * The prototype's toast region, which it appends to `<body>` on first use.
 * Teleported here for the same reason: `.toast-region` is `position: fixed`
 * and `body.has-bottom-bar` lifts it clear of the mobile summary bar, so it
 * has to be a child of the body rather than of a page section.
 *
 * Only `error` is announced as an alert; everything else is a polite status,
 * because an undo offer interrupting a screen reader mid-sentence is worse
 * than arriving a moment later.
 */
const { t } = useI18n()

const ICON = { success: 'check', error: 'alert-circle', info: 'info' } as const
</script>

<template>
  <Teleport to="body">
    <div
      v-if="toasts.length"
      id="toast-region"
      class="toast-region"
      aria-live="polite"
      aria-atomic="false"
    >
      <div
        v-for="item in toasts"
        :key="item.id"
        class="toast"
        :class="[`toast--${item.type}`, { 'is-leaving': item.leaving }]"
        :role="item.type === 'error' ? 'alert' : 'status'"
      >
        <span class="toast-ico"><AppIcon :name="ICON[item.type]" /></span>
        <span class="toast-msg">{{ item.message }}</span>
        <button
          v-if="item.action"
          type="button"
          class="toast-action"
          @click="
            item.action.onClick();
            dismissToast(item.id)
          "
        >
          {{ item.action.label }}
        </button>
        <button
          type="button"
          class="toast-x"
          :aria-label="t('commerce.toast.close')"
          @click="dismissToast(item.id)"
        >
          <AppIcon name="x" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
