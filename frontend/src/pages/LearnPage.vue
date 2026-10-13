<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CompactHeader from '@/components/learning/CompactHeader.vue'
import CurriculumPanel from '@/components/learning/CurriculumPanel.vue'
import LessonDoc from '@/components/learning/LessonDoc.vue'
import LessonLock from '@/components/learning/LessonLock.vue'
import LessonPlayer from '@/components/learning/LessonPlayer.vue'
import LessonQa from '@/components/learning/LessonQa.vue'
import LessonQuizCard from '@/components/learning/LessonQuizCard.vue'
import LearningSheet from '@/components/learning/LearningSheet.vue'
import AdsSlot from '@/components/ui/AdsSlot.vue'
import { LESSON_ICON, toast, useFocusMode } from '@/components/learning/learning'
import type { Access, Course, CourseModule, Lesson, Progress, QuizStatus } from '@/components/learning/types'
import { ApiError, api, type StudyCurriculum } from '@/lib/api'
import { flatLessons, toCourse, toProgress } from '@/lib/study'
import { durationLabel } from '@/lib/course'
import { useAuthStore } from '@/stores/auth'
import { useChatDockStore } from '@/stores/chatDock'
import { openAuth } from '@/components/auth/authChannel'
import { useLearningStore } from '@/stores/learning'

/**
 * The learning room.
 *
 * One lesson is on the stage at a time, and what the stage becomes is the only
 * real decision this page takes: no entitlement gives the access overlay, a
 * video gives the player, a document gives the reader. Everything underneath —
 * the title block, the tabs, the curriculum — describes that same lesson, so it
 * all follows from `lessonId` rather than keeping state of its own.
 *
 * Progress is not this page's to decide either. The player reports how far it
 * reached and the API applies the rule; this page sends the number and takes
 * back what the server made of it. That is what keeps the ring here, the bar on
 * the course page and the shelf on the account page telling one story.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
/** A slug or an id — whatever the link carried. The API resolves both. */
const id = computed(() => String(route.params.id ?? ''))

const auth = useAuthStore()
const dock = useChatDockStore()
const loggedIn = computed(() => auth.isLoggedIn)

/**
 * Asking about the lesson on screen.
 *
 * It goes to the school, not to the teacher — a learner has no direct line to
 * whoever teaches the course, and an admin passes on what is worth passing on
 * without saying who asked.
 *
 * What travels is the heading of the page they are standing on: the course,
 * the module, then the lesson. It is sent on arrival rather than put in the
 * box, so there is one thing left to do — write the question — and the school
 * can see which teacher it belongs to before a word of it is typed.
 */
function askTheSchool(): void {
  // Signing in first, because a conversation needs somebody to have it with.
  if (!loggedIn.value) {
    openAuth({ step: 'login' })
    return
  }
  const context = [course.value?.title, moduleLabel.value, '', lesson.value?.title]
    .filter((line) => line !== undefined && line !== null)
    .join('\n')
    .trim()
  dock.open(context)
}

/* ---------------- the course, as this member may study it ---------------- */

const data = ref<StudyCurriculum | null>(null)
const loading = ref(true)
/** Why the room is shut, when it is. Mirrors the prototype's vocabulary because
 *  the lock overlay and the sidebar chip both read it. */
const denied = ref<Access['reason'] | null>(null)

const learning = useLearningStore()

/**
 * Fetches the curriculum.
 *
 * `loading` is only ever true when there is nothing on screen yet. It used to
 * be set on every call, and every call blanked the stage for a spinner — which
 * took the `<video>` out of the page and stopped playback. The access token is
 * renewed every few minutes, and renewing it flips the signed-in flag the watch
 * below listens to, so a lesson would stop by itself partway through for no
 * reason the reader could see.
 */
async function load(): Promise<void> {
  if (!id.value) {
    loading.value = false
    return
  }
  if (!loggedIn.value) {
    data.value = null
    denied.value = 'guest'
    loading.value = false
    return
  }

  loading.value = data.value === null
  denied.value = null
  try {
    data.value = (await api.studyCurriculum(id.value)).data
  } catch (err) {
    data.value = null
    // 403 is the ordinary case — a course they have not bought, or one whose
    // access has run out — and the two read differently to a reader, so the
    // message decides which.
    if (err instanceof ApiError && err.status === 403) {
      denied.value = /ended/i.test(err.message) ? 'expired' : 'none'
    } else if (err instanceof ApiError && err.status === 404) {
      denied.value = 'missing'
    } else {
      denied.value = 'none'
    }
  } finally {
    loading.value = false
  }
}

