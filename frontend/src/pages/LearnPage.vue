<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import InstructorLine from '@/components/course/InstructorLine.vue'
import CommerceToasts from '@/components/commerce/CommerceToasts.vue'
import CompactHeader from '@/components/learning/CompactHeader.vue'
import CurriculumPanel from '@/components/learning/CurriculumPanel.vue'
import LearningSheet from '@/components/learning/LearningSheet.vue'
import LessonDoc from '@/components/learning/LessonDoc.vue'
import LessonLock from '@/components/learning/LessonLock.vue'
import LessonNotes from '@/components/learning/LessonNotes.vue'
import LessonPlayer from '@/components/learning/LessonPlayer.vue'
import LessonQa from '@/components/learning/LessonQa.vue'
import LessonQuizCard from '@/components/learning/LessonQuizCard.vue'
import {
  call,
  LESSON_ICON,
  toast,
  useFocusMode,
  useStoreTick,
} from '@/components/learning/learning'
import type {
  Access,
  Course,
  CourseModule,
  Lesson,
  Note,
  Progress,
  Question,
  QuizStatus,
} from '@/components/learning/types'
import { courseView, type CourseView } from '@/vendor'
import { vendorPeople } from '@/lib/vendor-view'
import AdsSlot from '@/components/ui/AdsSlot.vue'

/**
 * The learning room.
 *
 * One lesson is on the stage at a time, and what the stage becomes is the only
 * real decision this page takes: no entitlement gives the access overlay, a
 * video gives the simulated player, a document gives the reader, and the quiz
 * lesson gives its standing card. Everything underneath — the title block, the
 * four tabs, the curriculum — describes that same lesson, so it all follows
 * from `lessonId` rather than keeping state of its own.
 *
 * Progress is not this page's to decide. The player reports how far it reached
 * and `store.trackLesson` applies the 90% rule; the reader reports that it was
 * opened. Nothing here marks a lesson finished itself, which is what keeps the
 * sidebar, the course page and the result page telling the same story.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
const id = computed(() => String(route.params.id ?? ''))

const tick = useStoreTick()

const course = computed<Course | null>(() => {
  void tick.value
  return call<Course | null>('course', id.value)
})

const category = computed(() => {
  const c = course.value
  return c
    ? call<{ icon: string; palette?: number } | null>('category', c.category)
    : null
})

const loggedIn = computed(() => {
  void tick.value
  return call<boolean>('isLoggedIn')
})
const access = computed<Access>(() => {
  void tick.value
  return call<Access>('access', id.value)
})
const view = computed<CourseView | null>(() => {
  void tick.value
  return course.value ? courseView(id.value) : null
})
const progress = computed<Progress>(() => {
  void tick.value
  return call<Progress>('progress', id.value)
})
const quizStatus = computed<QuizStatus>(() => {
  void tick.value
  return call<QuizStatus>('quizStatus', id.value)
})

const lessons = computed<Lesson[]>(() =>
  course.value ? call<Lesson[]>('lessons', course.value) : [],
)

/* ---------------- which lesson ---------------- */

/**
 * The lesson in the URL wins; without one, the store's resume point does, which
 * is what makes "continue" from the account page land where you left off.
 */
function pickLesson(): string {
  const wanted = route.query.lesson
  if (typeof wanted === 'string' && lessons.value.some((l) => l.id === wanted)) return wanted
  return progress.value.resume?.id ?? lessons.value[0]?.id ?? ''
}

const lessonId = ref(pickLesson())

watch(id, () => {
  lessonId.value = pickLesson()
  openModules.value = {}
})

const lesson = computed<Lesson | null>(
  () => lessons.value.find((l) => l.id === lessonId.value) ?? null,
)

const lessonModule = computed<CourseModule | null>(() =>
  course.value && lesson.value
    ? call<CourseModule | null>('moduleOf', course.value, lesson.value.id)
    : null,
)

const moduleNumber = computed(() =>
  course.value && lessonModule.value
    ? course.value.modules.indexOf(lessonModule.value) + 1
    : 0,
)

