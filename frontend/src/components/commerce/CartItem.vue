<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import InstructorLine from '@/components/course/InstructorLine.vue'
import CoAccessNote from './CoAccessNote.vue'
import type { AccessNote } from './types'
import type { CourseView } from '@/lib/course'
import { num } from '@/lib/format'

/**
 * One course in the basket.
 *
 * A line that cannot be bought keeps its place with the box disabled rather
 * than disappearing: somebody who put it there is owed an explanation, and a
 * row that vanishes gives none.
 */
const props = defineProps<{
  view: CourseView
  courseId: number
  selected: boolean
  /** Why this line cannot be bought; null when it can. */
  block: 'owned' | 'ended' | null
  busy?: boolean
}>()

const emit = defineEmits<{
  'toggle-select': [courseId: number, selected: boolean]
  remove: [courseId: number]
}>()

const { t } = useI18n()

const BLOCK = {
  owned: { icon: 'check-circle', badge: 'done' },
  ended: { icon: 'ban', badge: 'expired' },
} as const

const blockedBadge = computed(() => (props.block ? BLOCK[props.block] : null))
const noteId = computed(() => `ct-note-${props.courseId}`)

const saving = computed(() =>
  props.view.normalPrice && props.view.normalPrice > props.view.price
    ? props.view.normalPrice - props.view.price
    : 0,
)

/**
 * The line's one sentence of context.
 *
 * Only what can be said without a session beyond the one fact the basket
 * already has — whether this account owns the course. Lapsed access and
 * progress belong to the student API, and a "renew" note shown on a guess
 * would be worse than none.
 */
const note = computed<AccessNote>(() => {
  if (props.block === 'owned') {
    return { icon: 'check-circle', tone: 'success', kind: 'blocked', text: t('commerce.cart.noteOwned') }
  }
  if (props.block === 'ended') {
    return { icon: 'ban', tone: 'muted', kind: 'blocked', text: t('commerce.cart.noteEnded') }
  }
  if (props.view.isFree) return { icon: 'gift', tone: 'success', kind: 'free' }
  // Null days means lifetime, not nought. "สิทธิ์เรียน 0 วัน" is what the
  // other reading produces, and it says the opposite of what is on offer.
  if (props.view.accessDays === null) {
    return { icon: 'clock', tone: 'info', kind: 'blocked', text: t('course.perkLifetime') }
  }
  return { icon: 'clock', tone: 'info', kind: 'access', days: props.view.accessDays }
})
</script>

<template>
  <li
    class="ct-item"
    :class="{ 'is-selected': selected, 'is-blocked': !!block }"
    :data-cid="courseId"
  >
    <div class="ct-check">
      <label class="check">
        <input
          type="checkbox"
          :data-sel="courseId"
          :checked="selected"
          :disabled="!!block || busy"
          :aria-describedby="noteId"
          @change="emit('toggle-select', courseId, ($event.target as HTMLInputElement).checked)"
        />
        <span class="sr-only">{{
          block
            ? t('commerce.cart.selectBlocked', { title: view.title })
            : t('commerce.cart.select', { title: view.title })
        }}</span>
      </label>
    </div>

    <RouterLink class="ct-media" :to="view.href" tabindex="-1" aria-hidden="true">
      <CourseImage
        :image="view.image"
        alt=""
        :width="416"
        :height="234"
        :art-icon="view.categoryIcon"
        :art-palette="view.categoryPalette"
        sizes="(max-width: 767px) 96px, 208px"
      />
    </RouterLink>

    <div class="ct-head">
      <div class="ct-cat">{{ view.categoryName }}</div>
      <h3 class="ct-title"><RouterLink :to="view.href">{{ view.title }}</RouterLink></h3>
    </div>

    <div class="ct-info">
      <InstructorLine :people="view.people" :course-id="String(courseId)" />
      <div class="ct-meta">
        <span
          ><AppIcon name="book-open" />{{
            t('course.lessonCount', { count: view.lessonCount })
          }}</span
        >
        <span><AppIcon name="clock" />{{ view.durationLabel }}</span>
      </div>
    </div>

    <div class="ct-price">
      <span v-if="blockedBadge" class="badge" :class="`badge--${blockedBadge.badge}`">
        <AppIcon :name="blockedBadge.icon" />{{ t(`commerce.blockBadge.${block}`) }}
      </span>
      <template v-else-if="view.isFree">
        <strong class="is-free">{{ t('commerce.free') }}</strong>
        <span class="text-xs text-muted">{{ t('commerce.freeForMembers') }}</span>
      </template>
      <template v-else>
        <strong>{{ t('commerce.baht', { n: num(view.price) }) }}</strong>
        <template v-if="saving">
          <s
            ><span class="sr-only">{{ t('commerce.normalPrice') }}</span
            >{{ t('commerce.baht', { n: num(view.normalPrice ?? 0) }) }}</s
          >
          <span class="co-save">
            <AppIcon name="tag" />{{
              t('commerce.cart.saving', { amount: t('commerce.baht', { n: num(saving) }) })
            }}
          </span>
        </template>
      </template>
    </div>

    <div class="ct-foot">
      <CoAccessNote :note="note" :id="noteId" />
      <button
        type="button"
        class="btn btn--ghost btn--sm ct-remove"
        :data-remove="courseId"
        :disabled="busy"
        :aria-label="t('commerce.cart.removeAria', { title: view.title })"
        @click="emit('remove', courseId)"
      >
        <AppIcon name="trash" />{{ t('commerce.cart.remove') }}
      </button>
    </div>
  </li>
</template>
