<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import FileField from '@/components/forms/FileField.vue'
import {
  ApiError,
  api,
  quiz as quizApi,
  type Lesson,
  type QuestionInput,
  type QuestionType,
  type Quiz,
  type QuizQuestion,
} from '@/lib/api'
import { useConfirm } from '@/composables/useConfirm'

/**
 * The quiz behind a course. One per course, which the database enforces, so
 * there is nothing to pick between — it either exists or it is made here.
 *
 * Questions come in three shapes and each has a rule that makes it answerable:
 * one right answer, at least one right answer, or no choices at all. The API
 * refuses a question that breaks them, and so does this form, because finding
 * out after saving is worse than being told while typing.
 *
 * Which choices are correct is shown here and nowhere else. The learner's side
 * never receives it.
 */
const route = useRoute()
const { ask } = useConfirm()

const courseId = computed(() => Number(route.params.id))

const courseTitle = ref('')
const data = ref<Quiz | null>(null)
const quizLessons = ref<Lesson[]>([])
const loading = ref(true)
const error = ref('')

/* --- quiz settings --- */
const settings = ref<{
  title: string
  passPct: number
  timerMinutes: number | null
  lessonId: number | null
  imagePath: string | null
}>({
  title: '',
  passPct: 80,
  timerMinutes: null,
  lessonId: null,
  imagePath: null,
})
const savingSettings = ref(false)

/* --- question editing --- */
const open = ref<'new' | number | null>(null)
const form = ref<QuestionInput & { choices: { text: string; isCorrect: boolean }[] }>(blank())
const fieldErrors = ref<Record<string, string>>({})
const formError = ref('')
const saving = ref(false)

function blank(): QuestionInput & { choices: { text: string; isCorrect: boolean }[] } {
  return {
    type: 'single',
    text: '',
    imagePath: null,
    maxLength: 1000,
    attachmentAllowed: false,
    choices: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ],
  }
}

const TYPE_LABEL: Record<QuestionType, string> = {
  single: 'One answer',
  multiple: 'Several answers',
  essay: 'Written answer',
}

const TYPE_STYLE: Record<QuestionType, string> = {
  single: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  multiple: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  essay: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
}

/** Written answers are marked by a person, so they do not count toward the
 *  pass mark, which is the share of the choice questions got right. */
const markedCount = computed(
  () => data.value?.questions.filter((q) => q.type !== 'essay').length ?? 0,
)
const essayCount = computed(() => data.value?.questions.filter((q) => q.type === 'essay').length ?? 0)

const previews = ref<Record<string, string>>({})

