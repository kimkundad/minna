
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppProgress from '@/components/ui/AppProgress.vue'
import { LESSON_ICON } from './learning'
import type { Access, Course, Lesson, Progress, QuizStatus } from './types'
import type { CourseView } from '@/vendor'

/**
 * The course contents: a progress head, then one collapsible section per
 * module with its lessons.
 *
 * The same component is both the desktop sidebar and the body of the drawer
 * below 960px, which is why the element ids it generates are prefixed — two
 * copies of the list can be in the DOM at once while the drawer animates, and
 * `aria-controls` has to point at the right one.
 *
 * A row knows three things about itself: finished, locked, or current. Locked
 * is not the same as unfinished — a free sample inside a course nobody has
 * bought is openable — so it asks `playable` rather than assuming access.
 */
const props = defineProps<{
  course: Course
  view: CourseView
  access: Access
  progress: Progress
  quizStatus: QuizStatus
  currentLessonId: string
  /** Which modules are open, by module id; absent means "follow the current". */
  openModules: Record<string, boolean>
  /** Element-id prefix, 's' for the sidebar and 'd' for the drawer. */
  prefix: string
  loggedIn: boolean
  withTitle?: boolean
}>()

const emit = defineEmits<{ select: [lessonId: string]; toggle: [moduleId: string] }>()

const { t } = useI18n()

/** The module holding the lesson on screen, which decides what starts open. */
const currentModuleId = computed(
  () =>
    props.course.modules.find((m) => m.lessons.some((l) => l.id === props.currentLessonId))?.id ??
    null,
)

function isDone(lesson: Lesson): boolean {
  if (lesson.type === 'quiz') return props.quizStatus.completed
  return !!props.progress.map[lesson.id]?.done
}

/** The prototype's rule: with access everything opens; without it, only a
 *  lesson marked as a preview video, and not once the course has ended. */
function playable(lesson: Lesson): boolean {
  if (props.access.has) return true
  if (['ended', 'missing', 'free-available'].includes(props.access.reason)) return false
  return lesson.preview && lesson.type === 'video'
}

/** The lesson left part-watched, flagged only while access has lapsed — that is
 *  the one case where "come back to this" is the point of the row. */
const resumeId = computed(() =>
  props.progress.started && !props.access.has && props.progress.resume
    ? props.progress.resume.id
    : null,
)

const stateChip = computed(() => {
  const map: Record<string, [string, string, string]> = {
    ended: ['expired', 'ban', t('learning.side.chipEnded')],
    'access-expired': ['access-expired', 'hourglass', t('learning.side.chipAccessExpired')],
    'pkg-expired': ['access-expired', 'hourglass', t('learning.side.chipPkgExpired')],
    guest: ['info', 'eye', t('learning.side.chipGuest')],
    buy: ['info', 'lock', t('learning.side.chipBuy')],
  }
  const hit = map[props.view?.state ?? '']
  if (hit) return hit
  if (props.access.source === 'package')
    return ['package', 'package', t('learning.side.chipPackage')] as [string, string, string]
  return null
})

const showProgress = computed(
  () => props.loggedIn && (props.access.has || props.progress.started),
)

const modules = computed(() =>
  props.course.modules.map((m, index) => {
    const doneCount = m.lessons.filter(isDone).length
    const seconds = m.lessons.reduce((sum, l) => sum + (l.sec || 0), 0)
    return {
      ...m,
      index,
      doneCount,
      complete: doneCount === m.lessons.length,
      seconds,
      open: props.openModules[m.id] ?? currentModuleId.value === m.id,
      listId: `lp-${props.prefix}-${m.id}`,
    }
  }),
)

/** The amber tag on the quiz row, when an attempt is in flight or short. */
function quizTag(): string {
  const qs = props.quizStatus
  if (!props.loggedIn || !qs.attempts) return ''
  const map: Record<string, string> = {
    pending: t('learning.side.quizPending'),
    resubmitted: t('learning.side.quizResubmitted'),
    revision: t('learning.side.quizRevision'),
  }
  return map[qs.essayStatus] ?? (qs.choicePassed ? '' : t('learning.side.quizFailed'))
}

function lessonBarWidth(lesson: Lesson): number {
  const f = props.progress.map[lesson.id]?.f ?? 0
  return Math.max(4, Math.round(Math.min(f, 0.89) * 100))
}

function showBar(lesson: Lesson): boolean {
  const f = props.progress.map[lesson.id]?.f ?? 0
  return f > 0 && !isDone(lesson) && lesson.type !== 'quiz'
}

/** What a screen reader hears after the lesson title. */
function srSuffix(lesson: Lesson): string {
  const parts: string[] = []
  if (isDone(lesson)) parts.push(t('learning.side.srDone'))
  else if (!playable(lesson)) parts.push(t('learning.side.srLocked'))
  if (lesson.preview && !props.access.has && playable(lesson))
    parts.push(t('learning.side.srPreview'))
  return parts.join(', ')
}
</script>