watch(id, () => void load(), { immediate: true })
// Only a real change of session: signing in, or out. A token renewal leaves
// this the same and must not disturb a lesson that is playing.
watch(loggedIn, (now, before) => {
  if (now !== before) void load()
})

const access = computed<Access>(() =>
  data.value
    ? { has: true, reason: 'ok', source: null, expiredType: null }
    : { has: false, reason: denied.value ?? 'missing', source: null, expiredType: null },
)

const course = computed<Course | null>(() =>
  data.value
    ? toCourse(data.value, {
        t,
        durationLabel: durationLabel(data.value.course.durationSeconds, t),
        levelLabel: data.value.course.level
          ? t(`catalog.level${data.value.course.level[0]!.toUpperCase()}${data.value.course.level.slice(1)}`)
          : '',
        languageLabel: t(`spoken.${data.value.course.contentLocale}`),
      })
    : null,
)

/** The card art the player falls back to, borrowed from the course's category
 *  the same way a catalog tile does. */
const category = computed(() => ({ icon: 'book-open', palette: 0 }))

const progress = computed<Progress>(() =>
  data.value
    ? toProgress(data.value)
    : {
        pct: 0,
        done: 0,
        total: 0,
        started: false,
        lessonsDone: false,
        lastLesson: null,
        resume: null,
        activityAt: null,
        map: {},
      },
)

/** No quiz API yet, so the room says nothing about one rather than inventing a
 *  state for it. */
const quizStatus = computed<QuizStatus>(() => ({
  attempts: 0,
  latest: null,
  choicePassed: false,
  essayStatus: 'none',
  essay: null,
  completed: false,
}))

/** `CurriculumPanel` reads one field off this, and on a course somebody is
 *  entitled to there is no chip to show. */
const view = computed(() => null)

const lessons = computed<Lesson[]>(() =>
  course.value ? course.value.modules.flatMap((m) => m.lessons) : [],
)

/* ---------------- which lesson ---------------- */

/**
 * The lesson in the URL wins; without one, the server's resume point does,
 * which is what makes "continue" land where you left off.
 */
function pickLesson(): string {
  const wanted = route.query.lesson
  if (typeof wanted === 'string' && lessons.value.some((l) => l.id === wanted)) return wanted
  return progress.value.resume?.id ?? lessons.value[0]?.id ?? ''
}

const lessonId = ref('')

/**
 * Set once the curriculum arrives, because until then there are no lessons to
 * choose between.
 *
 * Keyed on the course, not on the object. Saving progress replaces `data` with
 * a patched copy several times a minute, and watching the object meant every save
 * re-picked the lesson and re-fetched the file — which pulled the `<video>` out
 * of the page and put a fresh one back, paused, two seconds into playing.
 */
watch(
  () => data.value?.course.id,
  (courseId) => {
    if (!courseId) return
    lessonId.value = pickLesson()
    // Put it in the address as well. Arriving on a bare /learn/<course> and
    // being dropped into a lesson the URL does not name means a refresh can
    // land somewhere else, the link cannot be shared, and the reader has no way
    // to tell which lesson they are on from the address bar.
    if (lessonId.value && route.query.lesson !== lessonId.value) {
      void router.replace({ query: { ...route.query, lesson: lessonId.value } })
    }
    openModules.value = {}
    void loadMedia()
  },
)

const lesson = computed<Lesson | null>(
  () => lessons.value.find((l) => l.id === lessonId.value) ?? null,
)

const lessonModule = computed<CourseModule | null>(
  () => course.value?.modules.find((m) => m.lessons.some((l) => l.id === lessonId.value)) ?? null,
)

const moduleNumber = computed(() =>
  course.value && lessonModule.value ? course.value.modules.indexOf(lessonModule.value) + 1 : 0,
)

const moduleLabel = computed(() =>
  lessonModule.value?.title
    ? t('learning.info.moduleLabel', { n: moduleNumber.value, title: lessonModule.value.title })
    : '',
)

