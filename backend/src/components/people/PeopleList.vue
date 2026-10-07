<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import TablePager from '@/components/common/TablePager.vue'
import { ApiError, people, type CreateMemberInput, type Member, type RoleName } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'

/**
 * The table behind the students, teachers and admins screens.
 *
 * One component because they are the same table of people with the same four
 * actions; three screens because they are three different jobs, and a single
 * list with a filter on top makes you choose the job every time you arrive.
 *
 * Everything that changes an account is a superadmin's. An admin reads these
 * screens, because an admin who can grant roles can make itself a superadmin
 * and the two levels stop meaning anything.
 */
const props = defineProps<{
  group: 'students' | 'teachers' | 'admins'
  title: string
  subtitle: string
  /** Which roles this screen can hand out. Students get none. */
  roleOptions: RoleName[]
  /** Only the admins screen creates accounts. */
  allowCreate?: boolean
  createLabel?: string
  /** Roles a newly created account starts with. */
  createRoles?: RoleName[]
}>()

const auth = useAuthStore()
const { ask } = useConfirm()

const rows = ref<Member[]>([])
const total = ref(0)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')
const notice = ref('')

const page = ref(1)
const q = ref('')
const status = ref<'active' | 'suspended' | ''>('')

/** Shown once, then gone: not stored anywhere readable. */
const inviteUrl = ref('')

const creating = ref(false)
const form = ref<CreateMemberInput>(blank())
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)

const editing = ref<Member | null>(null)
const draftRoles = ref<RoleName[]>([])

/** The member whose password is being set, and the two boxes. */
const settingPassword = ref<Member | null>(null)
const pw1 = ref('')
const pw2 = ref('')

/** The confirmation on the create form. Checked here as well as by the API:
 *  a mistyped password locks someone out of an account only a superadmin can
 *  rescue. */
const confirmNew = ref('')

function blank(): CreateMemberInput {
  return {
    email: '',
    firstName: '',
    lastName: '',
    roles: [...(props.createRoles ?? ['admin'])],
    locale: 'th',
  }
}

const ROLE_NOTES: Record<RoleName, string> = {
  superadmin: 'Team, roles, settings, audit log',
  admin: 'Courses, orders, content, applications',
  teacher: 'Their own courses and marking',
  student: 'Learns on the public site',
}

const ROLE_STYLE: Record<RoleName, string> = {
  superadmin: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400',
  admin: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  teacher: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  student: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
}

