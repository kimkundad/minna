<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import CourseRail from '@/components/course/CourseRail.vue'
import { call, useStoreTick } from '@/components/account/account'
import type { CourseLike, PkgInfoLike, PlanLike } from '@/components/account/types'
import { date, num } from '@/lib/format'
import { vendorCourseView } from '@/lib/vendor-view'

/**
 * The membership: what you are on now, how much of the term is left, and the
 * plans you could move to.
 *
 * Only the plans for your own member type are offered. A vet cannot buy the
 * student price and showing it would only invite the question.
 */
const { t } = useI18n()
const route = useRoute()
const tick = useStoreTick()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
/** Until this page is served by our own API, its cards come from the
 *  prototype store. See `vendor-view.ts`. */
const vendorView = (id: string) => vendorCourseView(id, locale.value)

const TERM_DAYS = 365

const pkg = computed(() => {
  void tick.value
  return call<PkgInfoLike | null>('pkgInfo')
})
const plans = computed(() => {
  void tick.value
  return call<PlanLike[]>('plansFor')
})
const memberTypeLabel = computed(() => call<{ memberTypeLabel: string }>('user').memberTypeLabel)
const memberType = computed(() => call<string>('memberType'))

/** Courses the package opens, which is also the strongest line in the benefit
 *  list — so it is counted once and used in both places. */
const includedCourses = computed(() => {
  void tick.value
  return call<CourseLike[]>('catalog').filter(
    (c) => (c as unknown as { packageIncluded?: boolean }).packageIncluded,
  )
})

const TIER_ICON = { free: 'book-open', online: 'monitor', print: 'newspaper' } as const
function tierIcon(tier: string) {
  return TIER_ICON[tier as keyof typeof TIER_ICON] ?? 'package'
}

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

const daysPct = computed(() => {
  const left = pkg.value?.daysLeft
  if (left == null) return 0
  return Math.max(0, Math.min(100, Math.round((left / TERM_DAYS) * 100)))
})

/**
 * The benefits read as one list even though they come from two places: what
 * the plan says it includes, then what holding it actually unlocks here, then
 * what it leaves out — which belongs last, where it reads as a caveat rather
 * than as the offer.
 */
const benefits = computed(() => {
  const plan = pkg.value?.plan
  if (!plan) return []
  const included = plan.features.filter((f) => f.ok).map((f) => ({ ok: true, text: f.t }))
  const excluded = plan.features.filter((f) => !f.ok).map((f) => ({ ok: false, text: f.t }))
  const derived = [
    ...(plan.includesCourses
      ? [{ ok: true, text: t('account.pkg.benefitCourses', { count: includedCourses.value.length }) }]
      : []),
    { ok: true, text: t('account.pkg.benefitFree') },
  ]
  return [...included, ...derived, ...excluded]
})

const planPrice = (plan: PlanLike) =>
  plan.price === 0
    ? { value: 'FREE', unit: t('account.pkg.noCharge') }
    : { value: num(plan.price), unit: t('account.pkg.perYear') }

function renew() {
  call('renewPlan')
}
function choose(planId: string) {
  call('changePlan', planId)
}
</script>