<template>
  <div class="lp-side-head">
    <h2 v-if="props.withTitle" class="lp-side-h" id="lp-side-h">{{ t('learning.side.title') }}</h2>
    <template v-if="showProgress">
      <AppProgress
        :value="props.progress.pct"
        :muted="!props.access.has"
        :label="t('learning.side.courseProgress')"
      />
      <p class="lp-side-sub">
        {{ t('learning.side.lessonsDonePrefix') }}
        <b>{{ props.progress.done }}/{{ props.progress.total }}</b>
        {{ t('learning.side.lessonsDoneSuffix')
        }}{{ props.access.has ? '' : t('learning.side.progressKept') }}
      </p>
    </template>
    <p v-else class="lp-side-sub">
      {{ t('learning.side.lessonCount', { n: props.progress.total }) }} ·
      {{ props.course.durationLabel }}
    </p>
    <p v-if="stateChip" class="lp-side-chip">
      <span class="badge" :class="`badge--${stateChip[0]}`">
        <AppIcon :name="stateChip[1]" />{{ stateChip[2] }}
      </span>
    </p>
  </div>

  <div class="lp-side-body">
    <section v-for="m in modules" :key="m.id" class="lp-mod" :class="{ 'is-complete': m.complete }">
      <h3 class="lp-mod-h">
        <button
          type="button"
          class="lp-mod-btn"
          :data-mid="m.id"
          :data-k="`mod-${m.id}`"
          :aria-expanded="m.open"
          :aria-controls="m.listId"
          @click="emit('toggle', m.id)"
        >
          <span class="lp-mod-idx" aria-hidden="true">
            <AppIcon v-if="m.complete && props.loggedIn" name="check" />
            <template v-else>{{ m.index + 1 }}</template>
          </span>
          <span class="lp-mod-title">
            <span class="lp-mod-kicker">{{ t('learning.side.module', { n: m.index + 1 }) }}</span>
            {{ m.title }}
            <small>
              {{
                props.loggedIn
                  ? t('learning.side.moduleDone', { done: m.doneCount, total: m.lessons.length })
                  : t('learning.side.lessonCount', { n: m.lessons.length })
              }}{{
                m.seconds ? ` · ${t('learning.side.minutes', { n: Math.round(m.seconds / 60) })}` : ''
              }}
            </small>
          </span>
          <AppIcon name="chevron-down" class="lp-mod-chev" />
        </button>
      </h3>
      <ol class="lp-mod-list" :id="m.listId" role="list" :hidden="!m.open">
        <li v-for="l in m.lessons" :key="l.id">
          <button
            type="button"
            class="lp-les"
            :class="{
              'is-current': l.id === props.currentLessonId,
              'is-done': isDone(l),
              'is-locked': !playable(l),
            }"
            :data-lp-lesson="l.id"
            :data-k="`les-${l.id}`"
            :aria-current="l.id === props.currentLessonId ? 'true' : undefined"
            @click="emit('select', l.id)"
          >
            <span class="lp-les-ico">
              <AppIcon
                :name="
                  l.id === props.currentLessonId && playable(l) && l.type === 'video'
                    ? 'play'
                    : LESSON_ICON[l.type]
                "
              />
            </span>
            <span class="lp-les-body">
              <span class="lp-les-title">{{ l.title }}</span>
              <span v-if="l.subtitle" class="lp-les-subt">{{ l.subtitle }}</span>
              <span class="lp-les-meta">
                <span>
                  {{ t(`learning.type.${l.type}`)
                  }}<template v-if="l.duration">
                    · <span class="tabular">{{ l.duration }}</span>
                  </template>
                </span>
                <span v-if="l.preview && !props.access.has && playable(l)" class="lp-les-tag">
                  {{ t('learning.side.tagPreview') }}
                </span>
                <span
                  v-if="resumeId === l.id && !props.access.has && !isDone(l)"
                  class="lp-les-tag lp-les-tag--resume"
                >
                  {{ t('learning.side.tagResume') }}
                </span>
                <span v-if="l.type === 'quiz' && !isDone(l) && quizTag()" class="lp-les-tag lp-les-tag--warn">
                  {{ quizTag() }}
                </span>
              </span>
              <span v-if="showBar(l)" class="lp-les-bar" aria-hidden="true">
                <span :style="`width:${lessonBarWidth(l)}%`" />
              </span>
            </span>
            <span v-if="isDone(l)" class="lp-les-state lp-les-state--done">
              <AppIcon name="check-circle" />
            </span>
            <span v-else-if="!playable(l)" class="lp-les-state lp-les-state--lock">
              <AppIcon name="lock" />
            </span>
            <span v-if="srSuffix(l)" class="sr-only">, {{ srSuffix(l) }}</span>
          </button>
        </li>
      </ol>
    </section>
  </div>
</template>
