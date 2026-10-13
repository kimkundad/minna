<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
import PageBreadcrumb from '@/components/common/PageBreadcrumb.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'
import { ApiError, mediaUrl, settings as settingsApi, type SiteSetting, type VatPreview } from '@/lib/api'
import { UploadError, uploadFile } from '@/lib/upload'
import { useBrandingStore } from '@/stores/branding'
import { formatBaht } from '@/lib/money'

/**
 * Site settings.
 *
 * One of these decides what every customer is charged, so the VAT fields come
 * with a worked example underneath rather than a number in a box: inclusive and
 * exclusive are a word apart and ฿118 apart, and the difference is easy to read
 * straight past.
 *
 * Reading is admin; saving is superadmin, which is why the form is read-only
 * for an ordinary admin rather than hidden — knowing the rate is useful even
 * when changing it is not yours to do.
 */
const { ask } = useConfirm()
const auth = useAuthStore()

const canSave = computed(() => auth.roles.includes('superadmin'))

const rows = ref<SiteSetting[]>([])
const form = ref<Record<string, string>>({})
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const fieldErrors = ref<Record<string, string>>({})

/** What the saved rules do to a ฿1,690 course — the price of the one course
 *  that exists, so the example is one somebody recognises. */
const EXAMPLE = 169000
const preview = ref<VatPreview | null>(null)

const byGroup = computed(() => ({
  branding: rows.value.filter((r) => r.group === 'branding'),
  billing: rows.value.filter((r) => r.group === 'billing'),
  seller: rows.value.filter((r) => r.group === 'seller'),
  contact: rows.value.filter((r) => r.group === 'contact'),
  social: rows.value.filter((r) => r.group === 'social'),
  sharing: rows.value.filter((r) => r.group === 'sharing'),
}))

/** Only what actually changed, so a save never writes a field nobody touched. */
const changed = computed(() =>
  Object.fromEntries(
    rows.value.filter((r) => form.value[r.key] !== r.value).map((r) => [r.key, form.value[r.key]!]),
  ),
)
const dirty = computed(() => Object.keys(changed.value).length > 0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [list, vat] = await Promise.all([
      settingsApi.list(),
      settingsApi.vatPreview(EXAMPLE).catch(() => null),
    ])
    rows.value = list.data
    form.value = Object.fromEntries(list.data.map((r) => [r.key, r.value]))
    preview.value = vat?.data ?? null
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the settings.'
  } finally {
    loading.value = false
  }
}

/**
 * The live sum for whatever is currently typed, before it is saved.
 *
 * Worked out here rather than asked of the API, because the API can only answer
 * for what is stored — and the question being asked is what this change would
 * do. The arithmetic is the same as `vatOf`: inclusive extracts, exclusive adds.
 */
const pending = computed(() => {
  const percent = Number(form.value.vat_percent ?? '0')
  const inclusive = (form.value.vat_inclusive ?? 'true') === 'true'
  if (!Number.isFinite(percent) || percent < 0) return null

  const tax = percent
    ? inclusive
      ? Math.round(EXAMPLE - EXAMPLE / (1 + percent / 100))
      : Math.round(EXAMPLE * (percent / 100))
    : 0

  return { percent, inclusive, tax, customerPays: inclusive ? EXAMPLE : EXAMPLE + tax }
})

const vatChanged = computed(
  () => 'vat_percent' in changed.value || 'vat_inclusive' in changed.value,
)

const brand = useBrandingStore()

/** Which logo field is uploading, so only that box shows a spinner. */
const uploading = ref<string | null>(null)

/**
 * Puts the file in the store and the path in the form — not in the settings.
 *
 * Saving is still the Save button's job. Uploading on its own would change the
 * logo on every page the moment a file was picked, with no chance to look at it
 * first and no Discard to undo it.
 */
async function pickLogo(key: string, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploading.value = key
  fieldErrors.value = { ...fieldErrors.value, [key]: '' }
  try {
    const { path } = await uploadFile(file, { purpose: 'site-logo' })
    form.value[key] = path
  } catch (err) {
    fieldErrors.value = {
      ...fieldErrors.value,
      [key]: err instanceof UploadError || err instanceof ApiError ? err.message : 'Could not upload that file.',
    }
  } finally {
    uploading.value = null
  }
}

/** Back to the built-in logo. Empty is a real value here, not a blank field. */
function clearLogo(key: string): void {
  form.value[key] = ''
}

