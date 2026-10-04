<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import AppProgress from '@/components/ui/AppProgress.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import InstructorLine from '@/components/course/InstructorLine.vue'
import { call, fixImage, protoHref } from './account'
import type { LearningItemLike } from './types'
import { date } from '@/lib/format'
import type { CtaAction } from '@/vendor'

/**
 * One course in "My learning": what you were granted, how long it lasts, how
 * far you got and what you can do about it now.
 *
 * Three facts, not five — Minna issues no certificates and awards no CE, so
 * neither column is here. The three that remain are the ones that decide
 * whether you can open the course at all.
 */
const props = defineProps<{ item: LearningItemLike }>()
const emit = defineEmits<{ run: [action: string, courseId?: string] }>()

const { t } = useI18n()
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const course = computed(() => props.item.course)
const view = computed(() => props.item.view)
const state = computed(() => view.value.state)
const expired = computed(() => props.item.group === 'expired')
const ended = computed(() => course.value.status === 'ended')

const category = computed(() =>
  call<{ name: string; icon: string; palette?: number }>('category', course.value.category),
)

/**
 * The chips say where this course stands and how you reached it — nothing else.
 * `courseView` also hands back the marketing badges a catalogue tile wants, and
 * "bestseller" is not news on a course you already own.
 */
const MARKETING = ['bestseller', 'recommended', 'new', 'ce', 'free']
const badges = computed(() => {
  const list = view.value.badges.filter((b) => !MARKETING.includes(b.kind))
  if (state.value === 'not-started') {
    list.unshift({ kind: 'info', icon: 'circle', text: t('account.learning.notStartedBadge') })
  }
  return list
})

/** Where the entitlement came from, which is also what decides when it ends. */
const source = computed(() => props.item.entitlement?.source ?? props.item.access.source ?? 'package')

const expiryFact = computed(() => {
  if (ended.value) {
    return {
      tone: 'is-muted',
      icon: 'ban',
      value: t('account.learning.expiredValue'),
      note: t('account.learning.endedOn', { date: date(course.value.endedAt) }),
    }
  }
  if (state.value === 'access-expired') {
    return {
      tone: 'is-danger',
      icon: 'hourglass',
      value: t('account.learning.expiredValue'),
      note: t('account.learning.accessEndedOn', { date: date(props.item.entitlement?.endAt) }),
    }
  }
  if (source.value === 'package') {
    return {
      tone: '',
      icon: 'package',
      value: t('account.learning.followsPackage'),
      note: props.item.expiry ? t('account.learning.untilDate', { date: date(props.item.expiry) }) : '',
    }
  }
  if (!props.item.expiry) {
    return { tone: '', icon: 'check-circle', value: t('account.learning.noExpiry'), note: '' }
  }
  return {
    tone: '',
    icon: 'calendar',
    value: date(props.item.expiry),
    note: t('account.learning.accessUntil'),
  }
})

const quizFact = computed(() => {
  const q = props.item.quiz
  if (q.completed) {
    return {
      tone: 'is-success',
      icon: 'check-circle',
      value: t('account.learning.quizPassed'),
      note: t('account.learning.quizPassedNote'),
    }
  }
  if (q.essayStatus === 'revision') {
    return {
      tone: 'is-danger',
      icon: 'alert-circle',
      value: t('account.learning.quizRevision'),
      note: t('account.learning.quizRevisionNote'),
    }
  }
  if (q.essayStatus === 'pending' || q.essayStatus === 'resubmitted') {
    return {
      tone: 'is-warning',
      icon: 'hourglass',
      value: t('account.learning.quizPending'),
      note: t('account.learning.quizPendingNote'),
    }
  }
  const note = ended.value
    ? t('account.learning.quizEndedNote')
    : state.value === 'access-expired' || state.value === 'pkg-expired'
      ? t('account.learning.quizExpiredNote')
      : t('account.learning.quizTodoNote')
  return { tone: 'is-muted', icon: 'circle', value: t('account.learning.quizTodo'), note }
})

const lock = computed(() => {
  const type = view.value.lock?.type
  if (!type || !['ended', 'access-expired', 'pkg-expired'].includes(type)) return null
  return {
    tone: type === 'ended' ? ('neutral' as const) : ('warning' as const),
    icon: type === 'ended' ? 'ban' : 'hourglass',
    title: t(`account.lock.${type}.title`),
    text: t(`account.lock.${type}.text`, { pct: props.item.progress.pct }),
  }
})

