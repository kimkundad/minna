<script setup lang="ts">
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * A placeholder, on purpose.
 *
 * The template's dashboard is full of invented revenue charts. Showing those
 * over a real database teaches people to read numbers that are not true, and
 * the first person to screenshot one into a meeting will not know. Real figures
 * go here once there are orders to count.
 */
const auth = useAuthStore()

const sections = [
  { title: 'Courses', note: 'Categories, courses, modules and lessons.' },
  { title: 'People', note: 'Members, roles and teacher applications.' },
  { title: 'Sales', note: 'Orders, invoices, coupons and packages.' },
  { title: 'Learning', note: 'Quizzes, essay review and progress.' },
  { title: 'Content', note: 'Articles, testimonials and enquiries.' },
  { title: 'Settings', note: 'VAT, site details and integrations.' },
]
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Dashboard" />

    <div
      class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6"
    >
      <h3 class="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        Signed in as {{ auth.displayName || auth.user?.email }}
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ auth.roles.join(', ') || 'no role' }}
      </p>

      <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="s in sections"
          :key="s.title"
          class="rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700"
        >
          <p class="font-medium text-gray-800 dark:text-white/90">{{ s.title }}</p>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ s.note }}</p>
          <p class="mt-3 text-xs font-medium uppercase tracking-wide text-gray-400">Not built yet</p>
        </div>
      </div>
    </div>
  </admin-layout>
</template>
