<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import FileField from '@/components/forms/FileField.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'
import {
  ApiError,
  me as meApi,
  type MyProfile,
  type MyProfileInput,
  type MyTeacherProfileInput,
  type PayoutDetails,
  type PayoutDetailsInput,
  type TaughtLanguage,
  type TeacherProfile,
} from '@/lib/api'
import { UI_LOCALES } from '@/lib/locales'

/**
 * Your own account.
 *
 * Replaces the theme's profile page, which was three cards of invented details
 * with nothing behind them.
 *
 * Deliberately narrow. Email, roles and status are not here: changing an email
 * needs the new address proved, and the two things that decide what somebody
 * can do are not things they should hand themselves. A teacher also edits the
 * page students read about them, because nobody else should have to.
 */
const auth = useAuthStore()
const { ask } = useConfirm()

const loading = ref(true)
const error = ref('')

/* ---------------- the account ---------------- */

const profile = ref<MyProfile | null>(null)
const form = ref<MyProfileInput>({
  firstName: '',
  lastName: '',
  phoneCountryCode: null,
  phoneNational: null,
  locale: 'th',
})
const avatarPath = ref<string | null>(null)
const savingProfile = ref(false)
const profileSaved = ref(false)
const profileErrors = ref<Record<string, string>>({})

const LOCALES: { value: MyProfileInput['locale']; label: string }[] = UI_LOCALES

/**
 * What a teacher may say they teach — a different list from the one above.
 *
 * These checkboxes used to read `LOCALES`, which was the same four values at
 * the time. It is not any more: the site speaks eight languages and the school
 * still teaches four, and the API refuses the other four outright.
 */
const TAUGHT: { value: TaughtLanguage; label: string }[] = [
  { value: 'jp', label: 'Japanese' },
  { value: 'en', label: 'English' },
  { value: 'th', label: 'Thai' },
  { value: 'vn', label: 'Vietnamese' },
]

async function loadProfile() {
  const res = await meApi.profile()
  profile.value = res.data
  form.value = {
    firstName: res.data.firstName,
    lastName: res.data.lastName,
    phoneCountryCode: res.data.phoneCountryCode,
    phoneNational: res.data.phoneNational,
    locale: res.data.locale as MyProfileInput['locale'],
  }
  avatarPath.value = res.data.avatarPath
}

async function saveProfile() {
  savingProfile.value = true
  profileSaved.value = false
  profileErrors.value = {}
  error.value = ''
  try {
    const res = await meApi.save({ ...form.value, avatarPath: avatarPath.value })
    profile.value = res.data
    // The header and the sidebar read the store, so it has to hear about this
    // or the name in the corner stays wrong until the next reload.
    await auth.bootstrap()
    profileSaved.value = true
  } catch (err) {
    if (err instanceof ApiError) {
      profileErrors.value = err.fields
      error.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      error.value = 'Could not save. Try again.'
    }
  } finally {
    savingProfile.value = false
  }
}

/* ---------------- the public page, for a teacher ---------------- */

const isTeacher = computed(() => auth.roles.includes('teacher'))
const teacher = ref<TeacherProfile | null>(null)
const teacherForm = ref<MyTeacherProfileInput>({
  slug: '',
  displayName: '',
  shortName: '',
  headline: null,
  bio: null,
  languages: [],
  credentials: null,
  yearsExperience: null,
})
const savingTeacher = ref(false)
const teacherSaved = ref(false)
const teacherError = ref('')
const teacherErrors = ref<Record<string, string>>({})

async function loadTeacher() {
  const res = await meApi.teacherProfile()
  teacher.value = res.data
  if (res.data) {
    teacherForm.value = {
      slug: res.data.slug,
      displayName: res.data.displayName,
      shortName: res.data.shortName,
      headline: res.data.headline,
      bio: res.data.bio,
      languages: res.data.languages ?? [],
      credentials: res.data.credentials,
      yearsExperience: res.data.yearsExperience,
    }
  }
}

function toggleLanguage(code: TaughtLanguage) {
  const list = teacherForm.value.languages ?? []
  teacherForm.value.languages = list.includes(code)
    ? list.filter((l) => l !== code)
    : [...list, code]
}

