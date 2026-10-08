<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError, dashboard as dashboardApi, type DashboardData, type OrderStatus } from '@/lib/api'
import { formatBaht } from '@/lib/money'

/**
 * The dashboard.
 *
 * Every number here comes out of the database. The theme ships one full of
 * invented revenue charts, and the first person to screenshot one into a
 * meeting will not know it is fiction — so none of that is kept.
 *
 * Ordered by what it is for: what is waiting for somebody, then what is wrong,
 * then what has happened. A dashboard that opens with a vanity figure and
 * buries the queue has the priorities of whoever built it, not whoever reads
 * it.
 */
const auth = useAuthStore()

const data = ref<DashboardData | null>(null)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = (await dashboardApi.load()).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the dashboard.'
  } finally {
    loading.value = false
  }
}

/** Only the queues that actually have something in them. An empty dashboard
 *  full of zeroes trains people to stop reading it. */
const queues = computed(() => {
  const w = data.value?.waiting
  if (!w) return []
  return [
    {
      key: 'essays',
      n: w.essays,
      label: w.essays === 1 ? 'essay to mark' : 'essays to mark',
      to: '/essay-review',
      note:
        w.oldestEssayHours === null
          ? null
          : w.oldestEssayHours >= 48
            ? `the oldest has waited ${Math.floor(w.oldestEssayHours / 24)} days`
            : `the oldest has waited ${w.oldestEssayHours} hours`,
      urgent: (w.oldestEssayHours ?? 0) >= 48,
    },
    {
      key: 'applications',
      n: w.applications,
      label: w.applications === 1 ? 'teacher application' : 'teacher applications',
      to: '/teacher-applications',
      note: null,
      urgent: false,
    },
    {
      key: 'invoices',
      n: w.invoicesToIssue,
      label: w.invoicesToIssue === 1 ? 'tax invoice to issue' : 'tax invoices to issue',
      to: '/invoices?status=requested',
      note: 'paid, but never numbered',
      urgent: true,
    },
    {
      key: 'enquiries',
      n: w.enquiries,
      label: w.enquiries === 1 ? 'unread enquiry' : 'unread enquiries',
      to: '/contact-messages',
      note: null,
      urgent: false,
    },
    {
      key: 'questions',
      n: w.lessonQuestions,
      label: w.lessonQuestions === 1 ? 'unanswered question' : 'unanswered questions',
      to: '/lesson-questions',
      note: null,
      urgent: false,
    },
  ].filter((q) => q.n > 0)
})

/**
 * Things the admin can create that the public site cannot show.
 *
 * Worth naming rather than leaving to be discovered by a customer: a course
 * with no teacher renders a page with an empty instructor block, and a lesson
 * with no module is invisible because the design walks the modules.
 */
const faults = computed(() => {
  const p = data.value?.problems
  if (!p) return []
  return [
    {
      n: p.coursesWithoutTeacher,
      text: 'course has no teacher — its page has nobody to show',
      plural: 'courses have no teacher — their pages have nobody to show',
      to: '/courses',
    },
    {
      n: p.coursesWithoutLessons,
      text: 'published course has no lessons at all',
      plural: 'published courses have no lessons at all',
      to: '/courses',
    },
    {
      n: p.lessonsWithoutModule,
      text: 'lesson sits outside any module, so nobody can reach it',
      plural: 'lessons sit outside any module, so nobody can reach them',
      to: '/courses',
    },
    {
      n: p.teachersWithoutProfile,
      text: 'teacher has no public profile yet',
      plural: 'teachers have no public profile yet',
      to: '/teachers',
    },
  ].filter((f) => f.n > 0)
})

