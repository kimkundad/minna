<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import FileField from '@/components/forms/FileField.vue'
import RichTextField from '@/components/forms/RichTextField.vue'

import { useConfirm } from '@/composables/useConfirm'
import {
  ApiError,
  api,
  content,
  teachers,
  type Category,
  type Post,
  type PostInput,
  type PostLocale,
  type TeacherOption,
} from '@/lib/api'

/**
 * Articles.
 *
 * Written here and read by the public site. The body is plain HTML in a
 * textarea rather than a rich editor: a rich editor is a project of its own,
 * and pasting from a document is how these actually get written. Keeping it
 * honest about being HTML is better than a toolbar that silently mangles it.
 *
 * The public site still reads its own fixtures, so nothing written here shows
 * up there yet. That is said on the screen rather than left to be discovered.
 */
const { ask } = useConfirm()

const rows = ref<Post[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const PER_PAGE = 20

const q = ref('')
const status = ref<'' | 'draft' | 'published'>('')
const locale = ref<'' | PostLocale>('')

/**
 * 'all' is the article's own setting, not a view of everything: for writing
 * that is not about one language — how long learning takes, how to revise, how
 * the school works. Those appear whichever language the site is read in.
 *
 * Most articles are not that, which is why the form opens on Thai. In the
 * filter above the table it means "only the ones set to every language".
 */
const LOCALES = [
  { value: 'all', label: 'ทุกภาษา · every language' },
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'English' },
  { value: 'jp', label: '日本語' },
  { value: 'vn', label: 'Tiếng Việt' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'zh', label: '简体中文' },
  { value: 'ko', label: '한국어' },
  { value: 'tw', label: '繁體中文' },
] as const

/* ---------------- the form ---------------- */

const editing = ref<number | 'new' | null>(null)
const form = ref<PostInput>(blank())
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)
const slugTouched = ref(false)

/**
 * The course categories, shown as "parent · child" because four of them are
 * called "สนทนา" and the names alone would read as four identical options.
 */
const categories = ref<Category[]>([])

/**
 * Who an article can be credited to.
 *
 * The same list the course form picks instructors from, because it answers
 * the same question — who on this site has a public page with a name, a
 * headline and a biography on it. That is exactly what the card at the end of
 * an article shows, and an administrator has none of it.
 */
const authors = ref<TeacherOption[]>([])

async function loadAuthors() {
  try {
    authors.value = (await teachers.options()).data
  } catch {
    // The select falls back to "whoever creates it", which is what used to
    // happen always. Nothing else on the page depends on this.
  }
}

const categoryOptions = computed(() =>
  categories.value
    .map((c) => {
      const parent = c.parentId ? categories.value.find((p) => p.id === c.parentId) : null
      return { id: c.id, label: parent ? `${parent.name} · ${c.name}` : c.name }
    })
    .sort((a, b) => a.label.localeCompare(b.label)),
)

async function loadCategories() {
  try {
    categories.value = (await api.categories()).data
  } catch {
    // The field falls back to "no category", which is a valid article.
  }
}

function blank(): PostInput {
  return {
    title: '',
    slug: '',
    excerpt: null,
    coverPath: null,
    contentHtml: null,
    contentLocale: 'th',
    status: 'draft',
    categoryId: null,
    authorId: null,
    ogTitle: null,
    ogDescription: null,
    ogImagePath: null,
  }
}

