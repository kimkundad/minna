<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

/** Only `danger` is announced as an alert; the rest are polite status updates,
 *  so a page full of notices does not interrupt a screen reader repeatedly. */
const props = withDefaults(
  defineProps<{
    tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'proto'
    title?: string
    text?: string
    icon?: string
  }>(),
  { tone: 'info' },
)

const DEFAULT_ICON = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'alert-circle',
  neutral: 'info',
  proto: 'flask',
} as const

const iconName = computed(() => props.icon ?? DEFAULT_ICON[props.tone])
</script>

<template>
  <div class="notice" :class="`notice--${tone}`" :role="tone === 'danger' ? 'alert' : 'status'">
    <AppIcon :name="iconName" />
    <div class="notice-body">
      <b v-if="title">{{ title }}</b>
      <span v-if="text">{{ text }}</span>
      <div v-if="$slots.actions" class="notice-actions"><slot name="actions" /></div>
    </div>
  </div>
</template>
