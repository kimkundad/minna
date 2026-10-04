<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import AppPrice from '@/components/ui/AppPrice.vue'
import AppProgress from '@/components/ui/AppProgress.vue'
import AdsSlot from '@/components/ui/AdsSlot.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import CourseRail from '@/components/course/CourseRail.vue'
import { courseView, store, type CourseView } from '@/vendor'
import { date, dateLong, levelShort, minutes, relative } from '@/lib/format'

/**
 * One course, in full.
 *
 * Every piece of state on this page — which badges sit by the category, whether
 * the panel shows a price or a progress bar, which notice explains the lock,
 * and the one, two or three CTAs underneath — comes out of `courseView(id)`.
 * Nothing here decides any of that for itself, so the page cannot disagree with
 * the card that linked to it or with the lesson rows further down.
 *
 * The curriculum is the one place that asks per lesson: `lessonMode` is the
 * same ladder the prototype walks — ended, then access, then a free preview,
 * then signed out, then expired, then buy — and it decides whether a row is a
 * link into the player or a button that explains why not.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const s = store as unknown as Record<string, (...args: any[]) => any>

const LESSON_TYPE: Record<string, { icon: string; label: string }> = {
  video: { icon: 'play-circle', label: 'course.lessonTypeVideo' },
  pdf: { icon: 'file-text', label: 'course.lessonTypeDocument' },
  quiz: { icon: 'clipboard-check', label: 'course.lessonTypeQuiz' },
}
const LOCK_TONE: Record<string, 'info' | 'warning' | 'danger'> = {
  ended: 'danger',
  'access-expired': 'warning',
  'pkg-expired': 'warning',
  guest: 'info',
  buy: 'info',
}
const LOCK_ICON: Record<string, string> = {
  ended: 'ban',
  'access-expired': 'hourglass',
  'pkg-expired': 'package',
  guest: 'lock',
  buy: 'lock',
}
const AUDIENCE_ICONS = ['stethoscope', 'users', 'graduation', 'briefcase']
const STEP_ICONS = ['play-circle', 'clipboard-check', 'pen', 'award']

/** Bumped after an action so the vendor store's new answer is re-read. */
const tick = ref(0)

const id = computed(() => String(route.params.id ?? '').trim().toUpperCase().slice(0, 40))

interface Lesson {
  id: string
  moduleId: string
  title: string
  type: string
  duration: string | null
  sec: number
  preview: boolean
  subtitle: string | null
  hasPdf: boolean
}
interface Module {
  id: string
  title: string
  lessons: Lesson[]
}
interface Course {
  id: string
  title: string
  shortDesc: string
  category: string
  level: string
  levelLabel: string
  languageLabel: string
  durationLabel: string
  ce: number
  price: number
  normalPrice: number | null
  isFree: boolean
  packageIncluded: boolean
  certificate: boolean
  accessDays: number
  status: string
  endedAt?: string
  updatedAt: string
  outcomes: string[]
  audience: string[]
  completion: string[]
  modules: Module[]
  quiz: { questions: unknown[] }
  instructors: { id: string; role: string }[]
  image: { src?: string; id?: string; alt?: string; fp?: string } | null
}

const course = computed<Course | null>(() => (id.value ? (s.course(id.value) as Course) : null))
const category = computed(() =>
  course.value
    ? (s.category(course.value.category) as {
        id: string
        name: string
        th: string
        icon: string
        palette?: number
      })
    : null,
)
const view = computed<CourseView | null>(() => {
  void tick.value
  return course.value ? courseView(id.value) : null
})
const simulateError = computed(() => {
  void tick.value
  return Boolean(s.simulateError())
})
const isLoggedIn = computed(() => {
  void tick.value
  return Boolean(s.isLoggedIn())
})

const lessons = computed<Lesson[]>(() =>
  course.value ? (s.lessons(course.value) as Lesson[]) : [],
)
const previewLesson = computed(() => lessons.value.find((l) => l.preview) ?? null)
const instructors = computed(() =>
  (course.value?.instructors ?? []).map((i) => ({
    role: i.role,
    ...(s.instructor(i.id) as {
      id: string
      name: string
      initials: string
      color: number
      photo?: string | null
      bio: string
    }),
  })),
)

/* ---------------- hero ---------------- */

const heroMeta = computed(() => {
  const c = course.value
  if (!c) return []
  return [
    ['calendar', t('course.updatedAt', { date: date(c.updatedAt) })],
    ['signal', t('course.level', { level: levelShort(c.level) })],
    ['clock', c.durationLabel],
    ['mic', c.languageLabel],
    ['book-open', t('course.lessonCount', lessons.value.length)],
  ] as [string, string][]
})

const instructorNames = computed(() => instructors.value.slice(0, 3).map((x) => x.name).join(', '))
const extraInstructors = computed(() => Math.max(0, instructors.value.length - 3))

/* ---------------- purchase panel ---------------- */

const discount = computed(() => {
  const c = course.value
  if (!c?.normalPrice || c.normalPrice <= c.price) return 0
  return Math.round((1 - c.price / c.normalPrice) * 100)
})

const previewCaption = computed(() => {
  const l = previewLesson.value
  if (!l) return ''
  return l.duration ? `${t('course.previewLesson')} · ${l.duration}` : t('course.previewLesson')
})