/** Thai is kept as-is: stripping it would leave an empty slug, and Thai URLs
 *  are normal here. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9฀-๿]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function onTitleInput() {
  if (!slugTouched.value) form.value.slug = slugify(form.value.title)
}

function openNew() {
  editing.value = 'new'
  form.value = blank()
  slugTouched.value = false
  formError.value = ''
  fieldErrors.value = {}
}

async function openEdit(row: Post) {
  formError.value = ''
  fieldErrors.value = {}
  try {
    // The list leaves the body out — it is thousands of characters per row.
    const full = (await content.post(row.id)).data
    editing.value = row.id
    form.value = {
      title: full.title,
      slug: full.slug,
      excerpt: full.excerpt,
      coverPath: full.coverPath,
      contentHtml: full.contentHtml ?? null,
      contentLocale: full.contentLocale,
      status: full.status,
      categoryId: full.categoryId ?? null,
      authorId: full.authorId ?? null,
      ogTitle: full.ogTitle ?? null,
      ogDescription: full.ogDescription ?? null,
      ogImagePath: full.ogImagePath ?? null,
    }
    // A published slug is a URL other pages point at; never regenerate it.
    slugTouched.value = true
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not open that article.'
  }
}

async function save() {
  saving.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    if (editing.value === 'new') await content.createPost(form.value)
    else if (editing.value != null) await content.updatePost(editing.value, form.value)
    editing.value = null
    await load()
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

async function remove(row: Post) {
  const { ok } = await ask({
    title: `Delete “${row.title}”?`,
    message:
      row.status === 'published'
        ? 'It is live, so anyone holding its address will get a missing page. This cannot be undone.'
        : 'This cannot be undone.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await content.deletePost(row.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that article.'
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await content.posts({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...(status.value ? { status: status.value } : {}),
      ...(locale.value ? { locale: locale.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the articles.'
  } finally {
    loading.value = false
  }
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
function when(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '—'
}

const inputClass =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400'

let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
watch([status, locale], () => {
  page.value = 1
  void load()
})
watch(page, load)

onMounted(() => {
  void load()
  void loadCategories()
  void loadAuthors()
})
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Articles" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ total }} articles
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Written in one language each; the reader's language decides what they see.
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
          @click="openNew"
        >
          Write one
        </button>
      </div>

      <p
        v-if="error"
        role="alert"
        class="mx-5 mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400 sm:mx-6"
      >
        {{ error }}
      </p>

      <form
        v-if="editing !== null"
        class="border-y border-gray-100 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6"
        @submit.prevent="save"
      >
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
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
            <label :class="labelClass">Web address<span class="text-error-500">*</span></label>
            <input
              v-model="form.slug"
              required
              maxlength="255"
              :class="inputClass"
              @input="slugTouched = true"
            />
            <p class="mt-1 text-xs text-gray-400">
              Changing this on a published article breaks every link to it.
            </p>
            <p v-if="fieldErrors.slug" class="mt-1 text-sm text-error-500">{{ fieldErrors.slug }}</p>
          </div>

          <div>
            <label :class="labelClass">Language</label>
            <select v-model="form.contentLocale" :class="inputClass">
              <option v-for="l in LOCALES" :key="l.value" :value="l.value">{{ l.label }}</option>
            </select>
            <p class="mt-1 text-xs text-gray-400">
              Pick a language unless the article is not about one — "every language" shows it to
              every reader, whichever language they are using the site in.
            </p>
          </div>

          <div>
            <label :class="labelClass">Category</label>
            <select v-model="form.categoryId" :class="inputClass">
              <option :value="null">No category</option>
              <option v-for="c in categoryOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
            <p class="mt-1 text-xs text-gray-400">
              The same list the courses use, so an article and a course on the same subject can
              point at each other.
            </p>
          </div>

          <div>
            <label :class="labelClass">Author</label>
            <select v-model="form.authorId" :class="inputClass">
              <option :value="null">
                {{ editing === 'new' ? 'Me' : 'Leave as it is' }}
              </option>
              <option v-for="a in authors" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <p class="mt-1 text-xs text-gray-400">
              Shown in the card at the end of the article, with their headline and biography.
              Only teachers have those, so an article credited to an administrator shows a name
              and nothing else.
            </p>
            <p v-if="fieldErrors.authorId" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.authorId }}
            </p>
          </div>

          <!-- Only where the shared wording should differ from the article's
               own. Empty is the normal state: it shares as the page reads. -->
          <div class="sm:col-span-2 mt-2 border-t border-gray-100 pt-5 dark:border-gray-800">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-400">
              Sharing
              <span class="ml-1 font-normal text-gray-500 dark:text-gray-500">
                — leave empty to share this article as it reads
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
            <label :class="labelClass">State</label>
            <select v-model="form.status" :class="inputClass">
              <option value="draft">Draft — nobody can see it</option>
              <option value="published">Published</option>
            </select>
          </div>

          <div class="sm:col-span-2">
            <label :class="labelClass">Summary</label>
            <input
              v-model="form.excerpt"
              maxlength="500"
              :class="inputClass"
              placeholder="One or two lines, shown on the article list."
            />
          </div>

          <div class="sm:col-span-2">
            <FileField
              v-model="form.coverPath"
              label="Cover image"
              purpose="avatar"
              accept="image/*"
              preview
              help="Shown at the top of the article and on its card."
            />
          </div>

          <div class="sm:col-span-2">
            <RichTextField
              v-model="form.contentHtml"
              label="The article"
              :rows="16"
              help="Pictures can be dropped straight in. The source button shows the HTML underneath."
              :error="fieldErrors.contentHtml ?? ''"
            />
          </div>
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
            @click="editing = null"
          >
            Cancel
          </button>
        </div>
      </form>

      <div
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-3 sm:px-6"
      >
        <input
          v-model="q"
          type="search"
          placeholder="Search title or address"
          :class="inputClass"
        />
        <select v-model="status" :class="inputClass">
          <option value="">Any state</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select v-model="locale" :class="inputClass">
          <option value="">Any language</option>
          <option v-for="l in LOCALES" :key="l.value" :value="l.value">{{ l.label }}</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[800px] text-left">
          <thead class="border-b border-gray-100 dark:border-gray-800">
            <tr class="text-xs uppercase tracking-wide text-gray-400">
              <th class="px-5 py-3 font-medium sm:px-6">Title</th>
              <th class="px-5 py-3 font-medium">Language</th>
              <th class="px-5 py-3 font-medium">State</th>
              <th class="px-5 py-3 font-medium">Published</th>
              <th class="px-5 py-3 font-medium sm:px-6"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-if="loading">
              <td colspan="5" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Loading…
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td colspan="5" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
                Nothing written yet.
              </td>
            </tr>
            <tr v-for="row in rows" :key="row.id" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <td class="px-5 py-3.5 sm:px-6">
                <p class="text-sm text-gray-800 dark:text-white/90">{{ row.title }}</p>
                <p class="mt-0.5 font-mono text-xs text-gray-400">/{{ row.slug }}</p>
              </td>
              <td class="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400">
                {{ row.contentLocale }}
              </td>
              <td class="px-5 py-3.5">
                <span
                  class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                  :class="
                    row.status === 'published'
                      ? 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400'
                  "
                >
                  {{ row.status === 'published' ? 'Published' : 'Draft' }}
                </span>
              </td>
              <td class="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                {{ when(row.publishedAt) }}
              </td>
              <td class="whitespace-nowrap px-5 py-3.5 text-right text-sm sm:px-6">
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
        noun="articles"
      />
    </div>

    <!-- Said here rather than left to be discovered by publishing one and
         looking for it. -->
    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
      The public site still shows its own sample articles. Nothing written here appears there until
      that is wired up.
    </p>
  </admin-layout>
</template>
