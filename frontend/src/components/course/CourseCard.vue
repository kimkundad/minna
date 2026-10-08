<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPrice from '@/components/ui/AppPrice.vue'
import AppProgress from '@/components/ui/AppProgress.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CourseImage from './CourseImage.vue'
import InstructorLine from './InstructorLine.vue'
import type { CourseView } from '@/lib/course'

/**
 * One course, in the three shapes the design uses:
 *
 *   grid      the default tile in a rail or results grid
 *   list      wider row with a description, level and language
 *   continue  adds which lesson you stopped on and when
 *
 * Everything it draws arrives in one `view` object, so a card can never
 * disagree with the course page it links to: both are built by `courseView`.
 *
 * The learner's own state — progress, a lock, a note — is optional on that
 * object and simply absent on the public catalog, which has no session behind
 * it. The card shows the price instead, which is what a visitor needs.
 */
const props = withDefaults(
  defineProps<{ view: CourseView; variant?: 'grid' | 'list' | 'continue'; reason?: string }>(),
  { variant: 'grid' },
)

const emit = defineEmits<{
  run: [action: string, courseId?: string]
  instructors: [courseId: string]
}>()

const { t } = useI18n()

const cid = computed(() => String(props.view.slug || props.view.id))

/** A price unless something has said otherwise. */
const showPrice = computed(() => props.view.showPrice !== false)
</script>

<template>
  <article
    class="cc"
    :class="{ 'cc--list': variant === 'list', 'cc--expired': view.expired }"
    :data-cid="cid"
  >
    <RouterLink class="cc-media" :to="view.href" tabindex="-1" aria-hidden="true">
      <CourseImage
        :image="view.image"
        :width="640"
        :height="360"
        :art-icon="view.categoryIcon"
        :art-palette="view.categoryPalette"
      />
      <div class="cc-badges">
        <AppBadge v-for="(b, i) in view.badges" :key="i" :badge="b" on-media />
      </div>
      <span v-if="view.locked" class="cc-lock" aria-hidden="true"><AppIcon name="lock" /></span>
    </RouterLink>

    <div class="cc-body">
      <div v-if="reason" class="cc-reason"><AppIcon name="sparkles" />{{ reason }}</div>

      <div class="cc-cat">{{ view.categoryName }}</div>

      <h3 class="cc-title"><RouterLink :to="view.href">{{ view.title }}</RouterLink></h3>

      <p v-if="variant === 'list'" class="cc-desc clamp-2">{{ view.shortDesc }}</p>

      <InstructorLine
        :people="view.people"
        :course-id="cid"
        @open="emit('instructors', cid)"
      />

      <!-- No CE unit here: that is the reference project's professional-credit
           scheme, and Minna awards none. -->
      <div class="cc-meta">
        <span><AppIcon name="clock" />{{ view.durationLabel }}</span>
        <span
          ><AppIcon name="book-open" />{{ t('course.lessonCount', { count: view.lessonCount }) }}</span
        >
        <template v-if="variant === 'list'">
          <span v-if="view.levelLabel"><AppIcon name="signal" />{{ view.levelLabel }}</span>
          <span class="lang"><AppIcon name="mic" />{{ view.spokenLabel }}</span>
        </template>
      </div>

      <AppProgress
        v-if="view.showProgress"
        :value="view.progressPct ?? 0"
        :muted="view.expired"
        :label="t('course.progressAria', { title: view.title })"
      />

      <div v-if="variant === 'continue' && view.showProgress" class="cc-progress-info">
        <template v-if="view.resumeTitle && (view.progressPct ?? 0) < 100">
          {{ t('course.lastLesson') }}: <b>{{ view.resumeTitle }}</b><br />
        </template>
      </div>

      <p v-if="variant === 'list' && view.note" class="cc-note">
        <AppIcon name="info" />{{ view.note }}
      </p>

      <div class="cc-foot" :class="{ 'cc-foot--end': !showPrice }">
        <AppPrice
          v-if="showPrice"
          :price="view.price"
          :normal-price="view.normalPrice"
          :is-free="view.isFree"
        />
        <CtaButton
          :action="view.primary"
          size="sm"
          :course-id="cid"
          @run="(a, c) => emit('run', a, c)"
        />
      </div>
    </div>
  </article>
</template>
