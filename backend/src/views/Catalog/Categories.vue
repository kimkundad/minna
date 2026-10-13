<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import { ApiError, api, type Category, type CategoryInput, type CategoryNames } from '@/lib/api'
import { useConfirm } from '@/composables/useConfirm'

/**
 * Categories, as a tree in one table.
 *
 * Small enough to load whole and edit in place: a dozen rows, three fields
 * each. A separate page per category would be more clicks than typing.
 *
 * The slug is generated from the name until someone edits it by hand. After
 * that it is left alone — a published URL that silently changes because
 * somebody fixed a typo in a title is a broken link on every page that pointed
 * at it.
 */
const { ask } = useConfirm()

const rows = ref<Category[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const q = ref('')

/** Parents hold their children, so a page is counted in top-level categories
 *  rather than rows — the number people are actually scrolling through. */
const PER_PAGE = 10

/**
 * The languages a name is translated into, and what to call each in the form.
 *
 * Thai is absent on purpose: that is the Name field itself. The public site
 * falls back to it wherever one of these is blank, so leaving them empty is a
 * valid state rather than an unfinished one.
 */
const TRANSLATIONS = [
  { locale: 'en' as const, label: 'English' },
  { locale: 'jp' as const, label: 'Japanese' },
  { locale: 'vn' as const, label: 'Vietnamese' },
  { locale: 'id' as const, label: 'Indonesian' },
  { locale: 'zh' as const, label: 'Chinese (Simplified)' },
  { locale: 'ko' as const, label: 'Korean' },
  { locale: 'tw' as const, label: 'Chinese (Traditional)' },
]

/** The row being edited, or 'new'. Null means nothing is open. */
const editing = ref<number | 'new' | null>(null)
/** `names` is filled in rather than optional, so the three inputs can bind to it. */
const form = ref<CategoryInput & { names: CategoryNames }>(blank())
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)
const slugTouched = ref(false)

function blank(): CategoryInput & { names: CategoryNames } {
  return {
    name: '',
    slug: '',
    parentId: null,
    icon: null,
    sortOrder: 0,
    names: emptyNames(),
  }
}

/** One blank per language in TRANSLATIONS, so every input has something to
 *  bind to and adding a language is one edit rather than three. */
function emptyNames(): CategoryNames {
  return Object.fromEntries(TRANSLATIONS.map((t) => [t.locale, ''])) as CategoryNames
}

/** The stored names, narrowed to the languages this form edits. Anything else
 *  the API sends alongside them — the Thai name among it — is left out. */
