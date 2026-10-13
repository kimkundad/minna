<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api, mediaUrl, type QuizResult, type StudyCurriculum } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import CompactHeader from '@/components/learning/CompactHeader.vue'
import FileChip from '@/components/learning/FileChip.vue'
import { useStoreTick } from '@/components/learning/learning'
import { date as fmtDate, dateTime, num } from '@/lib/format'
import { courseView, store, type CourseView } from '@/vendor'
import type {
  Access,
  Course,
  EssayReview,
  EssayVersion,
  Lesson,
  Person,
  Progress,
  QuizStatus,
} from '@/components/learning/types'

/**
 * How the course went: the score on the choice questions, the essay and the
 * instructor's verdict on it, the review history, and what is still missing.
 *
 * It shows the latest attempt's total and nothing else — no answer key, no
 * per-question breakdown, no best-of. That is a deliberate part of the design
 * and the reason `store.submitQuiz` hands back so little.
 *
 * Minna issues no certificates and awards no CE credits, so the reference's
 * "CE and certificate" card is gone, the fourth completion condition with it,
 * and the hero's actions point back at the course rather than at a download.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
const id = computed(() => String(route.params.id ?? ''))

const auth = useAuthStore()
const loggedIn = computed(() => auth.isLoggedIn)

/* ---------------- the result, from the API ---------------- */

const result = ref<QuizResult | null>(null)
const curriculum = ref<StudyCurriculum | null>(null)
const loading = ref(true)
const denied = ref<'none' | 'missing' | null>(null)

async function load(): Promise<void> {
  if (!id.value || !loggedIn.value) {
    loading.value = false
    return
  }
  loading.value = result.value === null
  denied.value = null
  try {
    const [res, cur] = await Promise.all([
      api.quizResult(id.value),
      api.studyCurriculum(id.value).catch(() => null),
    ])
    result.value = res.data
    curriculum.value = cur?.data ?? null
  } catch (err) {
    result.value = null
    denied.value = err instanceof ApiError && err.status === 404 ? 'missing' : 'none'
  } finally {
    loading.value = false
  }
}

watch(id, () => void load(), { immediate: true })
watch(loggedIn, (now, before) => {
  if (now !== before) void load()
})

/** The shapes this screen was written against, built from the API's. */
const course = computed(() =>
  curriculum.value
    ? {
        id: id.value,
        title: curriculum.value.course.title,
        image: curriculum.value.course.thumbnailPath
          ? { src: mediaUrl(curriculum.value.course.thumbnailPath), alt: curriculum.value.course.title }
          : null,
        quiz: result.value ? { passPct: result.value.quiz.passPct } : null,
      }
    : null,
)
const quiz = computed(() => (result.value ? { passPct: result.value.quiz.passPct } : null))
/** Only what the art needs: the cover carries the picture, and the fallback
 *  drawing needs an icon and a colour. */
const category = computed(() => ({ name: '', icon: 'book-open', palette: 0 }))

const access = computed<Access>(() =>
  result.value
    ? { has: true, reason: 'ok', source: null, expiredType: null }
    : { has: false, reason: denied.value ?? 'missing', source: null, expiredType: null },
)
const view = computed<CourseView | null>(() => null)

const progress = computed(() => ({
  done: curriculum.value?.progress.done ?? 0,
  total: curriculum.value?.progress.total ?? 0,
  pct: curriculum.value?.progress.pct ?? 0,
}))

const learnPath = computed(() => path(`/learn/${id.value}`))
const quizPath = computed(() => path(`/quiz/${id.value}`))
const essayPath = computed(() => `${quizPath.value}?mode=essay`)

/**
 * The banner the quiz leaves behind when it redirects here. It is read once and
 * taken off the URL, so a reload or a shared link does not re-announce a
 * submission that happened minutes ago.
 */
const flash = ref(typeof route.query.submitted === 'string' ? route.query.submitted : '')
if (flash.value) {
  const query = { ...route.query }
  delete query.submitted
  void router.replace({ path: route.path, query })
}

const FLASH: Record<string, ['success' | 'warning', string, string]> = {
  all: ['success', 'learning.result.flashAllTitle', 'learning.result.flashAllText'],
  choice: ['success', 'learning.result.flashChoiceTitle', 'learning.result.flashChoiceText'],
  essay: ['success', 'learning.result.flashEssayTitle', 'learning.result.flashEssayText'],
  timeout: ['warning', 'learning.result.flashTimeoutTitle', 'learning.result.flashTimeoutText'],
}

const flashNotice = computed(() => {
  const hit = FLASH[flash.value]
  return hit ? { tone: hit[0], title: t(hit[1]), text: t(hit[2]) } : null
})

/* ---------------- model ---------------- */