async function save() {
  if (!dirty.value) return

  // Only for the ones that move money. A phone number does not need a warning.
  if (vatChanged.value) {
    const p = pending.value
    const { ok } = await ask({
      title: 'Change how VAT is charged?',
      message: [
        p
          ? `A ฿1,690 course will be ${formatBaht(p.customerPays)} to the customer, with ${formatBaht(p.tax)} of tax ${p.inclusive ? 'inside it' : 'added on top'}.`
          : '',
        'This applies to every checkout from now on. Orders already placed keep the tax they were charged.',
      ]
        .filter(Boolean)
        .join('\n'),
      confirmLabel: 'Save',
      tone: 'danger',
    })
    if (!ok) return
  }

  saving.value = true
  error.value = ''
  saved.value = false
  fieldErrors.value = {}
  try {
    const res = await settingsApi.save(changed.value)
    rows.value = res.data
    form.value = Object.fromEntries(res.data.map((r) => [r.key, r.value]))
    preview.value = (await settingsApi.vatPreview(EXAMPLE)).data
    brand.set({
      logoPath: form.value.logo_path || null,
      logoIconPath: form.value.logo_icon_path || null,
      faviconPath: form.value.favicon_path || null,
    })
    saved.value = true
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

function reset() {
  form.value = Object.fromEntries(rows.value.map((r) => [r.key, r.value]))
  fieldErrors.value = {}
  error.value = ''
}

onMounted(load)
</script>

<template>
  <admin-layout>
    <PageBreadcrumb page-title="Settings" />

    <div class="mx-auto max-w-4xl space-y-6">
      <p
        v-if="error"
        role="alert"
        class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
      >
        {{ error }}
      </p>

      <p
        v-if="!loading && !canSave"
        class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300"
      >
        These are shown so you know what they are. Only a superadmin can change them.
      </p>

      <!-- Branding. First, because it is the one setting whose effect you can
           see on this very page: the menu beside the form uses it. -->
      <section
        v-if="!loading"
        class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">Logo</h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Used on the public site and in here. Saving changes both at once.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-6 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <div v-for="row in byGroup.branding" :key="row.key">
            <p class="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-400">
              {{ row.label }}
            </p>

            <!-- A checkerboard, because most logos have a transparent
                 background and white on white looks like nothing uploaded. -->
            <div
              class="flex h-24 items-center justify-center rounded-lg border border-gray-200 bg-[length:16px_16px] bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%,transparent_75%,#f3f4f6_75%),linear-gradient(45deg,#f3f4f6_25%,transparent_25%,transparent_75%,#f3f4f6_75%)] bg-[position:0_0,8px_8px] dark:border-gray-800"
            >
              <img
                v-if="form[row.key]"
                :src="mediaUrl(form[row.key]!)"
                alt=""
                class="max-h-16 max-w-full object-contain px-3"
              />
              <span v-else class="text-xs text-gray-400">Using the built-in logo</span>
            </div>

            <div v-if="canSave" class="mt-2 flex items-center gap-3">
              <label
                class="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                {{ uploading === row.key ? 'Uploading…' : form[row.key] ? 'Replace' : 'Upload' }}
                <input
                  type="file"
                  class="sr-only"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  :disabled="uploading !== null"
                  @change="pickLogo(row.key, $event)"
                />
              </label>
              <button
                v-if="form[row.key]"
                type="button"
                class="text-sm text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
                @click="clearLogo(row.key)"
              >
                Use the built-in one
              </button>
            </div>

            <p v-if="row.help" class="mt-1 text-xs text-gray-400">{{ row.help }}</p>
            <p v-if="fieldErrors[row.key]" class="mt-1 text-sm text-error-500">
              {{ fieldErrors[row.key] }}
            </p>
          </div>
        </div>
      </section>

      <!-- Billing -->
      <section
        class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">Tax</h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Used on every checkout, and written onto the order as it was at the time.
          </p>
        </div>

        <p v-if="loading" class="px-5 py-8 text-center text-sm text-gray-500 sm:px-6">Loading…</p>

        <div v-else class="space-y-5 px-5 py-5 sm:px-6">
          <div v-for="row in byGroup.billing" :key="row.key">
            <label
              :for="`set-${row.key}`"
              class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              {{ row.label }}
            </label>

            <!-- A rate, in whole percent -->
            <div v-if="row.type === 'percent'" class="flex items-center gap-2">
              <!-- `:value` and `@input` rather than `v-model`: Vue casts a
                   number input's model to a number, and every setting on the
                   wire is text. Comparing a number against the stored string
                   would also mark the field dirty the moment it loaded. -->
              <input
                :id="`set-${row.key}`"
                :value="form[row.key]"
                type="number"
                min="0"
                :max="row.max ?? 30"
                step="1"
                :disabled="!canSave"
                @input="form[row.key] = ($event.target as HTMLInputElement).value"
                class="h-11 w-32 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <span class="text-sm text-gray-500 dark:text-gray-400">%</span>
            </div>

            <!-- Inclusive or not -->
            <label
              v-else-if="row.type === 'boolean'"
              class="flex cursor-pointer items-center gap-3 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                :id="`set-${row.key}`"
                type="checkbox"
                :disabled="!canSave"
                :checked="form[row.key] === 'true'"
                class="h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20 disabled:opacity-60 dark:border-gray-700"
                @change="form[row.key] = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
              />
              {{ form[row.key] === 'true' ? 'Yes — the listed price contains the tax' : 'No — the tax is added at checkout' }}
            </label>

            <p v-if="row.help" class="mt-1 text-xs text-gray-400">{{ row.help }}</p>
            <p v-if="fieldErrors[row.key]" class="mt-1 text-sm text-error-500">
              {{ fieldErrors[row.key] }}
            </p>
          </div>

          <!-- The worked example. The point of the screen, really: it is the
               only way to see at a glance what inclusive actually means. -->
          <div
            v-if="pending"
            class="rounded-lg border px-4 py-4 text-sm"
            :class="
              vatChanged
                ? 'border-warning-500/40 bg-warning-50 dark:bg-warning-500/10'
                : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]'
            "
          >
            <p class="font-medium text-gray-800 dark:text-white/90">
              A course listed at {{ formatBaht(EXAMPLE) }}
            </p>
            <dl class="mt-2 space-y-1">
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">The customer pays</dt>
                <dd class="font-medium text-gray-800 dark:text-white/90">
                  {{ formatBaht(pending.customerPays) }}
                </dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">
                  VAT {{ pending.inclusive ? 'inside that' : 'added on top' }}
                </dt>
                <dd class="text-gray-800 dark:text-white/90">{{ formatBaht(pending.tax) }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500 dark:text-gray-400">We keep</dt>
                <dd class="text-gray-800 dark:text-white/90">
                  {{ formatBaht(pending.customerPays - pending.tax) }}
                </dd>
              </div>
            </dl>
            <p v-if="vatChanged" class="mt-3 text-xs text-warning-600 dark:text-warning-400">
              Not saved yet. Orders already placed keep the tax they were charged.
            </p>
          </div>
        </div>
      </section>

      <!-- Who the receipt is from. Until the name is filled in, a buyer's
           receipt prints without an issuer block rather than with an empty
           one, so the screen says what is riding on this. -->
      <section
        v-if="!loading"
        class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">Seller details</h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Printed at the top of every receipt and tax invoice. Leave the registered name blank
            and receipts go out without an issuer block at all.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <div
            v-for="row in byGroup.seller"
            :key="row.key"
            :class="row.type === 'multiline' ? 'sm:col-span-2' : undefined"
          >
            <label
              :for="`set-${row.key}`"
              class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              {{ row.label }}
            </label>
            <textarea
              v-if="row.type === 'multiline'"
              :id="`set-${row.key}`"
              v-model="form[row.key]"
              :disabled="!canSave"
              rows="3"
              class="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            ></textarea>
            <input
              v-else
              :id="`set-${row.key}`"
              v-model="form[row.key]"
              type="text"
              :inputmode="row.type === 'taxid' ? 'numeric' : undefined"
              :disabled="!canSave"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p v-if="row.help" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ row.help }}
            </p>
            <p v-if="fieldErrors[row.key]" class="mt-1 text-sm text-error-500">
              {{ fieldErrors[row.key] }}
            </p>
          </div>
        </div>
      </section>

      <!-- Contact and social. Stored, but nothing shows them yet, and the
           screen says so rather than letting someone fill in a dead box. -->
      <section
        v-if="!loading"
        class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">
            Contact and social
          </h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Saved here, but the public site still shows its own placeholder footer — these will not
            appear on it until that is wired up.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <div v-for="row in [...byGroup.contact, ...byGroup.social]" :key="row.key">
            <label
              :for="`set-${row.key}`"
              class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              {{ row.label }}
            </label>
            <input
              :id="`set-${row.key}`"
              v-model="form[row.key]"
              :type="row.type === 'email' ? 'email' : row.type === 'url' ? 'url' : 'text'"
              :disabled="!canSave"
              :placeholder="row.type === 'url' ? 'https://' : ''"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p v-if="fieldErrors[row.key]" class="mt-1 text-sm text-error-500">
              {{ fieldErrors[row.key] }}
            </p>
          </div>
        </div>
      </section>

      <!-- What a link looks like when somebody passes it on. Four languages,
           because the home page and the catalog render in all four and a link
           to /en that previews in Thai shows the wrong page to the person
           deciding whether to open it. -->
      <section
        v-if="byGroup.sharing.length"
        class="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div class="border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h3 class="text-base font-medium text-gray-800 dark:text-white/90">Sharing</h3>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            The preview card for pages that have none of their own — the home page, the catalog,
            about. A course or an article shares as its own title, description and cover, and each
            has its own override if the shared wording should differ.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 px-5 py-5 sm:px-6">
          <div v-for="row in byGroup.sharing" :key="row.key">
            <label
              :for="`set-${row.key}`"
              class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              {{ row.label }}
            </label>
            <input
              :id="`set-${row.key}`"
              v-model="form[row.key]"
              type="text"
              :disabled="!canSave"
              class="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <p v-if="row.help" class="mt-1 text-xs text-gray-400">{{ row.help }}</p>
            <p v-if="fieldErrors[row.key]" class="mt-1 text-sm text-error-500">
              {{ fieldErrors[row.key] }}
            </p>
          </div>
        </div>
      </section>

      <div v-if="!loading && canSave" class="flex items-center gap-3">
        <button
          type="button"
          :disabled="!dirty || saving"
          class="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
        <button
          v-if="dirty"
          type="button"
          class="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          @click="reset"
        >
          Discard
        </button>
        <p v-if="saved && !dirty" class="text-sm text-success-600 dark:text-success-400">
          Saved, and in use now.
        </p>
      </div>
    </div>
  </admin-layout>
</template>