const isMuted = computed(() =>
  ['ended', 'access-expired', 'pkg-expired'].includes(view.value?.state ?? ''),
)

const progressLabel = computed(() => {
  const pr = view.value?.progress
  if (!pr) return ''
  if (pr.pct >= 100) return t('course.progressDone')
  return isMuted.value ? t('course.progressKept') : t('course.progressTitle')
})

const progressSub = computed(() => {
  const pr = view.value?.progress
  if (!pr) return []
  const out: { text: string; strong?: string }[] = []
  if (pr.pct < 100 && pr.started && pr.resume) {
    out.push({
      text: t('course.resumeAt'),
      strong:
        pr.resume.type === 'quiz' ? t('course.finalQuiz') : pr.resume.title,
    })
  }
  if (pr.activityAt) out.push({ text: t('course.lastStudied', { when: relative(pr.activityAt) }) })
  return out
})

/** The one line that says where access comes from: a package, a purchase with
 *  an end date, or a free enrolment. */
const accessLine = computed(() => {
  const v = view.value
  if (!v?.access.has) return null
  if (v.access.source === 'package') {
    const pk = s.pkgInfo() as
      | { plan: { name: string }; endAt?: string; status?: string; daysLeft?: number }
      | null
    let sub = ''
    if (pk) {
      sub = pk.plan.name
      if (pk.endAt) sub += ` · ${t('course.accessPackageUntil', { date: date(pk.endAt) })}`
      if (pk.status === 'expiring')
        sub += ` · ${t('course.accessPackageExpiring', { days: pk.daysLeft ?? 0 })}`
    }
    return { kind: 'package', icon: 'package', title: t('course.accessInPackage'), sub }
  }
  const ent = v.access.ent as { endAt?: string } | undefined
  if (v.access.source === 'purchase' && ent?.endAt) {
    return {
      kind: 'purchase',
      icon: 'calendar',
      title: t('course.accessUntil', { date: dateLong(ent.endAt) }),
      sub: v.access.renewed ? t('course.accessRenewed') : t('course.accessPerCourse'),
    }
  }
  if (v.access.source === 'free') {
    return {
      kind: 'free',
      icon: 'gift',
      title: t('course.accessFreeEnrolled'),
      sub: t('course.accessFreeForMembers'),
    }
  }
  return null
})

/** A "buy" lock repeats what the note already says, so the note stands down
 *  rather than printing it twice. */
const lockText = computed(() => {
  const v = view.value
  if (!v?.lock) return ''
  return v.lock.type === 'buy' && v.note ? v.note : v.lock.text
})
const footNote = computed(() => {
  const v = view.value
  if (!v?.note) return ''
  return v.lock?.type === 'buy' ? '' : v.note
})

const perks = computed(() => {
  const c = course.value
  if (!c) return []
  return [
    [
      'calendar',
      c.isFree ? t('course.perkFree') : t('course.perkAccessDays', { days: c.accessDays }),
    ],
    ['monitor', t('course.perkAnyDevice')],
  ] as [string, string][]
})

const moreCtas = computed(() =>
  [view.value?.secondary, view.value?.tertiary].filter(Boolean),
)

/* ---------------- curriculum ---------------- */

const expanded = ref<Record<string, boolean>>({})

/** On arrival the first chapter is open, unless there is a lesson to resume —
 *  then that chapter is, because it is the one you came back for. */
function openCurrentModule(fallbackFirst: boolean): void {
  const c = course.value
  if (!c) return
  const cur = currentLessonId.value
  const target = cur
    ? c.modules.find((m) => m.lessons.some((l) => l.id === cur))
    : fallbackFirst
      ? c.modules[0]
      : undefined
  if (target) expanded.value[target.id] = true
}

const currentLessonId = computed(() => {
  const v = view.value
  if (!v) return null
  const pr = v.progress
  const hasHistory = isLoggedIn.value && (v.access.has || v.showProgress)
  return pr.started && pr.pct < 100 && pr.resume && hasHistory ? pr.resume.id : null
})

const allExpanded = computed(
  () => Boolean(course.value?.modules.every((m) => expanded.value[m.id])),
)

function toggleAll(): void {
  const open = !allExpanded.value
  for (const m of course.value?.modules ?? []) expanded.value[m.id] = open
}

function moduleSeconds(m: Module): number {
  return m.lessons.reduce((sum, l) => sum + (l.sec || 0), 0)
}

function moduleMeta(m: Module): string {
  const sec = moduleSeconds(m)
  const count = t('course.lessonCount', m.lessons.length)
  return sec ? `${count} · ${minutes(sec)}` : count
}

function lessonDone(l: Lesson): boolean {
  const v = view.value
  if (!v || !isLoggedIn.value) return false
  if (l.type === 'quiz') return Boolean(v.quiz.completed)
  return Boolean((s.lessonState(id.value, l.id) as { done: boolean }).done)
}

function moduleDone(m: Module): number {
  return m.lessons.filter((l) => lessonDone(l)).length
}

const showHistory = computed(() => {
  const v = view.value
  return Boolean(v && isLoggedIn.value && (v.access.has || v.showProgress))
})