/** Entitled means everything opens. Without one, nothing does — the free
 *  sample lives on the course page, which is where somebody without access is
 *  sent. */
const canPlay = computed(() => access.value.has && lesson.value !== null)
const canTrack = computed(() => loggedIn.value && access.value.has)

function isDone(l: Lesson): boolean {
  return !!progress.value.map[l.id]?.done
}

const lessonsExQuiz = computed(() => lessons.value.filter((l) => l.type !== 'quiz'))
const doneCount = computed(() => lessonsExQuiz.value.filter(isDone).length)

/** Nothing to offer on a locked stage here: the sample is on the course page. */
const previewLesson = computed<Lesson | null>(() => null)

/* ---------------- the file behind the lesson ---------------- */

const mediaUrlForLesson = ref<string | null>(null)
const mediaError = ref('')

/**
 * Signed, and asked for as the lesson is opened.
 *
 * Not handed out with the curriculum: these expire, and a page left open for an
 * afternoon should not be holding one for every lesson in the course.
 */
async function loadMedia(): Promise<void> {
  mediaUrlForLesson.value = null
  mediaError.value = ''
  const l = lesson.value
  if (!l || !access.value.has || l.type === 'quiz') return

  try {
    const play = (await api.playLesson(Number(l.id))).data
    mediaUrlForLesson.value = play.url
  } catch (err) {
    // The commonest cause by far is a lesson nobody has uploaded a file for
    // yet, which is a gap in the course rather than a fault of the reader's.
    mediaError.value =
      err instanceof ApiError && err.status === 404
        ? t('learning.player.noFile')
        : t('learning.player.loadFailed')
  }
}

watch(lessonId, () => void loadMedia())

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
    const mid = lessonModule.value?.id
    if (mid) openModules.value = { ...openModules.value, [mid]: true }

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
  const current = openModules.value[moduleId] ?? lessonModule.value?.id === moduleId
  openModules.value = { ...openModules.value, [moduleId]: !current }
}

/* ---------------- progress ---------------- */

/**
 * Sends the furthest point to the API and takes back what it made of it.
 *
 * Only the server marks a lesson finished, so the local copy is patched from
 * its answer rather than guessed at: a lesson that ticks over here but not
 * there is the disagreement this page exists to avoid.
 */
let saving = false
async function report(seconds: number, completed?: boolean): Promise<void> {
  const l = lesson.value
  if (!l || !canTrack.value || saving) return
  saving = true
  try {
    const saved = (await api.saveProgress(Number(l.id), {
      positionSeconds: seconds,
      ...(completed ? { completed: true } : {}),
    })).data

    const current = data.value
    if (!current) return
    const wasDone = findLesson(current, Number(l.id))?.progress.completedAt !== null
    patchLesson(current, Number(l.id), saved)
    current.progress = saved.course
    // A new object, so every computed over it recalculates — the ring in the
    // header, the bars in the sidebar and the tick on the row.
    data.value = { ...current }

    if (!wasDone && saved.completedAt) {
      toast(t('learning.lessonSaved'), { type: 'success' })
      // The shelf and the home page's rail read the same numbers.
      void learning.load(true)
    }
  } catch {
    // A lost report is a few seconds of progress, and the next one carries the
    // furthest point anyway. Nothing to tell the reader about.
  } finally {
    saving = false
  }
}

function findLesson(c: StudyCurriculum, lessonIdNumber: number) {
  return flatLessons(c).find((l) => l.id === lessonIdNumber)
}

function patchLesson(
  c: StudyCurriculum,
  lessonIdNumber: number,
  saved: { lastPositionSeconds: number; maxPositionSeconds: number; completedAt: string | null },
) {
  const target = findLesson(c, lessonIdNumber)
  if (!target) return
  target.progress = {
    lastPositionSeconds: saved.lastPositionSeconds,
    maxPositionSeconds: saved.maxPositionSeconds,
    completedAt: saved.completedAt,
    lastWatchedAt: new Date().toISOString(),
  }
}

function onLessonDone() {
  void report(lesson.value?.sec ?? 0, true)
}

/** The player reports its furthest point so the "watched N%" line can follow it
 *  without re-rendering the stage. */
const watchedFraction = ref<number | null>(null)
watch(lessonId, () => (watchedFraction.value = null))

