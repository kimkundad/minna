<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import FileField from '@/components/forms/FileField.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  ApiError,
  AD_PLACEMENTS,
  advertising,
  mediaUrl,
  type Ad,
  type AdInput,
  type AdPlacement,
} from '@/lib/api'

/**
 * Advertising.
 *
 * A placement is one reserved box on the public site, and a campaign buys one
 * of them between two dates. Several campaigns can hold the same placement at
 * once; the site then shows one of them at random on each page view, which is
 * how a position is sold to more than one advertiser.
 *
 * Two pictures per campaign, because the box is a different shape on each: 4:1
 * across a desktop and 4:5 on a phone. One picture squeezed into both ends up
 * either as a thumbnail or as a crop of its own middle, and neither keeps the
 * words on it readable.
 */

/** What each box is, in the words of somebody selling it. */
const PLACEMENTS: { value: AdPlacement; label: string; where: string }[] = [
  { value: 'home-top', label: 'Home · above the courses', where: 'Home page, under the slideshow' },
  { value: 'home-bottom', label: 'Home · foot of the page', where: 'Home page, after the articles' },
  { value: 'catalog-inline', label: 'Catalogue · inside the results', where: 'Between the sixth and seventh course' },
  { value: 'catalog-bottom', label: 'Catalogue · below the results', where: 'Under the course grid' },
  { value: 'course', label: 'Course page', where: 'Beside the recommended courses' },
  { value: 'blog', label: 'Articles · the list', where: 'Under the article grid' },
  { value: 'article', label: 'Article · the page itself', where: 'After an article is read' },
  { value: 'account', label: 'Account · overview', where: "A signed-in member's own page" },
  { value: 'learn', label: 'Lesson player', where: 'Beside the lesson a student is taking' },
]

const LOCALES = [
  { value: 'all', label: 'ทุกภาษา · every language' },
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'English' },
  { value: 'jp', label: '日本語' },
  { value: 'vn', label: 'Tiếng Việt' },
] as const

/** The sizes the artwork has to be, stated where it is uploaded rather than
 *  in an email somebody has to find again. */
const SPEC = {
  desktop: { ratio: '4:1', recommended: '1600 × 400 px', minimum: '1200 × 300 px' },
  mobile: { ratio: '4:5', recommended: '800 × 1000 px', minimum: '600 × 750 px' },
}

const rows = ref<Ad[]>([])
const live = ref<Record<string, number>>({})
const loading = ref(true)
const error = ref('')
const page = ref(1)
const total = ref(0)
const PER_PAGE = 20
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PER_PAGE)))

const q = ref('')
const placement = ref<'' | AdPlacement>('')
const status = ref<'' | 'draft' | 'published'>('')

/* ---------------- the form ---------------- */

const editing = ref<number | 'new' | null>(null)
const form = ref<AdInput>(blank())
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)

function blank(): AdInput {
  return {
    name: '',
    placement: 'home-top',
    advertiser: null,
    href: '',
    imageDesktopPath: null,
    imageMobilePath: null,
    imageAlt: null,
    locale: 'all',
    status: 'draft',
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
  }
}

/** `datetime-local` wants `2026-10-08T14:30`, with no zone and no seconds. */
function toLocalInput(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openNew() {
  editing.value = 'new'
  form.value = blank()
  if (placement.value) form.value.placement = placement.value
  formError.value = ''
  fieldErrors.value = {}
}

function openEdit(row: Ad) {
  editing.value = row.id
  formError.value = ''
  fieldErrors.value = {}
  form.value = {
    name: row.name,
    placement: row.placement,
    advertiser: row.advertiser,
    href: row.href,
    imageDesktopPath: row.imageDesktopPath,
    imageMobilePath: row.imageMobilePath,
    imageAlt: row.imageAlt,
    locale: row.locale,
    status: row.status,
    startsAt: toLocalInput(row.startsAt),
    endsAt: toLocalInput(row.endsAt),
    sortOrder: row.sortOrder,
  }
}

async function save() {
  saving.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    const body: AdInput = {
      ...form.value,
      // The boxes hold wall-clock time; the API stores an instant.
      startsAt: form.value.startsAt ? new Date(form.value.startsAt).toISOString() : null,
      endsAt: form.value.endsAt ? new Date(form.value.endsAt).toISOString() : null,
    }
    if (editing.value === 'new') await advertising.create(body)
    else if (editing.value != null) await advertising.update(editing.value, body)
    editing.value = null
    await load()
  } catch (err) {
    if (err instanceof ApiError) {
      formError.value = err.message
      fieldErrors.value = err.fields ?? {}
    } else {
      formError.value = 'Could not save it.'
    }
  } finally {
    saving.value = false
  }
}

const { ask } = useConfirm()