/** Counted by the API, which counts them the same way everywhere else. */
const lessonsExQuiz = computed(() => ({ length: progress.value.total }))
const doneCount = computed(() => progress.value.done)

/** The attempt on show: the passing one once there is a pass, otherwise the
 *  most recent — a later failed retry must not hide a pass already earned. */
/**
 * Every attempt, newest first, in the shape this screen reads.
 *
 * A score is a percentage on the wire; the screen shows "7 of 10", so the count
 * is worked back from the percentage and the number of questions. One number
 * decides both, which is why they cannot disagree.
 */
const total = computed(() => result.value?.quiz.choiceCount ?? 0)
const attempts = computed(() =>
  (result.value?.attempts ?? []).map((a) => ({
    correct: Math.round((a.scorePct / 100) * total.value),
    total: total.value,
    pct: a.scorePct,
    passed: a.passed,
    at: a.submittedAt,
    attemptNo: a.attemptNo,
  })),
)

const choicePassed = computed(() => Boolean(result.value?.latest?.passed))

/**
 * The attempt on show: the passing one once there is a pass, otherwise the most
 * recent — a later failed retry must not hide a pass already earned.
 */
const shown = computed(() => {
  if (choicePassed.value) {
    const passing = attempts.value.filter((a) => a.passed)
    return passing[0] ?? null
  }
  return attempts.value[0] ?? null
})

const essay = computed(() => result.value?.essays[0] ?? null)
const essayStatus = computed(() => essay.value?.status ?? 'none')

/**
 * What this screen used to read off the fixture store, now from the result.
 *
 * Kept as one object because the screen asks it a dozen questions in a dozen
 * places; splitting it would be a dozen edits for no gain.
 */
const status = computed(() => ({
  attempts: attempts.value.length,
  choicePassed: choicePassed.value,
  essayStatus: essayStatus.value,
  completed: Boolean(result.value?.completed),
}))

/** Every lesson finished — the other half of "completed". */
const lessonsDone = computed(
  () => progress.value.total > 0 && progress.value.done === progress.value.total,
)
/**
 * The draft on show is the current one.
 *
 * The API keeps every version but hands back the one the teacher is looking at
 * — which is the one the page is about. The older drafts matter to the review
 * history, and that is what the reviews below are.
 */
const lastVersion = computed(() =>
  essay.value
    ? {
        v: essay.value.version,
        at: essay.value.submittedAt,
        text: essay.value.body,
        file: essay.value.attachment,
      }
    : null,
)
const lastReview = computed(() => {
  const reviews = essay.value?.reviews ?? []
  return reviews.length ? reviews[reviews.length - 1]! : null
})

type Overall =
  | 'none'
  | 'passed'
  | 'passed-lessons'
  | 'failed'
  | 'revision'
  | 'resubmitted'
  | 'pending'
  | 'essay-missing'

const overall = computed<Overall>(() => {
  const qs = status.value
  if (!qs.attempts) return 'none'
  if (qs.completed) return lessonsDone.value ? 'passed' : 'passed-lessons'
  if (!qs.choicePassed) return 'failed'
  if (qs.essayStatus === 'revision') return 'revision'
  if (qs.essayStatus === 'resubmitted') return 'resubmitted'
  if (qs.essayStatus === 'pending') return 'pending'
  return 'essay-missing'
})

const TONE: Record<Overall, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  passed: 'success',
  'passed-lessons': 'info',
  pending: 'warning',
  resubmitted: 'warning',
  revision: 'danger',
  failed: 'danger',
  'essay-missing': 'info',
  none: 'neutral',
}

const BADGE: Record<Overall, [string, string]> = {
  passed: ['passed', 'check-circle'],
  'passed-lessons': ['passed', 'check-circle'],
  pending: ['pending', 'hourglass'],
  resubmitted: ['resubmitted', 'hourglass'],
  revision: ['revision', 'alert-circle'],
  failed: ['failed', 'x-circle'],
  'essay-missing': ['pending', 'pen'],
  none: ['expired', 'clipboard-check'],
}

const tone = computed(() => TONE[overall.value])

/** The glyph on the hero image. `badge-check` rather than a medal for the
 *  passing state: Minna hands out no award to picture. */
const medal = computed(
  () =>
    ({
      success: 'badge-check',
      warning: 'hourglass',
      danger: overall.value === 'revision' ? 'pen' : 'refresh',
      info: 'badge-check',
      neutral: 'clipboard-check',
    })[tone.value],
)

const ESSAY_BADGE: Record<string, [string, string]> = {
  pending: ['pending', 'hourglass'],
  resubmitted: ['resubmitted', 'hourglass'],
  revision: ['revision', 'alert-circle'],
  passed: ['passed', 'check-circle'],
  none: ['expired', 'pen'],
}