const watchedPct = computed(() => {
  const f = watchedFraction.value ?? progress.value.map[lessonId.value]?.f ?? 0
  return Math.round(Math.min(f, 0.99) * 100)
})

/** Where the lesson was left, for the player to resume from. */
const startAt = computed(() => progress.value.map[lessonId.value]?.pos ?? 0)
const watchedSoFar = computed(() => progress.value.map[lessonId.value]?.f ?? 0)

onBeforeUnmount(() => {
  // The player flushes on its own unmount; this is the page navigating away
  // under it.
  player.value?.flush()
})

/* ---------------- page chrome ---------------- */

const { on: focusOn, toggle: toggleFocus } = useFocusMode()

const drawerOpen = ref(false)

/**
 * Takes somebody down to the curriculum button.
 *
 * On a phone there is no sidebar: the lesson list is behind a button that sits
 * under the video and the lesson title, far enough down that people reported
 * the course contents as missing rather than as below. The header has room for
 * one more control, and this is it.
 *
 * It scrolls to the button rather than opening the drawer itself, so the
 * button is seen where it lives — next time it gets looked for there instead
 * of up here.
 */
function showCurriculum() {
  const btn = document.querySelector<HTMLElement>('[data-lp-curr]')
  if (!btn) return

  // The header floats over the page, so `scrollIntoView` would park the button
  // underneath it. `--lp-hdr` is the height the header measures itself as.
  const measured = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--lp-hdr'),
  )
  const clear = (Number.isFinite(measured) ? measured : 77) + 12
  const top = btn.getBoundingClientRect().top + window.scrollY - clear

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: Math.max(0, top), behavior: still ? 'auto' : 'smooth' })
  // So the keyboard follows the page. `preventScroll` because the smooth
  // scroll above is already on its way and focus would cut it short.
  btn.focus({ preventScroll: true })
}

const backTo = computed(() => (id.value ? path(`/courses/${id.value}`) : path('/courses')))
const quizPath = computed(() => path(`/quiz/${id.value}`))
const resultPath = computed(() => path(`/result/${id.value}`))
const essayPath = computed(() => `${quizPath.value}?mode=essay`)

/* ---------------- title block ---------------- */

const statusBadge = computed(() => {
  if (!lesson.value) return null
  if (!canPlay.value) return { kind: 'expired', icon: 'lock', text: t('learning.info.locked') }
  if (isDone(lesson.value))
    return { kind: 'done', icon: 'check-circle', text: t('learning.info.done') }
  return null
})

const autoNote = computed(() => {
  const l = lesson.value
  if (!l || !canPlay.value) return null
  return {
    icon: 'info',
    text: l.type === 'video' ? t('learning.info.auto90') : t('learning.info.autoDoc'),
    watched: l.type === 'video' && !isDone(l),
  }
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
  if (canPlay.value) return null
  const text =
    denied.value === 'expired'
      ? t('learning.lock.expired')
      : denied.value === 'guest'
        ? t('learning.lock.guest')
        : t('learning.lock.none')
  return { tone: denied.value === 'guest' ? ('info' as const) : ('warning' as const), text }
})

/* ---------------- tabs ---------------- */

/**
 * Three tabs.
 *
 * "บันทึกของฉัน" is still absent: private notes have no API behind them yet,
 * and a box somebody types into and loses is worse than a tab that is not
 * there. The questions, which do have one, are back.
 */
const TABS = ['ov', 'doc', 'qa'] as const
type TabKey = (typeof TABS)[number]
const activeTab = ref<TabKey>('ov')
const tabList = ref<HTMLElement | null>(null)

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
  void nextTick(() => tabList.value?.querySelector<HTMLElement>(`#lp-tab-${TABS[next]}`)?.focus())
}

/* ---------------- overview tab ---------------- */

/** What the lesson itself says, when the teacher wrote it, rather than three
 *  sentences generated about it. */