const moduleLabel = computed(() =>
  lessonModule.value
    ? t('learning.info.moduleLabel', { n: moduleNumber.value, title: lessonModule.value.title })
    : '',
)

/** The prototype's rule, repeated here because the stage and the title block
 *  both need it: with access everything opens, otherwise only a preview video,
 *  and nothing once the course has been withdrawn. */
function playable(l: Lesson | null): boolean {
  if (!l) return false
  if (access.value.has) return true
  if (['ended', 'missing', 'free-available'].includes(access.value.reason)) return false
  return l.preview && l.type === 'video'
}

const canPlay = computed(() => playable(lesson.value))
const canTrack = computed(() => loggedIn.value && access.value.has)

function isDone(l: Lesson): boolean {
  if (l.type === 'quiz') return quizStatus.value.completed
  return !!progress.value.map[l.id]?.done
}

const lessonsExQuiz = computed(() => lessons.value.filter((l) => l.type !== 'quiz'))
const doneCount = computed(() => lessonsExQuiz.value.filter(isDone).length)

/** The sample offered on a locked stage, when it is not the lesson already
 *  selected — pointing at what you are looking at would be no offer at all. */
const previewLesson = computed(() => {
  const first = lessons.value.find((l) => l.preview && l.type === 'video')
  if (!first || access.value.reason === 'ended' || first.id === lessonId.value) return null
  return first
})

/* ---------------- free enrolment ---------------- */

/**
 * A free course nobody has claimed yet enrols itself: `free-available` means
 * the entitlement is a formality, so the stage shows a spinner for a beat
 * rather than a locked box that asks for a click that could not be refused.
 */
let enrolling = false
watch(
  () => access.value.reason,
  (reason) => {
    if (reason !== 'free-available' || enrolling) return
    enrolling = true
    setTimeout(() => {
      const r = call<{ already?: boolean } | null>('enrollFree', id.value)
      enrolling = false
      tick.value += 1
      if (r && !r.already) toast(t('learning.enrolledFree'), { type: 'success' })
    }, 450)
  },
  { immediate: true },
)

/* ---------------- lesson switching ---------------- */

const lessonHeading = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const player = ref<InstanceType<typeof LessonPlayer> | null>(null)

const openModules = ref<Record<string, boolean>>({})

function selectLesson(nextId: string, opts: { seek?: number; fromDrawer?: boolean } = {}) {
  const next = lessons.value.find((l) => l.id === nextId)
  if (!next) return
  const fromDrawer = opts.fromDrawer ?? drawerOpen.value
  if (drawerOpen.value) drawerOpen.value = false

  if (nextId !== lessonId.value) {
    lessonId.value = nextId
    void router.replace({ query: { ...route.query, lesson: nextId } })
    if (canTrack.value) call('setLastLesson', id.value, nextId)
    const mid = call<CourseModule | null>('moduleOf', course.value, nextId)?.id
    if (mid) openModules.value = { ...openModules.value, [mid]: true }
    tick.value += 1

    void nextTick(() => {
      if (fromDrawer) lessonHeading.value?.focus({ preventScroll: true })
      const box = stage.value
      if (box && (fromDrawer || box.getBoundingClientRect().top < 0)) {
        box.scrollIntoView({ block: 'start' })
      }
    })
  }

  if (opts.seek != null) {
    void nextTick(() => player.value?.seek(opts.seek!))
  }
}

function toggleModule(moduleId: string) {
  const current =
    openModules.value[moduleId] ?? lessonModule.value?.id === moduleId
  openModules.value = { ...openModules.value, [moduleId]: !current }
}

/* ---------------- a lesson just finished ---------------- */

function onLessonDone() {
  tick.value += 1
  toast(t('learning.lessonSaved'), { type: 'success' })
}

/** The player reports its furthest point so the "watched N%" line can follow it
 *  without re-rendering the stage. */
const watchedFraction = ref<number | null>(null)
watch(lessonId, () => (watchedFraction.value = null))

const watchedPct = computed(() => {
  const f = watchedFraction.value ?? progress.value.map[lessonId.value]?.f ?? 0
  return Math.round(Math.min(f, 0.99) * 100)
})

