<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import FileField from '@/components/forms/FileField.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  ApiError,
  hero,
  mediaUrl,
  type HeroLocale,
  type HeroSlide,
  type HeroSlideInput,
  type HeroState,
} from '@/lib/api'

/**
 * The slideshow on the home page.
 *
 * Written per language, the way articles are: a carousel of Thai headlines
 * shown to somebody reading the English site is worse than no carousel.
 *
 * No paging and no search. A carousel with more than half a dozen slides is one
 * nobody reaches the end of, so the whole list fits on the screen and can be
 * ordered by eye.
 */
const { ask } = useConfirm()

/**
 * What the picture has to survive, taken from the stylesheet rather than
 * guessed. On a desktop it fills the right 56% of a band at least 560px tall;
 * on a phone it becomes a 16:10 strip across the full width. So it is cropped
 * twice, to two different shapes, which is what the focal point is for.
 */
const IMAGE = {
  recommended: '1600 × 1000 px',
  minimum: '1200 × 750 px',
  ratio: '16:10',
  maxMb: 8,
}

/**
 * 'all' is not a view of everything — it is a slide's own setting, for one
 * whose words work in any language: a picture with a short line on it, a
 * promotion with a price. Those slides appear on every language's home page.
 *
 * Most slides are not that. A headline is language-specific, which is why the
 * list opens on Thai rather than on 'all'.
 */
const LOCALES = [
  // Not "every language" any more: that is what the picker above the list
  // calls showing all the slides, and one phrase cannot mean both the view and
  // the setting. This is the setting — where the slide appears.
  { value: 'all', label: 'ขึ้นทุกภาษา · appears on every language' },
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'English' },
  { value: 'jp', label: '日本語' },
  { value: 'vn', label: 'Tiếng Việt' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'zh', label: '简体中文' },
  { value: 'ko', label: '한국어' },
  { value: 'tw', label: '繁體中文' },
] as const

/**
 * Which slides the list is showing — a view, not a slide's own setting.
 *
 * The two were one control and meant different things by the same words.
 * Picking "every language" listed the slides whose own setting is `all`, which
 * is a handful of them, when what somebody looking at a page called "Home
 * slideshow" expects is every slide there is.
 *
 * So the picker now starts with EVERY, which lists all of them with their
 * language beside each, and `all` keeps its own meaning further down the list:
 * a slide written to appear on every language's home page.
 */
const EVERY = '*' as const
type View = typeof EVERY | HeroLocale

const view = ref<View>('th')

/** The language a new slide starts in, and the one `reorder` is about. Never
 *  the catch-all view, which is not a language anything can be saved into. */
const locale = computed<HeroLocale>(() => (view.value === EVERY ? 'th' : view.value))

/** What to call a language in a sentence. */
function localeLabel(value: HeroLocale): string {
  return LOCALES.find((l) => l.value === value)?.label ?? value
}

/**
 * An example link in the language the slide is for.
 *
 * It used to read `/th/courses` whatever language was open. A path is only
 * half an answer here — every page on the site carries its language — and an
 * example copied as-is would drop a Korean reader onto the Thai site. An
 * every-language slide has no one language to point at, so it shows the shape
 * rather than a path that would be wrong seven times out of eight.
 */
function hrefExample(path: string): string {
  return form.value.locale === 'all' ? `/<language>${path}` : `/${form.value.locale}${path}`
}

/** How many every-language slides also show on whichever language is open, so
 *  the count on screen is not quietly short of what a visitor sees. */
const alsoShown = ref(0)

async function countEveryLanguage() {
  if (view.value === EVERY || view.value === 'all') {
    alsoShown.value = 0
    return
  }
  try {
    alsoShown.value = (await hero.list('all')).data.length
  } catch {
    alsoShown.value = 0
  }
}
const rows = ref<HeroSlide[]>([])
const loading = ref(true)
const error = ref('')

const editing = ref<number | 'new' | null>(null)
const form = ref<HeroSlideInput>(blank())
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)