const lessonPoints = computed<string[]>(() => {
  const l = lesson.value
  if (!l) return []
  const written = data.value && findLesson(data.value, Number(l.id))?.description
  if (written) {
    return written
      .split(/\n+|<\/p>/)
      .map((line) => line.replace(/<[^>]*>/g, '').trim())
      .filter(Boolean)
      .slice(0, 4)
  }
  return []
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
    ...(moduleLabel.value
      ? [{ icon: 'layers', key: t('learning.overview.factModule'), value: moduleLabel.value }]
      : []),
    {
      icon: LESSON_ICON[l.type],
      key: t('learning.overview.factType'),
      value: t(`learning.type.${l.type}`),
    },
    ...(l.duration
      ? [{ icon: 'clock', key: t('learning.overview.factLength'), value: durationWords(l.duration) }]
      : []),
    { icon: 'mic', key: t('learning.overview.factLanguage'), value: c.languageLabel },
    ...(c.levelLabel
      ? [{ icon: 'signal', key: t('learning.overview.factLevel'), value: c.levelLabel }]
      : []),
  ]
})

/* ---------------- documents tab ---------------- */

/**
 * What the documents tab lists: this lesson's own file, then the course's.
 *
 * Each row carries what it takes to fetch a link for it — a lesson id or a
 * document id — because the URLs are signed and short-lived and are asked for
 * at the moment somebody clicks, not held on the page.
 */
interface DocRow {
  key: string
  name: string
  size: string
  desc: string
  lessonId?: number
  documentId?: number
}