type LessonMode = 'ended' | 'learn' | 'preview' | 'auth' | 'expired' | 'buy'

function lessonMode(l: Lesson): LessonMode {
  const v = view.value
  if (!v) return 'auth'
  if (v.state === 'ended') return 'ended'
  if (v.access.has) return 'learn'
  if (l.preview) return 'preview'
  if (!isLoggedIn.value) return 'auth'
  if (v.state === 'access-expired') return 'expired'
  return 'buy'
}

function lessonSmall(l: Lesson): string {
  const type = LESSON_TYPE[l.type] ?? LESSON_TYPE.video
  let out = t(type.label)
  if (l.subtitle) out += ` · ${l.subtitle}`
  if (l.hasPdf) out += ` · ${t('course.hasPdf')}`
  return out
}

function lessonDuration(l: Lesson): string {
  if (l.duration) return l.duration
  if (l.type === 'quiz')
    return t('course.quizQuestions', course.value?.quiz.questions.length ?? 0)
  return t('course.documentDuration')
}

/** What the right-hand end of a row says: finished, where you are, a free
 *  preview, or locked. */
function lessonState(
  l: Lesson,
): { kind: string; icon: string; label: string; withLock?: boolean } | null {
  const mode = lessonMode(l)
  const done = lessonDone(l)
  if (mode === 'learn') {
    if (done) return { kind: 'done', icon: 'check-circle', label: t('course.legendDone') }
    if (currentLessonId.value === l.id)
      return { kind: 'current', icon: 'play', label: t('course.stateCurrent') }
    return null
  }
  if (mode === 'preview')
    return { kind: 'preview', icon: 'play-circle', label: t('course.statePreview') }
  if (done)
    return {
      kind: 'done',
      icon: 'check-circle',
      label: t('course.legendDone'),
      withLock: true,
    }
  return { kind: 'locked', icon: 'lock', label: t('course.stateLocked') }
}

function lessonHref(l: Lesson): string {
  return `${path('/learn')}?id=${id.value}&lesson=${l.id}`
}

/* ---------------- completion steps ---------------- */

const stepStatuses = computed(() => {
  const v = view.value
  if (!v || !showHistory.value) return []
  const nonQuiz = lessons.value.filter((l) => l.type !== 'quiz')
  const done = nonQuiz.filter(
    (l) => (s.lessonState(id.value, l.id) as { done: boolean }).done,
  ).length
  const essay = {
    none: { kind: '', icon: '', label: t('course.essayNone') },
    pending: { kind: 'pending', icon: 'hourglass', label: t('course.essayPending') },
    resubmitted: { kind: 'resubmitted', icon: 'hourglass', label: t('course.essayResubmitted') },
    revision: { kind: 'revision', icon: 'alert-circle', label: t('course.essayRevision') },
    passed: { kind: 'done', icon: 'check-circle', label: t('course.essayPassed') },
  }[v.quiz.essayStatus] ?? { kind: '', icon: '', label: t('course.essayNone') }

  return [
    v.progress.lessonsDone
      ? { kind: 'done', icon: 'check-circle', label: t('course.stepLessonsDone') }
      : {
          kind: '',
          icon: '',
          label: t('course.stepLessonsPartial', { done, total: nonQuiz.length }),
        },
    v.quiz.choicePassed
      ? { kind: 'done', icon: 'check-circle', label: t('course.stepQuizPassed') }
      : v.quiz.attempts
        ? { kind: 'revision', icon: 'alert-circle', label: t('course.stepQuizFailed') }
        : { kind: '', icon: '', label: t('course.stepQuizNone') },
    essay,
    v.cert
      ? { kind: 'done', icon: 'badge-check', label: t('course.stepCertIssued') }
      : { kind: '', icon: '', label: t('course.stepNotYet') },
  ]
})

/* ---------------- course info ---------------- */

interface InfoRow {
  dt: string
  dd: string
  sub?: string
  href?: string
}

const infoRows = computed<InfoRow[]>(() => {
  const c = course.value
  const cat = category.value
  if (!c || !cat) return []
  const rows: InfoRow[] = [
    {
      dt: t('course.infoCategory'),
      dd: cat.name,
      sub: `(${cat.th})`,
      href: `${path('/courses')}?category=${cat.id}`,
    },
    { dt: t('course.infoLevel'), dd: c.levelLabel },
    { dt: t('course.infoDuration'), dd: c.durationLabel },
    {
      dt: t('course.infoLessons'),
      dd: t('course.lessonCount', lessons.value.length),
      sub: t('course.infoLessonsSub', { modules: c.modules.length }),
    },
    { dt: t('course.infoLanguage'), dd: String(c.languageLabel).split(': ').pop() ?? '' },
    { dt: t('course.infoUpdated'), dd: dateLong(c.updatedAt) },
    {
      dt: t('course.infoAccess'),
      dd: c.isFree ? t('course.infoAccessFree') : t('course.infoAccessDays', { days: c.accessDays }),
      sub: !c.isFree && c.packageIncluded ? t('course.infoAccessPackageSub') : undefined,
    },
    {
      dt: t('course.infoInPackage'),
      dd: c.packageIncluded ? t('course.yes') : t('course.no'),
      sub: c.packageIncluded
        ? t('course.infoPackagePaid')
        : c.isFree
          ? t('course.infoPackageNoFree')
          : t('course.infoPackageNoCourse'),
    },
  ]
  if (c.status === 'ended')
    rows.push({ dt: t('course.infoStatus'), dd: t('course.infoEnded', { date: dateLong(c.endedAt) }) })
  return rows
})

