<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPrice from '@/components/ui/AppPrice.vue'
import AdsSlot from '@/components/ui/AdsSlot.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import CourseRail from '@/components/course/CourseRail.vue'
import LessonPreviewDialog from '@/components/course/LessonPreviewDialog.vue'
import { ApiError, api, mediaUrl } from '@/lib/api'
import type { Curriculum, CurriculumLesson, PublicCategory, PublicCourseDetail } from '@/lib/api'
import { categoryLabel, courseView, personOf } from '@/lib/course'
import { dateLong, minutes } from '@/lib/format'

/**
 * One course, in full — the sales page a visitor reads before buying.
 *
 * It is public throughout. The prototype's version also showed the signed-in
 * learner's own state: a progress bar instead of the price, where to resume,
 * which lessons were finished, how far through the completion steps they were.
 * None of that is here, because none of it exists yet — entitlements and lesson
 * progress need a student API that has not been written, and a bar drawn from
 * the prototype's localStorage would be claiming progress on a purchase that
 * never happened.
 *
 * So what a lesson row offers has two answers rather than six: a free sample is
 * marked as one, and everything else is locked until the course is bought.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const LESSON_TYPE: Record<string, { icon: string; label: string }> = {
  video: { icon: 'play-circle', label: 'course.lessonTypeVideo' },
  document: { icon: 'file-text', label: 'course.lessonTypeDocument' },
  quiz: { icon: 'clipboard-check', label: 'course.lessonTypeQuiz' },
  essay: { icon: 'pen', label: 'course.lessonTypeEssay' },
  live: { icon: 'video', label: 'course.lessonTypeLive' },
}
const AUDIENCE_ICONS = ['users', 'graduation', 'briefcase', 'compass']

/** A slug, or an id. The API accepts either and both appear in links. */
const courseRef = computed(() => String(route.params.id ?? '').trim().slice(0, 255))

const course = ref<PublicCourseDetail | null>(null)
const curriculum = ref<Curriculum | null>(null)
const categories = ref<PublicCategory[]>([])
/** Each with why it is here, because "same category" is only true of the
 *  first few: see `loadRelated`. */
type RelatedScope = 'category' | 'family' | 'popular'
const related = ref<{ course: PublicCourseDetail; why: RelatedScope }[]>([])
const loading = ref(true)
/** Told apart on purpose: "no such course" is the visitor's to fix and "could
 *  not load" is ours, and they do not deserve the same page. */
const missing = ref(false)
const failed = ref(false)

const category = computed(() => {
  const id = course.value?.categoryId
  return id ? (categories.value.find((c) => c.id === id) ?? null) : null
})

const categoryName = computed(() =>
  category.value
    ? categoryLabel(category.value, categories.value)
    : (course.value?.categoryName ?? ''),
)

const categoryIcon = computed(
  () =>
    category.value?.icon ??
    categories.value.find((c) => c.id === category.value?.parentId)?.icon ??
    'book-open',
)

/** The same mapping the cards use, so this page and the card that linked to it
 *  cannot describe one course two ways. */
const view = computed(() =>
  course.value
    ? courseView(course.value, { locale: locale.value, t, categories: categories.value })
    : null,
)

const instructors = computed(() =>
  (course.value?.instructors ?? []).map((i) => ({
    ...personOf(i),
    headline: i.headline,
    bio: (i as { bio?: string | null }).bio ?? null,
    credentials: (i as { credentials?: string | null }).credentials ?? null,
    yearsExperience: (i as { yearsExperience?: number | null }).yearsExperience ?? null,
  })),
)

/** Lessons in the order someone would take them: each chapter's, then any
 *  that sit on the course itself. */
const lessons = computed<CurriculumLesson[]>(() => {
  const c = curriculum.value
  if (!c) return []
  return [...c.modules.flatMap((m) => m.lessons), ...c.loose]
})

/**
 * The curriculum as chapters, with any loose lessons gathered into one last
 * chapter of their own.
 *
 * The admin allows a lesson to sit directly on a course, so the page has to
 * show one: a lesson left off this list is a lesson the buyer did not know
 * they were getting.
 */
