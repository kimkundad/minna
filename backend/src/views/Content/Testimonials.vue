<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import TablePager from '@/components/common/TablePager.vue'
import FileField from '@/components/forms/FileField.vue'
import { useConfirm } from '@/composables/useConfirm'
import { ApiError, content, type Testimonial, type TestimonialInput } from '@/lib/api'

/**
 * What students said.
 *
 * Typed in by an administrator rather than collected from students: these are
 * marketing copy on the home page, and a review nobody checked before it went
 * live is a different feature with different rules. If that is ever wanted it
 * needs its own moderation queue, not this screen.
 */
const { ask } = useConfirm()

const rows = ref<Testimonial[]>([])
const loading = ref(true)
const error = ref('')

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const PER_PAGE = 20

const q = ref('')
const status = ref<'' | 'draft' | 'published'>('')

const editing = ref<number | 'new' | null>(null)
const form = ref<TestimonialInput>(blank())
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const saving = ref(false)

function blank(): TestimonialInput {
  return {
    name: '',
    designation: null,
    content: '',
    rating: 5,
    avatarPath: null,
    status: 'published',
    sortOrder: 0,
  }
}

function openNew() {
  editing.value = 'new'
  form.value = blank()
  formError.value = ''
  fieldErrors.value = {}
}

function openEdit(row: Testimonial) {
  editing.value = row.id
  form.value = {
    name: row.name,
    designation: row.designation,
    content: row.content,
    rating: row.rating,
    avatarPath: row.avatarPath,
    status: row.status,
    sortOrder: row.sortOrder,
  }
  formError.value = ''
  fieldErrors.value = {}
}

async function save() {
  saving.value = true
  formError.value = ''
  fieldErrors.value = {}
  try {
    if (editing.value === 'new') await content.createTestimonial(form.value)
    else if (editing.value != null) await content.updateTestimonial(editing.value, form.value)
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

async function remove(row: Testimonial) {
  const { ok } = await ask({
    title: `Delete what ${row.name} said?`,
    message: 'This cannot be undone.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await content.deleteTestimonial(row.id)
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not delete that.'
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await content.testimonials({
      page: page.value,
      perPage: PER_PAGE,
      ...(q.value ? { q: q.value } : {}),
      ...(status.value ? { status: status.value } : {}),
    })
    rows.value = res.data
    total.value = res.meta.total
    totalPages.value = res.meta.totalPages
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load these.'
  } finally {
    loading.value = false
  }
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
watch(status, () => {
  page.value = 1
  void load()
})
watch(page, load)

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Testimonials" />

    <div
      class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            {{ total }} testimonials
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Shown on the home page, in the order set below.
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
          @click="openNew"
        >
          Add one
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
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label :class="labelClass">Who said it<span class="text-error-500">*</span></label>
            <input v-model="form.name" required maxlength="150" :class="inputClass" />
            <p v-if="fieldErrors.name" class="mt-1 text-sm text-error-500">{{ fieldErrors.name }}</p>
          </div>
          <div>
            <label :class="labelClass">What they do</label>
            <input
              v-model="form.designation"
              maxlength="150"
              :class="inputClass"
              placeholder="นักศึกษา · พนักงานบริษัท"
            />
          </div>
          <div>
            <label :class="labelClass">Stars</label>
            <select v-model.number="form.rating" :class="inputClass">
              <option v-for="n in 5" :key="n" :value="n">{{ '★'.repeat(n) }}</option>
            </select>
          </div>
          <div>
            <label :class="labelClass">Order</label>
            <input v-model.number="form.sortOrder" type="number" min="0" :class="inputClass" />
            <p class="mt-1 text-xs text-gray-400">Smaller numbers come first.</p>
          </div>

          <div class="sm:col-span-2 xl:col-span-4">
            <label :class="labelClass">What they said<span class="text-error-500">*</span></label>
            <textarea
              v-model="form.content"
              required
              rows="3"
              maxlength="2000"
              class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            ></textarea>
            <p v-if="fieldErrors.content" class="mt-1 text-sm text-error-500">
              {{ fieldErrors.content }}
            </p>
          </div>

          <div class="sm:col-span-2">
            <FileField
              v-model="form.avatarPath"
              label="Their photo"
              purpose="avatar"
              accept="image/*"
              preview
            />
          </div>

          <div>
            <label :class="labelClass">State</label>
            <select v-model="form.status" :class="inputClass">
              <option value="published">Shown on the site</option>
              <option value="draft">Hidden</option>
            </select>
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
        class="grid grid-cols-1 gap-3 border-y border-gray-100 px-5 py-4 dark:border-gray-800 sm:grid-cols-2 sm:px-6"
      >
        <input v-model="q" type="search" placeholder="Search name or words" :class="inputClass" />
        <select v-model="status" :class="inputClass">
          <option value="">Any state</option>
          <option value="published">Shown</option>
          <option value="draft">Hidden</option>
        </select>
      </div>

      <ul class="divide-y divide-gray-100 dark:divide-gray-800">
        <li v-if="loading" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</li>
        <li v-else-if="!rows.length" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">
          Nothing here yet.
        </li>
        <li v-for="row in rows" :key="row.id" class="px-5 py-4 sm:px-6">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <p class="text-sm">
                <span class="font-medium text-gray-800 dark:text-white/90">{{ row.name }}</span>
                <span v-if="row.designation" class="text-gray-500 dark:text-gray-400">
                  · {{ row.designation }}
                </span>
                <span class="ml-2 text-warning-500">{{ '★'.repeat(row.rating) }}</span>
                <span
                  v-if="row.status === 'draft'"
                  class="ml-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-400"
                >
                  hidden
                </span>
              </p>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{{ row.content }}</p>
            </div>
            <div class="shrink-0 whitespace-nowrap text-sm">
              <span class="mr-4 text-xs text-gray-400">#{{ row.sortOrder }}</span>
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
          </div>
        </li>
      </ul>

      <TablePager
        v-model:page="page"
        :total-pages="totalPages"
        :total="total"
        :per-page="PER_PAGE"
        noun="testimonials"
      />
    </div>

    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
      The public site still shows its own sample quotes. Nothing added here appears there until that
      is wired up.
    </p>
  </admin-layout>
</template>
