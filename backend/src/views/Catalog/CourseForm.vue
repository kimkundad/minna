<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import DropZone from '@/components/forms/DropZone.vue'
import FileField from '@/components/forms/FileField.vue'
import RichTextField from '@/components/forms/RichTextField.vue'
import {
  ApiError,
  api,
  teachers as teacherApi,
  type TeacherOption,
  type Category,
  type CourseInput,
  type CourseStatus,
  type Currency,
} from '@/lib/api'
import { toBahtInput, toSatang } from '@/lib/money'
import { useConfirm } from '@/composables/useConfirm'
import type { CourseDocument } from '@/lib/api'
import { UploadError, uploadFile } from '@/lib/upload'
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

const { ask } = useConfirm()

const id = computed(() => (route.params.id === 'new' ? null : Number(route.params.id)))
const isNew = computed(() => id.value === null)

const form = ref<CourseInput>(blank())
const priceBaht = ref('0.00')
const normalPriceBaht = ref('')

/**
 * The sample video on a brand-new course, which has no id to upload against
 * yet. Held here and sent the moment the course exists.
 */
/** The file the dropzone is holding until the course exists. */
const pendingSample = ref<File | null>(null)
const uploadingSample = ref(false)
const samplePercent = ref(0)
const sampleProblem = ref('')

/** Fetched rather than hard-coded, so the form cannot offer a currency the
 *  API would refuse. */
const currencies = ref<Currency[]>([])
const currencySymbol = computed(
  () => currencies.value.find((c) => c.code === form.value.currency)?.symbol ?? '฿',
)
const outcomesText = ref('')
const audienceText = ref('')

const categories = ref<Category[]>([])
const teacherOptions = ref<TeacherOption[]>([])

/** One course, one teacher. Still sent as a list, because the pivot allows
 *  more and widening the rule later should not change the shape every caller
 *  sends. */
const teacherId = ref<number | null>(null)

/** Below this many, a search box is more work than reading the list. */
const SEARCH_FROM = 8
const teacherSearch = ref('')

/** Name, subject and email together, because a school with two 田中 on the
 *  books is found by subject and one with two Sarahs is found by email. */
function teacherHaystack(t: TeacherOption): string {
  return `${t.name} ${t.short} ${t.headline ?? ''} ${t.email}`.toLowerCase()
}

function teacherLabel(t: TeacherOption): string {
  const suffix = t.hasProfile ? '' : '  (no profile yet)'
  return t.headline ? `${t.name} — ${t.headline}${suffix}` : `${t.name}${suffix}`
}

/** What the search found, before the chosen teacher is pinned back on. */
const teacherMatches = computed(() => {
  const term = teacherSearch.value.trim().toLowerCase()
  if (!term) return teacherOptions.value
  return teacherOptions.value.filter((t) => teacherHaystack(t).includes(term))
})

const visibleTeachers = computed(() => {
  // The one already chosen stays in the list even when the search excludes it,
  // so filtering never silently empties a required field.
  const chosen = teacherOptions.value.find((t) => t.id === teacherId.value)
  const matches = teacherMatches.value
  return chosen && !matches.some((t) => t.id === chosen.id) ? [chosen, ...matches] : matches
})

const selectedTeacher = computed(
  () => teacherOptions.value.find((t) => t.id === teacherId.value) ?? null,
)

/**
 * The course names somebody who cannot be chosen here.
 *
 * Happens when a course was set up before the teacher role existed, or when
 * whoever taught it has since lost the role. Without this the select simply
 * renders blank and the course looks as though it has no teacher — and saving
 * the form would quietly hand it to whoever was picked instead.
 */
const strandedInstructor = computed(() => {
  // Only an administrator can change who teaches a course, and only they are
  // given the list to compare against — a teacher's copy is always empty, so
  // without this every teacher opening any course of theirs was told it had
  // been left to somebody who is not a teacher. Which was their own name.
  if (!auth.isAdmin) return null
  if (teacherId.value === null) return null
  return selectedTeacher.value ? null : (currentInstructorName.value ?? 'Someone')
})

