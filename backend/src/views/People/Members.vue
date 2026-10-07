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
const role = ref<RoleName | ''>('')
const status = ref<'active' | 'suspended' | ''>('')

/** The member whose roles are being edited, and the set being built. */
const editing = ref<Member | null>(null)
const draftRoles = ref<RoleName[]>([])
const saving = ref(false)

const ALL_ROLES: { value: RoleName; label: string; note: string }[] = [
  { value: 'superadmin', label: 'Superadmin', note: 'Roles, settings, audit log' },
  { value: 'admin', label: 'Admin', note: 'Courses, orders, content' },
  { value: 'teacher', label: 'Teacher', note: 'Their own courses and marking' },
  { value: 'student', label: 'Student', note: 'Learns on the public site' },
]

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
      ...(role.value ? { role: role.value } : {}),
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
watch([role, status], () => {
  page.value = 1
  void load()
})
watch(page, load)

function openRoles(member: Member) {
  editing.value = member
  draftRoles.value = [...member.roles]
  error.value = ''
}

function toggleRole(value: RoleName) {
  draftRoles.value = draftRoles.value.includes(value)
    ? draftRoles.value.filter((r) => r !== value)
    : [...draftRoles.value, value]
}

async function saveRoles() {
  if (!editing.value) return
  saving.value = true
  error.value = ''
  try {
    await people.setRoles(editing.value.id, draftRoles.value)
    editing.value = null
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change those roles.'
  } finally {
    saving.value = false
  }
}

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
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-3 sm:px-6"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Search name or email"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <select
          v-model="role"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any role</option>
          <option v-for="r in ALL_ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
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

      <!-- Role editing sits above the table, so the other members stay in view
           while deciding what someone should be. -->
      <div
        v-if="editing"
        class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
      >
        <h4 class="mb-4 text-sm font-medium text-gray-800 dark:text-white/90">
          Roles for {{ editing.email }}
        </h4>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label
            v-for="r in ALL_ROLES"
            :key="r.value"
            class="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
            :class="{ 'border-brand-500': draftRoles.includes(r.value) }"
          >
            <input
              type="checkbox"
              :checked="draftRoles.includes(r.value)"
              class="mt-0.5 h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
              @change="toggleRole(r.value)"
            />
            <span>
              <span class="block text-sm font-medium text-gray-800 dark:text-white/90">
                {{ r.label }}
              </span>
              <span class="block text-xs text-gray-500 dark:text-gray-400">{{ r.note }}</span>
            </span>
          </label>
        </div>
        <div class="mt-4 flex gap-3">
          <button
            type="button"
            :disabled="saving"
            class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            @click="saveRoles"
          >
            {{ saving ? 'Saving…' : 'Save roles' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
            @click="editing = null"
          >
            Cancel
          </button>
        </div>
      </div>

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
                  <button type="button" class="text-brand-500 hover:text-brand-600" @click="openRoles(m)">
                    Roles
                  </button>
                  <button
                    type="button"
                    class="ml-4"
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