const chapters = computed(() => {
  const c = curriculum.value
  if (!c) return []
  const out = c.modules.map((m) => ({ id: `m${m.id}`, title: m.title, lessons: m.lessons }))
  if (c.loose.length) out.push({ id: 'loose', title: t('course.looseModule'), lessons: c.loose })
  return out
})

const previewLesson = computed(() => lessons.value.find((l) => l.isPreview) ?? null)

/* ---------------- the free sample ---------------- */

const openLesson = ref<CurriculumLesson | null>(null)

function openPreview(lesson: CurriculumLesson): void {
  openLesson.value = lesson
}

/* ---------------- loading ---------------- */

let seq = 0

async function load(): Promise<void> {
  const mine = ++seq
  loading.value = true
  missing.value = false
  failed.value = false

  try {
    const [detail, cats] = await Promise.all([
      api.course(courseRef.value) as Promise<{ data: PublicCourseDetail }>,
      categories.value.length ? Promise.resolve({ data: categories.value }) : api.categories(),
    ])
    if (mine !== seq) return
    course.value = detail.data
    categories.value = cats.data

    // Neither of these is worth failing the page over: a course whose
    // curriculum did not load still has a price and a buy button.
    const [cur, rail] = await Promise.all([
      api.curriculum(detail.data.id).catch(() => null),
      loadRelated(detail.data),
    ])
    if (mine !== seq) return
    curriculum.value = cur?.data ?? null
    related.value = rail
    openFirstChapter()
  } catch (err) {
    if (mine !== seq) return
    course.value = null
    if (err instanceof ApiError && err.status === 404) missing.value = true
    else failed.value = true
  } finally {
    if (mine === seq) loading.value = false
  }
}

const RAIL_MIN = 4
const RAIL_MAX = 8

/**
 * Courses to put beside this one.
 *
 * The nearest thing first — the same category — but a category can hold one
 * course, and "คันจิ" does: a rail that only ever shows its own category is an
 * empty rail on most pages. So it widens by a step at a time, from the
 * category to its siblings under the same parent and then to the catalog at
 * large, and stops as soon as it has enough. Someone reading about a kanji
 * course is served by more Japanese courses; they are not served by a heading
 * with nothing under it.
 */
async function loadRelated(
  detail: PublicCourseDetail,
): Promise<{ course: PublicCourseDetail; why: RelatedScope }[]> {
  const found = new Map<number, { course: PublicCourseDetail; why: RelatedScope }>()

  const add = async (ids: number[] | undefined, why: RelatedScope) => {
    if (found.size >= RAIL_MIN) return
    if (ids && !ids.length) return
    const res = await api
      .courses({ ...(ids ? { categoryIds: ids } : {}), perPage: 12, sort: 'popularity' })
      .catch(() => null)
    for (const c of (res?.data ?? []) as PublicCourseDetail[]) {
      if (c.id !== detail.id && !found.has(c.id)) found.set(c.id, { course: c, why })
    }
  }

  const own = detail.categoryId
  if (own) await add([own], 'category')

  // The siblings: everything under the same parent, the parent itself
  // included, since a course can be filed on either.
  const cat = categories.value.find((c) => c.id === own)
  const parentId = cat?.parentId ?? (cat ? cat.id : null)
  if (parentId) {
    const family = categories.value
      .filter((c) => c.id === parentId || c.parentId === parentId)
      .map((c) => c.id)
      .filter((id) => id !== own)
    await add(family, 'family')
  }

  await add(undefined, 'popular')

  return [...found.values()].slice(0, RAIL_MAX)
}

/** The rail on the "no such course" page: simply the most popular courses,
 *  since there is no category to be near. */
const fallbackRail = ref<PublicCourseDetail[]>([])

async function loadFallbackRail(): Promise<void> {
  try {
    const [res, cats] = await Promise.all([
      api.courses({ perPage: 8, sort: 'popularity' }),
      categories.value.length ? Promise.resolve({ data: categories.value }) : api.categories(),
    ])
    fallbackRail.value = res.data as PublicCourseDetail[]
    categories.value = cats.data
  } catch {
    // The page still says the course does not exist, which is its job.
  }
}

