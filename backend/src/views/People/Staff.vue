<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { ApiError, people, type CreateMemberInput, type Member, type RoleName } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

/**
 * Everyone who can sign in here: superadmins, admins and teachers.
 *
 * Separate from members on purpose. Members answers "what did this customer
 * buy"; this answers "who can get in", and there will be thousands of the
 * first and a handful of the second. Mixing them hides the handful.
 *
 * Only a superadmin may open it. Creating staff and granting roles are the two
 * powers that could be turned on the people who hold them.
 */
const auth = useAuthStore()

const rows = ref<Member[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')

const q = ref('')

/** The set-password link, when the creator chose to pass it on themselves.
 *  Shown once: it is not stored anywhere readable, the same as an emailed one. */
const inviteUrl = ref('')

const creating = ref(false)
const form = ref<CreateMemberInput>(blank())
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)

const editing = ref<Member | null>(null)
const draftRoles = ref<RoleName[]>([])

function blank(): CreateMemberInput {
  return { email: '', firstName: '', lastName: '', roles: ['admin'], locale: 'th', sendInvite: true }
}

const STAFF_ROLES: { value: RoleName; label: string; note: string }[] = [
  { value: 'superadmin', label: 'Superadmin', note: 'Staff, roles, settings, audit log' },
  { value: 'admin', label: 'Admin', note: 'Courses, orders, content, applications' },
  { value: 'teacher', label: 'Teacher', note: 'Their own courses and marking' },
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
    rows.value = (
      await people.members({ group: 'staff', perPage: 100, ...(q.value ? { q: q.value } : {}) })
    ).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the team.'
  } finally {
    loading.value = false
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(load, 300)
})

function toggle(list: RoleName[], value: RoleName): RoleName[] {
  return list.includes(value) ? list.filter((r) => r !== value) : [...list, value]
}

async function create() {
  saving.value = true
  error.value = ''
  notice.value = ''
  fieldErrors.value = {}
  try {
    const res = await people.create(form.value)
    creating.value = false
    inviteUrl.value = res.inviteUrl ?? ''
    notice.value = res.inviteUrl
      ? `${res.data.email} created. Send them the link below — it is shown once.`
      : `${res.data.email} created and invited by email.`
    form.value = blank()
    await load()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      error.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      error.value = 'Could not create that account.'
    }
  } finally {
    saving.value = false
  }
}