const inCart = computed(() => call<boolean>('inCart', course.value.id))

/**
 * The buttons, written out per state rather than taken from `courseView`,
 * because that resolver still offers certificates and this app has none.
 */
const actions = computed<CtaAction[]>(() => {
  const id = course.value.id
  const lesson = props.item.progress.resume?.id
  const learn = protoHref(`learn.html?id=${id}${lesson ? `&lesson=${lesson}` : ''}`, locale.value)
  const result = protoHref(`result.html?id=${id}`, locale.value)

  switch (state.value) {
    case 'ended':
      return [
        { label: t('account.cta.courseDetail'), href: path(`/courses/${id}`), variant: 'secondary', icon: 'info' },
      ]
    case 'access-expired':
      return [
        inCart.value
          ? { label: t('account.cta.inCart'), href: path('/cart'), variant: 'secondary', icon: 'check' }
          : { label: t('account.cta.addToCart'), action: 'add-cart', variant: 'secondary', icon: 'cart' },
        { label: t('account.cta.buyAgain'), action: 'buy', variant: 'primary', icon: 'refresh' },
      ]
    case 'pkg-expired':
      return [
        { label: t('account.cta.buyCourse'), action: 'buy', variant: 'secondary' },
        { label: t('account.cta.renewPackage'), href: path('/account/package'), variant: 'primary', icon: 'refresh' },
      ]
    case 'completed':
    case 'result-pending':
      return [{ label: t('account.cta.viewResult'), href: result, variant: 'primary' }]
    case 'in-progress':
      return [
        ...(props.item.progress.lessonsDone && !props.item.quiz.choicePassed
          ? [{ label: t('account.cta.takeQuiz'), href: protoHref(`quiz.html?id=${id}`, locale.value), variant: 'secondary', icon: 'clipboard-check' }]
          : []),
        { label: t('account.cta.continue'), href: learn, variant: 'primary', icon: 'play' },
      ]
    default:
      return [{ label: t('account.cta.start'), href: learn, variant: 'primary', icon: 'play' }]
  }
})
</script>

<template>
  <article
    class="acct-li"
    :class="{ 'acct-li--expired': expired, 'acct-li--ended': ended }"
    :aria-labelledby="`li-${course.id}`"
  >
    <div class="acct-li-head">
      <RouterLink class="acct-li-media" :to="path(`/courses/${course.id}`)" tabindex="-1" aria-hidden="true">
        <CourseImage
          :image="fixImage(course.image)"
          :width="320"
          :height="180"
          :art-icon="category?.icon"
          :art-palette="category?.palette ?? 0"
        />
        <span v-if="expired" class="cc-lock"><AppIcon name="lock" /></span>
      </RouterLink>

      <div class="acct-li-title">
        <div class="acct-chips">
          <span class="acct-cat">{{ category?.name }}</span>
          <AppBadge v-for="(b, i) in badges" :key="i" :badge="b" />
        </div>
        <h3 :id="`li-${course.id}`">
          <RouterLink :to="path(`/courses/${course.id}`)">{{ course.title }}</RouterLink>
        </h3>
        <InstructorLine :instructors="course.instructors" :course-id="course.id" />
      </div>
    </div>

    <dl class="acct-facts">
      <div class="acct-fact">
        <dt>{{ t('account.learning.grantedOn') }}</dt>
        <dd>
          <span class="acct-fact-v"><span>{{ date(item.accessDate) }}</span></span>
          <small>
            <AppIcon :name="source === 'purchase' ? 'receipt' : source === 'free' ? 'gift' : 'package'" />
            {{ t(`account.learning.source.${source}`) }}
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

      <div class="acct-fact">
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
          <span>{{ expired ? t('account.learning.progressKept') : t('account.learning.progress') }}</span>
          <span class="tabular">
            {{ t('account.learning.lessonsDone', { done: item.progress.done, total: item.progress.total }) }}
          </span>
        </div>
        <AppProgress
          :value="item.progress.pct"
          :muted="expired"
          :label="t('account.progressOf', { title: course.title })"
        />
      </div>

      <div class="acct-li-cta">
        <CtaButton
          v-for="(a, i) in actions"
          :key="i"
          :action="a"
          size="sm"
          :course-id="course.id"
          @run="(act, cid) => emit('run', act, cid)"
        />
      </div>
    </div>
  </article>
</template>