watch(missing, (yes) => {
  if (yes && !fallbackRail.value.length) void loadFallbackRail()
})

watch(courseRef, () => {
  expanded.value = {}
  void load()
  window.scrollTo({ top: 0 })
})

/* ---------------- hero ---------------- */

const heroMeta = computed(() => {
  const c = course.value
  const v = view.value
  if (!c || !v) return []
  const out: [string, string][] = []
  if (c.updatedAt) out.push(['calendar', t('course.updatedAt', { date: dateLong(c.updatedAt) })])
  if (v.levelLabel) out.push(['signal', t('course.level', { level: v.levelLabel })])
  out.push(['clock', v.durationLabel])
  out.push(['mic', v.spokenLabel])
  out.push(['book-open', t('course.lessonCount', { count: c.lessonCount })])
  return out
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
  const label = t('course.previewLesson')
  return l.durationSeconds ? `${label} · ${minutes(l.durationSeconds)}` : label
})

/** The free sample, if the school uploaded one. Played in place, because it is
 *  marketing and sending somebody to another page for it loses them. */
const sampleUrl = computed(() =>
  course.value?.sampleVideoPath ? mediaUrl(course.value.sampleVideoPath) : null,
)
const samplePlaying = ref(false)

const perks = computed(() => {
  const c = course.value
  if (!c) return []
  const out: [string, string][] = [
    [
      'calendar',
      c.price === 0
        ? t('course.perkFree')
        : c.accessType === 'limited' && c.accessDurationDays
          ? t('course.perkAccessDays', { days: c.accessDurationDays })
          : t('course.perkLifetime'),
    ],
    ['monitor', t('course.perkAnyDevice')],
  ]
  if (c.inPackage) out.push(['package', t('course.perkInPackage')])
  return out
})

const moreCtas = computed(() => (view.value?.secondary ? [view.value.secondary] : []))

/** A course that is no longer sold. The panel says so outright rather than
 *  offering a button that cannot work. */
const notForSale = computed(
  () => Boolean(course.value) && !course.value!.sellable && course.value!.price > 0,
)

/* ---------------- curriculum ---------------- */

const expanded = ref<Record<string, boolean>>({})

/** The first chapter is open on arrival, so the section reads as a list of
 *  lessons rather than a row of closed bars. */
function openFirstChapter(): void {
  const first = chapters.value[0]
  if (first) expanded.value[first.id] = true
}

const allExpanded = computed(
  () => chapters.value.length > 0 && chapters.value.every((m) => expanded.value[m.id]),
)

function toggleAll(): void {
  const open = !allExpanded.value
  for (const m of chapters.value) expanded.value[m.id] = open
}

function chapterMeta(within: CurriculumLesson[]): string {
  const sec = within.reduce((sum, l) => sum + (l.durationSeconds || 0), 0)
  const count = t('course.lessonCount', { count: within.length })
  return sec ? `${count} · ${minutes(sec)}` : count
}

function lessonSmall(l: CurriculumLesson): string {
  const type = LESSON_TYPE[l.type] ?? LESSON_TYPE.video!
  let out = t(type.label)
  if (l.subtitle) out += ` · ${l.subtitle}`
  return out
}

function lessonDuration(l: CurriculumLesson): string {
  return l.durationSeconds ? minutes(l.durationSeconds) : ''
}

/* ---------------- course info ---------------- */

interface InfoRow {
  dt: string
  dd: string
  sub?: string
  href?: string
}