function namesFrom(stored: CategoryNames | undefined): CategoryNames {
  return Object.fromEntries(
    TRANSLATIONS.map((t) => [t.locale, stored?.[t.locale] ?? '']),
  ) as CategoryNames
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Thai and Japanese have no case and no spaces to speak of; whatever is
    // left after stripping is better than an empty slug.
    .replace(/[^a-z0-9฀-๿]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Parents first, children under them, so the table reads as a tree. */
const ordered = computed(() => {
  const roots = rows.value.filter((c) => c.parentId === null)
  return roots.flatMap((root) => [
    { row: root, depth: 0 },
    ...rows.value.filter((c) => c.parentId === root.id).map((row) => ({ row, depth: 1 })),
  ])
})

/**
 * The languages this category has no name in yet.
 *
 * Shown in the table because the alternative is opening eighteen rows one at a
 * time to find out — and because a half-translated catalog is the normal state
 * right after someone adds a category, not a fault to hide.
 */
function missingNames(row: Category): string[] {
  return TRANSLATIONS.filter((t) => !row.names?.[t.locale]?.trim()).map((t) =>
    t.locale.toUpperCase(),
  )
}

/** Every top-level category, not only those on this page: a child can be
 *  moved under a parent that is paged out of sight. */
const allRoots = ref<Category[]>([])
const parentOptions = computed(() =>
  allRoots.value.filter((c) => c.id !== editing.value),
)

async function loadRoots() {
  try {
    allRoots.value = (await api.categories()).data.filter((c) => c.parentId === null)
  } catch {
    // The select falls back to empty; the table still works.
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.categoryPage({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load categories.'
  } finally {
    loading.value = false
  }
}

function openNew() {
  editing.value = 'new'
  form.value = blank()
  slugTouched.value = false
  formError.value = ''
  fieldErrors.value = {}
}

function openEdit(row: Category) {
  editing.value = row.id
  form.value = {
    name: row.name,
    slug: row.slug,
    parentId: row.parentId,
    icon: row.icon,
    sortOrder: row.sortOrder,
    // Blanks for the languages with no translation, so every input is there to
    // type into rather than appearing once something is saved.
    //
    // Only the keys in TRANSLATIONS, never the whole of `row.names`: the API
    // puts the canonical Thai name in there too, and sending `th` back is
    // refused outright — that is the Name field, not a translation.
    names: namesFrom(row.names),
  }
  // An existing slug is already in use somewhere; never regenerate it.
  slugTouched.value = true
  formError.value = ''
  fieldErrors.value = {}
}

function close() {
  editing.value = null
}

function onNameInput() {
  if (!slugTouched.value) form.value.slug = slugify(form.value.name)
}

async function save() {
  saving.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    if (editing.value === 'new') await api.createCategory(form.value)
    else if (editing.value != null) await api.updateCategory(editing.value, form.value)
    close()
    await Promise.all([load(), loadRoots()])
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

async function remove(row: Category) {
  // The API refuses when courses or sub-categories still point at it, and says
  // how many. This only needs to confirm intent.
  const { ok } = await ask({
    title: `Delete “${row.name}”?`,
    message: 'This cannot be undone.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await api.deleteCategory(row.id)
    await Promise.all([load(), loadRoots()])
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that category.'
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
watch(page, load)

onMounted(async () => {
  await Promise.all([load(), loadRoots()])
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Categories" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ total }} categories
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Courses are filed under these on the public site.
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
          @click="openNew"
        >
          Add category
        </button>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <!-- The form sits above the table rather than in a dialog: it is four
           fields, and keeping the list visible shows the sort order and the
           parents it is being placed among. -->
      <form
        v-if="editing !== null"
        class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
        @submit.prevent="save"
      >
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Name (Thai)<span class="text-error-500">*</span>
            </label>
            <input
              v-model="form.name"
              required
              maxlength="150"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              @input="onNameInput"
            />
            <p v-if="fieldErrors.name" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.name }}
            </p>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Slug<span class="text-error-500">*</span>
            </label>
            <input
              v-model="form.slug"
              required
              maxlength="150"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              @input="slugTouched = true"
            />
            <p v-if="fieldErrors.slug" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.slug }}
            </p>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Parent
            </label>
            <select
              v-model="form.parentId"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option :value="null">— top level —</option>
              <option v-for="p in parentOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <p v-if="fieldErrors.parentId" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.parentId }}
            </p>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Sort order
            </label>
            <input
              v-model.number="form.sortOrder"
              type="number"
              min="0"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>

        <!-- The other languages. Separated from the fields above because
             they are optional in a way the rest are not: the site reads the
             Thai name wherever one of these is blank, so a category works
             untranslated and these can be filled in later. -->
        <div class="mt-5 border-t border-gray-200 pt-5 dark:border-gray-800">
          <p class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-400">
            Name in other languages
            <span class="ml-1 font-normal text-gray-500 dark:text-gray-500">
              — leave blank to show the Thai name
            </span>
          </p>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div v-for="tr in TRANSLATIONS" :key="tr.locale">
              <label class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                {{ tr.label }}
              </label>
              <input
                v-model="form.names[tr.locale]"
                maxlength="150"
                :placeholder="form.name || '—'"
                class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>
          <p v-if="fieldErrors.names" class="mt-1 text-sm text-error-500">
            {{ fieldErrors.names }}
          </p>
        </div>

        <p v-if="formError" role="alert" class="mt-3 text-sm text-error-500">{{ formError }}</p>

        <div class="mt-4 flex gap-3">
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
            @click="close"
          >
            Cancel
          </button>
        </div>
      </form>

      <div class="border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
        <input
          v-model="q"
          type="search"
          placeholder="Search name or slug"
          class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[720px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Name</th>
              <th class="px-5 py-3 font-medium">Slug</th>
              <th class="px-5 py-3 font-medium">Languages</th>
              <th class="px-5 py-3 font-medium">Courses</th>
              <th class="px-5 py-3 font-medium">Order</th>
              <th class="px-5 py-3 font-medium sm:px-6"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="6" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="6" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                No categories yet.
              </td>
            </tr>
            <tr
              v-for="{ row, depth } in ordered"
              :key="row.id"
              class="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
            >
              <td class="px-5 py-3.5 text-sm text-gray-800 dark:text-white/90 sm:px-6">
                <span :style="{ paddingLeft: `${depth * 20}px` }">
                  <span v-if="depth" class="mr-1 text-gray-400">└</span>{{ row.name }}
                </span>
              </td>
              <td class="px-5 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                {{ row.slug }}
              </td>
              <td class="px-5 py-3.5 text-sm">
                <span
                  v-if="!missingNames(row).length"
                  class="text-xs font-medium text-success-600 dark:text-success-400"
                >
                  All languages
                </span>
                <span v-else class="flex flex-wrap gap-1">
                  <span
                    v-for="code in missingNames(row)"
                    :key="code"
                    class="rounded bg-warning-50 px-1.5 py-0.5 text-xs font-medium text-warning-600 dark:bg-warning-500/10 dark:text-warning-400"
                    :title="`No ${code} name — the Thai one is shown instead`"
                  >
                    {{ code }}
                  </span>
                </span>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ row.courseCount ?? 0 }}
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ row.sortOrder }}
              </td>
              <td class="px-5 py-3.5 text-right text-sm sm:px-6">
                <button
                  type="button"
                  class="text-brand-500 hover:text-brand-600"
                  @click="openEdit(row)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="ml-4 text-error-500 hover:text-error-600"
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
        noun="categories"
      />
    </div>
  </admin-layout>
</template>
