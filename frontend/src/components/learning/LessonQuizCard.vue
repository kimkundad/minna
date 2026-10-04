
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import type { Course, QuizStatus } from './types'

/**
 * The stage when the current lesson is the end-of-course quiz: what the test
 * is, and what the learner's standing on it is.
 *
 * The badge, the sentence and the buttons are one decision, taken in the order
 * the prototype takes it — never attempted, then completed, then choice not
 * passed, then each essay state — so the card cannot show "passed" beside a
 * "try again" button.
 *
 * Minna issues no certificates, so the completed state offers the result page
 * alone and the "not all lessons watched" note promises nothing about CE.
 */
const props = defineProps<{
  course: Course
  status: QuizStatus
  /** Lessons finished and lessons in total, excluding the quiz itself. */
  doneCount: number
  lessonCount: number
  quizPath: string
  resultPath: string
  essayPath: string
}>()

const { t } = useI18n()

const quiz = computed(() => props.course.quiz)
const choiceCount = computed(() => quiz.value.questions.filter((q) => q.type !== 'essay').length)
const essayCount = computed(() => quiz.value.questions.length - choiceCount.value)

type Standing = {
  kind: string
  icon: string
  title: string
  desc: string
  /** 'take' · 'result' · 'take+result' · 'result+edit' */
  actions: 'take' | 'result' | 'take+result' | 'result+edit'
}

const standing = computed<Standing>(() => {
  const s = props.status
  if (!s.attempts)
    return {
      kind: 'info',
      icon: 'circle',
      title: t('learning.quizCard.notTaken'),
      desc: t('learning.quizCard.notTakenDesc'),
      actions: 'take',
    }
  if (s.completed)
    return {
      kind: 'passed',
      icon: 'check-circle',
      title: t('learning.quizCard.passed'),
      desc: t('learning.quizCard.passedDesc'),
      actions: 'result',
    }
  if (!s.choicePassed)
    return {
      kind: 'failed',
      icon: 'x-circle',
      title: t('learning.quizCard.choiceFailed'),
      desc: t('learning.quizCard.choiceFailedDesc', {
        correct: s.latest?.correct ?? 0,
        total: s.latest?.total ?? 0,
      }),
      actions: 'take+result',
    }
  if (s.essayStatus === 'revision')
    return {
      kind: 'revision',
      icon: 'alert-circle',
      title: t('learning.quizCard.essayRevision'),
      desc: t('learning.quizCard.essayRevisionDesc'),
      actions: 'result+edit',
    }
  if (s.essayStatus === 'resubmitted')
    return {
      kind: 'resubmitted',
      icon: 'hourglass',
      title: t('learning.quizCard.essayResubmitted'),
      desc: t('learning.quizCard.essayResubmittedDesc'),
      actions: 'result',
    }
  if (s.essayStatus === 'pending')
    return {
      kind: 'pending',
      icon: 'hourglass',
      title: t('learning.quizCard.essayPending'),
      desc: t('learning.quizCard.essayPendingDesc'),
      actions: 'result',
    }
  return {
    kind: 'pending',
    icon: 'pen',
    title: t('learning.quizCard.essayMissing'),
    desc: t('learning.quizCard.essayMissingDesc'),
    actions: 'take+result',
  }
})

const showTake = computed(() => standing.value.actions.startsWith('take'))
const resultIsPrimary = computed(() => standing.value.actions.startsWith('result'))
</script>

<template>
  <div class="lp-quizcard">
    <div class="lp-qc-main">
      <span class="lp-qc-ico" aria-hidden="true"><AppIcon name="clipboard-check" /></span>
      <p class="lp-qc-eyebrow">{{ t('learning.quizCard.eyebrow') }}</p>
      <h2 class="lp-qc-title">{{ quiz.title }}</h2>
      <ul class="lp-qc-facts" role="list">
        <li>
          <AppIcon name="list" />
          <span>
            <b>{{ t('learning.quiz.questionCount', { n: quiz.questions.length }) }}</b>
            {{ t('learning.quizCard.mix', { choice: choiceCount, essay: essayCount }) }}
          </span>
        </li>
        <li>
          <AppIcon name="target" />
          <span>
            {{ t('learning.quizCard.passRulePrefix') }}
            <b>{{ t('learning.quiz.atLeastPct', { pct: quiz.passPct }) }}</b>
            {{ t('learning.quizCard.passRuleSuffix') }}
          </span>
        </li>
        <li v-if="quiz.timerMin">
          <AppIcon name="timer" />
          <span>
            {{ t('learning.quizCard.timerPrefix') }}
            <b>{{ t('learning.quiz.minutes', { n: quiz.timerMin }) }}</b>
          </span>
        </li>
        <li>
          <AppIcon name="refresh" />
          <span>{{ t('learning.quizCard.unlimited') }}</span>
        </li>
      </ul>
    </div>

    <div class="lp-qc-status">
      <span class="badge badge--lg" :class="`badge--${standing.kind}`">
        <AppIcon :name="standing.icon" />{{ standing.title }}
      </span>
      <p class="lp-qc-desc">{{ standing.desc }}</p>
      <p v-if="props.doneCount < props.lessonCount" class="lp-qc-note">
        <AppIcon name="info" />
        <span>
          {{ t('learning.quizCard.lessonsLeft', { done: props.doneCount, total: props.lessonCount }) }}
        </span>
      </p>
      <div class="lp-qc-actions">
        <RouterLink
          v-if="showTake"
          class="btn btn--primary"
          :to="props.quizPath"
          data-cta-primary
          data-k="qc-take"
        >
          <AppIcon name="clipboard-check" />{{ t('learning.quizCard.take') }}
        </RouterLink>
        <RouterLink
          v-if="standing.actions !== 'take'"
          class="btn"
          :class="resultIsPrimary ? 'btn--primary' : 'btn--secondary'"
          :to="props.resultPath"
          :data-cta-primary="resultIsPrimary ? '' : undefined"
          data-k="qc-result"
        >
          <AppIcon v-if="resultIsPrimary" name="badge-check" />{{ t('learning.quizCard.result') }}
        </RouterLink>
        <RouterLink
          v-if="standing.actions === 'result+edit'"
          class="btn btn--secondary"
          :to="props.essayPath"
          data-k="qc-edit"
        >
          <AppIcon name="pen" />{{ t('learning.quiz.editEssay') }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