/* ---------------- page chrome ---------------- */

const { on: focusOn, toggle: toggleFocus } = useFocusMode()

const drawerOpen = ref(false)

const backTo = computed(() => (course.value ? path(`/courses/${id.value}`) : path('/courses')))
const quizPath = computed(() => path(`/quiz/${id.value}`))
const resultPath = computed(() => path(`/result/${id.value}`))
const essayPath = computed(() => `${quizPath.value}?mode=essay`)

/* ---------------- title block ---------------- */

const statusBadge = computed(() => {
  if (!lesson.value) return null
  if (!canPlay.value) return { kind: 'expired', icon: 'lock', text: t('learning.info.locked') }
  if (isDone(lesson.value))
    return { kind: 'done', icon: 'check-circle', text: t('learning.info.done') }
  if (!access.value.has) return { kind: 'new', icon: 'eye', text: t('learning.info.sample') }
  return null
})

const autoNote = computed(() => {
  const l = lesson.value
  if (!l) return null
  if (canPlay.value && access.value.has && loggedIn.value && l.type !== 'quiz') {
    return {
      icon: 'info',
      text: l.type === 'video' ? t('learning.info.auto90') : t('learning.info.autoDoc'),
      watched: l.type === 'video' && !isDone(l),
    }
  }
  if (canPlay.value && !loggedIn.value) {
    return { icon: 'eye', text: t('learning.info.previewMode'), watched: false }
  }
  return null
})

const currSummary = computed(() =>
  loggedIn.value && (access.value.has || progress.value.started)
    ? t('learning.info.currProgress', {
        done: progress.value.done,
        total: progress.value.total,
        pct: progress.value.pct,
      })
    : t('learning.info.currStatic', {
        n: progress.value.total,
        duration: course.value?.durationLabel ?? '',
      }),
)

const lockNote = computed(() => {
  if (canPlay.value || !view.value?.lock?.text) return null
  const soft = ['guest', 'buy', 'none'].includes(view.value.state)
  return { tone: soft ? ('info' as const) : ('warning' as const), text: view.value.lock.text }
})

/* ---------------- tabs ---------------- */

const TABS = ['ov', 'doc', 'note', 'qa'] as const
type TabKey = (typeof TABS)[number]
const activeTab = ref<TabKey>('ov')
const tabList = ref<HTMLElement | null>(null)

/** Arrow keys move between tabs and activate on arrival, which is the pattern
 *  the design's `U.tabs` implements. */
function onTabKey(e: KeyboardEvent) {
  const i = TABS.indexOf(activeTab.value)
  let next = i
  if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
  else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = TABS.length - 1
  else return
  e.preventDefault()
  activeTab.value = TABS[next]!
  void nextTick(() =>
    tabList.value?.querySelector<HTMLElement>(`#lp-tab-${TABS[next]}`)?.focus(),
  )
}

/* ---------------- overview tab ---------------- */

/** Three bullets per lesson, the middle one borrowed from the course's own
 *  outcomes so the module it belongs to is reflected. */
const lessonPoints = computed<string[]>(() => {
  const c = course.value
  const l = lesson.value
  if (!c || !l) return []
  const outcome = c.outcomes[Math.min(moduleNumber.value - 1, c.outcomes.length - 1)] ?? ''
  if (l.type === 'quiz') {
    const choice = c.quiz.questions.filter((q) => q.type !== 'essay').length
    return [
      t('learning.overview.quizPoint1', { n: choice }),
      t('learning.overview.quizPoint2'),
      t('learning.overview.quizPoint3'),
    ]
  }
  if (l.type === 'pdf') {
    return [
      t('learning.overview.pdfPoint1', { title: l.title }),
      outcome,
      t('learning.overview.pdfPoint3'),
    ]
  }
  return [
    t('learning.overview.videoPoint1', { title: l.title }),
    outcome,
    t('learning.overview.videoPoint3'),
  ]
})

/** "17:50" as "17 นาที 50 วินาที", the long form the facts list uses. */
function durationWords(mmss: string | null): string {
  if (!mmss) return ''
  const [m, s] = mmss.split(':').map(Number)
  return s
    ? t('learning.overview.durationMinSec', { m, s })
    : t('learning.overview.durationMin', { m })
}

