<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import FileField from '@/components/forms/FileField.vue'
import {
  ApiError,
  people,
  teachers,
  type Member,
  type TeacherProfileInput,
} from '@/lib/api'

/**
 * A teacher's public page.
 *
 * Everything here is read by strangers deciding whether to pay, which is why
 * it is kept apart from the account: the account is how someone signs in, and
 * most accounts never have one of these.
 *
 * The photo is saved onto the account rather than the profile. A person has
 * one picture, and two would mean choosing which is current every time it
 * changes.
 */
const route = useRoute()
const userId = computed(() => Number(route.params.id))

const member = ref<Member | null>(null)
const form = ref<TeacherProfileInput & { avatarPath: string | null }>(blank())
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const fieldErrors = ref<Record<string, string>>({})
const slugTouched = ref(false)

const LANGUAGES: { value: 'th' | 'en' | 'jp' | 'vn'; label: string }[] = [
  { value: 'jp', label: 'Japanese' },
  { value: 'en', label: 'English' },
  { value: 'th', label: 'Thai' },
  { value: 'vn', label: 'Vietnamese' },
]

function blank(): TeacherProfileInput & { avatarPath: string | null } {
  return {
    displayName: '',
    shortName: '',
    slug: '',
    headline: '',
    bio: '',
    languages: [],
    credentials: '',
    yearsExperience: null,
    listed: true,
    avatarPath: null,
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [m, p] = await Promise.all([people.member(userId.value), teachers.profile(userId.value)])
    member.value = m.data

    if (p.data) {
      // `languages` is null in the database when nothing was picked; the form
      // wants a list it can push into.
      form.value = {
        ...p.data,
        languages: p.data.languages ?? [],
        avatarPath: m.data.avatarPath,
      }
      // An existing slug is already a public URL; never regenerate it.
      slugTouched.value = true
    } else {
      // A sensible first draft from what the account already knows.
      const full = `${m.data.firstName} ${m.data.lastName}`.trim()
      form.value = {
        ...blank(),
        displayName: full,
        shortName: full,
        slug: slugify(full),
        avatarPath: m.data.avatarPath,
      }
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load that profile.'
  } finally {
    loading.value = false
  }
}

function onNameInput() {
  if (!slugTouched.value) form.value.slug = slugify(form.value.displayName)
}

function toggleLanguage(value: 'th' | 'en' | 'jp' | 'vn') {
  const held = form.value.languages ?? []
  form.value.languages = held.includes(value)
    ? held.filter((l) => l !== value)
    : [...held, value]
}

async function save() {
  saving.value = true
  error.value = ''
  notice.value = ''
  fieldErrors.value = {}
  try {
    await teachers.saveProfile(userId.value, form.value)
    notice.value = 'Saved.'
    await load()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      error.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      error.value = 'Could not save that profile.'
    }
  } finally {
    saving.value = false
  }
}

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'
const textareaClass =
  'w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb :page-title="member ? `${member.firstName} ${member.lastName}` : 'Teacher'" />

    <p v-if="loading" class="text-sm text-gray-500">Loading…</p>

    <form v-else class="space-y-6" @submit.prevent="save">
      <p
        v-if="error"
        role="alert"
        class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
      >
        {{ error }}
      </p>
      <p
        v-if="notice"
        class="rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400"
      >
        {{ notice }}
      </p>

      <div
        class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6"
      >
        <h3 class="mb-1 text-base font-medium text-gray-800 dark:text-white/90">
          Public profile
        </h3>
        <p class="mb-5 text-sm text-gray-500 dark:text-gray-400">
          {{ member?.email }} — everything here is shown to people deciding whether to enrol.
        </p>

        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <FileField
              v-model="form.avatarPath"
              purpose="avatar"
              label="Photo"
              accept="image/*"
              hint="Square works best — it is shown as a circle on cards. Up to 4 MB."
              preview
            />
          </div>

          <div>
            <label :class="labelClass">
              Name as shown<span class="text-error-500">*</span>
            </label>
            <input
              v-model="form.displayName"
              required
              maxlength="150"
              :class="inputClass"
              @input="onNameInput"
            />
            <p class="mt-1 text-xs text-gray-400">
              With titles: “อ. ดร. ชลธิชา พรหมรักษ์”. The account holds a plain first and last
              name, which is not how a teacher is introduced.
            </p>
            <p v-if="fieldErrors.displayName" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.displayName }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Short name<span class="text-error-500">*</span></label>
            <input v-model="form.shortName" required maxlength="100" :class="inputClass" />
            <p class="mt-1 text-xs text-gray-400">
              For a course card, where the full form would wrap to three lines.
            </p>
            <p v-if="fieldErrors.shortName" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.shortName }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Profile URL<span class="text-error-500">*</span></label>
            <input
              v-model="form.slug"
              required
              maxlength="150"
              :class="inputClass"
              @input="slugTouched = true"
            />
            <p v-if="fieldErrors.slug" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.slug }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Years teaching</label>
            <input
              v-model.number="form.yearsExperience"
              type="number"
              min="0"
              max="80"
              :class="inputClass"
            />
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">One line under the name</label>
            <input
              v-model="form.headline"
              maxlength="180"
              placeholder="ภาษาญี่ปุ่นธุรกิจ · อดีตล่ามประจำบริษัทญี่ปุ่น"
              :class="inputClass"
            />
          </div>

          <div class="sm:col-span-2">
            <p :class="labelClass">Teaches</p>
            <div class="flex flex-wrap gap-3">
              <label
                v-for="l in LANGUAGES"
                :key="l.value"
                class="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
                :class="{ 'border-brand-500': (form.languages ?? []).includes(l.value) }"
              >
                <input
                  type="checkbox"
                  :checked="(form.languages ?? []).includes(l.value)"
                  class="h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
                  @change="toggleLanguage(l.value)"
                />
                {{ l.label }}
              </label>
            </div>
            <p class="mt-1 text-xs text-gray-400">
              People choose a language teacher by this before anything else.
            </p>
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">About</label>
            <textarea v-model="form.bio" rows="5" maxlength="5000" :class="textareaClass" />
            <p class="mt-1 text-xs text-gray-400">
              Shown when someone opens the instructor list on a course.
            </p>
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">Qualifications</label>
            <textarea
              v-model="form.credentials"
              rows="3"
              maxlength="2000"
              placeholder="JLPT N1 · ปริญญาโทการสอนภาษาญี่ปุ่น · วุฒิบัตรครูสอนภาษา"
              :class="textareaClass"
            />
          </div>

          <label
            class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-400 sm:col-span-2"
          >
            <input
              v-model="form.listed"
              type="checkbox"
              class="h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
            />
            List them on the site
          </label>
          <p class="text-xs text-gray-400 sm:col-span-2">
            Unticked while a profile is being written. Their courses still name them either way.
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          :disabled="saving"
          class="rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {{ saving ? 'Saving…' : 'Save profile' }}
        </button>
        <RouterLink
          to="/teachers"
          class="rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Back to teachers
        </RouterLink>
      </div>
    </form>
  </admin-layout>
</template>