const infoRows = computed<InfoRow[]>(() => {
  const c = course.value
  const v = view.value
  if (!c || !v) return []

  const rows: InfoRow[] = []
  if (categoryName.value) {
    rows.push({
      dt: t('course.infoCategory'),
      dd: categoryName.value,
      href: c.categoryId ? `${path('/courses')}?category=${c.categoryId}` : undefined,
    })
  }
  if (v.levelLabel) rows.push({ dt: t('course.infoLevel'), dd: v.levelLabel })
  rows.push({ dt: t('course.infoDuration'), dd: v.durationLabel })
  rows.push({
    dt: t('course.infoLessons'),
    dd: t('course.lessonCount', { count: c.lessonCount }),
    sub: curriculum.value?.modules.length
      ? t('course.infoLessonsSub', { modules: curriculum.value.modules.length })
      : undefined,
  })
  rows.push({ dt: t('course.infoLanguage'), dd: v.spokenLabel })
  if (c.updatedAt) rows.push({ dt: t('course.infoUpdated'), dd: dateLong(c.updatedAt) })
  rows.push({
    dt: t('course.infoAccess'),
    dd:
      c.price === 0
        ? t('course.infoAccessFree')
        : c.accessType === 'limited' && c.accessDurationDays
          ? t('course.infoAccessDays', { days: c.accessDurationDays })
          : t('course.perkLifetime'),
    sub: c.price > 0 && c.inPackage ? t('course.infoAccessPackageSub') : undefined,
  })
  rows.push({
    dt: t('course.infoInPackage'),
    dd: c.inPackage ? t('course.yes') : t('course.no'),
    sub: c.inPackage
      ? t('course.infoPackagePaid')
      : c.price === 0
        ? t('course.infoPackageNoFree')
        : t('course.infoPackageNoCourse'),
  })
  if (c.status === 'ended') rows.push({ dt: t('course.infoStatus'), dd: t('course.infoEndedPlain') })
  return rows
})

const infoHalf = computed(() => Math.ceil(infoRows.value.length / 2))

/* ---------------- recommended ---------------- */

/** The little line above a card's title says why it is being shown, which has
 *  to be the truth for that card rather than for the first one. */
const relatedCards = computed(() =>
  related.value.map(({ course: c, why }) => ({
    view: courseView(c, { locale: locale.value, t, categories: categories.value }),
    reason:
      why === 'category' && categoryName.value
        ? t('course.sameCategoryReason', { name: categoryName.value })
        : why === 'family' && parentName.value
          ? t('course.sameFamilyReason', { name: parentName.value })
          : t('course.popularReason'),
  })),
)

/** The parent category's name — "ภาษาญี่ปุ่น" for a course filed under
 *  "คันจิ" — used to say what a widened rail has in common. */
const parentName = computed(() => {
  const cat = category.value
  if (!cat) return ''
  const parent = cat.parentId ? categories.value.find((c) => c.id === cat.parentId) : cat
  return parent?.name ?? ''
})

const fallbackCards = computed(() =>
  fallbackRail.value.map((c) =>
    courseView(c, { locale: locale.value, t, categories: categories.value }),
  ),
)

/* ---------------- the mobile bottom bar ---------------- */

const stacked = ref(false)
const ctaVisible = ref(true)
const ctasEl = ref<HTMLElement | null>(null)
let mq: MediaQueryList | undefined
let io: IntersectionObserver | undefined

/** The bar only earns its place once the real CTAs have scrolled away, and
 *  only on the layouts where the purchase panel is not pinned beside the
 *  content. */
const showBar = computed(() => stacked.value && !ctaVisible.value && Boolean(view.value))

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

onMounted(async () => {
  document.body.classList.add('page-course')
  mq = window.matchMedia('(max-width: 959px)')
  stacked.value = mq.matches
  mq.addEventListener('change', onMqChange)
  await load()
  observeCtas()
})

onBeforeUnmount(() => {
  document.body.classList.remove('page-course', 'has-bottom-bar')
  mq?.removeEventListener('change', onMqChange)
  io?.disconnect()
})

watch(ctasEl, observeCtas)

/* ---------------- actions ---------------- */

/**
 * The cart and free enrolment both need an account and a student API that does
 * not exist yet, so every one of them goes the single way that works today:
 * straight to checkout with this course.
 */
function runAction(action: string, courseId?: string): void {
  const cid = courseId ?? course.value?.slug ?? courseRef.value
  if (action === 'buy' || action === 'add-cart' || action === 'enroll-free') {
    void router.push({ path: path('/checkout'), query: { items: cid } })
  }
}