async function saveTeacher() {
  savingTeacher.value = true
  teacherSaved.value = false
  teacherError.value = ''
  teacherErrors.value = {}
  try {
    teacher.value = (await meApi.saveTeacherProfile(teacherForm.value)).data
    teacherSaved.value = true
  } catch (err) {
    if (err instanceof ApiError) {
      teacherErrors.value = err.fields
      teacherError.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      teacherError.value = 'Could not save. Try again.'
    }
  } finally {
    savingTeacher.value = false
  }
}

/* ---------------- identity and bank, for a teacher ---------------- */

const payoutForm = ref<PayoutDetailsInput>({
  idDocumentPath: null,
  bankName: null,
  accountName: null,
  accountNumber: null,
  branch: null,
  swift: null,
  payoutCurrency: null,
  idDocumentUploadedAt: null,
  bankCountry: null,
  resumePath: null,
})
/** Sent with the record, so this list is whatever the server will accept. */
const currencies = ref<PayoutDetails['currencies']>([])
const countries = ref<PayoutDetails['countries']>([])
const thaiBanks = ref<PayoutDetails['thaiBanks']>([])
/**
 * What this teacher keeps of a sale, and whether it was agreed with them or
 * is simply the school's usual rate. Shown, never edited: only the school
 * sets it, and the API has no field for it here.
 */
/** The CV they applied with, so they can see which one the school holds. */
const myResumeUrl = ref<string | null>(null)
/** Whether what is on file is their own upload or the application copy. */
const resumeIsCurrent = ref(false)
const myShare = ref<number | null>(null)
const shareIsAgreed = ref(false)
const inThailand = computed(() => payoutForm.value.bankCountry === 'TH')

/** Picking a Thai bank fills in its SWIFT code — eight characters of
 *  nothing-in-particular, and the most mistyped field on this card. */
function pickThaiBank(name: string) {
  payoutForm.value.bankName = name
  const bank = thaiBanks.value.find((b) => b.name.en === name || b.name.th === name)
  if (bank) payoutForm.value.swift = bank.swift
}
const savingPayout = ref(false)
const payoutSaved = ref(false)
const payoutError = ref('')

async function loadPayout() {
  const { data } = await meApi.payoutDetails()
  const { currencies: list, countries: cs, thaiBanks: tb, revenueSharePct, houseSharePct, resumeUrl, resumeIsCurrent: cur, ...rest } = data
  myResumeUrl.value = resumeUrl
  resumeIsCurrent.value = cur
  myShare.value = revenueSharePct ?? houseSharePct
  shareIsAgreed.value = revenueSharePct !== null
  currencies.value = list
  countries.value = cs
  thaiBanks.value = tb
  payoutForm.value = rest
}

async function savePayout() {
  savingPayout.value = true
  payoutSaved.value = false
  payoutError.value = ''
  try {
    const { currencies: list, countries: cs, thaiBanks: tb, revenueSharePct, houseSharePct, resumeUrl, resumeIsCurrent: cur, ...rest } = (
      await meApi.savePayoutDetails(payoutForm.value)
    ).data
    myShare.value = revenueSharePct ?? houseSharePct
    shareIsAgreed.value = revenueSharePct !== null
    myResumeUrl.value = resumeUrl
    resumeIsCurrent.value = cur
    currencies.value = list
    countries.value = cs
    thaiBanks.value = tb
    payoutForm.value = rest
    payoutSaved.value = true
  } catch (err) {
    payoutError.value =
      err instanceof ApiError ? err.message : 'Could not save. Try again.'
  } finally {
    savingPayout.value = false
  }
}

/* ---------------- password ---------------- */

const pw = ref({ current: '', next: '', confirm: '' })
const changingPw = ref(false)
const pwError = ref('')
const pwErrors = ref<Record<string, string>>({})
const pwDone = ref('')