const essayBadge = computed(() => {
  const key = essay.value?.status ?? 'none'
  const [kind, icon] = ESSAY_BADGE[key] ?? ESSAY_BADGE.none!
  return { kind, icon, text: t(`learning.result.essayBadge.${key}`) }
})

/* ---------------- score meter ---------------- */

const scorePct = computed(() =>
  shown.value?.total ? Math.round((shown.value.correct / shown.value.total) * 100) : 0,
)

/**
 * The dial: a ring showing the score, plus a tick at the pass mark so the
 * number is read against the threshold rather than against 100.
 */
const meter = computed(() => {
  const r = 52
  const circumference = 2 * Math.PI * r
  const passPct = quiz.value?.passPct ?? 0
  const angle = (passPct / 100) * 2 * Math.PI - Math.PI / 2
  return {
    r,
    dash: `${((circumference * scorePct.value) / 100).toFixed(2)} ${circumference.toFixed(2)}`,
    x1: (60 + Math.cos(angle) * 44).toFixed(1),
    y1: (60 + Math.sin(angle) * 44).toFixed(1),
    x2: (60 + Math.cos(angle) * 60).toFixed(1),
    y2: (60 + Math.sin(angle) * 60).toFixed(1),
  }
})

/* ---------------- essay answer clamp ---------------- */

const answerExpanded = ref(false)
const answerIsLong = computed(() => (lastVersion.value?.text.length ?? 0) > 260)

/* ---------------- review history ---------------- */

interface HistoryVersion {
  v: number
  at: string
  text: string
  file: { name: string | null; url: string | null } | null
}

interface HistoryReview {
  version: number
  result: 'passed' | 'revision'
  comment: string
  reviewer: string | null
  reviewedAt: string
  attachmentUrl: string | null
}

type Event =
  | { kind: 'sub'; at: string; version: HistoryVersion }
  | { kind: 'rev'; at: string; review: HistoryReview }
  | { kind: 'wait'; at: null }

/**
 * The written answer's story: what was sent, what came back, what is still
 * waiting.
 *
 * The API hands back the current draft and every verdict. Older drafts are kept
 * server-side but are not sent — a review names the version it is about, which
 * is what the reader needs to follow the thread.
 */
const history = computed<Event[]>(() => {
  const e = essay.value
  if (!e) return []
  const events: Event[] = [
    { kind: 'sub' as const, at: e.submittedAt, version: { v: e.version, at: e.submittedAt, text: e.body, file: e.attachment } },
    ...e.reviews.map((r) => ({ kind: 'rev' as const, at: r.reviewedAt, review: r })),
  ]
  events.sort((a, b) => {
    const diff = new Date(String(a.at)).getTime() - new Date(String(b.at)).getTime()
    return diff || (a.kind === 'sub' ? -1 : 1)
  })
  if (e.status === 'pending' || e.status === 'resubmitted') {
    events.push({ kind: 'wait', at: null })
  }
  return events
})

/* ---------------- completion checklist ---------------- */

type Mark = 'done' | 'todo' | 'fail' | 'wait'

const checklist = computed(() => {
  const qs = status.value
  const s = essay.value?.status ?? 'none'
  const items: { mark: Mark; title: string; detail: string; link?: string }[] = [
    {
      mark: lessonsDone.value ? 'done' : 'todo',
      title: t('learning.result.checkLessons'),
      detail: t('learning.result.checkLessonsDetail', {
        done: doneCount.value,
        total: lessonsExQuiz.value.length,
      }),
      link: !lessonsDone.value && access.value.has ? learnPath.value : undefined,
    },
    {
      mark: qs.choicePassed ? 'done' : qs.attempts ? 'fail' : 'todo',
      title: t('learning.result.checkChoice', { pct: quiz.value?.passPct ?? 0 }),
      detail: shown.value
        ? t('learning.result.checkChoiceDetail', {
            correct: shown.value.correct,
            total: shown.value.total,
          })
        : t('learning.result.checkChoiceNone'),
    },
    {
      mark:
        s === 'passed'
          ? 'done'
          : s === 'revision'
            ? 'fail'
            : s === 'pending' || s === 'resubmitted'
              ? 'wait'
              : 'todo',
      title: t('learning.result.checkEssay'),
      detail: t('learning.result.checkEssayDetail', { status: essayBadge.value.text }),
    },
  ]
  return items
})

const checkIcon: Record<Mark, string> = {
  done: 'check',
  todo: 'circle',
  fail: 'alert-circle',
  wait: 'hourglass',
}