const STATUS_CLASS: Record<OrderStatus, string> = {
  pending: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
  paid: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  failed: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400',
  refunded: 'bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-400',
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
function when(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '—'
}

const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]'

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Dashboard" />

    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>

    <p v-if="loading" class="py-10 text-center text-sm text-gray-500">Loading…</p>

    <div v-else-if="data" class="space-y-6">
      <!-- 1. What is waiting -->
      <section>
        <h3 class="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">
          Waiting for you
        </h3>
        <div v-if="queues.length" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <router-link
            v-for="q in queues"
            :key="q.key"
            :to="q.to"
            class="rounded-2xl border p-5 transition hover:shadow-sm"
            :class="
              q.urgent
                ? 'border-warning-500/40 bg-warning-50 dark:bg-warning-500/10'
                : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'
            "
          >
            <p class="text-3xl font-semibold text-gray-800 dark:text-white/90">{{ q.n }}</p>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{{ q.label }}</p>
            <p v-if="q.note" class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {{ q.note }}
            </p>
          </router-link>
        </div>
        <p
          v-else
          class="rounded-2xl border border-gray-200 bg-white px-5 py-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400"
        >
          Nothing is waiting. No essays to mark, no applications, no unread enquiries.
        </p>
      </section>

      <!-- 2. What is wrong -->
      <section v-if="faults.length">
        <h3 class="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">
          Needs fixing before customers see it
        </h3>
        <ul
          class="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <li v-for="(f, i) in faults" :key="i">
            <router-link
              :to="f.to"
              class="flex items-center gap-3 px-5 py-3.5 text-sm transition hover:bg-gray-50 dark:hover:bg-white/[0.02]"
            >
              <span
                class="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-warning-50 px-2 text-xs font-semibold text-warning-600 dark:bg-warning-500/15 dark:text-warning-400"
              >
                {{ f.n }}
              </span>
              <span class="text-gray-700 dark:text-gray-300">
                {{ f.n === 1 ? f.text : f.plural }}
              </span>
            </router-link>
          </li>
        </ul>
      </section>

      <!-- 3. What has happened -->
      <section v-if="data.counts">
        <h3 class="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">The school</h3>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div :class="cardClass">
            <p class="text-xs uppercase tracking-wide text-gray-400">Taken this month</p>
            <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {{ formatBaht(data.counts.revenueThisMonth) }}
            </p>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {{ formatBaht(data.counts.revenueAllTime) }} in all<template
                v-if="data.counts.refundedAllTime"
              >
                · {{ formatBaht(data.counts.refundedAllTime) }} refunded</template
              >
            </p>
          </div>
          <div :class="cardClass">
            <p class="text-xs uppercase tracking-wide text-gray-400">Students</p>
            <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {{ data.counts.students }}
            </p>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {{ data.counts.studentsThisMonth }} joined this month
            </p>
          </div>
          <div :class="cardClass">
            <p class="text-xs uppercase tracking-wide text-gray-400">Courses live</p>
            <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {{ data.counts.publishedCourses }}
            </p>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {{ data.counts.draftCourses }} not published · {{ data.counts.teachers }} teachers
            </p>
          </div>
          <div :class="cardClass">
            <p class="text-xs uppercase tracking-wide text-gray-400">People studying</p>
            <p class="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {{ data.counts.activeEnrolments }}
            </p>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {{ data.counts.ordersAwaitingPayment }} orders awaiting payment
            </p>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <!-- The queue, not just its size -->
        <section
          class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div class="flex items-center justify-between px-5 py-4">
            <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
              Essays waiting longest
            </h3>
            <router-link to="/essay-review" class="text-sm text-brand-500 hover:text-brand-600">
              Mark them
            </router-link>
          </div>
          <ul
            v-if="data.essayQueue.length"
            class="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800"
          >
            <li v-for="e in data.essayQueue" :key="e.id" class="px-5 py-3">
              <p class="line-clamp-1 text-sm text-gray-800 dark:text-white/90">{{ e.prompt }}</p>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ e.firstName }} {{ e.lastName }} · {{ e.courseTitle ?? '—' }} ·
                {{ when(e.submittedAt) }}
                <span v-if="e.status === 'resubmitted'" class="text-warning-600">
                  · rewritten
                </span>
              </p>
            </li>
          </ul>
          <p v-else class="border-t border-gray-100 px-5 py-8 text-center text-sm text-gray-500 dark:border-gray-800">
            Nothing to mark.
          </p>
        </section>

        <!-- Latest orders -->
        <section
          v-if="data.counts"
          class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div class="flex items-center justify-between px-5 py-4">
            <h3 class="text-base font-medium text-gray-800 dark:text-white/90">Latest orders</h3>
            <router-link to="/orders" class="text-sm text-brand-500 hover:text-brand-600">
              All orders
            </router-link>
          </div>
          <ul
            v-if="data.recentOrders.length"
            class="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800"
          >
            <li
              v-for="o in data.recentOrders"
              :key="o.id"
              class="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div class="min-w-0">
                <router-link
                  :to="`/orders?q=${o.orderNo}`"
                  class="font-mono text-sm text-brand-500 hover:text-brand-600"
                >
                  {{ o.orderNo }}
                </router-link>
                <p class="truncate text-xs text-gray-500 dark:text-gray-400">
                  {{ o.firstName }} {{ o.lastName }} · {{ when(o.createdAt) }}
                </p>
              </div>
              <div class="shrink-0 text-right">
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">
                  {{ formatBaht(o.total) }}
                </p>
                <span
                  class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="STATUS_CLASS[o.status]"
                >
                  {{ o.status }}
                </span>
              </div>
            </li>
          </ul>
          <!-- Honest about why it is empty: nobody can buy anything yet. -->
          <p
            v-else
            class="border-t border-gray-100 px-5 py-8 text-center text-sm text-gray-500 dark:border-gray-800"
          >
            No orders yet.
          </p>
        </section>
      </div>

      <p class="text-xs text-gray-400">
        Signed in as {{ auth.displayName || auth.user?.email }} ·
        {{ auth.roles.join(', ') || 'no role' }}
      </p>
    </div>
  </admin-layout>
</template>
