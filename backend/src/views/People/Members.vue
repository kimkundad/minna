<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { ApiError, people, type Member, type RoleName } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

/**
 * Everyone with an account: students, teachers and staff.
 *
 * Roles and suspension are a superadmin's to change. An admin reads this
 * screen but cannot act on it, because an admin who can grant roles can make
 * itself a superadmin and the two levels stop meaning anything.
 */
const auth = useAuthStore()

const rows = ref<Member[]>([])
const total = ref(0)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')

const page = ref(1)
const q = ref('')
const status = ref<'active' | 'suspended' | ''>('')

const ROLE_STYLE: Record<RoleName, string> = {
  superadmin: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400',
  admin: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  teacher: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  student: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await people.members({
      page: page.value,
      perPage: 20,
      ...(q.value ? { q: q.value } : {}),
      group: 'learners',
      ...(status.value ? { status: status.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load members.'
  } finally {
    loading.value = false
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
watch(status, () => {
  page.value = 1
  void load()
})
watch(page, load)

async function toggleStatus(member: Member) {
  const next = member.status === 'active' ? 'suspended' : 'active'
  const reason =
    next === 'suspended'
      ? window.prompt(`Suspend ${member.email}? Give a reason for the record:`)
      : ''
  // prompt returns null when cancelled; an empty string is a reason of "none".
  if (next === 'suspended' && reason === null) return

  try {
    await people.setStatus(member.id, next, reason || undefined)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change that account.'
  }
}

const name = (m: Member) => `${m.firstName} ${m.lastName}`.trim() || m.email
const pageLabel = computed(() => `Page ${page.value} of ${totalPages.value}`)

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Members" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="px-5 py-4 sm:px-6">
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ total }} member{{ total === 1 ? '' : 's' }}
        </h3>
        <p v-if="!auth.isSuperadmin" class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Only a superadmin can change roles or suspend an account.
        </p>
      </div>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-2 sm:px-6"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Search name or email"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <select
          v-model="status"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 my-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[820px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Member</th>
              <th class="px-5 py-3 font-medium">Roles</th>
              <th class="px-5 py-3 font-medium">Email</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium sm:px-6"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="5" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="5" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                No members match.
              </td>
            </tr>
            <tr
              v-for="m in rows"
              :key="m.id"
              class="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
            >
              <td class="px-5 py-3.5 sm:px-6">
                <p class="text-sm font-medium text-gray-800 dark:text-white/90">{{ name(m) }}</p>
                <p class="mt-0.5 text-xs text-gray-400">{{ m.email }}</p>
              </td>
              <td class="px-5 py-3.5">
                <span
                  v-for="r in m.roles"
                  :key="r"
                  class="mr-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                  :class="ROLE_STYLE[r]"
                >
                  {{ r }}
                </span>
                <span v-if="!m.roles.length" class="text-sm text-gray-400">none</span>
              </td>
              <td class="px-5 py-3.5 text-sm">
                <span v-if="m.emailVerifiedAt" class="text-success-600 dark:text-success-400">
                  verified
                </span>
                <span v-else class="text-gray-400">unverified</span>
              </td>
              <td class="px-5 py-3.5 text-sm">
                <span
                  :class="
                    m.status === 'active'
                      ? 'text-gray-600 dark:text-gray-300'
                      : 'text-error-500'
                  "
                >
                  {{ m.status }}
                </span>
              </td>
              <td class="px-5 py-3.5 text-right text-sm sm:px-6">
                <template v-if="auth.isSuperadmin">
                  <button
                    type="button"
                    :class="m.status === 'active' ? 'text-error-500' : 'text-success-600'"
                    @click="toggleStatus(m)"
                  >
                    {{ m.status === 'active' ? 'Suspend' : 'Reinstate' }}
                  </button>
                </template>
                <span v-else class="text-gray-300 dark:text-gray-600">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="totalPages > 1"
        class="flex items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6"
      >
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ pageLabel }}</p>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="page <= 1"
            class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
            @click="page -= 1"
          >
            Previous
          </button>
          <button
            type="button"
            :disabled="page >= totalPages"
            class="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
            @click="page += 1"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </admin-layout>
</template>
