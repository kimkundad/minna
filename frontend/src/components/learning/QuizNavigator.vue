
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import type { QuizQuestion } from './types'

/**
 * The grid of question numbers, with a legend and the submit button.
 *
 * The same component is the sidebar above 960px and the body of the bottom
 * sheet below it, which is why `prefix` exists: both can be mounted at once
 * while the sheet animates, and `data-k` is what gives focus back to the
 * control the person was on after a re-render.
 */
const props = defineProps<{
  questions: QuizQuestion[]
  /** Answered, by question index. */
  answered: boolean[]
  currentIndex: number
  /** 'side' or 'sheet'. */
  prefix: string
}>()

const emit = defineEmits<{ go: [index: number]; submit: [] }>()

const { t } = useI18n()

const answeredCount = computed(() => props.answered.filter(Boolean).length)
const remaining = computed(() => props.questions.length - answeredCount.value)
</script>

<template>
  <ol class="qz-nav-grid" role="list">
    <li v-for="(q, i) in props.questions" :key="q.id">
      <button
        type="button"
        class="qz-nb"
        :class="{ 'is-answered': props.answered[i], 'is-current': i === props.currentIndex }"
        :data-go="i"
        :data-k="`${props.prefix}-nb-${i}`"
        :aria-current="i === props.currentIndex ? 'step' : undefined"
        :aria-label="
          q.type === 'essay'
            ? t('learning.quiz.navEssayLabel', {
                n: i + 1,
                state: props.answered[i] ? t('learning.quiz.answered') : t('learning.quiz.unanswered'),
              })
            : t('learning.quiz.navLabel', {
                n: i + 1,
                state: props.answered[i] ? t('learning.quiz.answered') : t('learning.quiz.unanswered'),
              })
        "
        @click="emit('go', i)"
      >
        <AppIcon v-if="q.type === 'essay'" name="pen" class="qz-nb-ico" />
        <span>{{ i + 1 }}</span>
      </button>
    </li>
  </ol>

  <ul class="qz-legend" role="list">
    <li><i class="qz-sw is-answered" />{{ t('learning.quiz.answered') }}</li>
    <li><i class="qz-sw is-current" />{{ t('learning.quiz.currentQuestion') }}</li>
    <li><i class="qz-sw" />{{ t('learning.quiz.unanswered') }}</li>
  </ul>

  <p class="qz-nav-sum">
    {{ t('learning.quiz.answeredPrefix') }}
    <b>{{ answeredCount }}</b>
    {{ t('learning.quiz.answeredNavSuffix', { total: props.questions.length })
    }}{{
      remaining
        ? ` · ${t('learning.quiz.remaining', { n: remaining })}`
        : ` · ${t('learning.quiz.allAnswered')}`
    }}
  </p>

  <button
    type="button"
    class="btn btn--primary btn--block"
    data-submit
    :data-k="`${props.prefix}-submit`"
    @click="emit('submit')"
  >
    <AppIcon name="send" />{{ t('learning.quiz.submit') }}
  </button>
</template>
