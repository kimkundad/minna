<script setup lang="ts">
import { computed } from 'vue'
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
import { assetUrl, call, fixImage, protoHref, useStoreTick } from '@/components/account/account'
import { data } from '@/vendor'
import { date, relative } from '@/lib/format'
import { vendorPeople } from '@/lib/vendor-view'

/**
 * The account landing page: who you are, what your package covers, what you
 * were last doing, and what has happened since.
 *
 * Certificates and CE are not issued here, so the certificate tile, the CE
 * ledger tile and the notifications that announce either are left out. What
 * remains is the package, the two course counts, the resume rows and the
 * notifications that still mean something.
 */
const { t } = useI18n()
const route = useRoute()
const tick = useStoreTick()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

interface PkgInfo {
  plan: { name: string; tier: string }
  status: 'active' | 'expiring' | 'expired'
  endAt: string | null
  daysLeft: number | null
  isPaidPlan: boolean
}

interface Course {
  id: string
  title: string
  category: string
  image?: Record<string, unknown>
  instructors: { id: string }[]
}

interface LearningItem {
  course: Course
  group: 'in-progress' | 'not-started' | 'completed' | 'expired'
  progress: { pct: number; resume?: { id: string; title: string; type: string } | null; activityAt?: string | null }
  view: { badges: { kind: string; text: string; icon?: string }[] }
}

const user = computed(() => {
  void tick.value
  return call<{ name: string; initials: string; memberTypeLabel: string }>('user')
})
const pkg = computed(() => {
  void tick.value
  return call<PkgInfo | null>('pkgInfo')
})
const photo = computed(() => assetUrl(data.memberPhoto))

const myCourses = computed(() => {
  void tick.value
  return call<Course[]>('myCourses')
})
const items = computed(() => myCourses.value.map((c) => call<LearningItem>('learningItem', c.id)))

const inProgress = computed(() => items.value.filter((i) => i.group === 'in-progress'))

/** Counted on progress rather than on the group, so a course you finished and
 *  then lost access to still counts as finished — which is how it feels. */
const completed = computed(() => items.value.filter((i) => i.progress.pct >= 100))

/** Most recently touched first: the row you want is the one you left. */
const resumeRows = computed(() =>
  [...inProgress.value].sort(
    (a, b) => String(b.progress.activityAt ?? '').localeCompare(String(a.progress.activityAt ?? '')),
  ),
)

/** The days meter runs against a one-year term, which is what every paid plan
 *  in the data is sold as. */
const daysPct = computed(() => {
  const left = pkg.value?.daysLeft
  if (left == null) return 0
  return Math.max(0, Math.min(100, Math.round((left / 365) * 100)))
})

const statusBadge = computed(() => {
  const status = pkg.value?.status ?? 'active'
  const map = {
    active: { kind: 'done', icon: 'check-circle' },
    expiring: { kind: 'pending', icon: 'hourglass' },
    expired: { kind: 'expired', icon: 'hourglass' },
  } as const
  const spec = map[status]
  return { kind: spec.kind, icon: spec.icon, text: t(`account.pkgStatus.${status}`) }
})

const NOTIF = {
  purchase: { icon: 'check-circle', tone: 'success' },
  'essay-pass': { icon: 'check-circle', tone: 'success' },
  'essay-revision': { icon: 'alert-circle', tone: 'danger' },
  'essay-submitted': { icon: 'hourglass', tone: 'cyan' },
  expiry: { icon: 'hourglass', tone: 'warning' },
  welcome: { icon: 'sparkles', tone: 'cyan' },
} as const

interface Notification {
  id: string
  type: keyof typeof NOTIF | string
  title: string
  desc: string
  at: string
  read: boolean
  cta?: { label: string; href: string } | null
}

/** Certificate and CE announcements have nothing to announce on Minna. */
const notifications = computed(() => {
  void tick.value
  return call<Notification[]>('notifications').filter(
    (n) => n.type !== 'certificate' && n.type !== 'ce',
  )
})
const unread = computed(() => notifications.value.filter((n) => !n.read).length)

function notifIcon(type: string) {
  return NOTIF[type as keyof typeof NOTIF] ?? { icon: 'bell', tone: 'cyan' }
}
function notifTypeLabel(type: string) {
  const key = `account.notif.type.${type}`
  const label = t(key)
  return label === key ? t('common.notifications') : label
}

