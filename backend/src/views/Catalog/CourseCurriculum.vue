<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import FileField from '@/components/forms/FileField.vue'
import {
  ApiError,
  api,
  type Curriculum,
  type Lesson,
  type LessonInput,
  type LessonType,
} from '@/lib/api'
import { formatDuration } from '@/lib/money'

/**
 * A course's modules and lessons.
 *
 * Lessons belong to the course, not to the module. A short course can be a
 * flat list, and deleting a module leaves its lessons on the course rather
 * than taking the teaching with the heading.
 *
 * Order is moved one step at a time with buttons rather than by dragging.
 * Dragging is nicer with a mouse and unusable with a keyboard, and the whole
 * order is sent in one call either way — sending a row at a time would leave
 * the list half-sorted if the tab closed in the middle.
 */
const route = useRoute()
const courseId = computed(() => Number(route.params.id))

const data = ref<Curriculum | null>(null)
const courseTitle = ref('')
const loading = ref(true)
const error = ref('')

/* --- module editing --- */
const moduleTitle = ref('')
const editingModule = ref<number | null>(null)
const editingModuleTitle = ref('')

/* --- lesson editing --- */
const lessonOpen = ref<'new' | number | null>(null)
/** Which module a new lesson goes into; null means straight on the course. */
const lessonParent = ref<number | null>(null)
const lessonForm = ref<LessonInput>(blankLesson())
const lessonMinutes = ref(0)
const fieldErrors = ref<Record<string, string>>({})
const formError = ref('')
const saving = ref(false)

function blankLesson(): LessonInput {
  return {
    moduleId: null,
    type: 'video',
    title: '',
    subtitle: '',
    description: '',
    durationSeconds: 0,
    videoPath: null,
    documentPath: null,
    isPreview: false,
  }
}

const TYPE_LABEL: Record<LessonType, string> = {
  video: 'Video',
  document: 'Document',
  quiz: 'Quiz',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [course, curriculum] = await Promise.all([
      api.course(courseId.value),
      api.curriculum(courseId.value),
    ])
    courseTitle.value = course.data.title
    data.value = curriculum.data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load this curriculum.'
  } finally {
    loading.value = false
  }
}

async function addModule() {
  if (!moduleTitle.value.trim()) return
  try {
    await api.createModule(courseId.value, {
      title: moduleTitle.value.trim(),
      sortOrder: data.value?.modules.length ?? 0,
    })
    moduleTitle.value = ''
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not add that module.'
  }
}

function startRenameModule(mod: { id: number; title: string }) {
  editingModule.value = mod.id
  editingModuleTitle.value = mod.title
}

async function saveModuleTitle(moduleId: number) {
  const title = editingModuleTitle.value.trim()
  editingModule.value = null
  if (!title) return
  try {
    await api.updateModule(courseId.value, moduleId, { title })
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not rename that module.'
  }
}

async function removeModule(moduleId: number, title: string, lessonCount: number) {
  const note = lessonCount
    ? `\n\nIts ${lessonCount} lesson(s) stay on the course and move out of any module.`
    : ''
  if (!window.confirm(`Delete the module “${title}”?${note}`)) return
  try {
    await api.deleteModule(courseId.value, moduleId)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that module.'
  }
}

/** Swaps a row with its neighbour and sends the whole order. */
async function move(what: 'modules' | 'lessons', ids: number[], index: number, by: -1 | 1) {
  const next = index + by
  if (next < 0 || next >= ids.length) return
  const reordered = [...ids]
  ;[reordered[index], reordered[next]] = [reordered[next]!, reordered[index]!]
  try {
    await api.reorder(courseId.value, what, reordered as number[])
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change the order.'
  }
}

function openNewLesson(moduleId: number | null) {
  lessonOpen.value = 'new'
  lessonParent.value = moduleId
  lessonForm.value = { ...blankLesson(), moduleId }
  lessonMinutes.value = 0
  fieldErrors.value = {}
  formError.value = ''
}

function openLesson(lesson: Lesson) {
  lessonOpen.value = lesson.id
  lessonParent.value = lesson.moduleId
  lessonForm.value = { ...lesson }
  lessonMinutes.value = Math.round(lesson.durationSeconds / 60)
  fieldErrors.value = {}
  formError.value = ''
}

async function saveLesson() {
  saving.value = true
  fieldErrors.value = {}
  formError.value = ''

  const body: LessonInput = {
    ...lessonForm.value,
    // Lengths are entered in minutes and stored in seconds, the same way the
    // database sums them.
    durationSeconds: Math.max(0, Math.round(lessonMinutes.value * 60)),
  }

  try {
    if (lessonOpen.value === 'new') await api.createLesson(courseId.value, body)
    else if (lessonOpen.value != null) await api.updateLesson(courseId.value, lessonOpen.value, body)
    lessonOpen.value = null
    await load()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      formError.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      formError.value = 'Could not save that lesson.'
    }
  } finally {
    saving.value = false
  }
}