async function loadPreviews(paths: (string | null)[]) {
  for (const path of paths) {
    if (!path || previews.value[path]) continue
    try {
      previews.value[path] = (await api.signPath(path, 900)).data.url
    } catch {
      // No preview is better than a broken image; the row still says there
      // is one.
    }
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [course, got, curriculum] = await Promise.all([
      api.course(courseId.value),
      quizApi.get(courseId.value),
      api.curriculum(courseId.value),
    ])
    courseTitle.value = course.data.title
    data.value = got.data
    // Only a lesson of type `quiz` can hold one, so the picker offers those.
    quizLessons.value = [
      ...curriculum.data.modules.flatMap((m) => m.lessons),
      ...curriculum.data.loose,
    ].filter((l) => l.type === 'quiz')

    if (got.data) {
      settings.value = {
        title: got.data.title,
        passPct: got.data.passPct,
        timerMinutes: got.data.timerMinutes,
        lessonId: got.data.lessonId,
        imagePath: got.data.imagePath,
      }
    } else {
      settings.value = {
        title: `${course.data.title} — test`,
        passPct: 80,
        timerMinutes: null,
        lessonId: null,
        imagePath: null,
      }
    }
    if (got.data) {
      void loadPreviews([got.data.imagePath, ...got.data.questions.map((q) => q.imagePath)])
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load this quiz.'
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  savingSettings.value = true
  error.value = ''
  try {
    await quizApi.save(courseId.value, settings.value)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not save those settings.'
  } finally {
    savingSettings.value = false
  }
}

async function removeQuiz() {
  const n = data.value?.questions.length ?? 0
  const { ok } = await ask({
    title: 'Delete this quiz?',
    message: `Its ${n} question(s) go with it, and so does every attempt and written answer anyone has submitted. This cannot be undone.`,
    confirmLabel: 'Delete the quiz',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await quizApi.remove(courseId.value)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that quiz.'
  }
}

function openNew() {
  open.value = 'new'
  form.value = blank()
  fieldErrors.value = {}
  formError.value = ''
}

function openEdit(q: QuizQuestion) {
  open.value = q.id
  form.value = {
    type: q.type,
    text: q.text,
    imagePath: q.imagePath,
    maxLength: q.maxLength,
    attachmentAllowed: q.attachmentAllowed,
    choices: q.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
  }
  fieldErrors.value = {}
  formError.value = ''
}

/** Switching type reshapes the choices, because each type needs a different
 *  thing and leaving the old ones would save something the API refuses. */
function onTypeChange() {
  if (form.value.type === 'essay') {
    form.value.choices = []
  } else if (!form.value.choices.length) {
    form.value.choices = [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ]
  } else if (form.value.type === 'single') {
    // One answer means one: keep the first ticked and clear the rest.
    let seen = false
    form.value.choices = form.value.choices.map((c) => {
      const keep = c.isCorrect && !seen
      if (keep) seen = true
      return { ...c, isCorrect: keep }
    })
    if (!seen && form.value.choices[0]) form.value.choices[0].isCorrect = true
  }
}

function pickCorrect(index: number) {
  if (form.value.type === 'single') {
    form.value.choices = form.value.choices.map((c, i) => ({ ...c, isCorrect: i === index }))
  } else {
    const c = form.value.choices[index]
    if (c) c.isCorrect = !c.isCorrect
  }
}

function addChoice() {
  if (form.value.choices.length < 10) form.value.choices.push({ text: '', isCorrect: false })
}

function removeChoice(index: number) {
  form.value.choices.splice(index, 1)
}

async function saveQuestion() {
  saving.value = true
  fieldErrors.value = {}
  formError.value = ''

  const body: QuestionInput = {
    ...form.value,
    choices: form.value.type === 'essay' ? [] : form.value.choices.filter((c) => c.text.trim()),
    sortOrder:
      open.value === 'new' ? (data.value?.questions.length ?? 0) : undefined,
  } as QuestionInput

  try {
    if (open.value === 'new') await quizApi.addQuestion(courseId.value, body)
    else if (open.value != null) await quizApi.updateQuestion(courseId.value, open.value, body)
    open.value = null
    await load()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      formError.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      formError.value = 'Could not save that question.'
    }
  } finally {
    saving.value = false
  }
}

async function removeQuestion(q: QuizQuestion) {
  const { ok } = await ask({
    title: 'Delete this question?',
    message: q.text.slice(0, 160),
    confirmLabel: 'Delete question',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await quizApi.deleteQuestion(courseId.value, q.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that question.'
  }
}

async function move(index: number, by: -1 | 1) {
  const ids = data.value?.questions.map((q) => q.id) ?? []
  const next = index + by
  if (next < 0 || next >= ids.length) return
  ;[ids[index], ids[next]] = [ids[next]!, ids[index]!]
  try {
    await quizApi.reorder(courseId.value, ids as number[])
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change the order.'
  }
}

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'
const cardClass =
  'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'
const moveBtn =
  'rounded border border-gray-300 px-1.5 text-xs text-gray-500 disabled:opacity-30 dark:border-gray-700'

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb :page-title="courseTitle ? `${courseTitle} — quiz` : 'Quiz'" />

    <p
      v-if="error"
      role="alert"
      class="mb-5 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
    >
      {{ error }}
    </p>

    <p v-if="loading" class="text-sm text-gray-500">Loading…</p>

    <template v-else>
      <!-- Settings. Saving this is also what creates the quiz. -->
      <form :class="[cardClass, 'mb-6 p-5 sm:p-6']" @submit.prevent="saveSettings">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ data ? 'Quiz settings' : 'This course has no quiz yet' }}
          </h3>
          <RouterLink
            :to="`/courses/${courseId}/curriculum`"
            class="text-sm text-brand-500 hover:text-brand-600"
          >
            Modules and lessons
          </RouterLink>
        </div>

        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div class="sm:col-span-2">
            <label :class="labelClass">Title<span class="text-error-500">*</span></label>
            <input v-model="settings.title" required maxlength="255" :class="inputClass" />
          </div>
          <div>
            <label :class="labelClass">Pass mark (%)</label>
            <input
              v-model.number="settings.passPct"
              type="number"
              min="1"
              max="100"
              :class="inputClass"
            />
            <p class="mt-1 text-xs text-gray-400">
              Of the {{ markedCount }} question(s) marked automatically.
            </p>
          </div>
          <div>
            <label :class="labelClass">Time limit (minutes)</label>
            <input
              v-model.number="settings.timerMinutes"
              type="number"
              min="1"
              max="600"
              placeholder="Leave empty for no limit"
              :class="inputClass"
            />
            <p class="mt-1 text-xs text-gray-400">The clock runs even if the tab is closed.</p>
          </div>
          <div v-if="data" class="sm:col-span-2 xl:col-span-4">
            <FileField
              v-model="settings.imagePath"
              :course-id="courseId"
              purpose="course-thumbnail"
              label="Picture for the whole test"
              accept="image/*"
              hint="A diagram or a passage every question refers to. Optional."
              preview
            />
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">Sits behind the lesson</label>
            <select v-model="settings.lessonId" :class="inputClass">
              <option :value="null">— not attached —</option>
              <option v-for="l in quizLessons" :key="l.id" :value="l.id">{{ l.title }}</option>
            </select>
            <p class="mt-1 text-xs text-gray-400">
              Only lessons of type "quiz" can hold one, so that finishing it counts toward
              progress.
              <span v-if="!quizLessons.length">Add one on the curriculum page first.</span>
            </p>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap gap-3">
          <button
            type="submit"
            :disabled="savingSettings"
            class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {{ savingSettings ? 'Saving…' : data ? 'Save settings' : 'Create quiz' }}
          </button>
          <button
            v-if="data"
            type="button"
            class="rounded-lg border border-error-500 px-4 py-2.5 text-sm font-medium text-error-500 transition hover:bg-error-50 dark:hover:bg-error-500/10"
            @click="removeQuiz"
          >
            Delete quiz
          </button>
        </div>
      </form>

      <template v-if="data">
        <!-- The question being written. -->
        <form
          v-if="open !== null"
          class="mb-6 rounded-2xl border border-brand-500/40 bg-white p-5 dark:bg-white/[0.03] sm:p-6"
          @submit.prevent="saveQuestion"
        >
          <h3 class="mb-5 text-base font-medium text-gray-800 dark:text-white/90">
            {{ open === 'new' ? 'New question' : 'Edit question' }}
          </h3>

          <div class="grid grid-cols-1 gap-5">
            <div>
              <label :class="labelClass">Answer type</label>
              <select v-model="form.type" :class="inputClass" @change="onTypeChange">
                <option value="single">One answer — the learner picks exactly one</option>
                <option value="multiple">Several answers — any number can be right</option>
                <option value="essay">Written answer — marked by a person</option>
              </select>
            </div>

            <div>
              <label :class="labelClass">Question<span class="text-error-500">*</span></label>
              <textarea
                v-model="form.text"
                required
                rows="3"
                maxlength="5000"
                class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <p v-if="fieldErrors.text" class="mt-1 text-sm text-error-500">
                {{ fieldErrors.text }}
              </p>
            </div>

            <FileField
              v-model="form.imagePath"
              :course-id="courseId"
              purpose="course-thumbnail"
              label="Picture for this question"
              accept="image/*"
              hint="Some questions cannot be asked without one — a diagram, a photo, a sentence to read."
              preview
            />

            <!-- Choices, for everything but a written answer. -->
            <div v-if="form.type !== 'essay'">
              <p :class="labelClass">
                Choices
                <span class="font-normal text-gray-400">
                  — tick the {{ form.type === 'single' ? 'correct one' : 'correct ones' }}
                </span>
              </p>
              <div class="space-y-3">
                <div
                  v-for="(c, i) in form.choices"
                  :key="i"
                  class="flex items-center gap-3"
                >
                  <input
                    :type="form.type === 'single' ? 'radio' : 'checkbox'"
                    :checked="c.isCorrect"
                    :aria-label="`Choice ${i + 1} is correct`"
                    class="h-5 w-5 border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
                    :class="form.type === 'single' ? 'rounded-full' : 'rounded'"
                    @change="pickCorrect(i)"
                  />
                  <input
                    v-model="c.text"
                    maxlength="500"
                    :placeholder="`Choice ${i + 1}`"
                    :class="inputClass"
                  />
                  <button
                    type="button"
                    class="shrink-0 text-sm text-error-500 disabled:opacity-30"
                    :disabled="form.choices.length <= 2"
                    @click="removeChoice(i)"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="mt-3 text-sm text-brand-500 hover:text-brand-600 disabled:opacity-40"
                :disabled="form.choices.length >= 10"
                @click="addChoice"
              >
                Add a choice
              </button>
              <p v-if="fieldErrors.choices" class="mt-2 text-sm text-error-500">
                {{ fieldErrors.choices }}
              </p>
            </div>

            <!-- Written answers. -->
            <div v-else class="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label :class="labelClass">Longest answer (characters)</label>
                <input
                  v-model.number="form.maxLength"
                  type="number"
                  min="50"
                  max="20000"
                  :class="inputClass"
                />
              </div>
              <label
                class="flex items-end gap-3 pb-3 text-sm text-gray-700 dark:text-gray-400"
              >
                <input
                  v-model="form.attachmentAllowed"
                  type="checkbox"
                  class="h-5 w-5 rounded border-gray-300 text-brand-500 dark:border-gray-700 dark:bg-gray-900"
                />
                Allow a file to be attached
              </label>
              <p class="text-xs text-gray-400 sm:col-span-2">
                A written answer is marked by a person and does not count toward the pass mark.
              </p>
            </div>
          </div>

          <p v-if="formError" role="alert" class="mt-3 text-sm text-error-500">{{ formError }}</p>

          <div class="mt-5 flex gap-3">
            <button
              type="submit"
              :disabled="saving"
              class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {{ saving ? 'Saving…' : open === 'new' ? 'Add question' : 'Save question' }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
              @click="open = null"
            >
              Cancel
            </button>
          </div>
        </form>

        <div :class="cardClass">
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <div>
              <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
                {{ data.questions.length }} question(s)
              </h3>
              <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {{ markedCount }} marked automatically, {{ essayCount }} marked by a person.
              </p>
            </div>
            <button
              type="button"
              class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
              @click="openNew"
            >
              Add question
            </button>
          </div>

          <ul
            v-if="data.questions.length"
            class="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800"
          >
            <li v-for="(q, i) in data.questions" :key="q.id" class="px-5 py-4 sm:px-6">
              <div class="flex flex-wrap items-start gap-3">
                <div class="flex flex-col gap-1">
                  <button
                    type="button"
                    :class="moveBtn"
                    :disabled="i === 0"
                    aria-label="Move question up"
                    @click="move(i, -1)"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    :class="moveBtn"
                    :disabled="i === data.questions.length - 1"
                    aria-label="Move question down"
                    @click="move(i, 1)"
                  >
                    ▼
                  </button>
                </div>

                <span
                  class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                  :class="TYPE_STYLE[q.type]"
                >
                  {{ TYPE_LABEL[q.type] }}
                </span>

                <div class="min-w-0 flex-1">
                  <p class="whitespace-pre-line text-sm text-gray-800 dark:text-white/90">
                    {{ i + 1 }}. {{ q.text }}
                  </p>
                  <img
                    v-if="q.imagePath && previews[q.imagePath]"
                    :src="previews[q.imagePath]"
                    alt=""
                    class="mt-2 max-h-40 rounded-lg border border-gray-200 dark:border-gray-700"
                  />
                  <p v-else-if="q.imagePath" class="mt-1 text-xs text-gray-400">
                    Has a picture
                  </p>
                  <ul v-if="q.choices.length" class="mt-2 space-y-1">
                    <li
                      v-for="c in q.choices"
                      :key="c.id"
                      class="text-sm"
                      :class="
                        c.isCorrect
                          ? 'font-medium text-success-600 dark:text-success-400'
                          : 'text-gray-500 dark:text-gray-400'
                      "
                    >
                      {{ c.isCorrect ? '✓' : '·' }} {{ c.text }}
                    </li>
                  </ul>
                  <p v-else class="mt-2 text-xs text-gray-400">
                    Up to {{ q.maxLength }} characters<span v-if="q.attachmentAllowed">
                      · a file may be attached</span
                    >
                  </p>
                </div>

                <div class="flex shrink-0 gap-4 text-sm">
                  <button type="button" class="text-brand-500" @click="openEdit(q)">Edit</button>
                  <button type="button" class="text-error-500" @click="removeQuestion(q)">
                    Delete
                  </button>
                </div>
              </div>
            </li>
          </ul>
          <p v-else class="border-t border-gray-100 px-5 py-8 text-center text-sm text-gray-400 dark:border-gray-800 sm:px-6">
            No questions yet.
          </p>
        </div>
      </template>
    </template>
  </admin-layout>
</template>
