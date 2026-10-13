<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import AdsSlot from '@/components/ui/AdsSlot.vue'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppProgress from '@/components/ui/AppProgress.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import InstructorLine from '@/components/course/InstructorLine.vue'
import { ApiError, api, mediaUrl, type MyCourseItem, type PublicCategory } from '@/lib/api'
import { courseView } from '@/lib/course'
import { useAuthStore } from '@/stores/auth'
import { relative } from '@/lib/format'

/**
 * The account landing page: who you are, where you had got to, and what is
 * left to carry on with.
 *
 * Everything here comes off `/me/courses`, which is the same list "คอร์สของฉัน"
 * is drawn from — so the count on this page and the count on that one cannot
 * disagree, which is exactly what happened while this page read a fixture.
 *
 * Three things the prototype had are deliberately not here. Certificates and
 * CE are not issued by this school. Packages are not on sale — the API refuses
 * to put one in a basket — so a card announcing somebody's package would be
 * describing something nobody can have. And notifications have no API behind
 * them yet; an invented one is worse than a quiet page.
 */
const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const items = ref<MyCourseItem[]>([])
const categories = ref<PublicCategory[]>([])
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [mine, cats] = await Promise.all([
      api.myCourses(),
      api.categories().then((r) => r.data).catch(() => []),
    ])
    items.value = mine.data
    categories.value = cats
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('account.learning.loadFailed')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // The shell already sends a signed-out visitor to the dialog; there is
  // nothing to ask for until there is somebody to ask about.
  if (auth.isLoggedIn) void load()
  else loading.value = false
})

/* ---------------- who you are ---------------- */

const user = computed(() => {
  const u = auth.user
  return {
    name: auth.displayName,
    initials: `${u?.firstName?.[0] ?? ''}${u?.lastName?.[0] ?? ''}`.trim(),
    roleLabel: u?.roles.includes('teacher') ? t('auth.memberTeacher') : t('auth.memberStudent'),
  }
})
const photo = computed(() =>
  auth.user?.avatarPath ? mediaUrl(auth.user.avatarPath) : null,
)

/* ---------------- how far along ---------------- */

const inProgress = computed(() => items.value.filter((i) => i.group === 'in-progress'))
const notStarted = computed(() => items.value.filter((i) => i.group === 'not-started'))

/** Counted on progress rather than on the group, so a course you finished and
 *  then lost access to still counts as finished — which is how it feels. */
const completed = computed(() => items.value.filter((i) => i.progress.pct >= 100))

/**
 * One number for the shelf: lessons done over lessons there are.
 *
 * Averaging the per-course percentages would let a three-lesson course weigh
 * as much as a forty-lesson one, and then finishing the short one would move
 * the bar further than a week on the long one.
 */
const overall = computed(() => {
  const total = items.value.reduce((n, i) => n + i.progress.total, 0)
  const done = items.value.reduce((n, i) => n + i.progress.done, 0)
  return total > 0 ? Math.round((done / total) * 100) : 0
})

/** Most recently touched first: the row you want is the one you left. A course
 *  never opened has no date, and sorts below the ones that have. */
const resumeRows = computed(() =>
  [...inProgress.value, ...notStarted.value]
    .filter((i) => i.blocked === null && i.progress.resume !== null)
    .sort((a, b) =>
      String(b.progress.lastStudiedAt ?? '').localeCompare(String(a.progress.lastStudiedAt ?? '')),
    )
    .slice(0, 3),
)

function viewOf(item: MyCourseItem) {
  return courseView(item.course, { locale: locale.value, t, categories: categories.value })
}

function resumeLabel(item: MyCourseItem): string {
  const r = item.progress.resume
  if (!r) return ''
  return r.type === 'quiz' ? t('account.overview.quizLesson') : r.title
}

function learnHref(item: MyCourseItem): string {
  const lesson = item.progress.resume?.id
  return path(`/learn/${item.course.slug}${lesson ? `?lesson=${lesson}` : ''}`)
}
</script>