async function remove(row: Ad) {
  const ok = await ask({
    title: 'Delete this campaign?',
    message: `"${row.name}" will be removed, and its artwork with it. This cannot be undone.`,
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await advertising.remove(row.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete it.'
  }
}

/* ---------------- loading ---------------- */

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await advertising.list({
      page: page.value,
      perPage: PER_PAGE,
      placement: placement.value || undefined,
      status: status.value || undefined,
      q: q.value || undefined,
    })
    rows.value = res.data
    total.value = res.meta.total
    live.value = res.live
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the campaigns.'
  } finally {
    loading.value = false
  }
}

let typing: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(typing)
  typing = setTimeout(() => {
    page.value = 1
    void load()
  }, 320)
})
watch([placement, status], () => {
  page.value = 1
  void load()
})
watch(page, () => void load())

onMounted(load)

/* ---------------- shown in the table ---------------- */

const placementLabel = (p: AdPlacement) =>
  PLACEMENTS.find((x) => x.value === p)?.label ?? p

/** Whether this campaign is on air right now, which is status and dates
 *  together — a published campaign whose dates have passed is not running. */
function isRunning(row: Ad): boolean {
  if (row.status !== 'published') return false
  const now = Date.now()
  if (row.startsAt && new Date(row.startsAt).getTime() > now) return false
  if (row.endsAt && new Date(row.endsAt).getTime() < now) return false
  return true
}

function scheduleText(row: Ad): string {
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (!row.startsAt && !row.endsAt) return 'No end date'
  if (row.startsAt && row.endsAt) return `${when(row.startsAt)} → ${when(row.endsAt)}`
  return row.startsAt ? `From ${when(row.startsAt)}` : `Until ${when(row.endsAt!)}`
}

/** Placements with nothing running, so an unsold box is visible as unsold
 *  rather than only as an absence from the table. */
const unsold = computed(() => PLACEMENTS.filter((p) => !live.value[p.value]))

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'
</script>

