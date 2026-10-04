
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import type { CourseView } from '@/vendor'
import type { Access, Course, Lesson } from './types'

/**
 * The access overlay: the 16:9 stage, filled with the course art behind a
 * scrim, saying why this lesson will not play and what to do about it.
 *
 * Which of the five entitlement states it is comes from `courseView(id)` —
 * signed out, never bought, course withdrawn, access expired, package expired —
 * and the glyph and tone follow from that. The buy and cart actions are
 * `courseView`'s own, not this component's idea of them, so they stay in step
 * with the course page and the cards.
 *
 * Whenever a free sample exists and is not the lesson already selected, a link
 * to it sits underneath: refusing a lesson is a better experience when there is
 * something to say yes to.
 */
const props = defineProps<{
  course: Course
  lesson: Lesson
  view: CourseView
  access: Access
  categoryIcon: string
  categoryPalette: number
  /** The free sample video to offer instead, if there is one worth offering. */
  previewLesson: Lesson | null
  /** The lesson left unfinished, shown when access has lapsed. */
  resumeLesson: Lesson | null
}>()

const emit = defineEmits<{ run: [action: string, courseId?: string]; select: [lessonId: string] }>()

const { t } = useI18n()

const reason = computed(() => props.access.reason)

const tone = computed(() =>
  reason.value === 'ended'
    ? 'ended'
    : reason.value === 'expired' || reason.value === 'pkg-expired'
      ? 'expired'
      : 'default',
)

const glyph = computed(() =>
  reason.value === 'ended'
    ? 'ban'
    : reason.value === 'expired' || reason.value === 'pkg-expired'
      ? 'hourglass'
      : 'lock',
)

const title = computed(() => props.view?.lock?.title ?? t('learning.lock.fallbackTitle'))

const text = computed(() => {
  const base = props.view?.lock?.text ?? ''
  if (reason.value === 'guest' && props.course.isFree) {
    return base + t('learning.lock.freeForMembersSuffix')
  }
  return base
})

/** `courseView` offers an action set per state; expiry gets the repurchase
 *  button spelled out, because its own primary is the softer "renew". */
const actions = computed(() => {
  const v = props.view
  if (reason.value === 'ended') {
    const list = [v?.primary, v?.secondary].filter((a) => a && !a.disabled)
    return list.length
      ? list
      : [
          {
            label: t('learning.lock.otherCourses'),
            href: 'courses.html',
            variant: 'secondary',
            icon: 'search',
          },
        ]
  }
  if (reason.value === 'expired') {
    return [
      { label: t('learning.lock.rebuy'), action: 'buy', icon: 'refresh' },
      ...(v?.secondary ? [v.secondary] : []),
    ]
  }
  return [v?.primary, v?.secondary].filter(Boolean)
})

const showResumeChip = computed(() => reason.value === 'expired' && props.resumeLesson)
</script>

<template>
  <div class="lp-frame lp-lock" :class="`lp-lock--${tone}`" role="region" aria-labelledby="lp-lock-h">
    <div class="lp-lock-bg" aria-hidden="true">
      <CourseImage
        class="lp-lock-img"
        :image="props.course.image"
        :width="960"
        :height="540"
        :art-icon="props.categoryIcon"
        :art-palette="props.categoryPalette"
        alt=""
        eager
      />
    </div>
    <div class="lp-lock-body">
      <span class="lp-lock-ico"><AppIcon :name="glyph" /></span>
      <h2 class="lp-lock-title" id="lp-lock-h">{{ title }}</h2>
      <p v-if="text" class="lp-lock-text">{{ text }}</p>

      <p v-if="showResumeChip" class="lp-lock-chip">
        <AppIcon name="history" />
        <span>
          {{ t('learning.lock.unfinished') }}
          <b>
            {{ props.resumeLesson!.title
            }}{{ props.resumeLesson!.subtitle ? ` — ${props.resumeLesson!.subtitle}` : '' }}
          </b>
        </span>
      </p>

      <div class="lp-lock-actions">
        <!-- Signing in is not wired up yet, so these two stay inert, as on the
             course page. -->
        <template v-if="reason === 'guest'">
          <button type="button" class="btn btn--primary" data-cta-primary data-k="lock-login">
            <AppIcon name="log-in" />{{ t('common.login') }}
          </button>
          <button type="button" class="btn btn--secondary" data-k="lock-register">
            {{ t('common.register') }}
          </button>
        </template>
        <template v-else>
          <CtaButton
            v-for="(action, i) in actions"
            :key="i"
            :action="action"
            :course-id="props.course.id"
            @run="(a, cid) => emit('run', a, cid)"
          />
        </template>
      </div>

      <button
        v-if="props.previewLesson"
        type="button"
        class="lp-lock-link"
        data-k="lock-preview"
        @click="emit('select', props.previewLesson!.id)"
      >
        <AppIcon name="play-circle" />{{
          t('learning.lock.watchSample', { title: props.previewLesson!.title })
        }}
      </button>
    </div>
  </div>
</template>