<template>
  <AccountShell page="overview">
    <div class="acct-stack">
      <!-- Who you are -->
      <section class="acct-sec" id="ov-welcome" aria-labelledby="ov-welcome-h">
        <div class="acct-welcome">
          <div class="acct-welcome-av">
            <!-- AppAvatar stops at `lg`; the extra class is what reaches the
                 88px the welcome card is drawn at. -->
            <AppAvatar
              :name="user.name"
              :initials="user.initials"
              :photo="photo"
              extra-class="avatar--xl"
            />
          </div>
          <div class="acct-welcome-body">
            <p class="eyebrow">My Account</p>
            <h2 id="ov-welcome-h">{{ t('account.overview.hello', { name: user.name }) }}</h2>
            <ul class="acct-welcome-meta" role="list">
              <li>
                <AppIcon name="user" />
                <span>{{ user.roleLabel }}</span>
              </li>
              <li v-if="!loading && items.length">
                <AppIcon name="book-open" />
                <span>{{ t('account.overview.allCourses', { count: items.length }) }}</span>
              </li>
            </ul>
          </div>
          <RouterLink
            class="btn btn--secondary btn--sm acct-welcome-edit"
            :to="path('/account/profile')"
          >
            <AppIcon name="settings" />{{ t('account.nav.profile') }}
          </RouterLink>
        </div>
      </section>

      <div class="acct-ads" id="ov-ads"><AdsSlot placement="account" /></div>

      <div v-if="error" class="state-box state-box--plain">
        <div class="state-ico"><AppIcon name="alert-circle" /></div>
        <h3>{{ t('account.learning.loadFailed') }}</h3>
        <p>{{ error }}</p>
        <div class="state-actions">
          <button type="button" class="btn btn--secondary" @click="load">
            {{ t('course.retry') }}
          </button>
        </div>
      </div>

      <template v-else-if="!loading && items.length">
        <!-- How far along -->
        <section class="acct-sec" aria-labelledby="ov-sum-h">
          <h2 class="sr-only" id="ov-sum-h">{{ t('account.overview.summary') }}</h2>
          <div id="ov-stats">
            <div class="acct-stats">
              <RouterLink
                class="acct-stat acct-stat--third"
                :to="path('/account/learning')"
              >
                <span class="acct-stat-top">
                  <span class="stat-ico acct-ico--violet" aria-hidden="true">
                    <AppIcon name="book-open" />
                  </span>
                  <AppBadge
                    :badge="{
                      kind: overall >= 100 ? 'done' : 'progress',
                      icon: overall >= 100 ? 'check-circle' : 'play-circle',
                      text: t('account.overview.overallPct', { pct: overall }),
                    }"
                  />
                </span>
                <span class="stat-label">{{ t('account.overview.shelfLabel') }}</span>
                <span class="acct-stat-name">
                  {{ t('account.overview.allCourses', { count: items.length }) }}
                </span>
                <span class="acct-stat-sub">
                  {{ t('account.overview.lessonsDone', {
                    done: items.reduce((n, i) => n + i.progress.done, 0),
                    total: items.reduce((n, i) => n + i.progress.total, 0),
                  }) }}
                </span>
                <div class="acct-meter" aria-hidden="true">
                  <span :style="{ '--p': `${overall}%` }"></span>
                </div>
                <span class="acct-stat-go">
                  {{ t('account.nav.learning') }}
                  <AppIcon name="arrow-right" />
                </span>
              </RouterLink>

              <RouterLink
                class="acct-stat acct-stat--sm"
                :to="`${path('/account/learning')}?tab=in-progress`"
              >
                <span class="stat-ico acct-ico--blue" aria-hidden="true">
                  <AppIcon name="play-circle" />
                </span>
                <span class="stat-value tabular">
                  {{ inProgress.length }}<small>{{ t('account.courseUnit') }}</small>
                </span>
                <span class="stat-label">{{ t('account.group.inProgress') }}</span>
              </RouterLink>

              <RouterLink
                class="acct-stat acct-stat--sm"
                :to="`${path('/account/learning')}?tab=completed`"
              >
                <span class="stat-ico acct-ico--success" aria-hidden="true">
                  <AppIcon name="check-circle" />
                </span>
                <span class="stat-value tabular">
                  {{ completed.length }}<small>{{ t('account.courseUnit') }}</small>
                </span>
                <span class="stat-label">{{ t('account.group.completedShort') }}</span>
              </RouterLink>
            </div>
          </div>
        </section>

        <!-- Carry on where you stopped -->
        <section class="acct-sec" id="ov-continue" aria-labelledby="ov-cont-h">
          <div class="acct-sec-head">
            <div class="acct-sec-title">
              <p class="eyebrow">Continue Learning</p>
              <h2 id="ov-cont-h" tabindex="-1">
                <span>{{ t('account.overview.continueTitle') }}</span>
              </h2>
              <p v-if="resumeRows.length" class="acct-sec-sub">
                {{ t('account.overview.continueSub') }}
              </p>
            </div>
            <div v-if="resumeRows.length" class="acct-sec-tools">
              <RouterLink class="link-arrow" :to="path('/account/learning')">
                {{ t('account.overview.allCourses', { count: items.length }) }}
                <AppIcon name="arrow-right" />
              </RouterLink>
            </div>
          </div>

          <div v-if="resumeRows.length" class="acct-rs-list">
            <article
              v-for="item in resumeRows"
              :key="item.entitlementId"
              class="acct-rs"
              :aria-labelledby="`rs-${item.course.id}`"
            >
              <RouterLink
                class="acct-rs-media"
                :to="path(`/courses/${item.course.slug}`)"
                tabindex="-1"
                aria-hidden="true"
              >
                <CourseImage
                  :image="viewOf(item).image"
                  :width="400"
                  :height="225"
                  :art-icon="viewOf(item).categoryIcon"
                  :art-palette="viewOf(item).categoryPalette"
                />
              </RouterLink>

              <div class="acct-rs-body">
                <div class="acct-chips">
                  <span class="acct-cat">{{ viewOf(item).categoryName }}</span>
                  <AppBadge
                    :badge="{
                      kind: item.group === 'in-progress' ? 'progress' : 'info',
                      icon: item.group === 'in-progress' ? 'play-circle' : 'circle',
                      text:
                        item.group === 'in-progress'
                          ? t('account.group.inProgress')
                          : t('account.learning.notStartedBadge'),
                    }"
                  />
                </div>
                <h3 class="acct-rs-title" :id="`rs-${item.course.id}`">
                  <RouterLink :to="path(`/courses/${item.course.slug}`)">
                    {{ item.course.title }}
                  </RouterLink>
                </h3>
                <InstructorLine :people="viewOf(item).people" :course-id="item.course.id" />
                <div class="acct-rs-prog">
                  <AppProgress
                    :value="item.progress.pct"
                    lg
                    :label="t('account.progressOf', { title: item.course.title })"
                  />
                </div>
                <p class="acct-rs-meta">
                  <span v-if="item.progress.resume">
                    <AppIcon name="play-circle" />{{ t('account.overview.lastLesson') }}
                    <b>{{ resumeLabel(item) }}</b>
                  </span>
                  <span v-if="item.progress.lastStudiedAt">
                    <AppIcon name="clock" />
                    {{ t('account.overview.lastStudied', {
                      when: relative(item.progress.lastStudiedAt),
                    }) }}
                  </span>
                </p>
              </div>

              <div class="acct-rs-cta">
                <RouterLink class="btn btn--primary" :to="learnHref(item)">
                  <AppIcon name="play" />
                  {{ item.progress.done ? t('cta.continue') : t('cta.start') }}
                </RouterLink>
              </div>
            </article>
          </div>

          <div v-else class="state-box state-box--plain">
            <div class="state-ico"><AppIcon name="check-circle" /></div>
            <h3>{{ t('account.overview.allDoneTitle') }}</h3>
            <p>{{ t('account.overview.allDoneText') }}</p>
            <div class="state-actions">
              <RouterLink class="btn btn--secondary" :to="path('/account/learning')">
                {{ t('account.nav.learning') }}
              </RouterLink>
            </div>
          </div>
        </section>
      </template>

      <div v-else-if="loading" class="state-box state-box--plain">
        <p>{{ t('account.learning.loading') }}</p>
      </div>

      <div v-else class="state-box">
        <div class="state-ico"><AppIcon name="book-open" /></div>
        <h3>{{ t('account.empty.learningTitle') }}</h3>
        <p>{{ t('account.empty.overviewText') }}</p>
        <div class="state-actions">
          <RouterLink class="btn btn--primary" :to="path('/courses')">
            <AppIcon name="search" />{{ t('account.empty.findCourses') }}
          </RouterLink>
          <RouterLink class="btn btn--secondary" :to="`${path('/courses')}?access=free`">
            <AppIcon name="gift" />{{ t('account.empty.freeCourses') }}
          </RouterLink>
        </div>
      </div>
    </div>
  </AccountShell>
</template>
