<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import MyCourseRow from '@/components/account/MyCourseRow.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { api, ApiError, type MyCourseItem, type PublicCategory } from '@/lib/api'
import { courseView } from '@/lib/course'
import { useCartStore } from '@/stores/cart'
import { openAuth } from '@/components/auth/authChannel'
import { useAuthStore } from '@/stores/auth'

/**
 * Every course this member has a claim on, filtered by what state it is in.
 *
 * The tabs carry counts because the useful question is rarely "show me
 * everything" — it is "what have I not finished" or "what have I lost access
 * to". The chosen tab lives in the query string so the overview tiles can link
 * straight to one of those answers.
 *
 * The API decides which group each course is in, and the counts are taken from
 * the same array the list is drawn from: a tab saying 3 above a list of 2 is the
 * one bug this screen can have.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const cart = useCartStore()

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

const items = ref<MyCourseItem[]>([])
const categories = ref<PublicCategory[]>([])
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    // The categories are for the icon and the parent's name on each card, and
    // they are the same list every page asks for; a failure there should not
    // cost somebody their shelf.
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

const counts = computed(
  () =>
    Object.fromEntries(
      GROUPS.map((g) => [
        g,
        g === 'all' ? items.value.length : items.value.filter((i) => i.group === g).length,
      ]),
    ) as Record<Group, number>,
)

const active = computed<Group>(() => {
  const tab = String(route.query.tab ?? 'all')
  return (GROUPS as readonly string[]).includes(tab) ? (tab as Group) : 'all'
})

const shown = computed(() =>
  active.value === 'all' ? items.value : items.value.filter((i) => i.group === active.value),
)

/** Built once per row rather than inside it, so the category list is read once
 *  for the page instead of once per card. */
function viewOf(item: MyCourseItem) {
  return courseView(item.course, { locale: locale.value, t, categories: categories.value })
}

function select(group: Group) {
  void router.replace({ query: group === 'all' ? {} : { tab: group } })
}

/**
 * Buying back a course whose access has lapsed.
 *
 * The basket is the same one the rest of the site uses, so a course added here
 * is in the header's count before the page has finished animating.
 */
async function run(action: string, courseId: number): Promise<void> {
  if (action !== 'add-cart' && action !== 'buy') return

  if (!cart.has(courseId) && !(await cart.add(courseId))) {
    openAuth({
      step: 'login',
      reason: t('auth.reasonCart'),
      onDone: () => void cart.add(courseId),
    })
    return
  }
  if (action === 'buy') void router.push(path('/cart'))
}

onMounted(() => {
  // The shell already sends a signed-out visitor to the dialog; this page simply
  // has nothing to ask for until there is somebody to ask about.
  if (auth.isLoggedIn) void load()
  else loading.value = false
})
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
          <span class="tab-count" :data-count="g">{{ counts[g] }}</span>
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
      <div v-if="loading" class="state-box state-box--plain">
        <p>{{ t('account.learning.loading') }}</p>
      </div>

      <div v-else-if="error" class="state-box state-box--plain">
        <div class="state-ico"><AppIcon name="alert-circle" /></div>
        <h3>{{ t('account.learning.loadFailed') }}</h3>
        <p>{{ error }}</p>
        <div class="state-actions">
          <button type="button" class="btn btn--secondary" @click="load">
            {{ t('course.retry') }}
          </button>
        </div>
      </div>

      <template v-else-if="shown.length">
        <p class="sr-only" aria-live="polite">
          {{ t('account.learning.showing', { count: shown.length }) }}
        </p>
        <div class="acct-li-list">
          <MyCourseRow
            v-for="item in shown"
            :key="item.entitlementId"
            :item="item"
            :view="viewOf(item)"
            @run="run"
          />
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