<template>
  <AccountShell page="package">
    <div class="acct-stack">
      <!-- What you are on now -->
      <div id="pk-current">
        <section
          v-if="pkg"
          class="acct-cur"
          :class="pkg.isPaidPlan ? `acct-cur--${pkg.status}` : 'acct-cur--free'"
          id="current"
          aria-labelledby="pk-cur-h"
        >
          <div class="acct-cur-band">
            <span class="acct-cur-ico" aria-hidden="true"><AppIcon :name="tierIcon(pkg.plan.tier)" /></span>
            <div class="acct-cur-id">
              <p class="acct-cur-eyebrow">{{ t('account.pkg.currentEyebrow') }}</p>
              <h2 id="pk-cur-h" tabindex="-1">{{ pkg.plan.name }}</h2>
              <p class="acct-cur-price">
                {{ pkg.plan.price === 0
                  ? t('account.pkg.noCharge')
                  : t('account.pkg.pricePerYear', { price: num(pkg.plan.price) }) }}
              </p>
            </div>
            <AppBadge class="badge--lg" :badge="statusBadge" />
          </div>

          <div class="acct-cur-body">
            <dl class="acct-cur-facts">
              <div>
                <dt>{{ t('account.pkg.memberType') }}</dt>
                <dd>
                  <AppIcon :name="memberType === 'student' ? 'graduation' : 'stethoscope'" />
                  <span>{{ memberTypeLabel }}</span>
                </dd>
              </div>
              <div>
                <dt>{{ t('account.pkg.startDate') }}</dt>
                <dd>{{ pkg.isPaidPlan ? date(pkg.startAt) : '—' }}</dd>
              </div>
              <div>
                <dt>{{ t('account.pkg.endDate') }}</dt>
                <dd>{{ pkg.isPaidPlan ? date(pkg.endAt) : t('account.pkg.noExpiry') }}</dd>
              </div>
              <div>
                <dt>{{ t('account.pkg.daysLeft') }}</dt>
                <dd :class="{ 'is-warning': pkg.status === 'expiring', 'is-danger': pkg.status === 'expired' }">
                  {{ pkg.isPaidPlan
                    ? (pkg.status === 'expired'
                      ? t('account.pkg.expiredAlready')
                      : t('account.days', { n: pkg.daysLeft ?? 0 }))
                    : t('account.pkg.unlimited') }}
                </dd>
              </div>
            </dl>

            <div v-if="pkg.isPaidPlan && pkg.status !== 'expired'" class="acct-days">
              <div class="acct-days-top">
                <span>{{ t('account.pkg.daysMeter') }}</span>
                <b class="tabular">
                  {{ t('account.pkg.daysOf', { left: pkg.daysLeft ?? 0, total: TERM_DAYS }) }}
                </b>
              </div>
              <div
                class="acct-meter"
                :class="`acct-meter--${pkg.status}`"
                role="meter"
                aria-valuemin="0"
                :aria-valuemax="TERM_DAYS"
                :aria-valuenow="pkg.daysLeft ?? 0"
                :aria-valuetext="t('account.pkg.daysOf', { left: pkg.daysLeft ?? 0, total: TERM_DAYS })"
                :aria-label="t('account.pkg.daysMeter')"
              >
                <span :style="{ '--p': `${daysPct}%` }"></span>
              </div>
            </div>

            <div class="acct-benefits">
              <h3>{{ t('account.pkg.benefits') }}</h3>
              <ul role="list">
                <li
                  v-for="(b, i) in benefits"
                  :key="i"
                  class="acct-feat"
                  :class="b.ok ? 'is-ok' : 'is-no'"
                >
                  <span class="fi" aria-hidden="true"><AppIcon :name="b.ok ? 'check' : 'x'" /></span>
                  <span>{{ b.text }}</span>
                </li>
              </ul>
            </div>

            <div class="acct-cur-actions">
              <button v-if="pkg.isPaidPlan" type="button" class="btn btn--primary" @click="renew">
                <AppIcon name="refresh" />{{ t('account.pkg.renew') }}
              </button>
              <a class="btn" :class="pkg.isPaidPlan ? 'btn--secondary' : 'btn--primary'" href="#plans">
                <AppIcon name="sliders" />
                {{ pkg.isPaidPlan ? t('account.pkg.change') : t('account.pkg.upgrade') }}
              </a>
            </div>
          </div>
        </section>
      </div>

      <!-- What you could move to -->
      <section class="acct-plans" id="plans" aria-labelledby="pk-plans-h">
        <div class="acct-plans-head">
          <p class="eyebrow">Membership Plans</p>
          <h2 id="pk-plans-h" tabindex="-1">{{ t('account.pkg.plansTitle') }}</h2>
          <p class="acct-plans-desc">{{ t('account.pkg.plansDesc') }}</p>
          <p class="acct-plans-note">
            <AppIcon :name="memberType === 'student' ? 'graduation' : 'stethoscope'" />
            <span>{{ t('account.pkg.plansFor') }} <b>{{ memberTypeLabel }}</b></span>
          </p>
        </div>

        <div class="acct-plan-grid" :class="`acct-plan-grid--${plans.length === 2 ? 2 : 3}`">
          <article
            v-for="plan in plans"
            :key="plan.id"
            class="acct-plan"
            :class="{
              'acct-plan--featured': plan.featured,
              'acct-plan--current': plan.tier === pkg?.plan.tier,
            }"
            :aria-labelledby="`plan-${plan.id}`"
          >
            <span v-if="plan.tier === pkg?.plan.tier" class="acct-plan-cur">
              <AppIcon name="check-circle" />{{ t('account.pkg.yourPlan') }}
            </span>
            <span v-if="plan.badge" class="acct-plan-badge">
              <AppIcon name="sparkles" />{{ plan.badge }}
            </span>

            <span class="acct-plan-ico" aria-hidden="true"><AppIcon :name="tierIcon(plan.tier)" /></span>
            <h3 :id="`plan-${plan.id}`">{{ plan.name }}</h3>
            <p class="acct-plan-price">
              <b :class="{ tabular: plan.price !== 0 }">{{ planPrice(plan).value }}</b>
              <span>{{ planPrice(plan).unit }}</span>
            </p>

            <ul class="acct-plan-feats" role="list">
              <li v-for="(f, i) in plan.features" :key="i" :class="f.ok ? 'is-ok' : 'is-no'">
                <AppIcon :name="f.ok ? 'check' : 'x'" />
                <span>{{ f.t }}</span>
              </li>
            </ul>

            <button
              v-if="plan.tier === pkg?.plan.tier"
              type="button"
              class="btn btn--white acct-plan-btn"
              disabled
            >
              <AppIcon name="check" />{{ t('account.pkg.currentPlan') }}
            </button>
            <button
              v-else
              type="button"
              class="btn btn--primary acct-plan-btn"
              :aria-describedby="`plan-${plan.id}`"
              @click="choose(plan.id)"
            >
              {{ t('account.pkg.choosePlan') }}
            </button>
          </article>
        </div>

        <p class="sr-only" aria-live="polite">
          {{ t('account.pkg.plansCount', { count: plans.length, type: memberTypeLabel }) }}
        </p>
        <p class="acct-plans-foot">
          <AppIcon name="info" /><span>{{ t('account.pkg.plansFoot') }}</span>
        </p>
      </section>

      <!-- What the package already opens -->
      <section
        v-if="includedCourses.length"
        class="acct-sec acct-pk-courses"
        id="pk-courses"
        aria-labelledby="pkinc-h"
      >
        <CourseRail
          id="pkinc"
          eyebrow="Included Courses"
          :title="t('account.pkg.includedTitle')"
          :sub="t('account.pkg.includedSub', { plan: pkg?.plan.name ?? '', count: includedCourses.length })"
          :more-href="`${path('/courses')}?access=package`"
          :more-label="t('common.viewAll')"
          :count="includedCourses.length"
        >
          <CourseCard v-for="c in includedCourses" :key="c.id" :view="vendorView(c.id)" />
        </CourseRail>
      </section>
    </div>
  </AccountShell>
</template>