const infoHalf = computed(() => Math.ceil(infoRows.value.length / 2))

/* ---------------- recommended ---------------- */

const recommended = computed(() => {
  void tick.value
  const c = course.value
  const cat = category.value
  if (!c || !cat) return []
  const same = (s.catalog() as { id: string; category: string }[])
    .filter((x) => x.category === c.category && x.id !== c.id)
    .map((x) => ({ id: x.id, reason: t('course.sameCategoryReason', { name: cat.name }) }))
  const taken = same.map((x) => x.id)
  const rest = (s.recommended() as { course: { id: string }; reason: string }[])
    .filter((r) => r.course.id !== c.id && !taken.includes(r.course.id))
    .map((r) => ({ id: r.course.id, reason: isLoggedIn.value ? r.reason : undefined }))
  return [...same, ...rest].slice(0, 8)
})

const notFoundRail = computed(() => {
  void tick.value
  return (s.recommended() as { course: { id: string } }[]).slice(0, 8).map((r) => r.course.id)
})

/* ---------------- the mobile bottom bar ---------------- */

const stacked = ref(false)
const ctaVisible = ref(true)
const ctasEl = ref<HTMLElement | null>(null)
let mq: MediaQueryList | undefined
let io: IntersectionObserver | undefined

/** The bar only earns its place once the real CTAs have scrolled away, and
 *  only on the layouts where the purchase panel is not pinned beside the
 *  content. */
const showBar = computed(() => stacked.value && !ctaVisible.value)

function syncBodyClass(): void {
  document.body.classList.toggle('has-bottom-bar', showBar.value)
}
watch(showBar, syncBodyClass)

function observeCtas(): void {
  io?.disconnect()
  const target = ctasEl.value
  if (!target) return
  if (!('IntersectionObserver' in window)) {
    ctaVisible.value = false
    return
  }
  io = new IntersectionObserver(
    (entries) => {
      ctaVisible.value = entries[entries.length - 1]!.isIntersecting
    },
    { rootMargin: '-72px 0px -16px 0px' },
  )
  io.observe(target)
}

function onMqChange(event: MediaQueryListEvent | MediaQueryList): void {
  stacked.value = event.matches
}

onMounted(() => {
  document.body.classList.add('page-course')
  mq = window.matchMedia('(max-width: 959px)')
  stacked.value = mq.matches
  mq.addEventListener('change', onMqChange)
  openCurrentModule(true)
  observeCtas()
})

onBeforeUnmount(() => {
  document.body.classList.remove('page-course', 'has-bottom-bar')
  mq?.removeEventListener('change', onMqChange)
  io?.disconnect()
})

watch(ctasEl, observeCtas)
watch(id, () => {
  expanded.value = {}
  openCurrentModule(true)
})

/* ---------------- actions ---------------- */

/** Store-changing CTAs run here; signing in is not wired up yet, so those
 *  buttons stay inert for now. */
function runAction(action: string, courseId?: string): void {
  const cid = courseId ?? id.value
  if (action === 'add-cart') s.addToCart(cid)
  else if (action === 'enroll-free') s.enrollFree(cid)
  else if (action === 'buy') {
    void router.push({ path: path('/checkout'), query: { items: cid } })
    return
  }
  tick.value++
}
</script>