/** Kept from the loaded course, because the teacher list cannot name them. */
const currentInstructorName = ref<string | null>(null)
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
    currency: 'THB',
    price: 0,
    normalPrice: null,
    accessType: 'lifetime',
    accessDurationDays: null,
    status: 'draft',
    reviewNote: null,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
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
    // The teacher picker is an admin-only list, and only an admin picks from
    // it: a teacher's course is their own either way. Asking for it as a
    // teacher answered 403 and took the whole form down with it.
    const [cats, picks, money] = await Promise.all([
      api.categories(),
      auth.isAdmin ? teacherApi.options() : Promise.resolve({ data: [] }),
      api.currencies(),
    ])
    categories.value = cats.data
    teacherOptions.value = picks.data
    currencies.value = money.data
    if (!isNew.value) {
      const course = (await api.course(id.value!)).data
      form.value = { ...course }
      const current = course.instructors?.[0]
      teacherId.value = current?.id ?? null
      // `name` and `short`, which is what a course's instructors carry — the
      // display name a teacher is introduced by. Reading `firstName` and
      // `lastName` here, which belong to an account and not to this shape,
      // printed the words "undefined undefined" into a warning about who the
      // course had been left to.
      currentInstructorName.value = current?.name?.trim() || current?.short?.trim() || null
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

  // A teacher is shown their own share but cannot send it — the API refuses
  // the field from anybody but an admin, and the loaded course carries it, so
  // without taking it back out here a teacher saving a typo fix would be told
  // they are not allowed to change their pay.
  const { revenueSharePct: loadedShare, ...loaded } = form.value as CourseInput & {
    revenueSharePct?: number
  }
  void loadedShare

  const body: CourseInput = {
    ...loaded,
    // Left out by a teacher on purpose: the API files their course under
    // them, and refuses to let them hand it to anybody else.
    ...(auth.isAdmin ? { instructorIds: teacherId.value ? [teacherId.value] : [] } : {}),
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

      /**
       * The sample video, now that the course it belongs to exists.
       *
       * An upload ticket names a folder, and the folder is the course's id —
       * which is why this field used to appear only after the first save, with
       * a line explaining that files come later. A teacher putting a course up
       * for review wants the clip attached to the thing being reviewed, not on
       * a second visit they have to remember to make.
       *
       * So the file waits in the browser through the save and goes up straight
       * after, in the same press of the button.
       */
      const clip = pendingSample.value
      if (clip) {
        uploadingSample.value = true
        try {
          const up = await uploadFile(clip, {
            purpose: 'course-sample',
            courseId: created.data.id,
            onProgress: (f) => (samplePercent.value = Math.round(f * 100)),
          })
          await api.updateCourse(created.data.id, { sampleVideoPath: up.path })
        } catch (err) {
          // The course saved. Say what did not, and leave them on the course
          // where the field is waiting, rather than losing the whole form.
          sampleProblem.value =
            err instanceof ApiError ? err.message : 'The course saved, but the sample video did not upload. Try again below.'
        } finally {
          uploadingSample.value = false
          samplePercent.value = 0
        }
      }

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

/* ---------------- handouts that belong to the course ---------------- */

/**
 * Files the learning room shows under every lesson, not just one.
 *
 * A lesson's own file is edited with the lesson, up in the modules. These are
 * the course's — a handbook, a glossary, a sheet of exercises — and until now
 * they could only be put there by a seed script, which is why a course could
 * end up advertising a document nobody could rename or remove.
 */
const documents = ref<CourseDocument[]>([])
const docError = ref('')
/** '' when idle, otherwise "3 of 7" while a batch is going up. */
const docProgress = ref('')
const docInput = ref<HTMLInputElement | null>(null)

async function loadDocuments() {
  try {
    documents.value = (await api.documents(id.value!)).data
  } catch {
    // The rest of the form works without this.
  }
}

/**
 * Takes however many files were picked, one after another.
 *
 * Sequential rather than parallel: these are handbooks and slide decks, and
 * five of them at once would compete for the same connection and make all five
 * slower. The count in the button is what makes the wait legible.
 *
 * Each file is filed under its own name, which is what a student sees. Rename
 * fixes the ones where the filename is not what it should be called — most of
 * the time it already is.
 */
async function addDocuments(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return

  docError.value = ''
  const failures: string[] = []

  for (const [i, file] of files.entries()) {
    docProgress.value = `${i + 1} of ${files.length}`
    try {
      const stored = await uploadFile(file, { purpose: 'course-document', courseId: id.value! })
      await api.addDocument(id.value!, {
        fileName: file.name,
        filePath: stored.path,
        sizeBytes: stored.size,
      })
    } catch (err) {
      failures.push(
        `${file.name}: ${err instanceof UploadError || err instanceof ApiError ? err.message : 'failed'}`,
      )
    }
  }

  docProgress.value = ''
  // The ones that worked are already filed; only the rest are reported, so a
  // single bad file in a batch of six does not look like six failures.
  if (failures.length) docError.value = failures.join(' · ')
  await loadDocuments()
}

async function renameDocument(doc: CourseDocument) {
  const next = window.prompt('What should students see this called?', doc.fileName)
  if (next === null) return
  const name = next.trim()
  if (!name || name === doc.fileName) return
  try {
    await api.renameDocument(id.value!, doc.id, name)
    await loadDocuments()
  } catch (err) {
    docError.value = err instanceof ApiError ? err.message : 'Could not rename that document.'
  }
}

async function removeDocument(doc: CourseDocument) {
  const { ok } = await ask({
    title: 'Remove this document?',
    message: `"${doc.fileName}" disappears from the learning room. The file itself stays in storage, in case another course uses it.`,
    confirmLabel: 'Remove',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await api.deleteDocument(id.value!, doc.id)
    await loadDocuments()
  } catch (err) {
    docError.value = err instanceof ApiError ? err.message : 'Could not remove that document.'
  }
}

/** Megabytes, which is how a person judges whether a download is worth it. */
function fileSize(bytes: number | null): string {
  if (!bytes) return ''
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

onMounted(async () => {
  await load()
  // Only an existing course has anywhere to put a file.
  if (!isNew.value) await loadDocuments()
})
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
              <option value="id">Indonesian</option>
              <option value="zh">Chinese (Simplified)</option>
              <option value="ko">Korean</option>
              <option value="tw">Chinese (Traditional)</option>
              <option value="all">All languages</option>
            </select>
            <p class="mt-1 text-xs text-gray-400">
              The language the lessons are in. It is not translated. "All languages" puts the course
              in every answer when somebody filters the catalogue by language.
            </p>
          </div>

          <div class="sm:col-span-2">
            <p :class="labelClass">
              Taught by<span class="text-error-500">*</span>
              <span class="font-normal text-gray-400">
                — one course, one teacher
              </span>
            </p>

            <!-- A list of every teacher was fine at five and unusable at a
                 hundred, so this is one control. The search box appears only
                 once the list is long enough to need it: typing to filter two
                 names is more work than reading them. -->
            <div v-if="auth.isAdmin && teacherOptions.length" class="space-y-2">
              <input
                v-if="teacherOptions.length > SEARCH_FROM"
                v-model="teacherSearch"
                type="search"
                placeholder="Search by name, subject or email"
                :class="inputClass"
              />

              <select v-model="teacherId" :class="inputClass">
                <option :value="null" disabled>— choose a teacher —</option>
                <option v-for="t in visibleTeachers" :key="t.id" :value="t.id">
                  {{ teacherLabel(t) }}
                </option>
              </select>
            </div>

            <p
              v-if="strandedInstructor"
              class="mt-2 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
            >
              This course is down to <strong>{{ strandedInstructor }}</strong
              >, who is not a teacher, so they are not in the list. The public course page has no
              teacher to show. Choose one — saving will move the course to whoever is picked.
            </p>

            <!-- What the old list showed under each name, kept for the one that
                 is chosen: picking the wrong 田中 is easy with names alone. -->
            <p
              v-if="selectedTeacher"
              class="mt-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-white/[0.02] dark:text-gray-300"
            >
              <span class="font-medium text-gray-800 dark:text-white/90">
                {{ selectedTeacher.name }}
              </span>
              <span v-if="selectedTeacher.headline"> — {{ selectedTeacher.headline }}</span>
              <span class="block text-xs text-gray-500 dark:text-gray-400">
                {{ selectedTeacher.email }}
              </span>
              <router-link
                v-if="!selectedTeacher.hasProfile"
                :to="`/teachers/${selectedTeacher.id}`"
                class="mt-1 inline-block text-xs text-warning-600 hover:underline dark:text-warning-400"
              >
                No public profile yet — the course page will have nothing to show. Write one.
              </router-link>
            </p>

            <!-- On `teacherMatches`, not `visibleTeachers`: the chosen teacher
                 is pinned into the list whatever the search says, so going by
                 the visible list would leave the collapse unexplained. -->
            <p
              v-if="teacherSearch.trim() && !teacherMatches.length"
              class="mt-1 text-sm text-gray-400"
            >
              Nobody matches “{{ teacherSearch }}”<template v-if="selectedTeacher">
                — only the teacher already on this course is left</template
              >.
            </p>

            <!-- A teacher does not choose: the course is theirs, and the API
                 says so whatever this form sends. Saying whose name it will
                 carry is still worth doing — the field is marked required. -->
            <p
              v-if="!auth.isAdmin"
              class="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-white/[0.03] dark:text-gray-300"
            >
              {{ currentInstructorName ?? auth.displayName }}
              <span class="text-xs text-gray-400">— your own course</span>
            </p>

            <p v-else-if="!teacherOptions.length" class="text-sm text-gray-400">
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
            <RichTextField
              v-model="form.description"
              label="Description"
              :rows="10"
              help="The long description on the course page. Pictures can be dropped straight in."
              :error="fieldErrors.description ?? ''"
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
            <DropZone
              v-model="form.sampleVideoPath"
              :course-id="id ?? undefined"
              purpose="course-sample"
              label="Sample video"
              hint="A free taste of the course, playable before buying — and what a reviewer watches before approving it."
            />
          </div>

          <!-- On a new course there is no id yet, so there is no folder to
               issue a ticket for. The file is held here and goes up the moment
               the course exists, which to whoever pressed the button is the
               same press. -->
          <div v-if="isNew" class="sm:col-span-2">
            <DropZone
              deferred
              purpose="course-sample"
              label="Sample video"
              hint="Optional. A free taste of the course, and what a reviewer watches before approving it."
              :disabled="saving"
              @file="(f) => (pendingSample = f)"
            />

            <div v-if="uploadingSample" class="mt-2">
              <div
                class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
                role="progressbar"
                :aria-valuenow="samplePercent"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span
                  class="block h-full rounded-full bg-brand-500 transition-[width] duration-200"
                  :style="{ width: samplePercent + '%' }"
                />
              </div>
              <p class="mt-1 text-xs text-gray-500">
                Sending the video… {{ samplePercent }}% — keep this page open.
              </p>
            </div>

            <p v-if="sampleProblem" class="mt-1 text-sm text-error-500">{{ sampleProblem }}</p>
          </div>

          <p v-if="isNew" class="text-sm text-gray-400 sm:col-span-2">
            The cover picture and the course documents can be added once the course has been
            created.
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
            <label :class="labelClass">Currency</label>
            <select v-model="form.currency" :class="inputClass">
              <option v-for="c in currencies" :key="c.code" :value="c.code">
                {{ c.symbol }} {{ c.code }} — {{ c.name.en }}
              </option>
            </select>
            <p class="mt-1 text-xs text-gray-400">
              What buyers are charged, wherever they are. Prices are not converted.
            </p>
          </div>

          <div>
            <label :class="labelClass">Price ({{ currencySymbol }})</label>
            <input v-model="priceBaht" inputmode="decimal" :class="inputClass" />
            <p class="mt-1 text-xs text-gray-400">0 makes the course free.</p>
            <p v-if="fieldErrors.price" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.price }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Original price ({{ currencySymbol }})</label>
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

          <!-- The reason, where the decision is made. Only while the course is
               actually being sent back: a box for a verdict that is not being
               given invites somebody to fill it in anyway, and the note would
               then sit on an approved course saying something was wrong. -->
          <div v-if="auth.isAdmin && form.status === 'rejected'" class="sm:col-span-2">
            <label :class="labelClass">Why it is going back</label>
            <textarea
              v-model="form.reviewNote"
              rows="3"
              maxlength="1000"
              placeholder="What the teacher needs to change before this can be approved."
              :class="inputClass"
            />
            <p class="mt-1 text-xs text-gray-400">
              Sent to the teacher as a notification and shown on this page until they send it
              back in. Without it the verdict says only that something is wrong.
            </p>
          </div>

          <!-- The same note, to the person it is for. A teacher cannot write
               here — the field is the reviewer's — so it is read out rather
               than offered as an input. -->
          <div
            v-if="!auth.isAdmin && form.status === 'rejected' && form.reviewNote"
            class="sm:col-span-2 rounded-lg border border-warning-500/30 bg-warning-50 px-4 py-3 dark:bg-warning-500/10"
          >
            <p class="text-sm font-medium text-warning-700 dark:text-warning-400">
              This course was sent back
            </p>
            <p class="mt-1 text-sm text-gray-700 dark:text-gray-300">{{ form.reviewNote }}</p>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Make the changes, then set the status to "Submit for review" again.
            </p>
          </div>


          <!-- Only where the shared wording should differ from the page's.
               Empty is the normal state and shares as the page reads; these
               exist for a title that works on a page and badly in a chat
               window, or a cover that crops to nonsense at 1200×630. -->
          <div class="sm:col-span-2 mt-2 border-t border-gray-100 pt-5 dark:border-gray-800">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-400">
              Sharing
              <span class="ml-1 font-normal text-gray-500 dark:text-gray-500">
                — leave empty to share this course as it reads
              </span>
            </p>
          </div>

          <div>
            <label :class="labelClass">Share title</label>
            <input v-model="form.ogTitle" type="text" maxlength="255" :class="inputClass" />
          </div>

          <div>
            <label :class="labelClass">Share picture</label>
            <input v-model="form.ogImagePath" type="text" maxlength="512" placeholder="1200×630" :class="inputClass" />
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">Share description</label>
            <input v-model="form.ogDescription" type="text" maxlength="500" :class="inputClass" />
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

      <!-- Handouts that belong to the course rather than to one lesson -->
      <section
        v-if="!isNew"
        class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            Course documents
            <span class="ml-2 text-sm font-normal text-gray-400">
              {{ documents.length }} file(s)
            </span>
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Shown in the learning room under every lesson, so a handbook is to hand wherever the
            student is. A file that belongs to one lesson goes on that lesson instead.
          </p>
        </div>

        <ul v-if="documents.length" class="divide-y divide-gray-100 dark:divide-gray-800">
          <li
            v-for="doc in documents"
            :key="doc.id"
            class="flex items-center gap-4 px-5 py-3.5 sm:px-6"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                {{ doc.fileName }}
              </p>
              <p class="truncate font-mono text-xs text-gray-400">
                {{ doc.filePath
                }}<span v-if="fileSize(doc.sizeBytes)"> · {{ fileSize(doc.sizeBytes) }}</span>
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 text-sm text-brand-500 hover:underline"
              @click="renameDocument(doc)"
            >
              Rename
            </button>
            <button
              type="button"
              class="shrink-0 text-sm text-error-500 hover:underline"
              @click="removeDocument(doc)"
            >
              Remove
            </button>
          </li>
        </ul>
        <p v-else class="px-5 py-5 text-sm text-gray-400 sm:px-6">No course-wide documents yet.</p>

        <div class="border-t border-gray-100 px-5 py-5 dark:border-gray-800 sm:px-6">
          <label :class="labelClass">Add files</label>
          <!-- `multiple`: a course usually gains its handouts in one go, and
               uploading six of them one at a time is five trips to the dialog
               nobody needed. Each is filed under its own filename; Rename above
               fixes the ones where that is not what it should be called. -->
          <input
            ref="docInput"
            type="file"
            multiple
            :disabled="!!docProgress"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,image/*"
            class="mt-1.5 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600 disabled:opacity-60 dark:text-gray-400"
            @change="addDocuments"
          />
          <p class="mt-1.5 text-xs text-gray-400">
            Handbooks, glossaries, sheets of exercises. Up to 200 MB each.
          </p>
          <p v-if="docProgress" class="mt-2 text-sm text-brand-500">
            Uploading {{ docProgress }}…
          </p>
          <p v-if="docError" class="mt-2 text-sm text-error-500">{{ docError }}</p>
        </div>
      </section>

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
