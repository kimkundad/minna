<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import type { CtaAction } from '@/vendor'

/**
 * Renders one action from `courseView`. Which element it becomes follows the
 * prototype's precedence: disabled wins, then a plain link, then an action
 * button. Keeping that order matters — a disabled action must never stay
 * clickable just because it also carries an href.
 */
const props = withDefaults(
  defineProps<{
    action: CtaAction | null | undefined
    size?: 'sm' | 'lg'
    block?: boolean
    extraClass?: string
    courseId?: string
    lessonId?: string
  }>(),
  {},
)

const emit = defineEmits<{ run: [action: string, courseId?: string, lessonId?: string] }>()

const classes = computed(() => [
  'btn',
  `btn--${props.action?.variant ?? props.action?.kind ?? 'primary'}`,
  props.size === 'sm' ? 'btn--sm' : '',
  props.size === 'lg' ? 'btn--lg' : '',
  props.block ? 'btn--block' : '',
  props.extraClass ?? '',
])

const isLink = computed(() => Boolean(props.action?.href && !props.action?.act))
</script>

<template>
  <template v-if="action">
    <button v-if="action.disabled" type="button" :class="classes" disabled>
      <AppIcon v-if="action.icon" :name="action.icon" />{{ action.label }}
    </button>

    <a v-else-if="isLink" :class="classes" :href="action.href">
      <AppIcon v-if="action.icon" :name="action.icon" />{{ action.label }}
    </a>

    <button
      v-else
      type="button"
      :class="classes"
      :data-action="action.act"
      :data-cid="courseId"
      :data-lid="lessonId"
      @click="emit('run', action.act, courseId, lessonId)"
    >
      <AppIcon v-if="action.icon" :name="action.icon" />{{ action.label }}
    </button>
  </template>
</template>
