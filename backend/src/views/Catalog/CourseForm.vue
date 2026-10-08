<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import FileField from '@/components/forms/FileField.vue'
import {
  ApiError,
  api,
  teachers as teacherApi,
  type TeacherOption,
  type Category,
  type CourseInput,
  type CourseStatus,
} from '@/lib/api'
import { toBahtInput, toSatang } from '@/lib/money'
import { useAuthStore } from '@/stores/auth'

/**
 * Creating and editing a course.
 *
 * Prices are typed in baht and stored in satang. The conversion happens here
 * and in `money.ts` and nowhere else — see the note in that file for why.
 *
 * A teacher may save a course as a draft and submit it for review. Approving
 * is an admin's decision, because it is what puts a price in front of the
 * public, so the status list is shorter for everyone else.
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const id = computed(() => (route.params.id === 'new' ? null : Number(route.params.id)))
const isNew = computed(() => id.value === null)

const form = ref<CourseInput>(blank())
const priceBaht = ref('0.00')
const normalPriceBaht = ref('')
const outcomesText = ref('')
const audienceText = ref('')

const categories = ref<Category[]>([])
const teacherOptions = ref<TeacherOption[]>([])

/** One course, one teacher. Still sent as a list, because the pivot allows
 *  more and widening the rule later should not change the shape every caller
 *  sends. */
const teacherId = ref<number | null>(null)
const loading = ref(true)
const saving = ref(false)
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const slugTouched = ref(false)