function markRead(id: string) {
  call('markRead', id)
}
function markAllRead() {
  call('markAllRead')
}

function resumeLabel(item: LearningItem): string {
  const r = item.progress.resume
  if (!r) return ''
  return r.type === 'quiz' ? t('account.overview.quizLesson') : r.title
}
function learnHref(item: LearningItem): string {
  const lesson = item.progress.resume?.id
  return protoHref(`learn.html?id=${item.course.id}${lesson ? `&lesson=${lesson}` : ''}`, locale.value)
}
function category(id: string) {
  return call<{ name: string; icon: string; palette?: number }>('category', id)
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
                <AppIcon name="stethoscope" />
                <span>{{ user.memberTypeLabel }}</span>
              </li>
              <li v-if="pkg">
                <AppIcon name="package" />
                <span>{{ t('account.package') }} <b>{{ pkg.plan.name }}</b></span>
                <AppBadge :badge="statusBadge" />
              </li>
            </ul>
          </div>
          <RouterLink class="btn btn--secondary btn--sm acct-welcome-edit" :to="path('/account/profile')">
            <AppIcon name="settings" />{{ t('account.nav.profile') }}
          </RouterLink>
        </div>
      </section>

      <div class="acct-ads" id="ov-ads"><AdsSlot /></div>

      <!-- Package and course counts -->
      <section class="acct-sec" aria-labelledby="ov-sum-h">
        <h2 class="sr-only" id="ov-sum-h">{{ t('account.overview.summary') }}</h2>
        <div id="ov-stats">
          <div class="acct-stats">
            <RouterLink
              v-if="pkg"
              class="acct-stat acct-stat--wide acct-stat--pkg"
              :class="pkg.isPaidPlan ? `acct-stat--${pkg.status}` : 'acct-stat--free'"
              :to="path('/account/package')"
            >
              <span class="acct-stat-top">
                <span class="stat-ico acct-ico--violet" aria-hidden="true"><AppIcon name="package" /></span>
                <AppBadge :badge="statusBadge" />
              </span>
              <span class="stat-label">{{ t('account.overview.currentPackage') }}</span>
              <span class="acct-stat-name">{{ pkg.plan.name }}</span>
              <span v-if="pkg.isPaidPlan" class="acct-stat-sub">
                {{ t('account.overview.expiresOn', { date: date(pkg.endAt) }) }} ·
                {{ t('account.overview.daysLeftLabel') }}
                <b>{{ t('account.days', { n: pkg.daysLeft ?? 0 }) }}</b>
              </span>
              <span v-else class="acct-stat-sub">
                <b>FREE</b> · {{ t('account.overview.upgradeHint') }}
              </span>
              <div
                v-if="pkg.isPaidPlan"
                class="acct-meter"
                :class="`acct-meter--${pkg.status}`"
                aria-hidden="true"
              >
                <span :style="{ '--p': `${daysPct}%` }"></span>
              </div>
              <span class="acct-stat-go">
                {{ pkg.isPaidPlan ? t('account.overview.managePackage') : t('account.overview.viewPackages') }}
                <AppIcon name="arrow-right" />
              </span>
            </RouterLink>

            <RouterLink class="acct-stat acct-stat--sm" :to="`${path('/account/learning')}?tab=in-progress`">
              <span class="stat-ico acct-ico--blue" aria-hidden="true"><AppIcon name="play-circle" /></span>
              <span class="stat-value tabular">
                {{ inProgress.length }}<small>{{ t('account.courseUnit') }}</small>
              </span>
              <span class="stat-label">{{ t('account.group.inProgress') }}</span>
            </RouterLink>

            <RouterLink class="acct-stat acct-stat--sm" :to="`${path('/account/learning')}?tab=completed`">
              <span class="stat-ico acct-ico--success" aria-hidden="true"><AppIcon name="check-circle" /></span>
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
            <h2 id="ov-cont-h" tabindex="-1"><span>{{ t('account.overview.continueTitle') }}</span></h2>
            <p v-if="resumeRows.length" class="acct-sec-sub">{{ t('account.overview.continueSub') }}</p>
          </div>
          <div v-if="resumeRows.length" class="acct-sec-tools">
            <RouterLink class="link-arrow" :to="path('/account/learning')">
              {{ t('account.overview.allCourses', { count: myCourses.length }) }}
              <AppIcon name="arrow-right" />
            </RouterLink>
          </div>
        </div>

        <div v-if="resumeRows.length" class="acct-rs-list">
          <article v-for="item in resumeRows" :key="item.course.id" class="acct-rs" :aria-labelledby="`rs-${item.course.id}`">
            <RouterLink
              class="acct-rs-media"
              :to="path(`/courses/${item.course.id}`)"
              tabindex="-1"
              aria-hidden="true"
            >
              <CourseImage
                :image="fixImage(item.course.image)"
                :width="400"
                :height="225"
                :art-icon="category(item.course.category)?.icon"
                :art-palette="category(item.course.category)?.palette ?? 0"
              />
            </RouterLink>

            <div class="acct-rs-body">
              <div class="acct-chips">
                <span class="acct-cat">{{ category(item.course.category)?.name }}</span>
                <AppBadge
                  v-for="(b, i) in item.view.badges.filter((x) => x.kind !== 'ce')"
                  :key="i"
                  :badge="b"
                />
              </div>
              <h3 class="acct-rs-title" :id="`rs-${item.course.id}`">
                <RouterLink :to="path(`/courses/${item.course.id}`)">{{ item.course.title }}</RouterLink>
              </h3>
              <InstructorLine :people="vendorPeople(item.course.instructors)" :course-id="item.course.id" />
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
                <span v-if="item.progress.activityAt">
                  <AppIcon name="clock" />{{ t('account.overview.lastStudied', { when: relative(item.progress.activityAt) }) }}
                </span>
              </p>
            </div>

            <div class="acct-rs-cta">
              <a class="btn btn--primary" :href="learnHref(item)">
                <AppIcon name="play" />{{ t('cta.continue') }}
              </a>
            </div>
          </article>
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
      </section>

      <!-- What has happened since -->
      <section class="acct-sec" id="ov-notifs" aria-labelledby="ov-notif-h">
        <div class="acct-sec-head">
          <div class="acct-sec-title">
            <p class="eyebrow">Notifications</p>
            <h2 id="ov-notif-h" tabindex="-1">
              <span>{{ t('common.notifications') }}</span>
              <span v-if="unread" class="acct-count">{{ t('account.notif.newCount', { count: unread }) }}</span>
            </h2>
            <p class="acct-sec-sub">{{ t('account.notif.sub') }}</p>
          </div>
          <div v-if="unread" class="acct-sec-tools">
            <button type="button" class="btn btn--ghost btn--sm" @click="markAllRead">
              <AppIcon name="check" />{{ t('account.notif.readAll') }}
            </button>
          </div>
        </div>

        <div v-if="notifications.length" class="acct-card acct-card--flush acct-notifs">
          <div
            v-for="n in notifications"
            :key="n.id"
            class="notif-item"
            :class="{ 'is-unread': !n.read }"
          >
            <span class="notif-ico" :class="`notif-ico--${notifIcon(n.type).tone}`">
              <AppIcon :name="notifIcon(n.type).icon" />
            </span>
            <div class="notif-body">
              <div class="notif-type">
                {{ notifTypeLabel(n.type) }}
                <template v-if="!n.read">
                  · <span style="color: var(--brand-primary-dark)">{{ t('account.notif.new') }}</span>
                </template>
              </div>
              <div class="notif-title">{{ n.title }}</div>
              <div class="notif-desc">{{ n.desc }}</div>
              <div class="notif-meta">
                <span>{{ date(n.at) }}</span>
                <a v-if="n.cta" :href="protoHref(n.cta.href, locale)" @click="markRead(n.id)">
                  {{ n.cta.label }} →
                </a>
                <button
                  v-if="!n.read"
                  type="button"
                  class="link"
                  style="text-decoration: none; font-weight: 600; font-size: 17px"
                  @click="markRead(n.id)"
                >
                  {{ t('account.notif.markRead') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="state-box state-box--plain">
          <div class="state-ico"><AppIcon name="bell" /></div>
          <h3>{{ t('account.notif.emptyTitle') }}</h3>
          <p>{{ t('account.notif.emptyText') }}</p>
        </div>
      </section>
    </div>
  </AccountShell>
</template>