/** The hero's instructor row opens nothing: it takes you to the section that
 *  already says everything a dialog would have. */
function toInstructors(): void {
  document.getElementById('cd-ins-h')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <div class="cd-root" id="cd-root">
    <!-- Loading -->
    <section v-if="loading" class="page-hero" aria-busy="true">
      <div class="container">
        <p class="cd-loading">{{ t('course.loading') }}</p>
      </div>
    </section>

    <!-- No such course -->
    <template v-else-if="missing">
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
              {{
                courseRef ? t('course.notFoundWithId', { id: courseRef }) : t('course.notFoundNoId')
              }}
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
      <section
        v-if="fallbackCards.length"
        class="container cd-nf-rec"
        id="cd-nf-rec"
        aria-labelledby="nf-rec-h"
      >
        <CourseRail
          id="nf-rec"
          :eyebrow="t('course.recommendedEyebrow')"
          :title="t('course.recommendedTitle')"
          :sub="t('course.notFoundRailSub')"
          :more-href="path('/courses')"
          :more-label="t('course.viewAllCourses')"
          :count="fallbackCards.length"
        >
          <CourseCard v-for="c in fallbackCards" :key="c.id" :view="c" />
        </CourseRail>
      </section>
    </template>

    <!-- Could not load -->
    <section
      v-else-if="failed || !course || !view"
      class="page-hero cd-err"
      aria-labelledby="cd-err-h"
    >
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
          </ol>
        </nav>
        <h1 class="sr-only" id="cd-err-h">{{ t('course.errorTitle') }}</h1>
        <div class="state-box state-box--error" role="alert">
          <div class="state-ico"><AppIcon name="wifi-off" /></div>
          <h3>{{ t('course.errorTitle') }}</h3>
          <p>{{ t('course.errorText') }}</p>
          <div class="state-actions">
            <button type="button" class="btn btn--primary" data-retry="course" @click="load()">
              <AppIcon name="refresh" />{{ t('course.retry') }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <template v-else>
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
              <li v-if="categoryName">
                <AppIcon name="chevron-right" />
                <RouterLink :to="`${path('/courses')}?category=${course.categoryId}`">{{
                  categoryName
                }}</RouterLink>
              </li>
              <li>
                <AppIcon name="chevron-right" />
                <span aria-current="page">{{ course.title }}</span>
              </li>
            </ol>
          </nav>

          <div class="cd-tags">
            <RouterLink
              v-if="categoryName"
              class="cd-cat"
              :to="`${path('/courses')}?category=${course.categoryId}`"
            >
              <AppIcon :name="categoryIcon" />
              <span>{{ categoryName }}</span>
              <span class="sr-only">{{ ` ${t('course.catViewCourses')}` }}</span>
            </RouterLink>
            <span class="cd-badges" id="cd-badges">
              <AppBadge v-for="(b, i) in view.badges" :key="i" :badge="b" />
              <AppBadge
                v-if="course.inPackage"
                :badge="{ kind: 'package', text: t('course.inPackageBadge'), icon: 'package' }"
              />
            </span>
          </div>

          <h1 class="cd-title">{{ course.title }}</h1>
          <p class="cd-lead">{{ course.shortDesc }}</p>

          <button
            v-if="instructors.length"
            type="button"
            class="cd-inst"
            data-act="instructors"
            :data-cid="course.slug"
            @click="toInstructors"
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
                t('course.instructorCount', { count: instructors.length })
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
              <video
                v-if="samplePlaying && sampleUrl"
                class="cd-sample"
                :src="sampleUrl"
                controls
                autoplay
                playsinline
                controlslist="nodownload noplaybackrate"
                disablepictureinpicture
                disableremoteplayback
                @contextmenu.prevent
              />
              <template v-else>
                <CourseImage
                  :image="view.image"
                  :width="768"
                  :height="432"
                  :art-icon="categoryIcon"
                  :art-palette="view.categoryPalette"
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
                  v-else-if="sampleUrl"
                  type="button"
                  class="cd-media-play"
                  data-preview="sample"
                  @click="samplePlaying = true"
                >
                  <span class="cd-play-ico"><AppIcon name="play" /></span>
                  <span class="cd-play-cap">
                    <AppIcon name="play-circle" />
                    <span>{{ t('course.sampleVideo') }}</span>
                  </span>
                </button>
                <!-- No uploaded sample for the course, but a lesson is marked
                     as one: the same button, opening that lesson instead. -->
                <button
                  v-else-if="previewLesson"
                  type="button"
                  class="cd-media-play"
                  :data-preview="previewLesson.id"
                  aria-haspopup="dialog"
                  @click="openPreview(previewLesson)"
                >
                  <span class="cd-play-ico"><AppIcon name="play" /></span>
                  <span class="cd-play-cap">
                    <AppIcon name="play-circle" />
                    <span>{{ previewCaption }}</span>
                  </span>
                  <span class="sr-only">: {{ previewLesson.title }}</span>
                </button>
              </template>
            </div>

            <div class="cd-buy">
              <div id="cd-buy-top" class="cd-buy-top">
                <div class="cd-price">
                  <AppPrice
                    :price="view.price"
                    :normal-price="view.normalPrice"
                    :is-free="view.isFree"
                    lg
                  />
                  <span v-if="discount" class="badge badge--bestseller cd-off">{{
                    t('course.discountOff', { percent: discount })
                  }}</span>
                </div>
              </div>

              <div class="cd-ctas" id="cd-ctas" ref="ctasEl">
                <div class="cd-cta-primary" data-cta-primary tabindex="-1">
                  <CtaButton
                    :action="view.primary"
                    size="lg"
                    block
                    :course-id="course.slug"
                    @run="runAction"
                  />
                </div>
                <div v-if="moreCtas.length" class="cd-cta-more">
                  <CtaButton
                    v-for="(a, i) in moreCtas"
                    :key="i"
                    :action="a"
                    block
                    :course-id="course.slug"
                    @run="runAction"
                  />
                </div>
              </div>

              <div id="cd-buy-foot" class="cd-buy-foot">
                <p v-if="notForSale" class="cd-note">
                  <AppIcon name="info" />
                  <span>{{ t('course.notForSaleNote') }}</span>
                </p>
                <ul v-else class="cd-perks" role="list">
                  <li v-for="p in perks" :key="p[1]">
                    <AppIcon :name="p[0]" />
                    <span>{{ p[1] }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </aside>

        <div class="cd-main">
          <!-- What you will learn -->
          <section
            v-if="course.outcomes?.length"
            class="cd-sec"
            id="cd-outcomes"
            aria-labelledby="cd-out-h"
          >
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
          <section v-if="course.audience?.length" class="cd-sec" aria-labelledby="cd-aud-h">
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

          <!-- About the course. Written in the admin's own editor, so the
               markup is the school's — the same trust as the rest of the site. -->
          <section v-if="course.description" class="cd-sec" aria-labelledby="cd-desc-h">
            <div class="cd-sec-head">
              <div>
                <h2 id="cd-desc-h" tabindex="-1">{{ t('course.descriptionTitle') }}</h2>
              </div>
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="cd-prose" v-html="course.description" />
          </section>

          <!-- Curriculum -->
          <section v-if="chapters.length" class="cd-sec" id="curriculum" aria-labelledby="cd-cur-h">
            <div class="cd-sec-head">
              <div>
                <h2 id="cd-cur-h" tabindex="-1">{{ t('course.curriculumTitle') }}</h2>
                <p class="cd-sec-sub">
                  {{
                    t('course.curriculumSub', {
                      modules: chapters.length,
                      lessons: lessons.length,
                      duration: view.durationLabel,
                    })
                  }}
                </p>
              </div>
              <button
                type="button"
                class="cat-textbtn cd-expand"
                data-expand-all
                :aria-controls="chapters.map((m, i) => `cd-mod-${i + 1}`).join(' ')"
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
            </p>

            <div class="acc cd-acc">
              <div v-for="(m, mi) in chapters" :key="m.id" class="acc-item cd-mod">
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
                      }}<small class="cd-mod-meta">{{ chapterMeta(m.lessons) }}</small></span
                    >
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
                      <!-- A sample is a button and opens; everything else is a
                           row of text, because there is nothing behind it to
                           open until the course is bought. -->
                      <component
                        :is="l.isPreview ? 'button' : 'div'"
                        class="lesson cd-lesson"
                        :class="{ 'is-locked': !l.isPreview }"
                        :type="l.isPreview ? 'button' : undefined"
                        :aria-haspopup="l.isPreview ? 'dialog' : undefined"
                        :data-lesson="l.id"
                        :data-mode="l.isPreview ? 'preview' : 'locked'"
                        @click="l.isPreview && openPreview(l)"
                      >
                        <span class="lesson-ico">
                          <AppIcon :name="(LESSON_TYPE[l.type] ?? LESSON_TYPE.video!).icon" />
                        </span>
                        <span class="lesson-title"
                          >{{ l.title }}<small>{{ lessonSmall(l) }}</small></span
                        >
                        <span class="cd-ls-end">
                          <span v-if="lessonDuration(l)" class="lesson-dur">{{
                            lessonDuration(l)
                          }}</span>
                          <span
                            class="lesson-state"
                            :class="`lesson-state--${l.isPreview ? 'preview' : 'locked'}`"
                          >
                            <AppIcon :name="l.isPreview ? 'play-circle' : 'lock'" />{{
                              l.isPreview ? t('course.statePreview') : t('course.stateLocked')
                            }}
                          </span>
                        </span>
                      </component>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <!-- Instructors -->
          <section v-if="instructors.length" class="cd-sec" aria-labelledby="cd-ins-h">
            <div class="cd-sec-head">
              <div>
                <h2 id="cd-ins-h" tabindex="-1">{{ t('course.instructorsTitle') }}</h2>
                <p class="cd-sec-sub">
                  {{ t('course.instructorsSub', { count: instructors.length }) }}
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
                  <span v-if="p.headline" class="badge badge--info"
                    ><AppIcon name="briefcase" />{{ p.headline }}</span
                  >
                  <span v-if="p.yearsExperience" class="badge badge--info"
                    ><AppIcon name="clock" />{{
                      t('course.yearsTeaching', { years: p.yearsExperience })
                    }}</span
                  >
                  <p v-if="p.bio">{{ p.bio }}</p>
                  <p v-if="p.credentials" class="cd-ins-cred">
                    <AppIcon name="award" /><span>{{ p.credentials }}</span>
                  </p>
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
          <section v-if="relatedCards.length" class="cd-rec" id="cd-rec" aria-labelledby="cd-rec-h">
            <CourseRail
              id="cd-rec"
              :eyebrow="t('course.recommendedEyebrow')"
              :title="t('course.recommendedTitle')"
              :sub="t('course.recommendedSub')"
              :more-href="path('/courses')"
              :more-label="t('course.viewAllCourses')"
              :count="relatedCards.length"
            >
              <CourseCard
                v-for="r in relatedCards"
                :key="r.view.id"
                :view="r.view"
                :reason="r.reason"
              />
            </CourseRail>
          </section>
          <div class="cd-ads"><AdsSlot placement="course" /></div>
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
            v-if="!notForSale"
            :price="view.price"
            :normal-price="view.normalPrice"
            :is-free="view.isFree"
          />
          <span v-else class="cd-bar-label">{{ t('course.barNotForSale') }}</span>
        </div>
        <CtaButton :action="view.primary" :course-id="course.slug" @run="runAction" />
      </div>

      <LessonPreviewDialog
        :open="openLesson !== null"
        :course-ref="course.slug"
        :lesson-id="openLesson?.id ?? null"
        :course-title="course.title"
        :lesson-title="openLesson?.title ?? ''"
        :cover="view.image"
        :art-icon="categoryIcon"
        :art-palette="view.categoryPalette"
        :curriculum-href="`${path(`/courses/${course.slug}`)}#curriculum`"
        @close="openLesson = null"
      />
    </template>
  </div>
</template>
