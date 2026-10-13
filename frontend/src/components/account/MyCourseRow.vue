<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import AppProgress from '@/components/ui/AppProgress.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import InstructorLine from '@/components/course/InstructorLine.vue'
import type { CourseView } from '@/lib/course'
import type { MyCourseItem } from '@/lib/api'
import { date } from '@/lib/format'

/**
 * One course on the member's own shelf.
 *
 * Everything here is a fact the API stated: when access was granted and how it
 * ends, how many lessons are finished out of how many exist, and the result of
 * the test if the course has one. Nothing is inferred in the browser, because
 * the one thing a page like this must not do is encourage somebody to open a
 * course they can no longer open.
 *
 * Three facts, not five. Minna issues no certificates and awards no CE credit,
 * so neither column exists.
 */
const props = defineProps<{ item: MyCourseItem; view: CourseView }>()
const emit = defineEmits<{ run: [action: string, courseId: number] }>()

const { t } = useI18n()
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const expired = computed(() => props.item.blocked === 'expired')
const ended = computed(() => props.item.blocked === 'ended')
const blocked = computed(() => props.item.blocked !== null)

/**
 * The chips say where this course stands — nothing else. `courseView` also
 * hands back the marketing badges a catalog tile wants, and "bestseller" is not
 * news on a course you already own.
 */
const badges = computed(() => {
  if (props.item.group === 'not-started') {
    return [{ kind: 'info', icon: 'circle', text: t('account.learning.notStartedBadge') }]
  }
  if (props.item.group === 'completed') {
    return [{ kind: 'done', icon: 'check-circle', text: t('account.group.completed') }]
  }
  return []
})

/** When access ends, in the one sentence that applies. */
const expiryFact = computed(() => {
  if (ended.value) {
    return {
      tone: 'is-muted',
      icon: 'ban',
      value: t('account.learning.expiredValue'),
      note: t('account.learning.endedNote'),
    }
  }
  if (expired.value) {
    return {
      tone: 'is-danger',
      icon: 'hourglass',
      value: t('account.learning.expiredValue'),
      note: props.item.expiresAt
        ? t('account.learning.accessEndedOn', { date: date(props.item.expiresAt) })
        : '',
    }
  }
  // Null is lifetime, not nought — the other reading says the opposite of what
  // was sold.
  if (!props.item.expiresAt) {
    return { tone: '', icon: 'check-circle', value: t('account.learning.noExpiry'), note: '' }
  }
  return {
    tone: '',
    icon: 'calendar',
    value: date(props.item.expiresAt),
    note: t('account.learning.accessUntil'),
  }
})

/**
 * The test, when there is one.
 *
 * Null rather than "not taken" for a course with no test at all: a column
 * saying you have not passed something that does not exist is a worry invented
 * by a layout.
 */
const quizFact = computed(() => {
  const q = props.item.quiz
  if (!q?.exists) return null
  if (q.passed) {
    return {
      tone: 'is-success',
      icon: 'check-circle',
      value: t('account.learning.quizPassed'),
      note: q.scorePct === null ? '' : t('account.learning.quizScore', { pct: q.scorePct }),
    }
  }
  return {
    tone: 'is-muted',
    icon: 'circle',
    value: t('account.learning.quizTodo'),
    note: blocked.value ? t('account.learning.quizExpiredNote') : t('account.learning.quizTodoNote'),
  }
})

const lock = computed(() => {
  if (!blocked.value) return null
  const kind = ended.value ? 'ended' : 'access-expired'
  return {
    tone: ended.value ? ('neutral' as const) : ('warning' as const),
    icon: ended.value ? 'ban' : 'hourglass',
    title: t(`account.lock.${kind}.title`),
    text: t(`account.lock.${kind}.text`, { pct: props.item.progress.pct }),
  }
})

/** The room, at the lesson they were last on. */
const learnHref = computed(() => {
  const base = path(`/learn/${props.item.course.slug}`)
  const resume = props.item.progress.resume?.id
  return resume ? { path: base, query: { lesson: String(resume) } } : { path: base }
})

const sourceIcon = computed(() =>
  props.item.source === 'free' ? 'gift' : props.item.source === 'subscription' ? 'package' : 'receipt',
)
</script>