const checkLabel = computed<Record<Mark, string>>(() => ({
  done: t('learning.result.markDone'),
  todo: t('learning.result.markTodo'),
  fail: t('learning.result.markFail'),
  wait: t('learning.result.markWait'),
}))

const checkedCount = computed(() => checklist.value.filter((i) => i.mark === 'done').length)

/* ---------------- access notice ---------------- */

const accessNotice = computed(() => {
  const state = view.value?.state
  if (state !== 'access-expired' && state !== 'ended' && state !== 'pkg-expired') return null
  return {
    title: view.value?.lock?.title ?? '',
    text:
      t('learning.result.accessKept') +
      (state === 'ended' ? '' : t('learning.result.accessReopen')),
    actions: [view.value?.primary, view.value?.secondary].filter((a) => a && !a.disabled),
  }
})

/* ---------------- instructor ---------------- */

/**
 * Who marked it.
 *
 * The review carries the name, so there is no list to search and nobody to get
 * wrong — the avatar falls back to initials, which is what it does everywhere
 * else when there is no photograph.
 */
const reviewer = computed(() => {
  const name = lastReview.value?.reviewer
  return name ? { name, initials: name.slice(0, 1), color: 0, photo: null } : null
})

/* ---------------- actions ---------------- */

function runAction(action: string, courseId?: string) {
  const cid = courseId ?? id.value
  if (action === 'buy' || action === 'enroll-free') {
    void router.push({ path: path('/checkout'), query: { items: cid } })
    return
  }
  else if (action === 'buy') {
    void router.push({ path: path('/checkout'), query: { items: cid } })
    return
  }
}
</script>