async function changePassword() {
  pwError.value = ''
  pwErrors.value = {}
  pwDone.value = ''

  if (pw.value.next !== pw.value.confirm) {
    pwErrors.value.confirm = 'The two passwords do not match.'
    return
  }

  changingPw.value = true
  try {
    const res = await meApi.changePassword(pw.value.current, pw.value.next)
    pwDone.value = res.message
    pw.value = { current: '', next: '', confirm: '' }
    // Changing a password ends every other session, this one included.
    await loadSessions()
  } catch (err) {
    if (err instanceof ApiError) {
      pwErrors.value = err.fields
      pwError.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      pwError.value = 'Could not change the password.'
    }
  } finally {
    changingPw.value = false
  }
}

/* ---------------- where you are signed in ---------------- */

type Session = Awaited<ReturnType<typeof meApi.sessions>>['data'][number]

const sessions = ref<Session[]>([])

async function loadSessions() {
  try {
    sessions.value = (await meApi.sessions()).data
  } catch {
    sessions.value = []
  }
}

async function endSession(s: Session) {
  const { ok } = await ask({
    title: 'Sign that device out?',
    message: s.current
      ? 'That is this browser — you will be signed out here.'
      : 'Whoever is using it will have to sign in again.',
    confirmLabel: 'Sign it out',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await meApi.endSession(s.id)
    if (s.current) window.location.href = '/signin'
    else await loadSessions()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not end that session.'
  }
}

async function endAll() {
  const { ok } = await ask({
    title: 'Sign out everywhere?',
    message: 'Every device, this one included. Use this if you think somebody else has your password.',
    confirmLabel: 'Sign out everywhere',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await meApi.endAllSessions()
    window.location.href = '/signin'
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not sign out.'
  }
}

/* ---------------- presentation ---------------- */

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
function when(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '—'
}

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'
const cardClass =
  'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'

onMounted(async () => {
  try {
    await Promise.all([
      loadProfile(),
      loadSessions(),
      isTeacher.value ? loadTeacher() : null,
      isTeacher.value ? loadPayout() : null,
    ])
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load your account.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="My account" />

    <p
      v-if="error"
      role="alert"
      class="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>

    <p v-if="loading" class="py-10 text-center text-sm text-gray-500">Loading…</p>

    <div v-else class="mx-auto max-w-4xl space-y-6">
      <!-- You -->
      <section :class="cardClass">
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">You</h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {{ profile?.email }} · {{ auth.roles.join(', ') || 'no role' }}
          </p>
        </div>

        <form class="px-5 py-5 sm:px-6" @submit.prevent="saveProfile">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label :class="labelClass">First name<span class="text-error-500">*</span></label>
              <input v-model="form.firstName" required maxlength="100" :class="inputClass" />
              <p v-if="profileErrors.firstName" class="mt-1 text-sm text-error-500">
                {{ profileErrors.firstName }}
              </p>
            </div>
            <div>
              <label :class="labelClass">Last name<span class="text-error-500">*</span></label>
              <input v-model="form.lastName" required maxlength="100" :class="inputClass" />
              <p v-if="profileErrors.lastName" class="mt-1 text-sm text-error-500">
                {{ profileErrors.lastName }}
              </p>
            </div>
            <div>
              <label :class="labelClass">Phone</label>
              <div class="flex gap-2">
                <input
                  v-model="form.phoneCountryCode"
                  placeholder="+66"
                  maxlength="8"
                  class="h-11 w-20 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
                <input
                  v-model="form.phoneNational"
                  inputmode="tel"
                  maxlength="32"
                  :class="`${inputClass} flex-1`"
                />
              </div>
            </div>
            <div>
              <label :class="labelClass">Language for this admin</label>
              <select v-model="form.locale" :class="inputClass">
                <option v-for="l in LOCALES" :key="l.value" :value="l.value">{{ l.label }}</option>
              </select>
            </div>
            <div class="sm:col-span-2">
              <!-- The ticket is scoped to this account: a non-admin asking for
                   somebody else's avatar folder is refused by the API. -->
              <FileField
                v-model="avatarPath"
                label="Photo"
                purpose="avatar"
                accept="image/*"
                preview
                help="Shown beside your name here, and on your public page if you teach."
              />
            </div>
          </div>

          <div class="mt-4 flex items-center gap-3">
            <button
              type="submit"
              :disabled="savingProfile"
              class="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {{ savingProfile ? 'Saving…' : 'Save' }}
            </button>
            <p v-if="profileSaved" class="text-sm text-success-600 dark:text-success-400">Saved.</p>
          </div>
        </form>
      </section>

      <!-- Your public page, if you teach -->
      <section v-if="isTeacher" :class="cardClass">
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            Your public page
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            What students read about you on your courses.
            <template v-if="teacher"> Its web address is /teachers/{{ teacher.slug }}.</template>
          </p>
        </div>

        <p
          v-if="!teacher"
          class="px-5 py-8 text-sm text-gray-500 dark:text-gray-400 sm:px-6"
        >
          Your page has not been set up yet — an administrator creates it with your web address.
          Ask them, and this is where you fill it in.
        </p>

        <form v-else class="px-5 py-5 sm:px-6" @submit.prevent="saveTeacher">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label :class="labelClass">Name as it appears<span class="text-error-500">*</span></label>
              <input v-model="teacherForm.displayName" required maxlength="150" :class="inputClass" />
              <p class="mt-1 text-xs text-gray-400">Shown on your courses and your page.</p>
            </div>
            <div>
              <label :class="labelClass">Short name<span class="text-error-500">*</span></label>
              <input v-model="teacherForm.shortName" required maxlength="100" :class="inputClass" />
              <p class="mt-1 text-xs text-gray-400">For course cards, where there is less room.</p>
            </div>
            <div class="sm:col-span-2">
              <label :class="labelClass">Profile URL<span class="text-error-500">*</span></label>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-400">/teachers/</span>
                <input
                  v-model="teacherForm.slug"
                  required
                  maxlength="150"
                  :class="`${inputClass} flex-1`"
                />
              </div>
              <!-- Changing it is allowed, and worth a word: the old address is
                   what anybody who already shared the page is using. -->
              <p class="mt-1 text-xs text-gray-400">
                Letters, numbers and hyphens. Changing it stops old links to your page working.
              </p>
              <p v-if="teacherErrors.slug" class="mt-1 text-sm text-error-500">
                {{ teacherErrors.slug }}
              </p>
            </div>
            <div class="sm:col-span-2">
              <label :class="labelClass">One line about what you teach</label>
              <input
                v-model="teacherForm.headline"
                maxlength="180"
                :class="inputClass"
                placeholder="ภาษาญี่ปุ่นสำหรับผู้เริ่มต้น · เตรียมสอบ JLPT N5–N3"
              />
            </div>
            <div class="sm:col-span-2">
              <label :class="labelClass">About you</label>
              <textarea
                v-model="teacherForm.bio"
                rows="4"
                maxlength="5000"
                class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              ></textarea>
            </div>
            <div class="sm:col-span-2">
              <label :class="labelClass">Qualifications</label>
              <textarea
                v-model="teacherForm.credentials"
                rows="3"
                maxlength="5000"
                class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              ></textarea>
            </div>
            <div>
              <label :class="labelClass">Years teaching</label>
              <input
                v-model.number="teacherForm.yearsExperience"
                type="number"
                min="0"
                max="80"
                :class="inputClass"
              />
            </div>
            <div>
              <label :class="labelClass">Languages you teach in</label>
              <div class="flex flex-wrap gap-2 pt-1.5">
                <button
                  v-for="l in TAUGHT"
                  :key="l.value"
                  type="button"
                  class="rounded-full border px-3 py-1.5 text-sm transition"
                  :class="
                    teacherForm.languages?.includes(l.value)
                      ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/15'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5'
                  "
                  @click="toggleLanguage(l.value)"
                >
                  {{ l.label }}
                </button>
              </div>
            </div>
          </div>

          <p v-if="teacherError" role="alert" class="mt-3 text-sm text-error-500">
            {{ teacherError }}
          </p>

          <div class="mt-4 flex items-center gap-3">
            <button
              type="submit"
              :disabled="savingTeacher"
              class="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {{ savingTeacher ? 'Saving…' : 'Save' }}
            </button>
            <p v-if="teacherSaved" class="text-sm text-success-600 dark:text-success-400">Saved.</p>
          </div>
        </form>
      </section>

      <!-- Identity and bank, for a teacher who gets paid -->
      <section v-if="isTeacher" :class="cardClass">
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            Identity and payouts
          </h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Only you and the school's administrators can see what is on this card.
          </p>
        </div>

        <form class="px-5 py-5 sm:px-6" @submit.prevent="savePayout">
          <!-- Shown, not edited. The share is the school's to agree, and the
               route this form saves through has no field for it — so putting
               a box here would only teach somebody to type into something
               that does nothing. -->
          <div
            v-if="myShare !== null"
            class="mb-5 rounded-lg bg-gray-50 px-4 py-3 dark:bg-white/[0.03]"
          >
            <p class="text-xs font-medium uppercase tracking-wide text-gray-400">
              Your share of a sale
            </p>
            <p class="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {{ myShare }}%
            </p>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Of what the school receives for your courses, after any discount.
              {{
                shareIsAgreed
                  ? 'Agreed with you by the school.'
                  : "The school's usual rate."
              }}
              Set by the school — ask an administrator to change it.
            </p>
          </div>

          <div class="mb-5">
            <FileField
              v-model="payoutForm.resumePath"
              purpose="teacher-resume"
              label="CV"
              accept=".pdf,.doc,.docx,image/*"
              hint="Keep it up to date — the school reads this one. The copy you applied with is kept separately and does not change."
            />
            <p v-if="myResumeUrl" class="mt-1 text-xs text-gray-400">
              <a :href="myResumeUrl" target="_blank" rel="noopener" class="text-brand-500 hover:text-brand-600">
                Open the CV on file
              </a>
              <span class="ml-2">{{ resumeIsCurrent ? 'Your upload' : 'The one you applied with' }}</span>
            </p>
          </div>

          <div class="mb-5">
            <FileField
              v-model="payoutForm.idDocumentPath"
              purpose="identity-document"
              label="ID/Passport"
              accept="image/*,application/pdf"
              hint="Please upload a clear photo or copy of your National ID Card or Passport for identity verification."
            />
          </div>

          <h4 class="mb-1.5 text-sm font-medium text-gray-800 dark:text-white/90">
            Bank Account Details
          </h4>
          <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Enter your bank information for payouts. Account name must match the full name on your
            submitted ID/Passport.
          </p>

          <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label :class="labelClass">Country</label>
              <select v-model="payoutForm.bankCountry" :class="inputClass">
                <option :value="null">Choose a country</option>
                <option v-for="c in countries" :key="c.code" :value="c.code">
                  {{ c.name.en }}
                </option>
              </select>
              <p class="mt-1 text-xs text-gray-400">Where the account is held.</p>
            </div>
            <div>
              <label :class="labelClass">Bank</label>
              <select
                v-if="inThailand"
                :value="payoutForm.bankName ?? ''"
                :class="inputClass"
                @change="pickThaiBank(($event.target as HTMLSelectElement).value)"
              >
                <option value="">Choose your bank</option>
                <option v-for="b in thaiBanks" :key="b.swift" :value="b.name.en">
                  {{ b.name.th }} · {{ b.name.en }}
                </option>
              </select>
              <input v-else v-model="payoutForm.bankName" maxlength="120" :class="inputClass" />
              <p v-if="inThailand" class="mt-1 text-xs text-gray-400">
                Picking your bank fills in the SWIFT code below.
              </p>
            </div>
            <div>
              <label :class="labelClass">Account name</label>
              <input v-model="payoutForm.accountName" maxlength="150" :class="inputClass" />
            </div>
            <div>
              <label :class="labelClass">Account Number / IBAN</label>
              <input v-model="payoutForm.accountNumber" maxlength="64" :class="inputClass" />
            </div>
            <div>
              <label :class="labelClass">Branch</label>
              <input v-model="payoutForm.branch" maxlength="120" :class="inputClass" />
            </div>
            <div>
              <label :class="labelClass">SWIFT / BIC</label>
              <input v-model="payoutForm.swift" maxlength="16" :class="inputClass" />
              <p class="mt-1 text-xs text-gray-400">Only for a transfer from outside Thailand.</p>
            </div>
            <div>
              <label :class="labelClass">Pay me in</label>
              <select v-model="payoutForm.payoutCurrency" :class="inputClass">
                <option :value="null">No preference</option>
                <option v-for="c in currencies" :key="c.code" :value="c.code">
                  {{ c.code }} — {{ c.name }}
                </option>
              </select>
            </div>
          </div>

          <p v-if="payoutError" role="alert" class="mt-3 text-sm text-error-500">
            {{ payoutError }}
          </p>

          <div class="mt-4 flex items-center gap-3">
            <button
              type="submit"
              :disabled="savingPayout"
              class="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {{ savingPayout ? 'Saving…' : 'Save' }}
            </button>
            <p v-if="payoutSaved" class="text-sm text-success-600 dark:text-success-400">Saved.</p>
          </div>
        </form>
      </section>

      <!-- Password -->
      <section :class="cardClass">
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">Password</h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Changing it signs you out everywhere else.
          </p>
        </div>

        <form class="px-5 py-5 sm:px-6" @submit.prevent="changePassword">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label :class="labelClass">Current password</label>
              <input
                v-model="pw.current"
                type="password"
                required
                autocomplete="current-password"
                :class="inputClass"
              />
              <p v-if="pwErrors.currentPassword" class="mt-1 text-sm text-error-500">
                {{ pwErrors.currentPassword }}
              </p>
            </div>
            <div>
              <label :class="labelClass">New password</label>
              <input
                v-model="pw.next"
                type="password"
                required
                autocomplete="new-password"
                :class="inputClass"
              />
              <p v-if="pwErrors.newPassword" class="mt-1 text-sm text-error-500">
                {{ pwErrors.newPassword }}
              </p>
            </div>
            <div>
              <label :class="labelClass">Again</label>
              <input
                v-model="pw.confirm"
                type="password"
                required
                autocomplete="new-password"
                :class="inputClass"
              />
              <p v-if="pwErrors.confirm" class="mt-1 text-sm text-error-500">
                {{ pwErrors.confirm }}
              </p>
            </div>
          </div>

          <p v-if="pwError" role="alert" class="mt-3 text-sm text-error-500">{{ pwError }}</p>

          <div class="mt-4 flex items-center gap-3">
            <button
              type="submit"
              :disabled="changingPw"
              class="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {{ changingPw ? 'Changing…' : 'Change password' }}
            </button>
            <p v-if="pwDone" class="text-sm text-success-600 dark:text-success-400">{{ pwDone }}</p>
          </div>
        </form>
      </section>

      <!-- Sessions -->
      <section :class="cardClass">
        <div
          class="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6"
        >
          <div>
            <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
              Where you are signed in
            </h3>
            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Each of these can open the admin as you until it is ended.
            </p>
          </div>
          <button
            v-if="sessions.length > 1"
            type="button"
            class="text-sm text-error-500 hover:underline"
            @click="endAll"
          >
            Sign out everywhere
          </button>
        </div>

        <ul class="divide-y divide-gray-100 dark:divide-gray-800">
          <li
            v-for="s in sessions"
            :key="s.id"
            class="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6"
          >
            <div class="min-w-0">
              <p class="truncate text-sm text-gray-800 dark:text-white/90">
                {{ s.deviceLabel || 'An unnamed device' }}
                <span
                  v-if="s.current"
                  class="ml-2 inline-flex rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-600 dark:bg-success-500/15 dark:text-success-400"
                >
                  this one
                </span>
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ s.ip ?? 'unknown address' }} · signed in {{ when(s.createdAt) }}
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 text-sm text-error-500 hover:underline"
              @click="endSession(s)"
            >
              Sign out
            </button>
          </li>
          <li v-if="!sessions.length" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
            No other sessions.
          </li>
        </ul>
      </section>
    </div>
  </admin-layout>
</template>
