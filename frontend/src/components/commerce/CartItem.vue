<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import InstructorLine from '@/components/course/InstructorLine.vue'
import CoAccessNote from './CoAccessNote.vue'
import { courseView, store } from '@/vendor'
import { assetUrl, call, protoHref } from './useCommerce'
import type { AccessNote, CommerceCategory, CommerceCourse } from './types'
import { num } from '@/lib/format'

/**
 * One line in the cart.
 *
 * The checkbox, not the row, is what selects: the title and the thumbnail are
 * links to the course, so making the whole row a target would mean you could
 * not open a course without also buying it.
 *
 * A blocked line — already owned, covered by a package, or no longer on sale —
 * keeps its place rather than vanishing. Its checkbox is disabled, its price
 * becomes a badge saying why, and the note offers the way in that already
 * exists, because silently dropping something the person put in their cart is
 * how you lose their trust in the total.
 */
const props = defineProps<{
  courseId: string
  selected: boolean
  /** Why this line cannot be bought; null when it can. */
  block: 'package' | 'owned' | 'ended' | null
}>()

const emit = defineEmits<{
  'toggle-select': [cid: string, selected: boolean]
  remove: [cid: string]
  instructors: [cid: string]
}>()

const { t } = useI18n()
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))

const BLOCK = {
  package: { icon: 'package', tone: 'package', badge: 'package' },
  owned: { icon: 'check-circle', tone: 'success', badge: 'done' },
  ended: { icon: 'ban', tone: 'muted', badge: 'expired' },
} as const

const course = computed(() => call<CommerceCourse>('course', props.courseId))
const category = computed(() => call<CommerceCategory | null>('category', course.value.category))
const courseHref = computed(() => protoHref(`course.html?id=${props.courseId}`, locale.value))
const image = computed(() => {
  const img = course.value.image
  return img ? { ...img, src: assetUrl(img.src) ?? undefined } : null
})

const noteId = computed(() => `ct-note-${props.courseId}`)

/** Only ever true for a line that is actually purchasable. */
const isSelected = computed(() => !props.block && props.selected)

const saving = computed(() => {
  const c = course.value
  return c.normalPrice && c.normalPrice > c.price ? c.normalPrice - c.price : 0
})

const blockedBadge = computed(() => (props.block ? BLOCK[props.block] : null))

/**
 * What the buyer gets, or why they do not need to buy. Mirrors the prototype's
 * `accessNote`: block reason first, then free, then a lapsed purchase, then the
 * plain access window — with the package route offered when a package would
 * have covered it but has expired.
 */
const note = computed<AccessNote>(() => {
  const c = course.value
  if (props.block) {
    const b = BLOCK[props.block]
    if (props.block === 'ended') {
      return { icon: b.icon, tone: b.tone, kind: 'blocked', text: t('commerce.block.ended') }
    }
    // Whatever this account can already do with the course is the right offer
    // here, and `courseView` is the only thing allowed to decide that.
    const view = courseView(props.courseId) as unknown as {
      primary?: { href?: string; label?: string }
      learnHref?: string
    }
    const primary = view?.primary
    const href = protoHref(primary?.href ?? view?.learnHref ?? '', locale.value)
    const label = primary?.href ? (primary.label as string) : t('commerce.block.startLearning')
    return {
      icon: b.icon,
      tone: b.tone,
      kind: 'blocked-link',
      text: t(props.block === 'package' ? 'commerce.block.package' : 'commerce.block.owned'),
      link: { href, label },
    }
  }

  if (c.isFree) return { icon: 'gift', tone: 'success', kind: 'free' }

  const access = call<{ reason?: string }>('access', props.courseId)
  if (access.reason === 'expired') {
    const pr = call<{ pct: number }>('progress', props.courseId)
    return { icon: 'refresh', tone: 'renew', kind: 'renew', pct: pr.pct, days: c.accessDays }
  }
  if (access.reason === 'pkg-expired') {
    return {
      icon: 'clock',
      tone: 'info',
      kind: 'access-pkg',
      days: c.accessDays,
      link: {
        href: protoHref('account-package.html', locale.value),
        label: t('commerce.note.renewPackage'),
      },
    }
  }
  return { icon: 'clock', tone: 'info', kind: 'access', days: c.accessDays }
})

/** Lesson count stands where the reference showed CE units, which Minna does
 *  not award. */
const lessonCount = computed(
  () => (store as unknown as { lessons: (c: unknown) => unknown[] }).lessons(course.value).length,
)
</script>

<template>
  <li
    class="ct-item"
    :class="{ 'is-selected': isSelected, 'is-blocked': !!block }"
    :data-cid="courseId"
  >
    <div class="ct-check">
      <label class="check">
        <input
          type="checkbox"
          :data-sel="courseId"
          :data-fk="`sel-${courseId}`"
          :checked="isSelected"
          :disabled="!!block"
          :aria-describedby="noteId"
          @change="emit('toggle-select', courseId, ($event.target as HTMLInputElement).checked)"
        />
        <span class="sr-only">{{
          block
            ? t('commerce.cart.selectBlocked', { title: course.title })
            : t('commerce.cart.select', { title: course.title })
        }}</span>
      </label>
    </div>

    <a class="ct-media" :href="courseHref" tabindex="-1" aria-hidden="true">
      <CourseImage
        :image="image"
        alt=""
        :width="416"
        :height="234"
        :art-icon="category?.icon"
        :art-palette="category?.palette"
        sizes="(max-width: 767px) 96px, 208px"
      />
    </a>

    <div class="ct-head">
      <div class="ct-cat">{{ category?.name ?? '' }}</div>
      <h3 class="ct-title"><a :href="courseHref">{{ course.title }}</a></h3>
    </div>

    <div class="ct-info">
      <InstructorLine
        :instructors="course.instructors"
        :course-id="courseId"
        @open="emit('instructors', courseId)"
      />
      <div class="ct-meta">
        <span><AppIcon name="book-open" />{{ t('course.lessonCount', lessonCount) }}</span>
        <span><AppIcon name="clock" />{{ course.durationLabel }}</span>
      </div>
    </div>

    <div class="ct-price">
      <span v-if="blockedBadge" class="badge" :class="`badge--${blockedBadge.badge}`">
        <AppIcon :name="blockedBadge.icon" />{{ t(`commerce.blockBadge.${block}`) }}
      </span>
      <template v-else-if="course.isFree">
        <strong class="is-free">{{ t('commerce.free') }}</strong>
        <span class="text-xs text-muted">{{ t('commerce.freeForMembers') }}</span>
      </template>
      <template v-else>
        <strong>{{ t('commerce.baht', { n: num(course.price) }) }}</strong>
        <template v-if="saving">
          <s
            ><span class="sr-only">{{ t('commerce.normalPrice') }}</span
            >{{ t('commerce.baht', { n: num(course.normalPrice ?? 0) }) }}</s
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
        :data-fk="`rm-${courseId}`"
        :aria-label="t('commerce.cart.removeAria', { title: course.title })"
        @click="emit('remove', courseId)"
      >
        <AppIcon name="trash" />{{ t('commerce.cart.remove') }}
      </button>
    </div>
  </li>
</template>