<template>
  <article
    class="acct-li"
    :class="{ 'acct-li--expired': expired, 'acct-li--ended': ended }"
    :aria-labelledby="`li-${item.course.id}`"
    :data-mc="item.course.id"
    :data-group="item.group"
  >
    <div class="acct-li-head">
      <RouterLink class="acct-li-media" :to="view.href" tabindex="-1" aria-hidden="true">
        <CourseImage
          :image="view.image"
          :width="320"
          :height="180"
          :art-icon="view.categoryIcon"
          :art-palette="view.categoryPalette"
        />
        <span v-if="blocked" class="cc-lock"><AppIcon name="lock" /></span>
      </RouterLink>

      <div class="acct-li-title">
        <div class="acct-chips">
          <span class="acct-cat">{{ view.categoryName }}</span>
          <AppBadge v-for="(b, i) in badges" :key="i" :badge="b" />
        </div>
        <h3 :id="`li-${item.course.id}`">
          <RouterLink :to="view.href">{{ view.title }}</RouterLink>
        </h3>
        <InstructorLine :people="view.people" :course-id="String(item.course.id)" />
      </div>
    </div>

    <dl class="acct-facts" :class="{ 'acct-facts--2': !quizFact }">
      <div class="acct-fact">
        <dt>{{ t('account.learning.grantedOn') }}</dt>
        <dd>
          <span class="acct-fact-v"><span>{{ date(item.grantedAt) }}</span></span>
          <small>
            <AppIcon :name="sourceIcon" />
            {{ t(`account.learning.source.${item.source}`) }}
          </small>
        </dd>
      </div>

      <div class="acct-fact">
        <dt>{{ t('account.learning.expiryDate') }}</dt>
        <dd>
          <span class="acct-fact-v" :class="expiryFact.tone">
            <AppIcon :name="expiryFact.icon" /><span>{{ expiryFact.value }}</span>
          </span>
          <small v-if="expiryFact.note">{{ expiryFact.note }}</small>
        </dd>
      </div>

      <div v-if="quizFact" class="acct-fact">
        <dt>{{ t('account.learning.quiz') }}</dt>
        <dd>
          <span class="acct-fact-v" :class="quizFact.tone">
            <AppIcon :name="quizFact.icon" /><span>{{ quizFact.value }}</span>
          </span>
          <small v-if="quizFact.note">{{ quizFact.note }}</small>
        </dd>
      </div>
    </dl>

    <div v-if="lock" class="acct-li-lock">
      <AppNotice :tone="lock.tone" :icon="lock.icon" :title="lock.title" :text="lock.text" />
    </div>

    <div class="acct-li-foot">
      <div class="acct-li-prog">
        <div class="acct-li-prog-top">
          <span>{{
            blocked ? t('account.learning.progressKept') : t('account.learning.progress')
          }}</span>
          <span class="tabular">
            {{
              t('account.learning.lessonsDone', {
                done: item.progress.done,
                total: item.progress.total,
              })
            }}
          </span>
        </div>
        <AppProgress
          :value="item.progress.pct"
          :muted="blocked"
          :label="t('account.progressOf', { title: view.title })"
        />
      </div>

      <div class="acct-li-cta">
        <!-- Access has lapsed: the only thing on offer is buying it again, and
             the basket is where that starts. -->
        <template v-if="expired">
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            :data-mc-add="item.course.id"
            @click="emit('run', 'add-cart', item.course.id)"
          >
            <AppIcon name="cart" />{{ t('cta.addToCart') }}
          </button>
          <button
            type="button"
            class="btn btn--primary btn--sm"
            @click="emit('run', 'buy', item.course.id)"
          >
            <AppIcon name="refresh" />{{ t('cta.buyAgain') }}
          </button>
        </template>

        <!-- The course itself has ended. Nothing to buy and nothing to open;
             its page still says what it was. -->
        <RouterLink v-else-if="ended" class="btn btn--secondary btn--sm" :to="view.href">
          <AppIcon name="info" />{{ t('cta.courseDetail') }}
        </RouterLink>

        <RouterLink v-else class="btn btn--primary btn--sm" :to="learnHref">
          <AppIcon name="play" />{{
            item.group === 'not-started'
              ? t('cta.start')
              : item.group === 'completed'
                ? t('account.learning.review')
                : t('cta.continue')
          }}
        </RouterLink>
      </div>
    </div>
  </article>
</template>