<template>
  <CompactHeader
    height-var="--qz-hdr"
    :back-to="course ? learnPath : path('/account/learning')"
    :back-label="t('learning.header.backToRoom')"
    :title="t('learning.result.title')"
    :sub="course ? course.title : ''"
  />

  <div class="rs-root">
    <div class="container rs-wrap" id="rs-app">
      <!-- Still fetching. Without this the empty first tick reads as "no such
           course", which is the wrong thing to tell somebody who has just sat
           the test. -->
      <div v-if="loading" class="state-box state-box--plain">
        <p>{{ t('learning.result.loading') }}</p>
      </div>

      <!-- No such course -->
      <div v-else-if="!course || !quiz" class="state-box">
        <div class="state-ico"><AppIcon name="search" /></div>
        <h3>{{ t('learning.result.missingTitle') }}</h3>
        <p>{{ t('learning.result.missingText') }}</p>
        <div class="state-actions">
          <RouterLink class="btn btn--primary" :to="path('/account/learning')">
            {{ t('learning.missing.myCourses') }}
          </RouterLink>
          <RouterLink class="btn btn--secondary" :to="path('/courses')">
            {{ t('course.viewAllCourses') }}
          </RouterLink>
        </div>
      </div>

      <!-- Signed out -->
      <div v-else-if="!loggedIn" class="state-box state-box--plain" style="padding: 56px 24px">
        <div class="state-ico"><AppIcon name="lock" /></div>
        <h3>{{ t('learning.result.gateTitle') }}</h3>
        <p>{{ t('learning.result.gateText') }}</p>
        <!-- Signing in is not wired up yet, so these stay inert. -->
        <div class="state-actions">
          <button type="button" class="btn btn--primary">
            <AppIcon name="log-in" />{{ t('common.login') }}
          </button>
          <button type="button" class="btn btn--secondary">{{ t('common.register') }}</button>
        </div>
      </div>

      <template v-else>
        <div v-if="flashNotice" class="rs-flash">
          <AppNotice :tone="flashNotice.tone" :title="flashNotice.title" :text="flashNotice.text" />
        </div>

        <!-- Hero: the one-line verdict -->
        <section class="rs-hero" :class="`rs-hero--${tone}`" aria-labelledby="rs-h1">
          <div class="rs-hero-main">
            <p class="eyebrow">
              {{ t('learning.result.eyebrow', { category: category?.name ?? '' }) }}
            </p>
            <h1 class="rs-h1" id="rs-h1">{{ course.title }}</h1>
            <div class="rs-hero-status">
              <span class="badge badge--lg" :class="`badge--${BADGE[overall][0]}`">
                <AppIcon :name="BADGE[overall][1]" />{{ t(`learning.result.badge.${overall}`) }}
              </span>
              <span class="rs-hero-title">{{ t(`learning.result.headline.${overall}`) }}</span>
            </div>
            <p class="rs-hero-text">{{ t(`learning.result.detail.${overall}`) }}</p>

            <div class="rs-hero-actions">
              <template v-if="overall === 'passed'">
                <RouterLink class="btn btn--primary" :to="learnPath" data-cta-primary>
                  <AppIcon name="book-open" />{{ t('learning.result.reviewCourse') }}
                </RouterLink>
                <RouterLink class="btn btn--secondary" :to="path('/account/learning')">
                  {{ t('learning.missing.myCourses') }}
                </RouterLink>
              </template>

              <RouterLink
                v-else-if="overall === 'passed-lessons'"
                class="btn btn--primary"
                :to="learnPath"
                data-cta-primary
              >
                <AppIcon name="play" />{{ t('learning.result.keepLearning') }}
              </RouterLink>

              <template v-else-if="overall === 'revision'">
                <RouterLink class="btn btn--primary" :to="essayPath" data-cta-primary>
                  <AppIcon name="pen" />{{ t('learning.quiz.editEssay') }}
                </RouterLink>
                <a class="btn btn--secondary" href="#rs-essay">
                  {{ t('learning.result.seeComment') }}
                </a>
              </template>

              <template v-else-if="overall === 'failed'">
                <RouterLink class="btn btn--primary" :to="quizPath" data-cta-primary>
                  <AppIcon name="refresh" />{{ t('learning.result.retake') }}
                </RouterLink>
                <RouterLink class="btn btn--secondary" :to="learnPath">
                  <AppIcon name="book-open" />{{ t('learning.result.goReview') }}
                </RouterLink>
                <RouterLink
                  v-if="status.essayStatus === 'revision'"
                  class="btn btn--secondary"
                  :to="essayPath"
                >
                  <AppIcon name="pen" />{{ t('learning.quiz.editEssay') }}
                </RouterLink>
              </template>

              <RouterLink
                v-else-if="overall === 'essay-missing'"
                class="btn btn--primary"
                :to="quizPath"
                data-cta-primary
              >
                <AppIcon name="refresh" />{{ t('learning.result.retake') }}
              </RouterLink>

              <RouterLink
                v-else-if="overall === 'none' && access.has"
                class="btn btn--primary"
                :to="quizPath"
                data-cta-primary
              >
                <AppIcon name="clipboard-check" />{{ t('learning.quizCard.take') }}
              </RouterLink>

              <RouterLink
                v-if="
                  (overall === 'pending' || overall === 'resubmitted' || overall === 'none') &&
                  !lessonsDone &&
                  access.has
                "
                class="btn"
                :class="overall === 'none' ? 'btn--secondary' : 'btn--primary'"
                :to="learnPath"
              >
                <AppIcon name="play" />{{ t('learning.result.keepLearning') }}
              </RouterLink>
              <RouterLink
                v-else-if="
                  (overall === 'pending' || overall === 'resubmitted') && lessonsDone
                "
                class="btn btn--secondary"
                :to="learnPath"
              >
                {{ t('learning.header.backToRoom') }}
              </RouterLink>
            </div>
          </div>

          <div class="rs-hero-media" aria-hidden="true">
            <CourseImage
              :image="course.image"
              :width="720"
              :height="480"
              :art-icon="category?.icon ?? 'paw'"
              :art-palette="category?.palette ?? 0"
              alt=""
              eager
            />
            <span class="rs-medal"><AppIcon :name="medal" /></span>
          </div>
        </section>

        <div v-if="accessNotice" class="rs-flash">
          <AppNotice
            tone="warning"
            icon="hourglass"
            :title="accessNotice.title"
            :text="accessNotice.text"
          >
            <template v-if="accessNotice.actions.length" #actions>
              <CtaButton
                v-for="(a, i) in accessNotice.actions"
                :key="i"
                :action="a"
                size="sm"
                :course-id="id"
                @run="runAction"
              />
            </template>
          </AppNotice>
        </div>

        <div class="rs-grid">
          <div class="rs-col rs-col--main">
            <!-- Never attempted -->
            <section v-if="overall === 'none'" class="rs-card rs-card--empty">
              <div class="state-box">
                <div class="state-ico"><AppIcon name="clipboard-check" /></div>
                <h3>{{ t('learning.result.emptyTitle') }}</h3>
                <p>
                  {{ t('learning.result.emptyText')
                  }}{{
                    lessonsDone
                      ? ''
                      : ` · ${t('learning.result.emptyProgress', {
                          done: doneCount,
                          total: lessonsExQuiz.length,
                        })}`
                  }}
                </p>
                <div class="state-actions">
                  <template v-if="access.has">
                    <RouterLink class="btn btn--primary" :to="quizPath">
                      <AppIcon name="clipboard-check" />{{ t('learning.quizCard.take') }}
                    </RouterLink>
                    <RouterLink
                      v-if="!lessonsDone"
                      class="btn btn--secondary"
                      :to="learnPath"
                    >
                      <AppIcon name="play" />{{ t('learning.result.keepLearning') }}
                    </RouterLink>
                  </template>
                  <template v-else>
                    <CtaButton
                      v-for="(a, i) in [view?.primary, view?.secondary].filter(
                        (x) => x && !x.disabled,
                      )"
                      :key="i"
                      :action="a"
                      :course-id="id"
                      @run="runAction"
                    />
                  </template>
                </div>
              </div>
            </section>

            <template v-else>
              <!-- Choice questions -->
              <section v-if="shown" class="rs-card" aria-labelledby="rs-ch-h">
                <header class="rs-card-head">
                  <span class="rs-card-ico"><AppIcon name="list" /></span>
                  <div class="rs-card-ttl">
                    <h2 id="rs-ch-h">{{ t('learning.result.choiceTitle') }}</h2>
                    <p>{{ t('learning.result.lastAttempt', { when: dateTime(shown.at) }) }}</p>
                  </div>
                  <span
                    class="badge"
                    :class="status.choicePassed ? 'badge--passed' : 'badge--failed'"
                  >
                    <AppIcon :name="status.choicePassed ? 'check-circle' : 'x-circle'" />{{
                      status.choicePassed
                        ? t('learning.result.choicePassed')
                        : t('learning.result.choiceFailed')
                    }}
                  </span>
                </header>

                <div class="rs-score">
                  <div
                    class="rs-meter"
                    role="img"
                    :aria-label="
                      t('learning.result.meterLabel', {
                        pct: scorePct,
                        pass: quiz.passPct,
                      })
                    "
                  >
                    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
                      <defs>
                        <linearGradient id="rs-mg" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stop-color="#008A99" />
                          <stop offset="1" stop-color="#00C2D6" />
                        </linearGradient>
                      </defs>
                      <circle cx="60" cy="60" :r="meter.r" fill="none" stroke="#E1E5E5" stroke-width="10" />
                      <circle
                        v-if="scorePct > 0"
                        cx="60"
                        cy="60"
                        :r="meter.r"
                        fill="none"
                        stroke="url(#rs-mg)"
                        stroke-width="10"
                        stroke-linecap="round"
                        :stroke-dasharray="meter.dash"
                        transform="rotate(-90 60 60)"
                      />
                      <line
                        :x1="meter.x1"
                        :y1="meter.y1"
                        :x2="meter.x2"
                        :y2="meter.y2"
                        stroke="#18272A"
                        stroke-width="2.5"
                        stroke-linecap="round"
                      />
                    </svg>
                    <span class="rs-meter-val">{{ scorePct }}<small>%</small></span>
                  </div>

                  <div class="rs-score-txt">
                    <p class="rs-score-main">
                      {{
                        t('learning.result.scoreMain', {
                          correct: shown.correct,
                          total: shown.total,
                          pct: scorePct,
                        })
                      }}
                      <span>{{ t('learning.result.passMark', { pct: quiz.passPct }) }}</span>
                    </p>
                    <p class="rs-score-sub">
                      {{
                        status.choicePassed
                          ? t('learning.result.scoreSubPassed')
                          : t('learning.result.scoreSubFailed')
                      }}
                    </p>
                    <p class="rs-score-note">
                      <AppIcon name="info" />{{ t('learning.result.scoreNote') }}
                    </p>
                  </div>
                </div>

                <div v-if="!status.choicePassed" class="rs-card-actions">
                  <RouterLink class="btn btn--primary btn--sm" :to="quizPath">
                    <AppIcon name="refresh" />{{ t('learning.result.retake') }}
                  </RouterLink>
                  <RouterLink class="btn btn--secondary btn--sm" :to="learnPath">
                    <AppIcon name="book-open" />{{ t('learning.result.goReview') }}
                  </RouterLink>
                </div>
              </section>

              <!-- Essay -->
              <section v-if="(result?.quiz.essayCount ?? 0) > 0" class="rs-card" id="rs-essay" aria-labelledby="rs-es-h">
                <header class="rs-card-head">
                  <span class="rs-card-ico"><AppIcon name="pen" /></span>
                  <div class="rs-card-ttl">
                    <h2 id="rs-es-h">Essay</h2>
                    <p v-if="essay && lastVersion">
                      {{ t('learning.result.sentAt', { when: dateTime(lastVersion.at) })
                      }}{{
                        essay.version > 1
                          ? ` · ${t('learning.quiz.version', { n: essay.version })}`
                          : ''
                      }}
                    </p>
                    <p v-else>{{ t('learning.result.reviewedByInstructor') }}</p>
                  </div>
                  <span class="badge" :class="`badge--${essayBadge.kind}`">
                    <AppIcon :name="essayBadge.icon" />{{ essayBadge.text }}
                  </span>
                </header>

                <p class="rs-q">
                  <span>{{ t('learning.result.question') }}</span>
                  {{ essay?.questionText }}
                </p>

                <template v-if="essay && lastVersion">
                  <div class="rs-answer">
                    <span class="rs-flabel">
                      {{
                        essay.version > 1
                          ? t('learning.result.yourAnswerLatest')
                          : t('learning.result.yourAnswer')
                      }}
                    </span>
                    <p
                      class="rs-answer-text"
                      :class="{ 'is-clamped': answerIsLong && !answerExpanded }"
                      id="rs-answer-text"
                    >
                      {{ lastVersion.text }}
                    </p>
                    <div class="rs-answer-meta">
                      <span>
                        {{
                          t('learning.quiz.charCount', {
                            n: num(lastVersion.text.length),
                            max: num(1000),
                          })
                        }}
                      </span>
                      <button
                        v-if="answerIsLong"
                        type="button"
                        class="link"
                        data-rs-expand
                        :aria-expanded="answerExpanded"
                        aria-controls="rs-answer-text"
                        @click="answerExpanded = !answerExpanded"
                      >
                        {{
                          answerExpanded
                            ? t('learning.result.collapseAnswer')
                            : t('learning.result.expandAnswer')
                        }}
                      </button>
                    </div>
                  </div>

                  <div v-if="lastVersion.file" class="rs-files">
                    <span class="rs-flabel">{{ t('learning.result.yourFile') }}</span>
                    <a class="rs-chip link" :href="lastVersion.file.url ?? '#'" target="_blank" rel="noopener">
                      <AppIcon name="download" />{{ lastVersion.file.name ?? t('learning.doc.download') }}
                    </a>
                  </div>

                  <!-- The instructor's verdict, when there is one worth showing -->
                  <div
                    v-if="essay.status === 'revision' && lastReview"
                    class="rs-feedback"
                    role="note"
                    aria-labelledby="rs-fb-h"
                  >
                    <div class="rs-fb-head">
                      <AppIcon name="message-square" />
                      <b id="rs-fb-h">{{ t('learning.result.instructorComment') }}</b>
                    </div>
                    <div class="rs-fb-who">
                      <AppAvatar
                        v-if="reviewer"
                        size="md"
                        :name="reviewer.name"
                        :initials="reviewer.initials"
                        :color="reviewer.color"
                        :photo="reviewer.photo"
                      />
                      <span>
                        <b>{{ lastReview.reviewer }}</b>
                        <small>
                          {{ t('learning.result.reviewedAt', { when: dateTime(lastReview.reviewedAt) }) }} ·
                          {{ t('learning.quiz.version', { n: lastReview.version }) }}
                        </small>
                      </span>
                    </div>
                    <blockquote class="rs-fb-quote">{{ lastReview.comment }}</blockquote>
                    <div v-if="lastReview.attachmentUrl" class="rs-files">
                      <span class="rs-flabel">{{ t('learning.result.instructorFile') }}</span>
                      <a class="rs-chip link" :href="lastReview.attachmentUrl ?? '#'" target="_blank" rel="noopener">
                        <AppIcon name="download" />{{ t('learning.result.instructorFile') }}
                      </a>
                    </div>
                    <div class="rs-card-actions">
                      <RouterLink class="btn btn--primary" :to="essayPath">
                        <AppIcon name="pen" />{{ t('learning.quiz.editEssay') }}
                      </RouterLink>
                    </div>
                  </div>

                  <div
                    v-else-if="essay.status === 'passed' && lastReview?.comment"
                    class="rs-feedback rs-feedback--ok"
                  >
                    <div class="rs-fb-head">
                      <AppIcon name="check-circle" />
                      <b>{{ t('learning.result.instructorComment') }}</b>
                    </div>
                    <blockquote class="rs-fb-quote">{{ lastReview.comment }}</blockquote>
                    <p class="rs-muted">{{ lastReview.reviewer }} · {{ dateTime(lastReview.reviewedAt) }}</p>
                  </div>
                </template>

                <template v-else>
                  <p class="rs-muted">{{ t('learning.result.essayNotSent') }}</p>
                  <div class="rs-card-actions">
                    <RouterLink class="btn btn--primary btn--sm" :to="quizPath">
                      <AppIcon name="refresh" />{{ t('learning.result.retake') }}
                    </RouterLink>
                  </div>
                </template>
              </section>

              <!-- Review history -->
              <section v-if="essay" class="rs-card" id="rs-history" aria-labelledby="rs-hi-h">
                <header class="rs-card-head">
                  <span class="rs-card-ico"><AppIcon name="history" /></span>
                  <div class="rs-card-ttl">
                    <h2 id="rs-hi-h">{{ t('learning.result.historyTitle') }}</h2>
                    <p>
                      {{
                        t('learning.result.historySub', {
                          versions: essay.version,
                          reviews: essay.reviews.length,
                        })
                      }}
                    </p>
                  </div>
                </header>

                <ol class="timeline rs-timeline">
                  <li v-for="(e, i) in history" :key="i" class="tl-item">
                    <template v-if="e.kind === 'sub'">
                      <span class="tl-dot"><AppIcon name="send" /></span>
                      <div class="tl-head">
                        <b>
                          {{
                            e.version.v === 1
                              ? t('learning.result.sentFirst')
                              : t('learning.result.sentRevised', { n: e.version.v })
                          }}
                        </b>
                        <span class="tl-time">{{ dateTime(e.at) }}</span>
                      </div>
                      <div class="tl-body">
                        <p class="rs-tl-excerpt">{{ e.version.text }}</p>
                        <a
                          v-if="e.version.file?.url"
                          class="rs-chip link"
                          :href="e.version.file.url"
                          target="_blank"
                          rel="noopener"
                        >
                          <AppIcon name="download" />{{ e.version.file.name ?? t('learning.doc.download') }}
                        </a>
                      </div>
                    </template>

                    <template v-else-if="e.kind === 'rev'">
                      <span
                        class="tl-dot"
                        :class="e.review.result === 'passed' ? 'tl-dot--success' : 'tl-dot--danger'"
                      >
                        <AppIcon :name="e.review.result === 'passed' ? 'check' : 'alert-circle'" />
                      </span>
                      <div class="tl-head">
                        <b>
                          {{
                            e.review.result === 'passed'
                              ? t('learning.result.reviewPass')
                              : t('learning.result.reviewRevision')
                          }}
                        </b>
                        <span
                          class="badge"
                          :class="e.review.result === 'passed' ? 'badge--passed' : 'badge--revision'"
                        >
                          <AppIcon
                            :name="e.review.result === 'passed' ? 'check-circle' : 'alert-circle'"
                          />{{
                            e.review.result === 'passed'
                              ? t('learning.result.essayBadge.passed')
                              : t('learning.result.essayBadge.revision')
                          }}
                        </span>
                        <span class="tl-time">{{ dateTime(e.at) }}</span>
                      </div>
                      <div class="tl-body">
                        <span class="rs-tl-by">{{ e.review.reviewer }}</span>
                        <div v-if="e.review.comment" class="tl-quote">{{ e.review.comment }}</div>
                        <div v-if="e.review.attachmentUrl" class="rs-tl-file">
                          <a
                            class="rs-chip link"
                            :href="e.review.attachmentUrl"
                            target="_blank"
                            rel="noopener"
                          >
                            <AppIcon name="download" />{{ t('learning.result.instructorFile') }}
                          </a>
                        </div>
                      </div>
                    </template>

                    <template v-else>
                      <span class="tl-dot tl-dot--warning"><AppIcon name="hourglass" /></span>
                      <div class="tl-head">
                        <b>
                          {{
                            essay.status === 'resubmitted'
                              ? t('learning.result.awaitingAgain')
                              : t('learning.result.awaiting')
                          }}
                        </b>
                      </div>
                      <div class="tl-body">{{ t('learning.result.awaitingText') }}</div>
                    </template>
                  </li>
                </ol>
              </section>
            </template>
          </div>

          <aside class="rs-col rs-col--side" :aria-label="t('learning.result.sideLabel')">
            <section class="rs-card" aria-labelledby="rs-ck-h">
              <header class="rs-card-head">
                <span class="rs-card-ico"><AppIcon name="clipboard-check" /></span>
                <div class="rs-card-ttl">
                  <h2 id="rs-ck-h">{{ t('learning.result.checklistTitle') }}</h2>
                  <p>
                    {{
                      t('learning.result.checklistSub', {
                        done: checkedCount,
                        total: checklist.length,
                      })
                    }}
                  </p>
                </div>
              </header>
              <ol class="rs-check" role="list">
                <li v-for="(item, i) in checklist" :key="i" class="rs-ck" :class="`rs-ck--${item.mark}`">
                  <span class="rs-ck-ico"><AppIcon :name="checkIcon[item.mark]" /></span>
                  <div class="rs-ck-body">
                    <b>{{ item.title }}</b>
                    <small>{{ item.detail }}</small>
                    <RouterLink v-if="item.link" class="link" :to="item.link">
                      {{ t('learning.result.keepLearning') }}
                    </RouterLink>
                  </div>
                  <span class="sr-only">({{ checkLabel[item.mark] }})</span>
                </li>
              </ol>
            </section>
          </aside>
        </div>
      </template>
    </div>
  </div>
</template>