const facts = computed(() => {
  const c = course.value
  const l = lesson.value
  if (!c || !l) return []
  return [
    { icon: 'layers', key: t('learning.overview.factModule'), value: moduleLabel.value },
    { icon: LESSON_ICON[l.type], key: t('learning.overview.factType'), value: t(`learning.type.${l.type}`) },
    ...(l.duration
      ? [{ icon: 'clock', key: t('learning.overview.factLength'), value: durationWords(l.duration) }]
      : []),
    { icon: 'mic', key: t('learning.overview.factLanguage'), value: c.languageLabel },
    { icon: 'signal', key: t('learning.overview.factLevel'), value: c.levelLabel },
  ]
})

/* ---------------- documents tab ---------------- */

const docRows = computed(() => {
  const c = course.value
  const l = lesson.value
  if (!c || !l) return []
  const rows = []
  if (l.type === 'pdf' || l.hasPdf) {
    rows.push({
      name: `${l.title}.pdf`,
      size: '1.2 MB',
      desc: t('learning.docs.lessonFile'),
    })
  }
  c.resources.forEach((r) => rows.push({ name: r.name, size: r.size, desc: t('learning.docs.courseFile') }))
  return rows
})

/* ---------------- tab counts ---------------- */

const panelTick = ref(0)

const noteCount = computed(() => {
  void panelTick.value
  void tick.value
  if (!loggedIn.value) return 0
  return call<Note[]>('allNotes', id.value).filter((n) => String(n.text ?? '').trim().length > 0)
    .length
})

const qaCount = computed(() => {
  void panelTick.value
  void tick.value
  const seeded = 2
  return seeded + (loggedIn.value ? call<Question[]>('questions', id.value).length : 0)
})

/* ---------------- actions ---------------- */

/** Store-changing CTAs on the access overlay. Signing in is not wired up yet,
 *  so those buttons stay inert, as on the course page. */
function runAction(action: string, courseId?: string) {
  const cid = courseId ?? id.value
  if (action === 'add-cart') call('addToCart', cid)
  else if (action === 'enroll-free') call('enrollFree', cid)
  else if (action === 'buy') {
    void router.push({ path: path('/checkout'), query: { items: cid } })
    return
  }
  tick.value += 1
}

/** The playhead, for the notes tab's insert-timestamp button. It is only
 *  offered while a video is on the stage, and the player reports it once a
 *  second rather than being polled. */
const playhead = ref(0)
const playerPosition = computed(() =>
  lesson.value?.type === 'video' && canPlay.value ? playhead.value : null,
)
</script>