function blank(): HeroSlideInput {
  return {
    locale: locale.value,
    eyebrow: null,
    titleA: '',
    titleB: null,
    subtitle: null,
    imagePath: null,
    imageAlt: null,
    focalX: 50,
    focalY: 50,
    ctaLabel: null,
    ctaHref: null,
    cta2Label: null,
    cta2Href: null,
    status: 'draft',
    sortOrder: rows.value.length + 1,
    startsAt: null,
    endsAt: null,
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    // No language is how the API says 'every slide'.
    rows.value = (await hero.list(view.value === EVERY ? undefined : view.value)).data
    await countEveryLanguage()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the slides.'
  } finally {
    loading.value = false
  }
}

function openNew() {
  editing.value = 'new'
  form.value = blank()
  formError.value = ''
  fieldErrors.value = {}
}

function openEdit(row: HeroSlide) {
  editing.value = row.id
  form.value = {
    locale: row.locale,
    eyebrow: row.eyebrow,
    titleA: row.titleA,
    titleB: row.titleB,
    subtitle: row.subtitle,
    imagePath: row.imagePath,
    imageAlt: row.imageAlt,
    focalX: row.focalX,
    focalY: row.focalY,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    cta2Label: row.cta2Label,
    cta2Href: row.cta2Href,
    status: row.status,
    sortOrder: row.sortOrder,
    startsAt: toLocalInput(row.startsAt),
    endsAt: toLocalInput(row.endsAt),
  }
  formError.value = ''
  fieldErrors.value = {}
}

/** `datetime-local` wants `2026-10-08T14:30`, with no zone and no seconds. */
function toLocalInput(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function save() {
  saving.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    const body: HeroSlideInput = {
      ...form.value,
      // The boxes hold wall-clock time; the API stores an instant.
      startsAt: form.value.startsAt ? new Date(form.value.startsAt).toISOString() : null,
      endsAt: form.value.endsAt ? new Date(form.value.endsAt).toISOString() : null,
    }
    if (editing.value === 'new') await hero.create(body)
    else if (editing.value != null) await hero.update(editing.value, body)
    editing.value = null

    /**
     * Follow the slide if its language was changed.
     *
     * The list shows one language at a time, so a slide saved into a different
     * one would vanish from the screen with nothing to say where it went —
     * which reads as a save that failed. `watch(locale)` reloads the list, so
     * this is the whole of it.
     */
    // Not while the list is already showing every language — it has not lost
    // anything, and switching would narrow a view nobody asked to narrow.
    if (view.value !== EVERY && body.locale !== view.value) view.value = body.locale as HeroLocale
    else await load()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      formError.value = Object.keys(err.fields).length ? '' : err.message
    } else {
      formError.value = 'Could not save. Try again.'
    }
  } finally {
    saving.value = false
  }
}

