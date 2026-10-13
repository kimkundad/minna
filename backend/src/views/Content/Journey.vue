<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import SiteIcon from '@/components/ui/SiteIcon.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  ApiError,
  journey as journeyApi,
  type JourneyStep,
  type JourneySection,
  type JourneySectionInput,
  type HomeBand,
  type UiLocale,
} from '@/lib/api'

/**
 * The "how learning works here" band on the home page.
 *
 * It used to be a heading and four steps typed into the page in Thai: seven
 * languages read it in Thai, it still described the reference project's
 * veterinary scheme, and changing a word of it meant changing the page. The
 * school writes it here now, in each language.
 *
 * One language at a time, as the slideshow does — this is all sentences, and a
 * screen that edited eight at once would be eight forms stacked up.
 */
const { ask } = useConfirm()
const route = useRoute()

/**
 * Which of the two bands at the foot of the home page this screen is editing.
 *
 * They are the same shape — a heading, a paragraph, a button and a short list
 * of items with an icon each — so one screen serves both rather than two that
 * have to be kept in step. The route says which.
 */
const band = computed<HomeBand>(() => (route.path.endsWith('/cta') ? 'cta' : 'journey'))

/** What the items are called, since 'step' is wrong for a row of chips. */
const itemWord = computed(() => (band.value === 'cta' ? 'chip' : 'step'))
const itemWords = computed(() => (band.value === 'cta' ? 'chips' : 'steps'))

/** No "every language" here. Each field is a sentence; one shared across eight
 *  languages is a Thai paragraph under a Korean heading. */
const LOCALES: { value: UiLocale; label: string }[] = [
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'English' },
  { value: 'jp', label: '日本語' },
  { value: 'vn', label: 'Tiếng Việt' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'zh', label: '简体中文' },
  { value: 'ko', label: '한국어' },
  { value: 'tw', label: '繁體中文' },
]

const locale = ref<UiLocale>('th')
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const savedAt = ref('')

const section = ref<JourneySectionInput>(blankSection())
const steps = ref<JourneyStep[]>([])
const fieldErrors = ref<Record<string, string>>({})

/** How much is written in each language, so the picker says where the gaps
 *  are rather than making somebody visit all eight to find out. */
const written = ref<Record<string, { steps: number; status: string }>>({})

/** Every icon the site can draw, from the API. Listing them here instead would
 *  be a second copy to fall behind the first. */
const icons = ref<string[]>([])
const iconQuery = ref('')
const iconFor = ref<number | 'new' | null>(null)

const shownIcons = computed(() => {
  const q = iconQuery.value.trim().toLowerCase()
  return q ? icons.value.filter((i) => i.includes(q)) : icons.value
})

function blankSection(): JourneySectionInput {
  return { eyebrow: null, heading: '', intro: null, ctaLabel: null, ctaHref: null, status: 'draft' }
}

/* ---------------- loading ---------------- */

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await journeyApi.get(band.value, locale.value)
    const s = res.data.section as JourneySection
    section.value = {
      eyebrow: s.eyebrow,
      heading: s.heading,
      intro: s.intro,
      ctaLabel: s.ctaLabel,
      // A link with no language in it lands on whatever the browser last
      // stored, which for a reader of this language is the wrong site.
      ctaHref: s.ctaHref ?? `/${locale.value}/courses`,
      status: s.status,
    }
    steps.value = res.data.steps
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load this band.'
  } finally {
    loading.value = false
  }
}

async function loadSummary() {
  try {
    const res = await journeyApi.summary(band.value)
    const out: Record<string, { steps: number; status: string }> = {}
    for (const row of res.data) out[row.locale] = { steps: row.steps, status: row.status }
    written.value = out
  } catch {
    written.value = {}
  }
}

async function loadIcons() {
  try {
    icons.value = (await journeyApi.icons()).data
  } catch {
    icons.value = []
  }
}

/* ---------------- the heading ---------------- */

async function saveSection() {
  saving.value = true
  error.value = ''
  fieldErrors.value = {}
  try {
    await journeyApi.saveSection(band.value, locale.value, section.value)
    savedAt.value = new Date().toLocaleTimeString()
    await loadSummary()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      error.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      error.value = 'Could not save. Try again.'
    }
  } finally {
    saving.value = false
  }
}

/* ---------------- the steps ---------------- */

const editing = ref<number | 'new' | null>(null)
const draft = ref<{ icon: string; title: string; text: string | null }>({
  icon: 'circle',
  title: '',
  text: null,
})
const stepErrors = ref<Record<string, string>>({})

function openNew() {
  editing.value = 'new'
  draft.value = { icon: 'compass', title: '', text: null }
  stepErrors.value = {}
}

function openEdit(step: JourneyStep) {
  editing.value = step.id
  draft.value = { icon: step.icon, title: step.title, text: step.text }
  stepErrors.value = {}
}

function closeStep() {
  editing.value = null
  iconFor.value = null
  stepErrors.value = {}
}