<template>
  <div class="cd-root" id="cd-root">
    <!-- No such course -->
    <template v-if="!course">
      <section class="page-hero cd-nf" aria-labelledby="cd-nf-h">
        <div class="container">
          <nav :aria-label="t('common.breadcrumb')">
            <ol class="crumbs dc-crumbs">
              <li>
                <RouterLink :to="path('')">{{ t('common.home') }}</RouterLink>
              </li>
              <li>
                <AppIcon name="chevron-right" />
                <RouterLink :to="path('/courses')">{{ t('common.courses') }}</RouterLink>
              </li>
              <li>
                <AppIcon name="chevron-right" />
                <span aria-current="page">{{ t('course.notFoundCrumb') }}</span>
              </li>
            </ol>
          </nav>
          <div class="state-box state-box--error cd-nf-box" role="alert">
            <div class="state-ico"><AppIcon name="search" /></div>
            <h1 id="cd-nf-h">{{ t('course.notFoundTitle') }}</h1>
            <p>
              {{ id ? t('course.notFoundWithId', { id }) : t('course.notFoundNoId') }}
            </p>
            <div class="state-actions">
              <RouterLink class="btn btn--primary" :to="path('/courses')">
                <AppIcon name="arrow-left" />{{ t('course.backToCourses') }}
              </RouterLink>
              <RouterLink class="btn btn--secondary" :to="path('')">
                <AppIcon name="home" />{{ t('common.home') }}
              </RouterLink>
            </div>
          </div>
        </div>
      </section>
      <section class="container cd-nf-rec" id="cd-nf-rec" aria-labelledby="nf-rec-h">
        <CourseRail
          id="nf-rec"
          :eyebrow="t('course.recommendedEyebrow')"
          :title="t('course.recommendedTitle')"
          :sub="t('course.notFoundRailSub')"
          :more-href="path('/courses')"
          :more-label="t('course.viewAllCourses')"
          :count="notFoundRail.length"
        >
          <CourseCard v-for="cid in notFoundRail" :key="cid" :course-id="cid" @run="runAction" />
        </CourseRail>
      </section>
    </template>

    <!-- Could not load -->
    <section v-else-if="simulateError" class="page-hero cd-err" aria-labelledby="cd-err-h">
      <div class="container">
        <nav :aria-label="t('common.breadcrumb')">
          <ol class="crumbs dc-crumbs">
            <li>
              <RouterLink :to="path('')">{{ t('common.home') }}</RouterLink>
            </li>
            <li>
              <AppIcon name="chevron-right" />
              <RouterLink :to="path('/courses')">{{ t('common.courses') }}</RouterLink>
            </li>
            <li>
              <AppIcon name="chevron-right" />
              <span aria-current="page">{{ course.title }}</span>
            </li>
          </ol>
        </nav>
        <h1 class="sr-only" id="cd-err-h">{{ course.title }}</h1>
        <div class="state-box state-box--error" role="alert">
          <div class="state-ico"><AppIcon name="wifi-off" /></div>
          <h3>{{ t('course.errorTitle') }}</h3>
          <p>{{ t('course.errorText') }}</p>
          <div class="state-actions">
            <button type="button" class="btn btn--primary" data-retry="course" @click="tick++">
              <AppIcon name="refresh" />{{ t('course.retry') }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <template v-else-if="view && category">
      <div class="cd-layout">
        <div class="cd-hero-bg" aria-hidden="true" />

        <div class="cd-hero">
          <nav :aria-label="t('common.breadcrumb')">
            <ol class="crumbs dc-crumbs">
              <li>
                <RouterLink :to="path('')">{{ t('common.home') }}</RouterLink>
              </li>
              <li>
                <AppIcon name="chevron-right" />
                <RouterLink :to="path('/courses')">{{ t('common.courses') }}</RouterLink>
              </li>
              <li>
                <AppIcon name="chevron-right" />
                <RouterLink :to="`${path('/courses')}?category=${category.id}`">{{
                  category.name
                }}</RouterLink>
              </li>
              <li>
                <AppIcon name="chevron-right" />
                <span aria-current="page">{{ course.title }}</span>
              </li>
            </ol>
          </nav>

          <div class="cd-tags">
            <RouterLink class="cd-cat" :to="`${path('/courses')}?category=${category.id}`">
              <AppIcon :name="category.icon" />
              <span>{{ category.name }}</span>
              <span class="sr-only">{{ ` ${t('course.catViewCourses')}` }}</span>
            </RouterLink>
            <span class="cd-badges" id="cd-badges">
              <AppBadge v-for="(b, i) in view.badges" :key="i" :badge="b" />
            </span>
          </div>

          <h1 class="cd-title">{{ course.title }}</h1>
          <p class="cd-lead">{{ course.shortDesc }}</p>

          <button
            type="button"
            class="cd-inst"
            data-act="instructors"
            :data-cid="course.id"
            aria-haspopup="dialog"
          >
            <span class="avatar-stack">
              <AppAvatar
                v-for="p in instructors.slice(0, 4)"
                :key="p.id"
                :name="p.name"
                :initials="p.initials"
                :color="p.color"
                :photo="p.photo"
                size="md"
              />
            </span>
            <span class="cd-inst-text">
              <span class="cd-inst-label">{{
                t('course.instructorCount', instructors.length)
              }}</span>
              <span class="cd-inst-names"
                >{{ instructorNames }}<span v-if="extraInstructors" class="more">{{
                  ` ${t('course.andMore', { count: extraInstructors })}`
                }}</span></span
              >
            </span>
            <AppIcon name="chevron-right" />
          </button>

          <ul class="cd-meta" role="list">
            <li v-for="m in heroMeta" :key="m[1]">
              <AppIcon :name="m[0]" />
              <span>{{ m[1] }}</span>
            </li>
          </ul>
        </div>

        <aside class="cd-aside" aria-labelledby="cd-buy-h">
          <div class="cd-panel">
            <h2 class="sr-only" id="cd-buy-h">{{ t('course.buyHeading') }}</h2>

            <div class="cd-media" :class="{ 'is-locked': course.status === 'ended' }">
              <CourseImage
                :image="course.image"
                :width="768"
                :height="432"
                :art-icon="category.icon"
                :art-palette="category.palette ?? 0"
                sizes="(max-width: 959px) 92vw, 384px"
                eager
                priority
              />
              <div v-if="course.status === 'ended'" class="cd-media-lock">
                <span class="cd-media-lockico"><AppIcon name="lock" /></span>
                <b>{{ t('course.mediaLockTitle') }}</b>
                <span>{{ t('course.mediaLockText') }}</span>
              </div>
              <button
                v-else-if="previewLesson"
                type="button"
                class="cd-media-play"
                :data-preview="previewLesson.id"
                aria-haspopup="dialog"
              >
                <span class="cd-play-ico"><AppIcon name="play" /></span>
                <span class="cd-play-cap">
                  <AppIcon name="play-circle" />
                  <span>{{ previewCaption }}</span>
                </span>
                <span class="sr-only">: {{ previewLesson.title }}</span>
              </button>
            </div>

            <div class="cd-buy">
              <div id="cd-buy-top" class="cd-buy-top">
                <div v-if="view.showProgress" class="cd-prog">
                  <div class="cd-prog-head">
                    <span>{{ progressLabel }}</span>
                    <span class="cd-prog-n">{{
                      t('course.progressCount', {
                        done: view.progress.done,
                        total: view.progress.total,
                      })
                    }}</span>
                  </div>
                  <AppProgress
                    :value="view.progress.pct"
                    lg
                    :muted="isMuted"
                    :label="progressLabel"
                  />
                  <p v-if="progressSub.length" class="cd-prog-sub">
                    <template v-for="(line, i) in progressSub" :key="i">
                      <br v-if="i" />{{ line.text }}<b v-if="line.strong">{{ line.strong }}</b>
                    </template>
                  </p>
                </div>

                <div v-if="view.showPrice" class="cd-price">
                  <AppPrice
                    :price="course.price"
                    :normal-price="course.normalPrice"
                    :is-free="course.isFree"
                    lg
                  />
                  <span v-if="discount" class="badge badge--bestseller cd-off">{{
                    t('course.discountOff', { percent: discount })
                  }}</span>
                </div>

                <div
                  v-if="accessLine"
                  class="cd-access"
                  :class="`cd-access--${accessLine.kind}`"
                >
                  <AppIcon :name="accessLine.icon" />
                  <div>
                    <b>{{ accessLine.title }}</b>
                    <span v-if="accessLine.sub">{{ accessLine.sub }}</span>
                  </div>
                </div>

                <div v-if="view.lock" class="cd-lock">
                  <AppNotice
                    :tone="LOCK_TONE[view.lock.type] ?? 'info'"
                    :icon="LOCK_ICON[view.lock.type]"
                    :title="view.lock.title"
                    :text="lockText"
                  />
                </div>
              </div>

              <div class="cd-ctas" id="cd-ctas" ref="ctasEl">
                <div class="cd-cta-primary" data-cta-primary tabindex="-1">
                  <CtaButton
                    :action="view.primary"
                    size="lg"
                    block
                    :course-id="course.id"
                    @run="runAction"
                  />
                </div>
                <div
                  v-if="moreCtas.length"
                  class="cd-cta-more"
                  :class="{ 'is-pair': moreCtas.length > 1 }"
                >
                  <CtaButton
                    v-for="(a, i) in moreCtas"
                    :key="i"
                    :action="a"
                    block
                    :course-id="course.id"
                    @run="runAction"
                  />
                </div>
              </div>

              <div id="cd-buy-foot" class="cd-buy-foot">
                <template v-if="view.state !== 'ended'">
                  <p v-if="footNote" class="cd-note">
                    <AppIcon name="info" />
                    <span>{{ footNote }}</span>
                  </p>
                  <ul class="cd-perks" role="list">
                    <li v-for="p in perks" :key="p[1]">
                      <AppIcon :name="p[0]" />
                      <span>{{ p[1] }}</span>
                    </li>
                  </ul>
                </template>
                <p v-else-if="footNote" class="cd-note">
                  <AppIcon name="info" />
                  <span>{{ footNote }}</span>
                </p>
              </div>
            </div>
          </div>
        </aside>

        <div class="cd-main">
          <!-- What you will learn -->
          <section class="cd-sec" id="cd-outcomes" aria-labelledby="cd-out-h">
            <div class="cd-sec-head">
              <div>
                <h2 id="cd-out-h" tabindex="-1">{{ t('course.outcomesTitle') }}</h2>
              </div>
            </div>
            <ul class="cd-outcomes" role="list">
              <li v-for="o in course.outcomes" :key="o">
                <AppIcon name="check-circle" />
                <span>{{ o }}</span>
              </li>
            </ul>
          </section>

          <!-- Who it is for -->
          <section class="cd-sec" aria-labelledby="cd-aud-h">
            <div class="cd-sec-head">
              <div>
                <h2 id="cd-aud-h" tabindex="-1">{{ t('course.audienceTitle') }}</h2>
              </div>
            </div>
            <ul class="cd-aud" role="list">
              <li v-for="(a, i) in course.audience" :key="a">
                <span class="cd-aud-ico">
                  <AppIcon :name="AUDIENCE_ICONS[i % AUDIENCE_ICONS.length]!" />
                </span>
                <span>{{ a }}</span>
              </li>
            </ul>
          </section>

          <!-- Curriculum -->
          <section class="cd-sec" id="curriculum" aria-labelledby="cd-cur-h">
            <div class="cd-sec-head">
              <div>
                <h2 id="cd-cur-h" tabindex="-1">{{ t('course.curriculumTitle') }}</h2>
                <p class="cd-sec-sub">
                  {{
                    t('course.curriculumSub', {
                      modules: course.modules.length,
                      lessons: lessons.length,
                      duration: course.durationLabel,
                    })
                  }}
                </p>
              </div>
              <button
                type="button"
                class="cat-textbtn cd-expand"
                data-expand-all
                :aria-controls="course.modules.map((m, i) => `cd-mod-${i + 1}`).join(' ')"
                :aria-expanded="allExpanded ? 'true' : 'false'"
                @click="toggleAll"
              >
                <AppIcon :name="allExpanded ? 'chevron-up' : 'chevron-down'" />{{
                  allExpanded ? t('course.collapseAll') : t('course.expandAll')
                }}
              </button>
            </div>

            <p class="cd-legend" aria-hidden="true">
              <span class="lesson-state lesson-state--preview">
                <AppIcon name="play-circle" />{{ t('course.legendPreview') }}
              </span>
              <span class="lesson-state lesson-state--locked">
                <AppIcon name="lock" />{{ t('course.legendLocked') }}
              </span>
              <span class="lesson-state lesson-state--done">
                <AppIcon name="check-circle" />{{ t('course.legendDone') }}
              </span>
            </p>

            <div class="acc cd-acc">
              <div v-for="(m, mi) in course.modules" :key="m.id" class="acc-item cd-mod">
                <h3 class="cd-mod-h">
                  <button
                    type="button"
                    class="acc-btn"
                    :id="`cd-mod-${mi + 1}-btn`"
                    :aria-expanded="expanded[m.id] ? 'true' : 'false'"
                    :aria-controls="`cd-mod-${mi + 1}`"
                    :data-mod="m.id"
                    @click="expanded[m.id] = !expanded[m.id]"
                  >
                    <span class="cd-mod-num" aria-hidden="true">{{ mi + 1 }}</span>
                    <span class="acc-title"
                      ><span class="sr-only">{{ t('course.moduleNumber', { n: mi + 1 }) }}</span
                      >{{ m.title
                      }}<small class="cd-mod-meta">{{ moduleMeta(m) }}</small></span
                    >
                    <span class="cd-mod-status" :data-mod-status="m.id">
                      <template v-if="showHistory && moduleDone(m)">
                        <span
                          v-if="moduleDone(m) === m.lessons.length"
                          class="cd-mod-done"
                        >
                          <AppIcon name="check-circle" />{{ t('course.moduleAllDone') }}
                        </span>
                        <span v-else class="cd-mod-part"
                          >{{ moduleDone(m) }}/{{ m.lessons.length
                          }}<span class="sr-only">{{ ` ${t('course.moduleDoneSr')}` }}</span></span
                        >
                      </template>
                    </span>
                    <AppIcon name="chevron-down" class="acc-chev" />
                  </button>
                </h3>
                <div
                  class="acc-panel"
                  :id="`cd-mod-${mi + 1}`"
                  role="region"
                  :aria-labelledby="`cd-mod-${mi + 1}-btn`"
                  :hidden="!expanded[m.id]"
                >
                  <ul class="cd-lessons" role="list" :data-mod-list="m.id">
                    <li v-for="l in m.lessons" :key="l.id">
                      <component
                        :is="lessonMode(l) === 'learn' ? 'a' : 'button'"
                        class="lesson cd-lesson"
                        :class="{
                          'is-current': currentLessonId === l.id,
                          'is-locked': !['learn', 'preview'].includes(lessonMode(l)),
                        }"
                        :type="lessonMode(l) === 'learn' ? undefined : 'button'"
                        :href="lessonMode(l) === 'learn' ? lessonHref(l) : undefined"
                        :data-lesson="l.id"
                        :data-mode="lessonMode(l)"
                        :aria-haspopup="
                          lessonMode(l) === 'learn' || lessonMode(l) === 'ended'
                            ? undefined
                            : 'dialog'
                        "
                      >
                        <span class="lesson-ico">
                          <AppIcon :name="(LESSON_TYPE[l.type] ?? LESSON_TYPE.video!).icon" />
                        </span>
                        <span class="lesson-title"
                          >{{ l.title
                          }}<small
                            >{{ lessonSmall(l)
                            }}<template v-if="currentLessonId === l.id"
                              >{{ ' · ' }}<b class="cd-cur-tag">{{
                                t('course.currentTag')
                              }}</b></template
                            ></small
                          ></span
                        >
                        <span class="cd-ls-end">
                          <span class="lesson-dur">{{ lessonDuration(l) }}</span>
                          <template v-if="lessonState(l)">
                            <span
                              class="lesson-state"
                              :class="`lesson-state--${lessonState(l)!.kind}`"
                            >
                              <AppIcon :name="lessonState(l)!.icon" />{{ lessonState(l)!.label }}
                            </span>
                            <template v-if="lessonState(l)!.withLock">
                              <span class="cd-lockmini" aria-hidden="true"
                                ><AppIcon name="lock"
                              /></span>
                              <span class="sr-only">{{ ` (${t('course.stateLocked')})` }}</span>
                            </template>
                          </template>
                        </span>
                      </component>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <!-- How you finish -->
          <section class="cd-sec" aria-labelledby="cd-done-h">
            <div class="cd-sec-head">
              <div>
                <h2 id="cd-done-h" tabindex="-1">{{ t('course.completionTitle') }}</h2>
                <p class="cd-sec-sub">{{ t('course.completionSub') }}</p>
              </div>
            </div>
            <ol class="cd-steps" role="list">
              <li v-for="(step, i) in course.completion" :key="step">
                <span class="cd-step-ico">
                  <AppIcon :name="STEP_ICONS[i % STEP_ICONS.length]!" />
                  <span class="cd-step-n" aria-hidden="true">{{ i + 1 }}</span>
                </span>
                <div class="cd-step-body">
                  <p>{{ step }}</p>
                  <span class="cd-step-status" data-step-status>
                    <template v-if="stepStatuses[i]">
                      <span class="sr-only">{{ t('course.yourStatus') }}</span>
                      <span
                        class="badge"
                        :class="stepStatuses[i]!.kind ? `badge--${stepStatuses[i]!.kind}` : ''"
                      >
                        <AppIcon v-if="stepStatuses[i]!.icon" :name="stepStatuses[i]!.icon" />{{
                          stepStatuses[i]!.label
                        }}
                      </span>
                    </template>
                  </span>
                </div>
              </li>
            </ol>
          </section>

          <!-- Instructors -->
          <section class="cd-sec" aria-labelledby="cd-ins-h">
            <div class="cd-sec-head">
              <div>
                <h2 id="cd-ins-h" tabindex="-1">{{ t('course.instructorsTitle') }}</h2>
                <p class="cd-sec-sub">
                  {{ t('course.instructorsSub', instructors.length) }}
                </p>
              </div>
            </div>
            <ul class="cd-ins" role="list">
              <li v-for="p in instructors" :key="p.id" class="cd-ins-card">
                <AppAvatar
                  :name="p.name"
                  :initials="p.initials"
                  :color="p.color"
                  :photo="p.photo"
                  size="lg"
                />
                <div class="cd-ins-body">
                  <h3 class="cd-ins-name">{{ p.name }}</h3>
                  <span class="badge badge--info"><AppIcon name="briefcase" />{{ p.role }}</span>
                  <p>{{ p.bio }}</p>
                </div>
              </li>
            </ul>
          </section>

          <!-- Course details -->
          <section class="cd-sec" aria-labelledby="cd-info-h">
            <div class="cd-sec-head">
              <div>
                <h2 id="cd-info-h" tabindex="-1">{{ t('course.infoTitle') }}</h2>
              </div>
            </div>
            <div class="cd-info">
              <dl class="kv cd-kv">
                <template v-for="r in infoRows.slice(0, infoHalf)" :key="r.dt">
                  <dt>{{ r.dt }}</dt>
                  <dd>
                    <RouterLink v-if="r.href" class="link" :to="r.href">{{ r.dd }}</RouterLink>
                    <template v-else>{{ r.dd }}</template>
                    <template v-if="r.sub"
                      >{{ ' ' }}<span class="cd-kv-sub">{{ r.sub }}</span></template
                    >
                  </dd>
                </template>
              </dl>
              <dl class="kv cd-kv">
                <template v-for="r in infoRows.slice(infoHalf)" :key="r.dt">
                  <dt>{{ r.dt }}</dt>
                  <dd>
                    <RouterLink v-if="r.href" class="link" :to="r.href">{{ r.dd }}</RouterLink>
                    <template v-else>{{ r.dd }}</template>
                    <template v-if="r.sub"
                      >{{ ' ' }}<span class="cd-kv-sub">{{ r.sub }}</span></template
                    >
                  </dd>
                </template>
              </dl>
            </div>
          </section>
        </div>

        <div class="cd-wide">
          <section class="cd-rec" id="cd-rec" aria-labelledby="cd-rec-h">
            <CourseRail
              id="cd-rec"
              :eyebrow="t('course.recommendedEyebrow')"
              :title="t('course.recommendedTitle')"
              :sub="t('course.recommendedSub')"
              :more-href="path('/courses')"
              :more-label="t('course.viewAllCourses')"
              :count="recommended.length"
            >
              <CourseCard
                v-for="r in recommended"
                :key="r.id"
                :course-id="r.id"
                :reason="r.reason"
                @run="runAction"
              />
            </CourseRail>
          </section>
          <div class="cd-ads"><AdsSlot /></div>
        </div>
      </div>

      <div
        class="sticky-bar cd-bar"
        id="cd-bar"
        role="region"
        :aria-label="t('course.barLabel')"
        :hidden="!showBar"
      >
        <div class="cd-bar-info">
          <AppPrice
            v-if="view.showPrice"
            :price="course.price"
            :normal-price="course.normalPrice"
            :is-free="course.isFree"
          />
          <template v-else-if="view.showProgress">
            <span class="cd-bar-label">{{
              view.progress.pct >= 100 ? t('course.barDone') : t('course.barProgress')
            }}</span>
            <AppProgress
              :value="view.progress.pct"
              :muted="isMuted"
              :label="t('course.progressTitle')"
            />
          </template>
          <span v-else class="cd-bar-label">{{
            view.state === 'ended' ? t('course.barNotForSale') : course.title
          }}</span>
        </div>
        <CtaButton :action="view.primary" :course-id="course.id" @run="runAction" />
      </div>
    </template>
  </div>
</template>