<template>
  <AdminLayout>
    <PageBreadcrumb page-title="Advertising" />

    <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <!-- What is not sold. The useful question when you open this page. -->
      <div
        v-if="!loading && unsold.length"
        class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10"
      >
        <p class="font-medium text-amber-800 dark:text-amber-300">
          {{ unsold.length }} of {{ PLACEMENTS.length }} positions have nothing running
        </p>
        <p class="mt-1 text-amber-700 dark:text-amber-200/80">
          {{ unsold.map((p) => p.label).join(' · ') }}
        </p>
      </div>

      <div class="mb-5 flex flex-wrap items-center gap-3">
        <input v-model="q" placeholder="Search campaigns" :class="[inputClass, 'max-w-xs']" />
        <select v-model="placement" :class="[inputClass, 'max-w-xs']">
          <option value="">Any position</option>
          <option v-for="p in PLACEMENTS" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
        <select v-model="status" :class="[inputClass, 'max-w-40']">
          <option value="">Any state</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <button
          type="button"
          class="ml-auto h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600"
          @click="openNew"
        >
          New campaign
        </button>
      </div>

      <p v-if="error" class="mb-4 text-sm text-error-500">{{ error }}</p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[920px] text-left text-sm">
          <thead class="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800">
            <tr>
              <th class="py-3 pr-4 font-medium">Campaign</th>
              <th class="py-3 pr-4 font-medium">Position</th>
              <th class="py-3 pr-4 font-medium">Artwork</th>
              <th class="py-3 pr-4 font-medium">Runs</th>
              <th class="py-3 pr-4 font-medium">State</th>
              <th class="py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="6" class="py-8 text-center text-gray-400">Loading…</td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="6" class="py-8 text-center text-gray-400">No campaigns yet.</td>
            </tr>
            <tr v-for="row in rows" :key="row.id" class="align-middle">
              <td class="py-3 pr-4">
                <div class="font-medium text-gray-800 dark:text-white/90">{{ row.name }}</div>
                <div class="text-xs text-gray-400">{{ row.advertiser ?? row.href }}</div>
              </td>
              <td class="py-3 pr-4 text-gray-600 dark:text-gray-300">
                {{ placementLabel(row.placement) }}
              </td>
              <td class="py-3 pr-4">
                <div class="flex items-center gap-2">
                  <img
                    v-if="row.imageDesktopPath"
                    :src="mediaUrl(row.imageDesktopPath)"
                    alt=""
                    class="h-8 w-32 rounded border border-gray-200 object-cover dark:border-gray-700"
                  />
                  <span v-else class="text-xs text-error-500">no desktop</span>
                  <img
                    v-if="row.imageMobilePath"
                    :src="mediaUrl(row.imageMobilePath)"
                    alt=""
                    class="h-8 w-7 rounded border border-gray-200 object-cover dark:border-gray-700"
                  />
                  <span v-else class="text-xs text-error-500">no mobile</span>
                </div>
              </td>
              <td class="py-3 pr-4 text-xs text-gray-500">{{ scheduleText(row) }}</td>
              <td class="py-3 pr-4">
                <span
                  v-if="isRunning(row)"
                  class="rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-600 dark:bg-success-500/15 dark:text-success-400"
                  >On air</span
                >
                <span
                  v-else-if="row.status === 'published'"
                  class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-white/5"
                  >Out of dates</span
                >
                <span
                  v-else
                  class="rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-600 dark:bg-warning-500/15 dark:text-warning-400"
                  >Draft</span
                >
              </td>
              <td class="py-3 text-right whitespace-nowrap">
                <button type="button" class="text-sm text-brand-500 hover:underline" @click="openEdit(row)">
                  Edit
                </button>
                <button
                  type="button"
                  class="ml-4 text-sm text-error-500 hover:underline"
                  @click="remove(row)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <TablePager
        v-model:page="page"
        :total-pages="totalPages"
        :total="total"
        :per-page="PER_PAGE"
        noun="campaigns"
      />
    </div>

    <!-- The form -->
    <div
      v-if="editing !== null"
      class="fixed inset-0 z-99999 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
    >
      <div class="w-full max-w-3xl rounded-2xl bg-white p-6 dark:bg-gray-900">
        <h2 class="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
          {{ editing === 'new' ? 'New campaign' : 'Edit campaign' }}
        </h2>

        <p v-if="formError" class="mb-4 text-sm text-error-500">{{ formError }}</p>

        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label :class="labelClass">Campaign name</label>
            <input v-model="form.name" maxlength="150" :class="inputClass" />
            <p class="mt-1 text-xs text-gray-400">For this list only. Never shown on the site.</p>
            <p v-if="fieldErrors.name" class="mt-1 text-sm text-error-500">{{ fieldErrors.name }}</p>
          </div>

          <div>
            <label :class="labelClass">Advertiser</label>
            <input v-model="form.advertiser" maxlength="150" :class="inputClass" placeholder="learnsbuy.com" />
          </div>

          <div>
            <label :class="labelClass">Position</label>
            <select v-model="form.placement" :class="inputClass">
              <option v-for="p in PLACEMENTS" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
            <p class="mt-1 text-xs text-gray-400">
              {{ PLACEMENTS.find((p) => p.value === form.placement)?.where }}
            </p>
          </div>

          <div>
            <label :class="labelClass">Link</label>
            <input v-model="form.href" maxlength="512" :class="inputClass" placeholder="https://" />
            <p v-if="fieldErrors.href" class="mt-1 text-sm text-error-500">{{ fieldErrors.href }}</p>
          </div>

          <div class="sm:col-span-2">
            <FileField
              v-model="form.imageDesktopPath"
              purpose="content-image"
              label="Artwork · desktop"
              accept="image/*"
              preview
              :hint="`${SPEC.desktop.ratio} — ${SPEC.desktop.recommended} recommended, ${SPEC.desktop.minimum} minimum`"
            />
          </div>

          <div class="sm:col-span-2">
            <FileField
              v-model="form.imageMobilePath"
              purpose="content-image"
              label="Artwork · phone"
              accept="image/*"
              preview
              :hint="`${SPEC.mobile.ratio} — ${SPEC.mobile.recommended} recommended, ${SPEC.mobile.minimum} minimum`"
            />
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">What the picture says</label>
            <input v-model="form.imageAlt" maxlength="255" :class="inputClass" />
            <p class="mt-1 text-xs text-gray-400">
              Read out in place of the artwork. Without it the advertisement is silent to anyone
              using a screen reader.
            </p>
          </div>

          <div>
            <label :class="labelClass">Starts</label>
            <input v-model="form.startsAt" type="datetime-local" :class="inputClass" />
            <p class="mt-1 text-xs text-gray-400">Leave empty to start as soon as it is published.</p>
          </div>

          <div>
            <label :class="labelClass">Ends</label>
            <input v-model="form.endsAt" type="datetime-local" :class="inputClass" />
            <p class="mt-1 text-xs text-gray-400">Leave empty to run until somebody stops it.</p>
          </div>

          <div>
            <label :class="labelClass">Language</label>
            <select v-model="form.locale" :class="inputClass">
              <option v-for="l in LOCALES" :key="l.value" :value="l.value">{{ l.label }}</option>
            </select>
          </div>

          <div>
            <label :class="labelClass">State</label>
            <select v-model="form.status" :class="inputClass">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">Order</label>
            <input v-model.number="form.sortOrder" type="number" min="0" :class="[inputClass, 'max-w-32']" />
            <p class="mt-1 text-xs text-gray-400">
              Where several campaigns hold this position at once, the site shows one of them at
              random on each page view. A lower number wins when you want one of them to.
            </p>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="h-11 rounded-lg border border-gray-300 px-5 text-sm dark:border-gray-700 dark:text-white/90"
            @click="editing = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="h-11 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>