async function remove(row: HeroSlide) {
  const { ok } = await ask({
    title: `Delete “${row.titleA}”?`,
    message:
      row.state === 'live'
        ? 'It is on the home page now. This cannot be undone, and its picture is removed too.'
        : 'This cannot be undone, and its picture is removed too.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await hero.remove(row.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that slide.'
  }
}

/** Up and down rather than drag: it works with a keyboard, and a list this
 *  short never needs a long drag. */
async function move(row: HeroSlide, by: -1 | 1) {
  /**
   * Order belongs to one language.
   *
   * Each language's home page runs its own slides in its own order, so there
   * is no single sequence to move a slide up or down in while the list is
   * showing all of them — the API takes a language and the whole order for it.
   * The buttons are hidden in that view; this is the second lock.
   */
  if (view.value === EVERY) return

  const order = rows.value.map((r) => r.id)
  const at = order.indexOf(row.id)
  const to = at + by
  if (at < 0 || to < 0 || to >= order.length) return

  order.splice(to, 0, ...order.splice(at, 1))
  // Shown moved before the request lands, so the list does not lurch.
  rows.value = order.map((id) => rows.value.find((r) => r.id === id)!).filter(Boolean)
  try {
    rows.value = (await hero.reorder(locale.value, order)).data
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not reorder them.'
    await load()
  }
}

/* ---------------- presentation ---------------- */

const STATE: Record<HeroState, { text: string; cls: string }> = {
  live: {
    text: 'On the site',
    cls: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400',
  },
  scheduled: {
    text: 'Scheduled',
    cls: 'bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-400',
  },
  finished: {
    text: 'Finished',
    cls: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400',
  },
  draft: { text: 'Draft', cls: 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-500' },
}

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

function windowLabel(row: HeroSlide): string {
  if (!row.startsAt && !row.endsAt) return 'No end date'
  if (row.startsAt && row.endsAt) return `${when(row.startsAt)} → ${when(row.endsAt)}`
  return row.startsAt ? `From ${when(row.startsAt)}` : `Until ${when(row.endsAt)}`
}

/** The picture as the hero will crop it, with the focal point applied. */
const previewStyle = computed(() => ({
  backgroundImage: form.value.imagePath ? `url("${mediaUrl(form.value.imagePath)}")` : 'none',
  backgroundPosition: `${form.value.focalX}% ${form.value.focalY}%`,
  backgroundSize: 'cover',
}))

function thumbStyle(row: HeroSlide) {
  return {
    backgroundImage: row.imagePath ? `url("${mediaUrl(row.imagePath)}")` : 'none',
    backgroundPosition: `${row.focalX}% ${row.focalY}%`,
    backgroundSize: 'cover',
  }
}

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'

watch(view, () => {
  editing.value = null
  void load()
})

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Home slideshow" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ rows.length }} slides
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            <template v-if="view === EVERY">
              Every slide on the site, whatever language it is for. Each language runs its own
              order, so the up and down arrows are per language.
            </template>
            <template v-else-if="view === 'all'">
              These appear on every language's home page, mixed into its own slides by the order
              below.
            </template>
            <template v-else>
              Shown at the top of the home page, in this order.<template v-if="alsoShown">
                {{ alsoShown }} every-language
                {{ alsoShown === 1 ? 'slide also appears' : 'slides also appear' }} here.</template>
            </template>
          </p>
        </div>
        <div class="flex items-center gap-3">
          <select v-model="view" class="h-11 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
            <option :value="EVERY">ทุกภาษา · every language</option>
            <option v-for="l in LOCALES" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
          <button
            type="button"
            data-action="hero-add"
            class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
            @click="openNew"
          >
            Add a slide
          </button>
        </div>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <!-- The form -->
      <form
        v-if="editing !== null"
        class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
        @submit.prevent="save"
      >
        <!-- Which language this slide is for.
             It used to be taken silently from the picker above the list, which
             is in the page header rather than in the form: somebody writing a
             headline could not see which language they were writing it in, and
             the only clue was a Thai placeholder under every language. -->
        <div class="mb-5 flex flex-wrap items-center gap-3">
          <label :class="labelClass" class="!mb-0" for="hs-locale">Language</label>
          <select
            id="hs-locale"
            v-model="form.locale"
            class="h-11 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option v-for="l in LOCALES" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            <template v-if="form.locale === 'all'">
              Shown on every language's home page, mixed into its own slides by the order.
            </template>
            <template v-else>
              Shown only on the {{ localeLabel(form.locale) }} home page.
            </template>
          </p>
        </div>

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <!-- Words -->
          <div class="space-y-4 lg:col-span-2">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label :class="labelClass">Small line above</label>
                <input v-model="form.eyebrow" maxlength="120" :class="inputClass" placeholder="Minna No Nihongo" />
              </div>
              <div>
                <label :class="labelClass">Headline<span class="text-error-500">*</span></label>
                <input v-model="form.titleA" required maxlength="200" :class="inputClass" />
                <p v-if="fieldErrors.titleA" class="mt-1 text-sm text-error-500">
                  {{ fieldErrors.titleA }}
                </p>
              </div>
              <div>
                <label :class="labelClass">Second line</label>
                <input v-model="form.titleB" maxlength="200" :class="inputClass" />
                <p class="mt-1 text-xs text-gray-400">Styled differently from the first.</p>
              </div>
              <div class="sm:col-span-2">
                <label :class="labelClass">The sentence underneath</label>
                <textarea
                  v-model="form.subtitle"
                  rows="3"
                  maxlength="500"
                  class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                ></textarea>
              </div>

              <div>
                <label :class="labelClass">Main button</label>
                <input v-model="form.ctaLabel" maxlength="80" :class="inputClass" placeholder="ดูคอร์สเรียน" />
                <p v-if="fieldErrors.ctaLabel" class="mt-1 text-sm text-error-500">
                  {{ fieldErrors.ctaLabel }}
                </p>
              </div>
              <div>
                <label :class="labelClass">Where it goes</label>
                <input v-model="form.ctaHref" maxlength="512" :class="inputClass" :placeholder="hrefExample('/courses')" />
              </div>
              <div>
                <label :class="labelClass">Second button</label>
                <input v-model="form.cta2Label" maxlength="80" :class="inputClass" placeholder="เกี่ยวกับเรา" />
                <p v-if="fieldErrors.cta2Label" class="mt-1 text-sm text-error-500">
                  {{ fieldErrors.cta2Label }}
                </p>
              </div>
              <div>
                <label :class="labelClass">Where it goes</label>
                <input v-model="form.cta2Href" maxlength="512" :class="inputClass" :placeholder="hrefExample('/about')" />
              </div>
            </div>
          </div>

          <!-- Picture -->
          <div class="space-y-4">
            <FileField
              v-model="form.imagePath"
              label="Picture"
              purpose="content-image"
              accept="image/*"
            />

            <!-- What the admin asked for: the size, spelled out. -->
            <dl
              class="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs dark:border-gray-800 dark:bg-gray-900"
            >
              <div class="flex justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Best size</dt>
                <dd class="font-medium text-gray-800 dark:text-white/90">
                  {{ IMAGE.recommended }}
                </dd>
              </div>
              <div class="mt-1 flex justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">At least</dt>
                <dd class="text-gray-700 dark:text-gray-300">{{ IMAGE.minimum }}</dd>
              </div>
              <div class="mt-1 flex justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Shape</dt>
                <dd class="text-gray-700 dark:text-gray-300">{{ IMAGE.ratio }} landscape</dd>
              </div>
              <div class="mt-1 flex justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Up to</dt>
                <dd class="text-gray-700 dark:text-gray-300">{{ IMAGE.maxMb }} MB · JPG or PNG</dd>
              </div>
              <p class="mt-2 border-t border-gray-100 pt-2 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                It fills the right-hand half on a computer and a wide strip on a phone, so it is
                cropped twice. <strong class="text-gray-700 dark:text-gray-300">Keep the subject
                on the right</strong> — the headline sits over the left.
              </p>
            </dl>

            <div>
              <label :class="labelClass">
                Describe the picture<span v-if="form.imagePath" class="text-error-500">*</span>
              </label>
              <input
                v-model="form.imageAlt"
                maxlength="255"
                :class="inputClass"
                placeholder="ครูสอนภาษาญี่ปุ่นกับนักเรียนในห้องเรียน"
              />
              <p class="mt-1 text-xs text-gray-400">
                Read out to anyone who cannot see it. Describe the picture, not the headline.
              </p>
              <p v-if="fieldErrors.imageAlt" class="mt-1 text-sm text-error-500">
                {{ fieldErrors.imageAlt }}
              </p>
            </div>

            <!-- The crop, shown rather than described -->
            <div v-if="form.imagePath">
              <label :class="labelClass">What to keep when it is cropped</label>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <p class="mb-1 text-xs text-gray-400">On a computer</p>
                  <div
                    class="h-32 rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
                    :style="previewStyle"
                  ></div>
                </div>
                <div>
                  <p class="mb-1 text-xs text-gray-400">On a phone</p>
                  <div
                    class="rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
                    style="aspect-ratio: 16 / 10"
                    :style="previewStyle"
                  ></div>
                </div>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <label class="block text-xs text-gray-500 dark:text-gray-400">
                  Left ↔ right ({{ form.focalX }}%)
                  <input v-model.number="form.focalX" type="range" min="0" max="100" class="mt-1 w-full" />
                </label>
                <label class="block text-xs text-gray-500 dark:text-gray-400">
                  Top ↕ bottom ({{ form.focalY }}%)
                  <input v-model.number="form.focalY" type="range" min="0" max="100" class="mt-1 w-full" />
                </label>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label :class="labelClass">State</label>
                <select v-model="form.status" :class="inputClass">
                  <option value="draft">Draft — nobody sees it</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div>
                <label :class="labelClass">Order</label>
                <input v-model.number="form.sortOrder" type="number" min="0" :class="inputClass" />
              </div>
              <div>
                <label :class="labelClass">Show from</label>
                <input v-model="form.startsAt" type="datetime-local" :class="inputClass" />
              </div>
              <div>
                <label :class="labelClass">Stop showing</label>
                <input v-model="form.endsAt" type="datetime-local" :class="inputClass" />
                <p v-if="fieldErrors.endsAt" class="mt-1 text-sm text-error-500">
                  {{ fieldErrors.endsAt }}
                </p>
              </div>
            </div>
            <p class="text-xs text-gray-400">
              Leave the dates empty for a slide that stays until it is taken down.
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
            {{ saving ? 'Saving…' : editing === 'new' ? 'Create' : 'Save' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            @click="editing = null"
          >
            Cancel
          </button>
        </div>
      </form>

      <!-- The slides -->
      <ul class="divide-y divide-gray-100 dark:divide-gray-800">
        <li v-if="loading" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</li>
        <li v-else-if="!rows.length" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
          Nothing here yet. The home page shows its own sample slides until the first one is added.
        </li>

        <li v-for="(row, i) in rows" :key="row.id" class="flex items-start gap-4 px-5 py-4 sm:px-6">
          <!-- Order. Per language, so there is nothing to move while the list
               is showing all of them at once — the position is shown instead. -->
          <div v-if="view === EVERY" class="flex w-6 shrink-0 justify-center pt-1">
            <span class="text-xs text-gray-400">{{ row.sortOrder }}</span>
          </div>
          <div v-else class="flex shrink-0 flex-col items-center gap-1 pt-1">
            <button
              type="button"
              :disabled="i === 0"
              class="text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
              aria-label="Move up"
              @click="move(row, -1)"
            >
              ↑
            </button>
            <span class="text-xs text-gray-400">{{ i + 1 }}</span>
            <button
              type="button"
              :disabled="i === rows.length - 1"
              class="text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
              aria-label="Move down"
              @click="move(row, 1)"
            >
              ↓
            </button>
          </div>

          <div
            class="h-16 w-28 shrink-0 rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
            :style="thumbStyle(row)"
          ></div>

          <div class="min-w-0 flex-1">
            <p class="text-xs text-gray-400">
              <!-- Which language this one is for. Only while the list holds
                   several, where it is the thing telling them apart. -->
              <span
                v-if="view === EVERY"
                class="mr-1.5 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300"
                >{{ localeLabel(row.locale) }}</span
              >{{ row.eyebrow || '—' }}
            </p>
            <p class="text-sm font-medium text-gray-800 dark:text-white/90">
              {{ row.titleA }}
              <span v-if="row.titleB" class="font-normal text-gray-500 dark:text-gray-400">
                {{ row.titleB }}
              </span>
            </p>
            <p v-if="row.subtitle" class="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
              {{ row.subtitle }}
            </p>
            <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span
                class="inline-flex rounded-full px-2 py-0.5 font-medium"
                :class="STATE[row.state].cls"
              >
                {{ STATE[row.state].text }}
              </span>
              <span>{{ windowLabel(row) }}</span>
              <span v-if="row.ctaLabel">· {{ row.ctaLabel }}</span>
              <span v-if="!row.imagePath" class="text-warning-600 dark:text-warning-400">
                · no picture
              </span>
            </p>
          </div>

          <div class="shrink-0 whitespace-nowrap text-sm">
            <button type="button" class="text-brand-500 hover:text-brand-600" @click="openEdit(row)">
              Edit
            </button>
            <button
              type="button"
              class="ml-4 text-error-500 hover:text-error-600"
              @click="remove(row)"
            >
              Delete
            </button>
          </div>
        </li>
      </ul>
    </div>

    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
      The home page still shows its own sample slides. Nothing set here appears there until that is
      wired up.
    </p>
  </admin-layout>
</template>
