<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import LearningRow from '@/components/account/LearningRow.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { call, useStoreTick } from '@/components/account/account'
import type { LearningItemLike } from '@/components/account/types'

/**
 * Every course the member has a claim on, filtered by what state it is in.
 *
 * The tabs carry counts because the useful question is rarely "show me
 * everything" — it is "what have I not finished" or "what have I lost access
 * to". The chosen tab lives in the query string so those answers can be linked
 * to from the overview tiles.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const tick = useStoreTick()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const GROUPS = ['all', 'in-progress', 'not-started', 'completed', 'expired'] as const
type Group = (typeof GROUPS)[number]

const GROUP_LABEL: Record<Group, string> = {
  all: 'account.group.all',
  'in-progress': 'account.group.inProgress',
  'not-started': 'account.group.notStarted',
  completed: 'account.group.completed',
  expired: 'account.group.expired',
}

/**
 * Ordered the way the tabs are, then by when you last touched it. What you are
 * working on comes first and what you have lost access to comes last, so the
 * "all" tab reads as a priority list rather than as whatever order the
 * entitlements happened to be written in.
 */
const RANK: Record<string, number> = { 'in-progress': 0, 'not-started': 1, completed: 2, expired: 3 }

const items = computed<LearningItemLike[]>(() => {
  void tick.value
  return call<{ id: string }[]>('myCourses')
    .map((c) => call<LearningItemLike>('learningItem', c.id))
    .sort(
      (a, b) =>
        RANK[a.group] - RANK[b.group] ||
        String(b.progress.activityAt ?? '').localeCompare(String(a.progress.activityAt ?? '')),
    )
})

const counts = computed(() =>
  Object.fromEntries(
    GROUPS.map((g) => [g, g === 'all' ? items.value.length : items.value.filter((i) => i.group === g).length]),
  ) as Record<Group, number>,
)

const active = computed<Group>(() => {
  const tab = String(route.query.tab ?? 'all')
  return (GROUPS as readonly string[]).includes(tab) ? (tab as Group) : 'all'
})

const shown = computed(() =>
  active.value === 'all' ? items.value : items.value.filter((i) => i.group === active.value),
)

function select(group: Group) {
  void router.replace({ query: group === 'all' ? {} : { tab: group } })
}

/** The cart and buy actions belong to pages that own a checkout; from here the
 *  only honest thing to do is add to the cart and send you there. */
function run(action: string, courseId?: string) {
  if (!courseId) return
  if (action === 'add-cart') {
    call('addToCart', courseId)
    return
  }
  if (action === 'buy') {
    call('addToCart', courseId)
    void router.push(path('/cart'))
  }
}
</script>

<template>
  <AccountShell page="learning">
    <div class="acct-toolbar">
      <div
        class="tabs tabs--pill acct-ftabs"
        role="tablist"
        :aria-label="t('account.learning.filterLabel')"
      >
        <button
          v-for="g in GROUPS"
          :key="g"
          type="button"
          class="tab"
          role="tab"
          :id="`ml-tab-${g}`"
          aria-controls="ml-panel"
          :aria-selected="active === g"
          :tabindex="active === g ? 0 : -1"
          @click="select(g)"
        >
          <span>{{ t(GROUP_LABEL[g]) }}</span>
          <span class="tab-count">{{ counts[g] }}</span>
        </button>
      </div>
    </div>

    <div
      class="acct-ml-panel"
      role="tabpanel"
      id="ml-panel"
      :aria-labelledby="`ml-tab-${active}`"
      tabindex="-1"
    >
      <template v-if="shown.length">
        <p class="sr-only" aria-live="polite">{{ t('account.learning.showing', { count: shown.length }) }}</p>
        <div class="acct-li-list">
          <LearningRow v-for="item in shown" :key="item.course.id" :item="item" @run="run" />
        </div>
      </template>

      <div v-else-if="items.length" class="state-box state-box--plain">
        <div class="state-ico"><AppIcon name="book-open" /></div>
        <h3>{{ t('account.learning.noneInTab') }}</h3>
        <p>{{ t('account.learning.noneInTabText') }}</p>
        <div class="state-actions">
          <button type="button" class="btn btn--secondary" @click="select('all')">
            {{ t('account.group.all') }}
          </button>
        </div>
      </div>

      <div v-else class="state-box">
        <div class="state-ico"><AppIcon name="book-open" /></div>
        <h3>{{ t('account.empty.learningTitle') }}</h3>
        <p>{{ t('account.empty.learningText') }}</p>
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