const docRows = computed<DocRow[]>(() => {
  const l = lesson.value
  if (!data.value || !l) return []
  const rows: DocRow[] = []
  if (l.type === 'pdf' || l.hasPdf) {
    rows.push({
      key: `lesson-${l.id}`,
      name: l.title,
      size: '',
      desc: t('learning.docs.lessonFile'),
      lessonId: Number(l.id),
    })
  }
  for (const d of data.value.documents) {
    rows.push({
      key: `doc-${d.id}`,
      name: d.fileName,
      size: d.sizeBytes ? `${(d.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '',
      desc: t('learning.docs.courseFile'),
      documentId: d.id,
    })
  }
  return rows
})

/** Which row is being fetched, so its button can say so. */
const fetchingDoc = ref('')

/**
 * Opens a document.
 *
 * The link is fetched on the click rather than rendered into the page: it
 * expires, and a tab left open all afternoon would be holding a row of dead
 * ones. A new tab, because a PDF opening over the lesson you are watching is
 * not what "download" promised.
 */
async function openDoc(row: DocRow): Promise<void> {
  if (fetchingDoc.value) return
  fetchingDoc.value = row.key
  try {
    const url = row.documentId
      ? (await api.documentLink(row.documentId)).data.url
      : (await api.playLesson(row.lessonId!)).data.url
    window.open(url, '_blank', 'noopener')
  } catch {
    toast(t('learning.docs.failed'), { type: 'error' })
  } finally {
    fetchingDoc.value = ''
  }
}

/* ---------------- tab counts ---------------- */

const panelTick = ref(0)
const noteCount = computed(() => 0)

/** Reported by the questions panel once it has the course's threads. */
const qaCount = ref(0)

/* ---------------- actions ---------------- */

/** The overlay's buttons, for somebody who cannot open the course. The basket
 *  and the checkout are the same ones the rest of the site uses. */
function runAction(action: string, courseId?: string) {
  const cid = courseId ?? id.value
  if (action === 'buy' || action === 'enroll-free') {
    void router.push({ path: path('/checkout'), query: { items: cid } })
  } else {
    void router.push(path(`/courses/${cid}`))
  }
}

/** The playhead, which only a video reports. */
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
      <!-- Only while there is a lesson open, because that is the only time the
           button it scrolls to is on the page. CSS hides it from 960px up,
           where the curriculum is a sidebar and already in view. -->
      <button
        v-if="lesson"
        type="button"
        class="lp-jump-btn"
        :aria-label="t('learning.header.jumpToCurriculum')"
        :title="t('learning.header.jumpToCurriculum')"
        @click="showCurriculum()"
      >
        <AppIcon name="list" />
      </button>
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
          <div v-if="loading" class="lp-frame lp-frame--center" role="status">
            <span class="spinner spinner--lg" />
            <p>{{ t('learning.loading') }}</p>
          </div>

          <!-- Entitled, but there is nothing to play: the lesson exists and its
               file does not. Said plainly, because a reader staring at a play
               button that does nothing will assume the fault is theirs. -->
          <div
            v-else-if="canPlay && mediaError && lesson && lesson.type !== 'quiz'"
            class="lp-frame lp-frame--center"
            role="status"
            data-lp-nofile
          >
            <AppIcon name="alert-circle" />
            <p>{{ mediaError }}</p>
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
            :src="mediaUrlForLesson"
            :start-at="startAt"
            :watched="watchedSoFar"
            @done="onLessonDone"
            @tracked="(f) => (watchedFraction = f)"
            @report="(secs) => report(secs)"
            @move="(s) => (playhead = s)"
          />

          <LessonDoc
            v-else-if="lesson.type === 'pdf'"
            :key="lesson.id"
            :course="course"
            :lesson="lesson"
            :can-track="canTrack"
            :src="mediaUrlForLesson"
            :read="!!progress.map[lesson.id]?.done"
            @read="onLessonDone"
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

          <!-- Stuck on this lesson, in the place somebody is stuck: beside the
               lesson title rather than in a footer they would have to go
               looking for. It opens the conversation over the page instead of
               navigating to it, because asking a question should not cost the
               lesson they were in the middle of. -->
          <!-- The two things somebody reaches for without leaving the lesson,
               kept in one column beside the title rather than as two more
               items in the row: on a wide screen three siblings squeezed the
               lesson title into a third of the width it had. -->
          <div class="lp-side-actions">
            <button type="button" class="lp-ask" @click="askTheSchool">
              <span class="lp-ask-ico"><AppIcon name="headset" /></span>
              <span class="lp-ask-txt">
                <b>{{ t('learning.ask.title') }}</b>
                <small>{{ t('learning.ask.hint') }}</small>
              </span>
              <AppIcon name="chevron-right" class="lp-ask-chev" />
            </button>

            <!-- Offered whether or not anything has been marked yet: the
                 result page says so plainly, and a button that appears only
                 once there is something behind it is one nobody learns is
                 there. -->
            <RouterLink class="lp-ask lp-result" :to="resultPath">
              <span class="lp-ask-ico"><AppIcon name="clipboard-check" /></span>
              <span class="lp-ask-txt">
                <b>{{ t('cta.viewResult') }}</b>
                <small>{{ t('learning.result.cardHint') }}</small>
              </span>
              <AppIcon name="chevron-right" class="lp-ask-chev" />
            </RouterLink>
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
                <!-- Only what the teacher wrote about this lesson. The
                     prototype generated three bullets for every lesson; an
                     invented summary of a lesson nobody has watched is worse
                     than no summary. -->
                <template v-if="lessonPoints.length">
                  <h2 class="lp-pan-h">{{ t('learning.overview.whatYouLearn') }}</h2>
                  <ul class="lp-points" role="list">
                    <li v-for="(p, i) in lessonPoints" :key="i">
                      <AppIcon name="check" /><span>{{ p }}</span>
                    </li>
                  </ul>
                </template>
                <h2 class="lp-pan-h">{{ t('learning.overview.aboutCourse') }}</h2>
                <p class="lp-ov-desc">{{ course.shortDesc }}</p>
                <!-- The teachers are on the course's own page, which is one tap
                     away in the header. Carrying them into the room meant a
                     second place for the same list to be wrong. -->
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
                    : t('learning.docs.lockedFallback')
                "
              />
              <ul class="lp-files" role="list">
                <li v-for="r in docRows" :key="r.key" class="lp-file">
                  <span class="lp-file-ico"><AppIcon name="file-text" /></span>
                  <span class="lp-file-body">
                    <b>{{ r.name }}</b>
                    <small>{{ r.desc }}<template v-if="r.size"> · {{ r.size }}</template></small>
                  </span>
                  <button
                    v-if="access.has"
                    type="button"
                    class="btn btn--secondary btn--sm"
                    :data-download="r.key"
                    :disabled="fetchingDoc === r.key"
                    :aria-label="t('learning.docs.downloadNamed', { name: r.name })"
                    @click="openDoc(r)"
                  >
                    <AppIcon name="download" />
                    <span class="hide-sm">{{ t('learning.doc.download') }}</span>
                  </button>
                  <span v-else class="lp-file-lock" :aria-label="t('learning.info.locked')">
                    <AppIcon name="lock" />
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Questions -->
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
              :course-ref="id"
              @changed="panelTick++"
              @count="(n) => (qaCount = n)"
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

</template>