function openRoles(member: Member) {
  editing.value = member
  draftRoles.value = [...member.roles]
  error.value = ''
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

async function resetPassword(member: Member) {
  if (!window.confirm(`Send ${member.email} a link to set a new password?`)) return
  error.value = ''
  try {
    const res = await people.sendPasswordReset(member.id)
    notice.value = res.sent
      ? `A set-password link is on its way to ${member.email}.`
      : 'No link could be created for that account.'
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not send that link.'
  }
}

async function toggleStatus(member: Member) {
  const next = member.status === 'active' ? 'suspended' : 'active'
  const reason =
    next === 'suspended'
      ? window.prompt(`Suspend ${member.email}? Give a reason for the record:`)
      : ''
  if (next === 'suspended' && reason === null) return
  try {
    await people.setStatus(member.id, next, reason || undefined)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change that account.'
  }
}

const name = (m: Member) => `${m.firstName} ${m.lastName}`.trim() || m.email
const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Team" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ rows.length }} with access
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Everyone who can sign in to the admin.
          </p>
        </div>
        <button
          v-if="auth.isSuperadmin"
          type="button"
          class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
          @click="creating = !creating"
        >
          {{ creating ? 'Cancel' : 'Add someone' }}
        </button>
      </div>

      <p
        v-if="notice"
        class="mx-5 mb-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400 sm:mx-6"
      >
        {{ notice }}
      </p>

      <!-- Shown once, never again, and never stored anywhere readable. -->
      <div
        v-if="inviteUrl"
        class="mx-5 mb-4 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 dark:bg-warning-500/10 sm:mx-6"
      >
        <p class="mb-2 text-sm text-warning-700 dark:text-warning-400">
          Set-password link — copy it now, it will not be shown again.
        </p>
        <code class="block break-all text-xs text-gray-700 dark:text-gray-300">{{ inviteUrl }}</code>
        <button
          type="button"
          class="mt-2 text-xs text-brand-500"
          @click="inviteUrl = ''"
        >
          Done, hide it
        </button>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <form
        v-if="creating"
        class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
        @submit.prevent="create"
      >
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label :class="labelClass">First name<span class="text-error-500">*</span></label>
            <input v-model="form.firstName" required maxlength="100" :class="inputClass" />
            <p v-if="fieldErrors.firstName" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.firstName }}
            </p>
          </div>
          <div>
            <label :class="labelClass">Last name<span class="text-error-500">*</span></label>
            <input v-model="form.lastName" required maxlength="100" :class="inputClass" />
            <p v-if="fieldErrors.lastName" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.lastName }}
            </p>
          </div>
          <div>
            <label :class="labelClass">Email<span class="text-error-500">*</span></label>
            <input v-model="form.email" type="email" required maxlength="255" :class="inputClass" />
            <p v-if="fieldErrors.email" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.email }}
            </p>
          </div>
        </div>

        <p class="mt-5 mb-2 text-sm font-medium text-gray-700 dark:text-gray-400">Roles</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label
            v-for="r in STAFF_ROLES"
            :key="r.value"
            class="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
            :class="{ 'border-brand-500': form.roles.includes(r.value) }"
          >
            <input
              type="checkbox"
              :checked="form.roles.includes(r.value)"
              class="mt-0.5 h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
              @change="form.roles = toggle(form.roles, r.value)"
            />
            <span>
              <span class="block text-sm font-medium text-gray-800 dark:text-white/90">
                {{ r.label }}
              </span>
              <span class="block text-xs text-gray-500 dark:text-gray-400">{{ r.note }}</span>
            </span>
          </label>
        </div>
        <p v-if="fieldErrors.roles" class="mt-1 text-sm text-error-500">{{ fieldErrors.roles }}</p>

        <label class="mt-5 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-400">
          <input
            v-model="form.sendInvite"
            type="checkbox"
            class="h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
          />
          Email them a link to set their password
        </label>
        <p class="mt-1 text-xs text-gray-400">
          No password is set here. They choose their own, so nobody else ever knows it. Untick to
          get the link and pass it on yourself.
        </p>

        <div class="mt-5 flex gap-3">
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {{ saving ? 'Creating…' : 'Create account' }}
          </button>
        </div>
      </form>

      <div
        v-if="editing"
        class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
      >
        <h4 class="mb-4 text-sm font-medium text-gray-800 dark:text-white/90">
          Roles for {{ editing.email }}
        </h4>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label
            v-for="r in STAFF_ROLES"
            :key="r.value"
            class="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
            :class="{ 'border-brand-500': draftRoles.includes(r.value) }"
          >
            <input
              type="checkbox"
              :checked="draftRoles.includes(r.value)"
              class="mt-0.5 h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
              @change="draftRoles = toggle(draftRoles, r.value)"
            />
            <span>
              <span class="block text-sm font-medium text-gray-800 dark:text-white/90">
                {{ r.label }}
              </span>
              <span class="block text-xs text-gray-500 dark:text-gray-400">{{ r.note }}</span>
            </span>
          </label>
        </div>
        <p class="mt-2 text-xs text-gray-400">
          Removing every role here leaves an ordinary account that cannot sign in to the admin.
        </p>
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

      <div class="border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
        <input
          v-model="q"
          type="search"
          placeholder="Search name or email"
          :class="inputClass"
        />
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[760px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Person</th>
              <th class="px-5 py-3 font-medium">Roles</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium sm:px-6"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="4" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="4" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Nobody matches.
              </td>
            </tr>
            <tr v-for="m in rows" :key="m.id" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
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
              </td>
              <td class="px-5 py-3.5 text-sm">
                <span
                  :class="m.status === 'active' ? 'text-gray-600 dark:text-gray-300' : 'text-error-500'"
                >
                  {{ m.status }}
                </span>
              </td>
              <td class="px-5 py-3.5 text-right text-sm sm:px-6">
                <button
                  type="button"
                  class="text-brand-500 hover:text-brand-600"
                  @click="openRoles(m)"
                >
                  Roles
                </button>
                <button
                  type="button"
                  class="ml-4 text-brand-500 hover:text-brand-600"
                  @click="resetPassword(m)"
                >
                  Reset password
                </button>
                <button
                  type="button"
                  class="ml-4"
                  :class="m.status === 'active' ? 'text-error-500' : 'text-success-600'"
                  @click="toggleStatus(m)"
                >
                  {{ m.status === 'active' ? 'Suspend' : 'Reinstate' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </admin-layout>
</template>