/** Students hold no role worth editing, so that column is dropped for them. */
const showRoles = computed(() => props.roleOptions.length > 0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await people.members({
      group: props.group,
      page: page.value,
      perPage: 20,
      ...(q.value ? { q: q.value } : {}),
      ...(status.value ? { status: status.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load that list.'
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
// Arriving from another of these screens reuses the component, so the group
// changing has to reload rather than leaving the previous list on display.
watch(() => props.group, () => {
  page.value = 1
  q.value = ''
  status.value = ''
  void load()
})

function toggle(list: RoleName[], value: RoleName): RoleName[] {
  return list.includes(value) ? list.filter((r) => r !== value) : [...list, value]
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

async function create() {
  if (form.value.password && form.value.password !== confirmNew.value) {
    fieldErrors.value = { password: 'The two passwords do not match.' }
    return
  }
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
    confirmNew.value = ''
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

function openPassword(member: Member) {
  settingPassword.value = member
  pw1.value = ''
  pw2.value = ''
  error.value = ''
  notice.value = ''
  fieldErrors.value = {}
}

async function savePassword() {
  if (!settingPassword.value) return
  saving.value = true
  error.value = ''
  fieldErrors.value = {}
  try {
    await people.setPassword(settingPassword.value.id, pw1.value, pw2.value)
    notice.value = `Password set for ${settingPassword.value.email}. They have been signed out everywhere.`
    settingPassword.value = null
    pw1.value = ''
    pw2.value = ''
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      error.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      error.value = 'Could not set that password.'
    }
  } finally {
    saving.value = false
  }
}

async function toggleStatus(member: Member) {
  const next = member.status === 'active' ? 'suspended' : 'active'
  let reason = ''
  if (next === 'suspended') {
    const answer = await ask({
      title: `Suspend ${member.email}?`,
      message:
        'They will not be able to sign in. Nothing they bought, were taught or were marked on is removed.',
      confirmLabel: 'Suspend',
      tone: 'danger',
      reason: { label: 'Reason for the record', placeholder: 'Why this account is being stopped' },
    })
    if (!answer.ok) return
    reason = answer.reason
  }
  try {
    await people.setStatus(member.id, next, reason || undefined)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change that account.'
  }
}

const name = (m: Member) => `${m.firstName} ${m.lastName}`.trim() || m.email
const pageLabel = computed(() => `Page ${page.value} of ${totalPages.value}`)

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'

onMounted(load)
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
    <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
      <div>
        <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
          {{ total }} {{ props.title }}
        </h3>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{{ props.subtitle }}</p>
      </div>
      <button
        v-if="props.allowCreate && auth.isSuperadmin"
        type="button"
        class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
        @click="creating = !creating"
      >
        {{ creating ? 'Cancel' : (props.createLabel ?? 'Add someone') }}
      </button>
    </div>

    <p
      v-if="notice"
      class="mx-5 mb-4 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400 sm:mx-6"
    >
      {{ notice }}
    </p>

    <div
      v-if="inviteUrl"
      class="mx-5 mb-4 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 dark:bg-warning-500/10 sm:mx-6"
    >
      <p class="mb-2 text-sm text-warning-700 dark:text-warning-400">
        Set-password link — copy it now, it will not be shown again.
      </p>
      <code class="block break-all text-xs text-gray-700 dark:text-gray-300">{{ inviteUrl }}</code>
      <button type="button" class="mt-2 text-xs text-brand-500" @click="inviteUrl = ''">
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
          v-for="r in props.roleOptions"
          :key="r"
          class="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
          :class="{ 'border-brand-500': form.roles.includes(r) }"
        >
          <input
            type="checkbox"
            :checked="form.roles.includes(r)"
            class="mt-0.5 h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
            @change="form.roles = toggle(form.roles, r)"
          />
          <span>
            <span class="block text-sm font-medium capitalize text-gray-800 dark:text-white/90">
              {{ r }}
            </span>
            <span class="block text-xs text-gray-500 dark:text-gray-400">{{ ROLE_NOTES[r] }}</span>
          </span>
        </label>
      </div>
      <p v-if="fieldErrors.roles" class="mt-1 text-sm text-error-500">{{ fieldErrors.roles }}</p>

      <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label :class="labelClass">Password<span class="text-error-500">*</span></label>
          <input
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            :class="inputClass"
          />
          <p v-if="fieldErrors.password" class="mt-1 text-sm text-error-500">
            {{ fieldErrors.password }}
          </p>
        </div>
        <div>
          <label :class="labelClass">Confirm password<span class="text-error-500">*</span></label>
          <input
            v-model="confirmNew"
            type="password"
            required
            autocomplete="new-password"
            :class="inputClass"
          />
          <p v-if="confirmNew && confirmNew !== form.password" class="mt-1 text-sm text-error-500">
            The two passwords do not match.
          </p>
        </div>
      </div>


      <button
        type="submit"
        :disabled="saving"
        class="mt-5 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
      >
        {{ saving ? 'Creating…' : 'Create account' }}
      </button>
    </form>

    <form
      v-if="settingPassword"
      class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
      @submit.prevent="savePassword"
    >
      <h4 class="mb-1 text-sm font-medium text-gray-800 dark:text-white/90">
        Set a password for {{ settingPassword.email }}
      </h4>
      <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">
        They will be signed out everywhere, and the record shows you set it. Tell them to change it
        once they are in — a password two people know is not a password.
      </p>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label :class="labelClass">New password<span class="text-error-500">*</span></label>
          <input
            v-model="pw1"
            type="password"
            required
            autocomplete="new-password"
            minlength="8"
            :class="inputClass"
          />
          <p class="mt-1 text-xs text-gray-400">At least 8 characters, with a letter and a number.</p>
          <p v-if="fieldErrors.password" class="mt-1 text-sm text-error-500">
            {{ fieldErrors.password }}
          </p>
        </div>
        <div>
          <label :class="labelClass">Confirm password<span class="text-error-500">*</span></label>
          <input
            v-model="pw2"
            type="password"
            required
            autocomplete="new-password"
            :class="inputClass"
          />
          <p v-if="fieldErrors.confirmPassword" class="mt-1 text-sm text-error-500">
            {{ fieldErrors.confirmPassword }}
          </p>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-3">
        <button
          type="submit"
          :disabled="saving"
          class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {{ saving ? 'Saving…' : 'Set password' }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
          @click="settingPassword = null"
        >
          Cancel
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
          v-for="r in props.roleOptions"
          :key="r"
          class="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
          :class="{ 'border-brand-500': draftRoles.includes(r) }"
        >
          <input
            type="checkbox"
            :checked="draftRoles.includes(r)"
            class="mt-0.5 h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
            @change="draftRoles = toggle(draftRoles, r)"
          />
          <span>
            <span class="block text-sm font-medium capitalize text-gray-800 dark:text-white/90">
              {{ r }}
            </span>
            <span class="block text-xs text-gray-500 dark:text-gray-400">{{ ROLE_NOTES[r] }}</span>
          </span>
        </label>
      </div>
      <p class="mt-2 text-xs text-gray-400">
        Taking every role away here leaves an ordinary account that cannot open the admin. It will
        then appear under Students.
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

    <div
      class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-2 sm:px-6"
    >
      <input v-model="q" type="search" placeholder="Search name or email" :class="inputClass" />
      <select v-model="status" :class="inputClass">
        <option value="">Any status</option>
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
      </select>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full min-w-[760px] text-left">
        <thead class="border-b border-gray-100 dark:border-gray-800">
          <tr class="text-xs uppercase tracking-wide text-gray-400">
            <th class="px-5 py-3 font-medium sm:px-6">Person</th>
            <th v-if="showRoles" class="px-5 py-3 font-medium">Roles</th>
            <th class="px-5 py-3 font-medium">Email</th>
            <th class="px-5 py-3 font-medium">Status</th>
            <th class="px-5 py-3 font-medium sm:px-6"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
          <tr v-if="loading">
            <td :colspan="showRoles ? 5 : 4" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
              Loading…
            </td>
          </tr>
          <tr v-else-if="!rows.length">
            <td :colspan="showRoles ? 5 : 4" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
              Nobody here.
            </td>
          </tr>
          <tr v-for="m in rows" :key="m.id" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
            <td class="px-5 py-3.5 sm:px-6">
              <p class="text-sm font-medium text-gray-800 dark:text-white/90">{{ name(m) }}</p>
              <p class="mt-0.5 text-xs text-gray-400">{{ m.email }}</p>
            </td>
            <td v-if="showRoles" class="px-5 py-3.5">
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
                :class="m.status === 'active' ? 'text-gray-600 dark:text-gray-300' : 'text-error-500'"
              >
                {{ m.status }}
              </span>
            </td>
            <td class="px-5 py-3.5 text-right text-sm sm:px-6">
              <template v-if="auth.isSuperadmin">
                <button
                  v-if="showRoles"
                  type="button"
                  class="text-brand-500 hover:text-brand-600"
                  @click="openRoles(m)"
                >
                  Roles
                </button>
                <button
                  type="button"
                  class="ml-4 text-brand-500 hover:text-brand-600"
                  @click="openPassword(m)"
                >
                  Set password
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

    <TablePager
      v-model:page="page"
      :total-pages="totalPages"
      :total="total"
      :per-page="20"
      :noun="props.title"
    />
  </div>
</template>