function blank(): CourseInput {
  return {
    title: '',
    slug: '',
    categoryId: null,
    shortDesc: '',
    description: '',
    level: null,
    contentLocale: 'th',
    price: 0,
    normalPrice: null,
    accessType: 'lifetime',
    accessDurationDays: null,
    status: 'draft',
    sellable: true,
    repurchase: true,
    badge: null,
    featured: false,
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9฀-๿]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Only an admin decides what the public sees. A teacher proposes. */
const statusOptions = computed<{ value: CourseStatus; label: string }[]>(() =>
  auth.isAdmin
    ? [
        { value: 'draft', label: 'Draft — not visible' },
        { value: 'pending', label: 'Pending review' },
        { value: 'approved', label: 'Approved — live on the site' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'ended', label: 'Ended — no longer offered' },
      ]
    : [
        { value: 'draft', label: 'Draft — not visible' },
        { value: 'pending', label: 'Submit for review' },
      ],
)

/** Lines in, array out. One outcome per line is easier to edit than a
 *  comma-separated string that breaks on the first comma in a sentence. */
function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function load() {
  loading.value = true
  try {
    const [cats, picks] = await Promise.all([api.categories(), teacherApi.options()])
    categories.value = cats.data
    teacherOptions.value = picks.data
    if (!isNew.value) {
      const course = (await api.course(id.value!)).data
      form.value = { ...course }
      teacherId.value = course.instructors?.[0]?.id ?? null
      priceBaht.value = toBahtInput(course.price ?? 0)
      normalPriceBaht.value = toBahtInput(course.normalPrice ?? null)
      outcomesText.value = (course.outcomes ?? []).join('\n')
      audienceText.value = (course.audience ?? []).join('\n')
      // An existing slug is already a public URL; never regenerate it.
      slugTouched.value = true
    }
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : 'Could not load this course.'
  } finally {
    loading.value = false
  }
}

function onTitleInput() {
  if (!slugTouched.value) form.value.slug = slugify(form.value.title)
}

async function save() {
  saving.value = true
  formError.value = ''
  fieldErrors.value = {}

  const body: CourseInput = {
    ...form.value,
    instructorIds: teacherId.value ? [teacherId.value] : [],
    price: toSatang(priceBaht.value) ?? 0,
    normalPrice: toSatang(normalPriceBaht.value),
    outcomes: toLines(outcomesText.value),
    audience: toLines(audienceText.value),
    // 'lifetime' keeps no duration, or a stale number sits in the column
    // contradicting the access type beside it.
    accessDurationDays:
      form.value.accessType === 'limited' ? form.value.accessDurationDays : null,
  }

  try {
    if (isNew.value) {
      const created = await api.createCourse(body)
      await router.replace(`/courses/${created.data.id}`)
    } else {
      await api.updateCourse(id.value!, body)
    }
    await load()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      formError.value = Object.keys(err.fields).length
        ? 'Some fields need attention.'
        : err.message
    } else {
      formError.value = 'Could not save. Try again.'
    }
  } finally {
    saving.value = false
  }
}

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'
const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6'

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb :page-title="isNew ? 'New course' : form.title || 'Course'" />

    <p v-if="loading" class="text-sm text-gray-500">Loading…</p>

    <form v-else class="space-y-6" @submit.prevent="save">
      <p
        v-if="formError"
        role="alert"
        class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
      >
        {{ formError }}
      </p>

      <div :class="cardClass">
        <h3 class="mb-5 text-base font-medium text-gray-800 dark:text-white/90">Basics</h3>
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label :class="labelClass">Title<span class="text-error-500">*</span></label>
            <input
              v-model="form.title"
              required
              maxlength="255"
              :class="inputClass"
              @input="onTitleInput"
            />
            <p v-if="fieldErrors.title" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.title }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Slug<span class="text-error-500">*</span></label>
            <input
              v-model="form.slug"
              required
              maxlength="255"
              :class="inputClass"
              @input="slugTouched = true"
            />
            <p v-if="fieldErrors.slug" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.slug }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Category</label>
            <select v-model="form.categoryId" :class="inputClass">
              <option :value="null">— none —</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>

          <div>
            <label :class="labelClass">Level</label>
            <select v-model="form.level" :class="inputClass">
              <option :value="null">— not set —</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <div>
            <label :class="labelClass">Content language</label>
            <select v-model="form.contentLocale" :class="inputClass">
              <option value="th">Thai</option>
              <option value="en">English</option>
              <option value="jp">Japanese</option>
              <option value="vn">Vietnamese</option>
            </select>
            <p class="mt-1 text-xs text-gray-400">
              The language the lessons are in. It is not translated.
            </p>
          </div>

          <div class="sm:col-span-2">
            <p :class="labelClass">
              Taught by<span class="text-error-500">*</span>
              <span class="font-normal text-gray-400">
                — one course, one teacher
              </span>
            </p>

            <div class="space-y-2">
              <label
                v-for="t in teacherOptions"
                :key="t.id"
                class="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                :class="{ 'border-brand-500': teacherId === t.id }"
              >
                <input
                  v-model="teacherId"
                  type="radio"
                  :value="t.id"
                  name="course-teacher"
                  class="mt-0.5 h-5 w-5 border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
                />
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-gray-800 dark:text-white/90">
                    {{ t.name }}
                    <span v-if="!t.hasProfile" class="ml-2 text-xs text-warning-600">
                      no profile yet
                    </span>
                  </span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">
                    {{ t.headline ?? t.email }}
                  </span>
                </span>
              </label>
            </div>

            <p v-if="!teacherOptions.length" class="text-sm text-gray-400">
              Nobody has the teacher role yet. Approve a teacher application, or add one from
              Teachers.
            </p>
            <p v-if="fieldErrors.instructorIds" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.instructorIds }}
            </p>
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">Short description</label>
            <textarea
              v-model="form.shortDesc"
              rows="2"
              maxlength="500"
              class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p class="mt-1 text-xs text-gray-400">Shown on cards and in search results.</p>
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">Description</label>
            <textarea
              v-model="form.description"
              rows="6"
              class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div v-if="!isNew" class="sm:col-span-2">
            <FileField
              v-model="form.thumbnailPath"
              :course-id="id ?? undefined"
              purpose="course-thumbnail"
              label="Cover image"
              accept="image/*"
              hint="Shown on cards and at the top of the course page. Up to 8 MB."
              preview
            />
          </div>

          <div v-if="!isNew" class="sm:col-span-2">
            <FileField
              v-model="form.sampleVideoPath"
              :course-id="id ?? undefined"
              purpose="course-video"
              label="Sample video"
              accept="video/*"
              hint="A free taste of the course, playable before buying."
            />
          </div>

          <p v-if="isNew" class="text-sm text-gray-400 sm:col-span-2">
            Files can be uploaded once the course has been created.
          </p>

          <div>
            <label :class="labelClass">What they will learn</label>
            <textarea
              v-model="outcomesText"
              rows="5"
              placeholder="One per line"
              class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          <div>
            <label :class="labelClass">Who it is for</label>
            <textarea
              v-model="audienceText"
              rows="5"
              placeholder="One per line"
              class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>
      </div>

      <div :class="cardClass">
        <h3 class="mb-5 text-base font-medium text-gray-800 dark:text-white/90">
          Price and access
        </h3>
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label :class="labelClass">Price (฿)</label>
            <input v-model="priceBaht" inputmode="decimal" :class="inputClass" />
            <p class="mt-1 text-xs text-gray-400">0 makes the course free.</p>
            <p v-if="fieldErrors.price" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.price }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Original price (฿)</label>
            <input
              v-model="normalPriceBaht"
              inputmode="decimal"
              placeholder="Leave empty for no discount"
              :class="inputClass"
            />
            <p class="mt-1 text-xs text-gray-400">Shown struck through. Must be higher.</p>
            <p v-if="fieldErrors.normalPrice" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.normalPrice }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Access</label>
            <select v-model="form.accessType" :class="inputClass">
              <option value="lifetime">Lifetime</option>
              <option value="limited">Limited</option>
            </select>
          </div>

          <div v-if="form.accessType === 'limited'">
            <label :class="labelClass">Access lasts (days)</label>
            <input
              v-model.number="form.accessDurationDays"
              type="number"
              min="1"
              max="3650"
              :class="inputClass"
            />
            <p v-if="fieldErrors.accessDurationDays" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.accessDurationDays }}
            </p>
          </div>

          <div class="flex items-center gap-6 sm:col-span-2">
            <label class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-400">
              <input
                v-model="form.sellable"
                type="checkbox"
                class="h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
              />
              Still on sale
            </label>
            <label class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-400">
              <input
                v-model="form.repurchase"
                type="checkbox"
                class="h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
              />
              Can be bought again after access expires
            </label>
          </div>
        </div>
      </div>

      <div :class="cardClass">
        <h3 class="mb-5 text-base font-medium text-gray-800 dark:text-white/90">Publishing</h3>
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label :class="labelClass">Status</label>
            <select v-model="form.status" :class="inputClass">
              <option v-for="o in statusOptions" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
            <p v-if="!auth.isAdmin" class="mt-1 text-xs text-gray-400">
              An administrator approves a course before it goes live.
            </p>
          </div>

          <div>
            <label :class="labelClass">Badge</label>
            <select v-model="form.badge" :class="inputClass">
              <option :value="null">— none —</option>
              <option value="bestseller">Bestseller</option>
              <option value="recommended">Recommended</option>
              <option value="new">New</option>
              <option value="free">Free</option>
            </select>
          </div>

          <label
            class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-400 sm:col-span-2"
          >
            <input
              v-model="form.featured"
              type="checkbox"
              class="h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
            />
            Feature on the home page
          </label>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          :disabled="saving"
          class="rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {{ saving ? 'Saving…' : isNew ? 'Create course' : 'Save changes' }}
        </button>
        <RouterLink
          v-if="!isNew"
          :to="`/courses/${id}/curriculum`"
          class="rounded-lg border border-brand-500 px-5 py-3 text-sm font-medium text-brand-500 transition hover:bg-brand-50 dark:hover:bg-brand-500/10"
        >
          Modules and lessons
        </RouterLink>
        <RouterLink
          v-if="!isNew"
          :to="`/courses/${id}/quiz`"
          class="rounded-lg border border-brand-500 px-5 py-3 text-sm font-medium text-brand-500 transition hover:bg-brand-50 dark:hover:bg-brand-500/10"
        >
          Quiz
        </RouterLink>
        <RouterLink
          to="/courses"
          class="rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Back to courses
        </RouterLink>
      </div>
    </form>
  </admin-layout>
</template>