async function removeLesson(lesson: Lesson) {
  if (!window.confirm(`Delete the lesson “${lesson.title}”?`)) return
  try {
    await api.deleteLesson(courseId.value, lesson.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that lesson.'
  }
}

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'
const moveBtn =
  'rounded border border-gray-300 px-1.5 text-xs text-gray-500 disabled:opacity-30 dark:border-gray-700'

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb :page-title="courseTitle ? `${courseTitle} — curriculum` : 'Curriculum'" />

    <p
      v-if="error"
      role="alert"
      class="mb-5 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>

    <p v-if="loading" class="text-sm text-gray-500">Loading…</p>

    <template v-else-if="data">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ data.modules.length }} module(s) · total {{ formatDuration(data.totalSeconds) }}
        </p>
        <RouterLink
          :to="`/courses/${courseId}`"
          class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Course details
        </RouterLink>
      </div>

      <!-- The lesson form sits at the top while open, so the list below shows
           where the lesson is going. -->
      <form
        v-if="lessonOpen !== null"
        class="mb-6 rounded-2xl border border-brand-500/40 bg-white p-5 dark:bg-white/[0.03] sm:p-6"
        @submit.prevent="saveLesson"
      >
        <h3 class="mb-5 text-base font-medium text-gray-800 dark:text-white/90">
          {{ lessonOpen === 'new' ? 'New lesson' : 'Edit lesson' }}
        </h3>

        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label :class="labelClass">Type</label>
            <select v-model="lessonForm.type" :class="inputClass">
              <option value="video">Video</option>
              <option value="document">Document</option>
              <option value="quiz">Quiz</option>
            </select>
          </div>

          <div>
            <label :class="labelClass">Module</label>
            <select v-model="lessonForm.moduleId" :class="inputClass">
              <option :value="null">— directly on the course —</option>
              <option v-for="m in data.modules" :key="m.id" :value="m.id">{{ m.title }}</option>
            </select>
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">Title<span class="text-error-500">*</span></label>
            <input v-model="lessonForm.title" required maxlength="255" :class="inputClass" />
            <p v-if="fieldErrors.title" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.title }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Length (minutes)</label>
            <input v-model.number="lessonMinutes" type="number" min="0" :class="inputClass" />
            <p class="mt-1 text-xs text-gray-400">
              The course length is the sum of these and updates itself.
            </p>
          </div>

          <div v-if="lessonForm.type === 'video'" class="sm:col-span-2">
            <FileField
              v-model="lessonForm.videoPath"
              :course-id="courseId"
              purpose="course-video"
              label="Video"
              accept="video/*"
              hint="Uploaded straight to storage, in pieces, so a large file survives a dropped connection."
            />
            <p v-if="fieldErrors.videoPath" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.videoPath }}
            </p>
          </div>

          <div v-if="lessonForm.type === 'document'" class="sm:col-span-2">
            <FileField
              v-model="lessonForm.documentPath"
              :course-id="courseId"
              purpose="course-document"
              label="Document"
              accept=".pdf,.doc,.docx,.ppt,.pptx,image/*"
              hint="A worksheet or handout. Up to 200 MB."
            />
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">Subtitle</label>
            <input v-model="lessonForm.subtitle" maxlength="255" :class="inputClass" />
          </div>

          <label
            class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-400 sm:col-span-2"
          >
            <input
              v-model="lessonForm.isPreview"
              type="checkbox"
              class="h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
            />
            Free preview — playable before buying
          </label>
        </div>

        <p v-if="formError" role="alert" class="mt-3 text-sm text-error-500">{{ formError }}</p>

        <div class="mt-5 flex gap-3">
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {{ saving ? 'Saving…' : lessonOpen === 'new' ? 'Add lesson' : 'Save lesson' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
            @click="lessonOpen = null"
          >
            Cancel
          </button>
        </div>
      </form>

      <div class="space-y-4">
        <!-- Modules -->
        <div
          v-for="(mod, mi) in data.modules"
          :key="mod.id"
          class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div class="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
            <div class="flex flex-col gap-1">
              <button
                type="button"
                :class="moveBtn"
                :disabled="mi === 0"
                aria-label="Move module up"
                @click="move('modules', data.modules.map((m) => m.id), mi, -1)"
              >
                ▲
              </button>
              <button
                type="button"
                :class="moveBtn"
                :disabled="mi === data.modules.length - 1"
                aria-label="Move module down"
                @click="move('modules', data.modules.map((m) => m.id), mi, 1)"
              >
                ▼
              </button>
            </div>

            <template v-if="editingModule === mod.id">
              <input
                v-model="editingModuleTitle"
                class="h-10 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                @keyup.enter="saveModuleTitle(mod.id)"
                @keyup.esc="editingModule = null"
              />
              <button
                type="button"
                class="text-sm text-brand-500"
                @click="saveModuleTitle(mod.id)"
              >
                Save
              </button>
            </template>
            <template v-else>
              <h3 class="flex-1 text-base font-medium text-gray-800 dark:text-white/90">
                {{ mod.title }}
                <span class="ml-2 text-sm font-normal text-gray-400">
                  {{ mod.lessons.length }} lesson(s)
                </span>
              </h3>
              <button
                type="button"
                class="text-sm text-brand-500 hover:text-brand-600"
                @click="startRenameModule(mod)"
              >
                Rename
              </button>
            </template>

            <button
              type="button"
              class="text-sm text-brand-500 hover:text-brand-600"
              @click="openNewLesson(mod.id)"
            >
              Add lesson
            </button>
            <button
              type="button"
              class="text-sm text-error-500 hover:text-error-600"
              @click="removeModule(mod.id, mod.title, mod.lessons.length)"
            >
              Delete
            </button>
          </div>

          <ul
            v-if="mod.lessons.length"
            class="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800"
          >
            <li
              v-for="(lesson, li) in mod.lessons"
              :key="lesson.id"
              class="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6"
            >
              <div class="flex flex-col gap-1">
                <button
                  type="button"
                  :class="moveBtn"
                  :disabled="li === 0"
                  aria-label="Move lesson up"
                  @click="move('lessons', mod.lessons.map((l) => l.id), li, -1)"
                >
                  ▲
                </button>
                <button
                  type="button"
                  :class="moveBtn"
                  :disabled="li === mod.lessons.length - 1"
                  aria-label="Move lesson down"
                  @click="move('lessons', mod.lessons.map((l) => l.id), li, 1)"
                >
                  ▼
                </button>
              </div>
              <span
                class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300"
              >
                {{ TYPE_LABEL[lesson.type] }}
              </span>
              <span class="flex-1 text-sm text-gray-800 dark:text-white/90">
                {{ lesson.title }}
                <span
                  v-if="lesson.isPreview"
                  class="ml-2 rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-600 dark:bg-success-500/15 dark:text-success-400"
                >
                  preview
                </span>
              </span>
              <span class="text-sm text-gray-400">
                {{ formatDuration(lesson.durationSeconds) }}
              </span>
              <button type="button" class="text-sm text-brand-500" @click="openLesson(lesson)">
                Edit
              </button>
              <button type="button" class="text-sm text-error-500" @click="removeLesson(lesson)">
                Delete
              </button>
            </li>
          </ul>
          <p v-else class="border-t border-gray-100 px-5 py-4 text-sm text-gray-400 dark:border-gray-800 sm:px-6">
            No lessons in this module yet.
          </p>
        </div>

        <!-- Lessons that sit on the course itself -->
        <div
          v-if="data.loose.length"
          class="rounded-2xl border border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-white/[0.03]"
        >
          <div class="px-5 py-4 sm:px-6">
            <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
              Not in a module
              <span class="ml-2 text-sm font-normal text-gray-400">
                {{ data.loose.length }} lesson(s)
              </span>
            </h3>
          </div>
          <ul class="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
            <li
              v-for="lesson in data.loose"
              :key="lesson.id"
              class="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6"
            >
              <span
                class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300"
              >
                {{ TYPE_LABEL[lesson.type] }}
              </span>
              <span class="flex-1 text-sm text-gray-800 dark:text-white/90">{{ lesson.title }}</span>
              <span class="text-sm text-gray-400">
                {{ formatDuration(lesson.durationSeconds) }}
              </span>
              <button type="button" class="text-sm text-brand-500" @click="openLesson(lesson)">
                Edit
              </button>
              <button type="button" class="text-sm text-error-500" @click="removeLesson(lesson)">
                Delete
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div
        class="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6"
      >
        <div class="flex-1 min-w-[220px]">
          <label :class="labelClass">New module</label>
          <input
            v-model="moduleTitle"
            placeholder="e.g. Unit 1 — Greetings"
            :class="inputClass"
            @keyup.enter="addModule"
          />
        </div>
        <button
          type="button"
          class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
          @click="addModule"
        >
          Add module
        </button>
        <button
          type="button"
          class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
          @click="openNewLesson(null)"
        >
          Add lesson without a module
        </button>
      </div>
    </template>
  </admin-layout>
</template>
