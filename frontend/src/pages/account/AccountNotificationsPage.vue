<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { ApiError, notifications as notifyApi, type AppNotification } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { dateTime, relative } from '@/lib/format'

/**
 * Everything that has happened, rather than the eight the bell has room for.
 *
 * The rows are read where they are, not re-rendered from the events behind
 * them: a notification is a record of what was said at the time, and a course
 * renamed since should not rewrite the sentence somebody was shown.
 *
 * Reading one does not require opening it. A row with no link — and there will
 * be kinds that have none — can still be marked read, which is the difference
 * between a list and a queue.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const store = useNotificationsStore()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const rows = ref<AppNotification[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')

const TABS = ['all', 'unread'] as const
type Tab = (typeof TABS)[number]
const active = computed<Tab>(() => (route.query.tab === 'unread' ? 'unread' : 'all'))

async function load(): Promise<void> {
  if (!auth.isLoggedIn) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await notifyApi.list({
      unreadOnly: active.value === 'unread',
      limit: 20,
      page: page.value,
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
    // The header badge and this page read the same number from the same
    // answer, so they cannot disagree while both are on screen.
    store.unread = res.meta.unread
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('notifications.loadFailed')
  } finally {
    loading.value = false
  }
}

onMounted(load)
// A tab change is a different question, so it starts from the first page.
watch(active, () => {
  page.value = 1
  void load()
})
watch(page, load)

function select(tab: Tab) {
  void router.replace({ query: tab === 'all' ? {} : { tab } })
}

async function read(row: AppNotification): Promise<void> {
  if (row.readAt) return
  row.readAt = new Date().toISOString()
  store.unread = Math.max(0, store.unread - 1)
  await notifyApi.read(row.id).catch(() => {})
  // The unread tab is a queue: something read has left it.
  if (active.value === 'unread') void load()
}

async function readAll(): Promise<void> {
  await store.markAllRead()
  await load()
}

/** A link is stored with its locale already on it; this page may be in another. */
function linkFor(row: AppNotification): string | null {
  if (!row.link) return null
  return path(row.link.replace(/^\/[a-z]{2}(?=\/)/, ''))
}

const LOOK: Record<string, { icon: string; tone: string }> = {
  'order.paid': { icon: 'check-circle', tone: 'success' },
  'order.failed': { icon: 'x-circle', tone: 'danger' },
  'essay.reviewed': { icon: 'file-text', tone: 'cyan' },
  'entitlement.expiring': { icon: 'hourglass', tone: 'warning' },
}
const icon = (type: string) => LOOK[type]?.icon ?? 'bell'
const tone = (type: string) => LOOK[type]?.tone ?? 'cyan'

const unreadOnPage = computed(() => rows.value.filter((r) => !r.readAt).length)
</script>

<template>
  <AccountShell page="notifications">
    <div class="acct-toolbar">
      <div class="tabs tabs--pill acct-ftabs" role="tablist" :aria-label="t('notifications.filterLabel')">
        <button
          v-for="tab in TABS"
          :key="tab"
          type="button"
          class="tab"
          role="tab"
          :aria-selected="active === tab"
          :tabindex="active === tab ? 0 : -1"
          @click="select(tab)"
        >
          <span>{{ t(`notifications.tab.${tab}`) }}</span>
          <span v-if="tab === 'unread' && store.unread" class="tab-count">{{ store.unread }}</span>
        </button>
      </div>

      <button
        v-if="store.unread"
        type="button"
        class="btn btn--ghost btn--sm"
        @click="readAll"
      >
        <AppIcon name="check" />{{ t('notifications.readAll') }}
      </button>
    </div>

    <div v-if="loading" class="state-box state-box--plain">
      <p>{{ t('notifications.loading') }}</p>
    </div>

    <div v-else-if="error" class="state-box state-box--plain">
      <div class="state-ico"><AppIcon name="alert-circle" /></div>
      <h3>{{ t('notifications.loadFailed') }}</h3>
      <p>{{ error }}</p>
      <div class="state-actions">
        <button type="button" class="btn btn--secondary" @click="load">{{ t('course.retry') }}</button>
      </div>
    </div>

    <div v-else-if="!rows.length" class="state-box">
      <div class="state-ico"><AppIcon name="bell" /></div>
      <h3>
        {{ active === 'unread' ? t('notifications.noUnreadTitle') : t('notifications.emptyTitle') }}
      </h3>
      <p>
        {{ active === 'unread' ? t('notifications.noUnreadText') : t('notifications.emptyText') }}
      </p>
      <div v-if="active === 'unread'" class="state-actions">
        <RouterLink class="btn btn--secondary" :to="path('/account/notifications')">
          {{ t('notifications.tab.all') }}
        </RouterLink>
      </div>
    </div>

    <template v-else>
      <p class="sr-only" aria-live="polite">
        {{ t('notifications.showing', { count: rows.length, total }) }}
      </p>

      <ul class="acct-card acct-card--flush acct-notifs" role="list">
        <li
          v-for="row in rows"
          :key="row.id"
          class="notif-item"
          :class="{ 'is-unread': !row.readAt }"
        >
          <span class="notif-ico" :class="`notif-ico--${tone(row.type)}`" aria-hidden="true">
            <AppIcon :name="icon(row.type)" />
          </span>

          <div class="notif-body">
            <p class="notif-title">{{ row.title }}</p>
            <p v-if="row.body" class="notif-desc">{{ row.body }}</p>
            <p class="notif-meta">
              <time :datetime="row.createdAt" :title="dateTime(row.createdAt)">
                {{ relative(row.createdAt) }}
              </time>
              <RouterLink v-if="linkFor(row)" :to="linkFor(row)!" @click="read(row)">
                {{ t('notifications.open') }} →
              </RouterLink>
              <!-- Reading does not need opening: some kinds have nowhere to go,
                   and a list you cannot clear is a list that grows. -->
              <button v-if="!row.readAt" type="button" class="link" @click="read(row)">
                {{ t('notifications.markRead') }}
              </button>
            </p>
          </div>
        </li>
      </ul>

      <div v-if="totalPages > 1" class="acct-pager">
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          :disabled="page <= 1"
          @click="page -= 1"
        >
          <AppIcon name="chevron-left" />{{ t('common.previous') }}
        </button>
        <span class="acct-pager-at">{{ t('notifications.pageOf', { page, total: totalPages }) }}</span>
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          :disabled="page >= totalPages"
          @click="page += 1"
        >
          {{ t('common.next') }}<AppIcon name="chevron-right" />
        </button>
      </div>

      <p v-if="active === 'all' && unreadOnPage" class="acct-toolbar-note" style="margin-top: 14px">
        <AppIcon name="info" />{{ t('notifications.unreadHint', { count: unreadOnPage }) }}
      </p>
    </template>
  </AccountShell>
</template>