<template>
  <CompactHeader
    height-var="--lp-hdr"
    :back-to="backTo"
    :back-label="course ? t('learning.header.backToCourse') : t('learning.header.backToCourses')"
    :title="course ? course.title : t('learning.header.room')"
    :sub="lesson ? t('learning.header.currentLesson', { title: lesson.title }) : ''"
  >
    <template v-if="course">
      <div
        v-if="loggedIn && (access.has || progress.started)"
        class="progress-ring lp-ring"
        :style="`--p:${progress.pct}`"
        role="img"
        :aria-label="t('learning.header.courseProgress', { pct: progress.pct })"
      >
        <span aria-hidden="true">{{ progress.pct }}%</span>
      </div>
      <button
        type="button"
        class="lp-focus-btn"
        data-lp-focus
        :aria-pressed="focusOn"
        :title="t('learning.header.focusHint')"
        @click="toggleFocus()"
      >
        <AppIcon :name="focusOn ? 'sun' : 'moon'" />
        <span class="lp-focus-label">{{ t('learning.header.focusMode') }}</span>
      </button>
    </template>
  </CompactHeader>

  <div class="lp-root">
    <!-- No such course -->
    <div class="lp-error" id="lp-error" :hidden="!!course">
      <div class="container container--narrow">
        <div class="state-box">
          <div class="state-ico"><AppIcon name="search" /></div>
          <h3>{{ id ? t('learning.missing.title') : t('learning.missing.noneTitle') }}</h3>
          <p>{{ id ? t('learning.missing.text') : t('learning.missing.noneText') }}</p>
          <div class="state-actions">
            <RouterLink class="btn btn--primary" :to="path('/courses')">
              <AppIcon name="search" />{{ t('course.viewAllCourses') }}
            </RouterLink>
            <RouterLink class="btn btn--secondary" :to="path('/account/learning')">
              {{ t('learning.missing.myCourses') }}
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <div v-if="course && lesson" class="lp-layout" id="lp-layout">
      <div class="lp-main">
        <!-- Stage: video 16:9 / document viewer / quiz card / lock overlay -->
        <section ref="stage" class="lp-stage" id="lp-stage" :aria-label="t('learning.stage.region')">
          <div
            v-if="access.reason === 'free-available'"
            class="lp-frame lp-frame--center"
            role="status"
          >
            <span class="spinner spinner--lg" />
            <p>{{ t('learning.enrollingFree') }}</p>
          </div>

          <LessonLock
            v-else-if="!canPlay"
            :course="course"
            :lesson="lesson"
            :view="view!"
            :access="access"
            :category-icon="category?.icon ?? 'paw'"
            :category-palette="category?.palette ?? 0"
            :preview-lesson="previewLesson"
            :resume-lesson="progress.resume"
            @run="runAction"
            @select="(lid) => selectLesson(lid)"
          />

          <LessonPlayer
            v-else-if="lesson.type === 'video'"
            ref="player"
            :key="lesson.id"
            :course="course"
            :lesson="lesson"
            :category-icon="category?.icon ?? 'paw'"
            :category-palette="category?.palette ?? 0"
            :module-label="moduleLabel"
            :can-track="canTrack"
            :preview="!access.has"
            :guest="!loggedIn"
            @done="onLessonDone"
            @tracked="(f) => (watchedFraction = f)"
            @move="(s) => (playhead = s)"
          />

          <LessonDoc
            v-else-if="lesson.type === 'pdf'"
            :key="lesson.id"
            :course="course"
            :lesson="lesson"
            :can-track="canTrack"
            @done="onLessonDone"
          />

          <LessonQuizCard
            v-else
            :course="course"
            :status="quizStatus"
            :done-count="doneCount"
            :lesson-count="lessonsExQuiz.length"
            :quiz-path="quizPath"
            :result-path="resultPath"
            :essay-path="essayPath"
          />
        </section>

        <!-- Lesson title, module, type, duration + curriculum button (tablet/mobile) -->
        <div class="lp-info" id="lp-info">
          <div class="lp-info-main">
            <p class="lp-course-line">{{ course.title }}</p>
            <p class="lp-crumb">{{ moduleLabel }}</p>
            <h1 ref="lessonHeading" class="lp-title" id="lp-lesson-h" tabindex="-1">
              {{ lesson.title }}<small v-if="lesson.subtitle">{{ lesson.subtitle }}</small>
            </h1>
            <div class="lp-meta">
              <span><AppIcon :name="LESSON_ICON[lesson.type]" />{{ t(`learning.type.${lesson.type}`) }}</span>
              <span v-if="lesson.duration">
                <AppIcon name="clock" /><span class="tabular">{{ lesson.duration }}</span>
              </span>
              <span><AppIcon name="mic" />{{ course.languageLabel }}</span>
              <span v-if="statusBadge" class="badge" :class="`badge--${statusBadge.kind}`">
                <AppIcon :name="statusBadge.icon" />{{ statusBadge.text }}
              </span>
            </div>
            <p v-if="autoNote" class="lp-auto">
              <AppIcon :name="autoNote.icon" />
              <span>
                {{ autoNote.text
                }}<template v-if="autoNote.watched">
                  · <span data-lp-watched>{{ t('learning.info.watched', { pct: watchedPct }) }}</span>
                </template>
              </span>
            </p>
          </div>

          <button
            type="button"
            class="lp-curr-btn"
            data-lp-curr
            data-k="curr"
            aria-haspopup="dialog"
            @click="drawerOpen = true"
          >
            <span class="lp-curr-ico"><AppIcon name="list" /></span>
            <span class="lp-curr-txt">
              <b>{{ t('learning.side.title') }}</b>
              <small>{{ currSummary }}</small>
            </span>
            <AppIcon name="chevron-right" class="lp-curr-chev" />
          </button>

          <div v-if="lockNote" class="lp-lock-note">
            <AppNotice :tone="lockNote.tone" :text="lockNote.text" />
          </div>
        </div>

        <!-- Tabs -->
        <section class="lp-tabs" id="lp-tabs" :aria-label="t('learning.tabs.region')">
          <div ref="tabList" class="tabs" role="tablist" :aria-label="t('learning.tabs.region')">
            <button
              type="button"
              class="tab"
              role="tab"
              id="lp-tab-ov"
              aria-controls="lp-pan-ov"
              :aria-selected="activeTab === 'ov'"
              :tabindex="activeTab === 'ov' ? 0 : -1"
              @click="activeTab = 'ov'"
              @keydown="onTabKey"
            >
              {{ t('learning.tabs.overview') }}
            </button>
            <button
              type="button"
              class="tab"
              role="tab"
              id="lp-tab-doc"
              aria-controls="lp-pan-doc"
              :aria-selected="activeTab === 'doc'"
              :tabindex="activeTab === 'doc' ? 0 : -1"
              @click="activeTab = 'doc'"
              @keydown="onTabKey"
            >
              {{ t('learning.tabs.docs')
              }}<span class="tab-count" data-count="doc">{{ docRows.length || '' }}</span>
            </button>
            <button
              type="button"
              class="tab"
              role="tab"
              id="lp-tab-note"
              aria-controls="lp-pan-note"
              :aria-selected="activeTab === 'note'"
              :tabindex="activeTab === 'note' ? 0 : -1"
              @click="activeTab = 'note'"
              @keydown="onTabKey"
            >
              {{ t('learning.tabs.notes')
              }}<span class="tab-count" data-count="note">{{ noteCount || '' }}</span>
            </button>
            <button
              type="button"
              class="tab"
              role="tab"
              id="lp-tab-qa"
              aria-controls="lp-pan-qa"
              :aria-selected="activeTab === 'qa'"
              :tabindex="activeTab === 'qa' ? 0 : -1"
              @click="activeTab = 'qa'"
              @keydown="onTabKey"
            >
              {{ t('learning.tabs.qa')
              }}<span class="tab-count" data-count="qa">{{ qaCount || '' }}</span>
            </button>
          </div>

          <!-- Overview -->
          <div
            class="tab-panel lp-pan"
            role="tabpanel"
            id="lp-pan-ov"
            aria-labelledby="lp-tab-ov"
            tabindex="0"
            :hidden="activeTab !== 'ov'"
          >
            <div class="lp-ov">
              <div class="lp-ov-main">
                <h2 class="lp-pan-h">{{ t('learning.overview.whatYouLearn') }}</h2>
                <ul class="lp-points" role="list">
                  <li v-for="(p, i) in lessonPoints" :key="i">
                    <AppIcon name="check" /><span>{{ p }}</span>
                  </li>
                </ul>
                <p class="lp-mocknote">
                  <AppIcon name="info" />{{ t('learning.overview.mockNote') }}
                </p>
                <h2 class="lp-pan-h">{{ t('learning.overview.aboutCourse') }}</h2>
                <p class="lp-ov-desc">{{ course.shortDesc }}</p>
                <div class="lp-ov-inst">
                  <span class="lp-ov-label">
                    {{ t('learning.overview.instructors', { n: course.instructors.length }) }}
                  </span>
                  <InstructorLine
                    :people="vendorPeople(course.instructors)"
                    :course-id="course.id"
                    size="md"
                    full
                  />
                </div>
              </div>
              <dl class="lp-facts">
                <div v-for="f in facts" :key="f.key" class="lp-fact">
                  <dt><AppIcon :name="f.icon" />{{ f.key }}</dt>
                  <dd>{{ f.value }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <!-- Documents -->
          <div
            class="tab-panel lp-pan"
            role="tabpanel"
            id="lp-pan-doc"
            aria-labelledby="lp-tab-doc"
            tabindex="0"
            :hidden="activeTab !== 'doc'"
          >
            <div class="lp-docs">
              <h2 class="lp-pan-h">
                {{ t('learning.docs.title') }}
                <span class="lp-pan-count">{{ t('learning.docs.fileCount', { n: docRows.length }) }}</span>
              </h2>
              <AppNotice
                v-if="!access.has"
                tone="info"
                icon="lock"
                :title="t('learning.docs.lockedTitle')"
                :text="
                  access.reason === 'guest'
                    ? t('learning.docs.lockedGuest')
                    : (view?.lock?.title ?? t('learning.docs.lockedFallback'))
                "
              />
              <ul class="lp-files" role="list">
                <li v-for="r in docRows" :key="r.name" class="lp-file">
                  <span class="lp-file-ico"><AppIcon name="file-text" /></span>
                  <span class="lp-file-body">
                    <b>{{ r.name }}</b>
                    <small>{{ r.desc }} · PDF · {{ r.size }}</small>
                  </span>
                  <a
                    v-if="access.has"
                    class="btn btn--secondary btn--sm"
                    href="#download"
                    data-proto-link
                    :aria-label="t('learning.docs.downloadNamed', { name: r.name })"
                  >
                    <AppIcon name="download" />
                    <span class="hide-sm">{{ t('learning.doc.download') }}</span>
                  </a>
                  <span v-else class="lp-file-lock" :aria-label="t('learning.info.locked')">
                    <AppIcon name="lock" />
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Notes -->
          <div
            class="tab-panel lp-pan"
            role="tabpanel"
            id="lp-pan-note"
            aria-labelledby="lp-tab-note"
            tabindex="0"
            :hidden="activeTab !== 'note'"
          >
            <LessonNotes
              :course="course"
              :lesson="lesson"
              :logged-in="loggedIn"
              :player-position="playerPosition"
              @changed="panelTick++"
              @seek="(lid, sec) => selectLesson(lid, { seek: sec })"
            />
          </div>

          <!-- Q&A -->
          <div
            class="tab-panel lp-pan"
            role="tabpanel"
            id="lp-pan-qa"
            aria-labelledby="lp-tab-qa"
            tabindex="0"
            :hidden="activeTab !== 'qa'"
          >
            <LessonQa
              :course="course"
              :lesson="lesson"
              :logged-in="loggedIn"
              @changed="panelTick++"
            />
          </div>
        </section>
      </div>

      <!-- Curriculum sidebar (desktop ≥960px; tablet/mobile uses a drawer) -->
      <aside class="lp-side" id="lp-side" aria-labelledby="lp-side-h">
        <CurriculumPanel
          :course="course"
          :view="view!"
          :access="access"
          :progress="progress"
          :quiz-status="quizStatus"
          :current-lesson-id="lessonId"
          :open-modules="openModules"
          prefix="s"
          :logged-in="loggedIn"
          with-title
          @select="(lid) => selectLesson(lid)"
          @toggle="toggleModule"
        />
      </aside>
    </div>

    <!-- Ads (very bottom of the learning page) -->
    <div v-if="course" class="lp-ads" id="lp-ads">
      <AdsSlot placement="learn" />
    </div>
  </div>

  <LearningSheet
    v-if="drawerOpen && course"
    :title="t('learning.side.title')"
    :sub="course.title"
    root-class="lp-drawer-root"
    modal-class="lp-drawer"
    initial-focus="[aria-current='true']"
    @close="drawerOpen = false"
  >
    <div class="lp-dside">
      <CurriculumPanel
        :course="course"
        :view="view!"
        :access="access"
        :progress="progress"
        :quiz-status="quizStatus"
        :current-lesson-id="lessonId"
        :open-modules="openModules"
        prefix="d"
        :logged-in="loggedIn"
        @select="(lid) => selectLesson(lid, { fromDrawer: true })"
        @toggle="toggleModule"
      />
    </div>
  </LearningSheet>

  <CommerceToasts />
</template>