async function saveStep() {
  saving.value = true
  stepErrors.value = {}
  try {
    const body = { band: band.value, locale: locale.value, ...draft.value }
    if (editing.value === 'new') await journeyApi.createStep(body)
    else if (editing.value != null) await journeyApi.updateStep(editing.value, body)
    closeStep()
    await Promise.all([load(), loadSummary()])
  } catch (err) {
    if (err instanceof ApiError) {
      stepErrors.value = err.fields
      if (!Object.keys(err.fields).length) error.value = err.message
    } else {
      error.value = 'Could not save that step.'
    }
  } finally {
    saving.value = false
  }
}

async function removeStep(step: JourneyStep) {
  const { ok } = await ask({
    title: `Delete “${step.title}”?`,
    message: 'This cannot be undone.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await journeyApi.removeStep(step.id)
    await Promise.all([load(), loadSummary()])
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that step.'
  }
}

/** Up and down rather than drag: it works with a keyboard, and four steps
 *  never need a long drag. */
async function move(step: JourneyStep, by: -1 | 1) {
  const order = steps.value.map((s) => s.id)
  const at = order.indexOf(step.id)
  const to = at + by
  if (at < 0 || to < 0 || to >= order.length) return

  order.splice(to, 0, ...order.splice(at, 1))
  // Moved on screen before the request lands, so the list does not lurch.
  steps.value = order.map((id) => steps.value.find((s) => s.id === id)!).filter(Boolean)
  try {
    steps.value = (await journeyApi.reorder(band.value, locale.value, order)).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not reorder them.'
    await load()
  }
}

function pickIcon(name: string) {
  draft.value.icon = name
  iconFor.value = null
  iconQuery.value = ''
}

watch(locale, () => {
  closeStep()
  savedAt.value = ''
  void load()
})

onMounted(async () => {
  await Promise.all([load(), loadSummary(), loadIcons()])
})

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const areaClass =
  'w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'
</script>

<template>
  <admin-layout>
    <PageBreadcrumb :page-title="band === 'cta' ? 'Home closing band' : 'Home journey band'" />

    <div class="space-y-6">
      <!-- Which language is being written -->
      <div
        class="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6"
      >
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
              The band under “{{ LOCALES.find((l) => l.value === locale)?.label }}”
            </h3>
            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Written per language. A language with nothing in it leaves the band off its home
              page rather than borrowing another language's words.
            </p>
          </div>
          <select v-model="locale" data-action="journey-locale" :class="inputClass" class="w-auto">
            <option v-for="l in LOCALES" :key="l.value" :value="l.value">
              {{ l.label }}
              <template v-if="written[l.value]">
                — {{ written[l.value].steps }}
                {{ written[l.value].steps === 1 ? itemWord : itemWords }}
                <template v-if="written[l.value].status !== 'published'">· draft</template>
              </template>
              <template v-else>— nothing yet</template>
            </option>
          </select>
        </div>
      </div>

      <p
        v-if="error"
        role="alert"
        class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
      >
        {{ error }}
      </p>

      <!-- The heading above the steps -->
      <form
        class="rounded-2xl border border-gray-200 bg-white px-5 py-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6"
        @submit.prevent="saveSection"
      >
        <h3 class="mb-4 text-base font-medium text-gray-800 dark:text-white/90">The heading</h3>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label :class="labelClass">Small line above</label>
            <input
              v-model="section.eyebrow"
              data-field="eyebrow"
              maxlength="120"
              :class="inputClass"
              placeholder="Why Minna"
            />
          </div>
          <div>
            <label :class="labelClass">Heading<span class="text-error-500">*</span></label>
            <input
              v-model="section.heading"
              data-field="heading"
              required
              maxlength="200"
              :class="inputClass"
            />
            <p v-if="fieldErrors.heading" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.heading }}
            </p>
          </div>
          <div class="sm:col-span-2">
            <label :class="labelClass">The paragraph beside it</label>
            <textarea v-model="section.intro" rows="3" maxlength="2000" :class="areaClass" />
          </div>
          <div>
            <label :class="labelClass">Button</label>
            <input v-model="section.ctaLabel" maxlength="80" :class="inputClass" />
          </div>
          <div>
            <label :class="labelClass">Where it goes</label>
            <input
              v-model="section.ctaHref"
              maxlength="512"
              :class="inputClass"
              :placeholder="`/${locale}/courses`"
            />
            <p class="mt-1 text-xs text-gray-400">
              Start it with the language, or the link lands a reader on another one.
            </p>
          </div>
          <div>
            <label :class="labelClass">State</label>
            <select v-model="section.status" data-field="status" :class="inputClass">
              <option value="draft">Draft — the band is left off the page</option>
              <option value="published">Published — shown on the home page</option>
            </select>
          </div>
        </div>

        <div class="mt-5 flex items-center gap-3">
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {{ saving ? 'Saving…' : 'Save the heading' }}
          </button>
          <span v-if="savedAt" class="text-sm text-success-600 dark:text-success-400">
            Saved {{ savedAt }}
          </span>
        </div>
      </form>

      <!-- The steps -->
      <div
        class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <div>
            <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
              {{ steps.length }} {{ steps.length === 1 ? itemWord : itemWords }}
            </h3>
            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              <template v-if="band === 'cta'">
                Shown as a row of chips under the paragraph, in this order. Four is what the design
                was drawn for, and each is a few words with an icon — no sentence under it.
              </template>
              <template v-else>
                Numbered on the page in this order. Four is what the design was drawn for.
              </template>
            </p>
          </div>
          <button
            type="button"
            data-action="journey-add"
            class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
            @click="openNew"
          >
            Add a {{ itemWord }}
          </button>
        </div>

        <!-- One step's form -->
        <form
          v-if="editing !== null"
          class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
          @submit.prevent="saveStep"
        >
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
            <div>
              <label :class="labelClass">Icon</label>
              <button
                type="button"
                data-action="journey-icon"
                class="flex h-11 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700"
                @click="iconFor = iconFor === editing ? null : editing"
              >
                <SiteIcon :name="draft.icon" />
                <span class="font-mono text-xs text-gray-500">{{ draft.icon }}</span>
                <span class="text-gray-400">▾</span>
              </button>
              <p v-if="stepErrors.icon" class="mt-1 text-sm text-error-500">
                {{ stepErrors.icon }}
              </p>
            </div>

            <div>
              <label :class="labelClass">Title<span class="text-error-500">*</span></label>
              <input
                v-model="draft.title"
                data-field="step-title"
                required
                maxlength="200"
                :class="inputClass"
              />
              <p v-if="stepErrors.title" class="mt-1 text-sm text-error-500">
                {{ stepErrors.title }}
              </p>
            </div>
          </div>

          <!-- The icons the site can actually draw. Names rather than pictures:
               the admin does not carry the site's icon set, and a grid of
               wrong-looking glyphs would be worse than a list of right names. -->
          <div
            v-if="iconFor !== null"
            class="mt-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800"
          >
            <input
              v-model="iconQuery"
              data-field="icon-search"
              :class="inputClass"
              placeholder="Search the icons — book, play, award…"
            />
            <div class="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
              <button
                v-for="name in shownIcons"
                :key="name"
                type="button"
                class="flex w-[7.5rem] flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition"
                :class="
                  name === draft.icon
                    ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/15'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5'
                "
                :title="name"
                @click="pickIcon(name)"
              >
                <SiteIcon :name="name" :size="22" />
                <!-- The name under the drawing rather than instead of it: two
                     icons can look alike at this size, and the name is what
                     gets stored and talked about. -->
                <span class="w-full truncate font-mono text-[11px] leading-none">{{ name }}</span>
              </button>
              <p v-if="!shownIcons.length" class="text-sm text-gray-500">
                No icon is called that. The set is fixed — pick the nearest.
              </p>
            </div>
          </div>

          <!-- A chip is a few words with an icon; the design has nowhere to
               put a sentence under one, so the box is left out rather than
               offered and then quietly dropped. -->
          <div v-if="band !== 'cta'" class="mt-4">
            <label :class="labelClass">The sentence under it</label>
            <textarea v-model="draft.text" rows="2" maxlength="1000" :class="areaClass" />
          </div>

          <div class="mt-4 flex items-center gap-3">
            <button
              type="submit"
              data-action="journey-step-save"
              :disabled="saving"
              class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              {{ editing === 'new' ? 'Add it' : 'Save' }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm dark:border-gray-700"
              @click="closeStep"
            >
              Cancel
            </button>
          </div>
        </form>

        <ul class="divide-y divide-gray-100 dark:divide-gray-800">
          <li v-if="loading" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</li>
          <li
            v-else-if="!steps.length"
            class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6"
            data-state="journey-empty"
          >
            Nothing written in this language yet, so the band is left off its home page.
          </li>

          <li
            v-for="(step, i) in steps"
            :key="step.id"
            class="flex items-start gap-4 px-5 py-4 sm:px-6"
          >
            <div class="flex shrink-0 flex-col items-center gap-1 pt-1">
              <button
                type="button"
                :disabled="i === 0"
                class="text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
                aria-label="Move up"
                @click="move(step, -1)"
              >
                ↑
              </button>
              <span class="text-xs text-gray-400">{{ String(i + 1).padStart(2, '0') }}</span>
              <button
                type="button"
                :disabled="i === steps.length - 1"
                class="text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
                aria-label="Move down"
                @click="move(step, 1)"
              >
                ↓
              </button>
            </div>

            <div class="min-w-0 flex-1">
              <p class="text-xs text-gray-400">
                <span
                  class="rounded bg-gray-100 px-1.5 py-0.5 font-mono font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300"
                  ><SiteIcon :name="step.icon" :size="14" class="inline align-[-2px]" />
                  {{ step.icon }}</span
                >
              </p>
              <p class="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                {{ step.title }}
              </p>
              <p v-if="step.text" class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {{ step.text }}
              </p>
            </div>

            <div class="flex shrink-0 gap-2">
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
                @click="openEdit(step)"
              >
                Edit
              </button>
              <button
                type="button"
                class="rounded-lg border border-error-500/40 px-3 py-1.5 text-sm text-error-600"
                @click="removeStep(step)"
              >
                Delete
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </admin-layout>
</template>
