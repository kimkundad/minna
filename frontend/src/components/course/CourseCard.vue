<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPrice from '@/components/ui/AppPrice.vue'
import AppProgress from '@/components/ui/AppProgress.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CourseImage from './CourseImage.vue'
import InstructorLine from './InstructorLine.vue'
import { courseView, store } from '@/vendor'

/**
 * One course, in the three shapes the design uses:
 *
 *   grid      the default tile in a rail or results grid
 *   list      wider row with a description, level and language
 *   continue  adds which lesson you stopped on and when
 *
 * Every piece of state — badges, lock, price-or-progress, which button — comes
 * from `courseView`, so a card can never disagree with the course page it links
 * to.
 */
const props = withDefaults(
  defineProps<{ courseId: string; variant?: 'grid' | 'list' | 'continue'; reason?: string }>(),
  { variant: 'grid' },
)

const emit = defineEmits<{
  run: [action: string, courseId?: string]
  instructors: [courseId: string]
}>()

const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))
const href = computed(() => `/${locale.value}/courses/${props.courseId}`)

const view = computed(() => courseView(props.courseId))
const course = computed(
  () => (view.value as unknown as { course: Record<string, any> }).course,
)
const category = computed(() =>
  (store as unknown as { category: (id: string) => { name: string; icon: string; palette?: number } })
    .category(course.value.category),
)

/** Package membership is shown on the course page, not on cards: a tile has
 *  room for two badges and the marketing ones earn the space. */
const badges = computed(() =>
  view.value.badges.filter((b) => b.kind !== 'package').slice(0, 2),
)

const isLocked = computed(() =>
  ['ended', 'access-expired', 'pkg-expired'].includes(view.value.state),
)

const resumeTitle = computed(() => {
  const r = view.value.progress.resume
  if (!r) return ''
  return r.type === 'quiz' ? 'แบบทดสอบท้ายคอร์ส' : r.title
})

const cardAction = computed(
  () => (view.value as unknown as { card?: any }).card ?? view.value.primary,
)
</script>

<template>
  <article
    class="cc"
    :class="{ 'cc--list': variant === 'list', 'cc--expired': view.state === 'ended' }"
    :data-cid="courseId"
  >
    <RouterLink class="cc-media" :to="href" tabindex="-1" aria-hidden="true">
      <CourseImage
        :image="course.image"
        :width="640"
        :height="360"
        :art-icon="category?.icon"
        :art-palette="category?.palette ?? 0"
      />
      <div class="cc-badges">
        <AppBadge v-for="(b, i) in badges" :key="i" :badge="b" on-media />
      </div>
      <span v-if="isLocked" class="cc-lock" aria-hidden="true"><AppIcon name="lock" /></span>
    </RouterLink>

    <div class="cc-body">
      <div v-if="reason" class="cc-reason"><AppIcon name="sparkles" />{{ reason }}</div>

      <div class="cc-cat">{{ category?.name }}</div>

      <h3 class="cc-title"><RouterLink :to="href">{{ course.title }}</RouterLink></h3>

      <p v-if="variant === 'list'" class="cc-desc clamp-2">{{ course.shortDesc }}</p>

      <InstructorLine
        :instructors="course.instructors"
        :course-id="courseId"
        @open="emit('instructors', courseId)"
      />

      <div class="cc-meta">
        <span><AppIcon name="clock" />{{ course.durationLabel }}</span>
        <span><AppIcon name="award" />{{ course.ce ? `CE ${course.ce}` : 'ไม่มี CE' }}</span>
        <template v-if="variant === 'list'">
          <span><AppIcon name="signal" />{{ course.levelLabel }}</span>
          <span class="lang"><AppIcon name="mic" />{{ course.languageLabel }}</span>
        </template>
      </div>

      <AppProgress
        v-if="view.showProgress"
        :value="view.progress.pct"
        :muted="view.state === 'ended' || view.state === 'access-expired'"
        :label="`ความคืบหน้า ${course.title}`"
      />

      <div v-if="variant === 'continue' && view.showProgress" class="cc-progress-info">
        <template v-if="resumeTitle && view.progress.pct < 100">
          บทล่าสุด: <b>{{ resumeTitle }}</b><br />
        </template>
      </div>

      <p v-if="variant === 'list' && view.note" class="cc-note">
        <AppIcon name="info" />{{ view.note }}
      </p>

      <div class="cc-foot" :class="{ 'cc-foot--end': !view.showPrice }">
        <AppPrice
          v-if="view.showPrice"
          :price="course.price"
          :normal-price="course.normalPrice"
          :is-free="course.isFree"
        />
        <CtaButton
          :action="cardAction"
          size="sm"
          :course-id="courseId"
          @run="(a, c) => emit('run', a, c)"
        />
      </div>
    </div>
  </article>
</template>
