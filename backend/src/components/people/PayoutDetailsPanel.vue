<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FileField from '@/components/forms/FileField.vue'
import { ApiError, people, type AdminPayoutDetails } from '@/lib/api'

/**
 * Where one teacher's money goes, read and corrected by an administrator.
 *
 * One component for both screens that need it — the payout run, where somebody
 * is about to make a transfer, and the teacher's own page, where somebody is
 * fixing a number that came in over the phone. Two copies would be two places
 * to get the same careful thing wrong.
 *
 * Loaded on demand rather than with whatever list opened it: the server
 * records every read, and that record only means something if looking was a
 * decision. A table that fetched these to draw itself would log the same thing
 * every time anybody glanced at the page.
 *
 * The identity document is read-only here, whoever is looking. It is the
 * teacher's proof of who they are, and an administrator who could replace it
 * could make the bank details match a document nobody outside the building has
 * ever seen.
 */
const props = defineProps<{ userId: number }>()

const data = ref<AdminPayoutDetails | null>(null)
const loading = ref(true)
const error = ref('')

const editing = ref(false)
const saving = ref(false)
const saved = ref(false)
const form = ref({
  idDocumentPath: null as string | null,
  resumePath: null as string | null,
  bankCountry: '' as string,
  bankName: '',
  accountName: '',
  accountNumber: '',
  branch: '',
  swift: '',
  payoutCurrency: '',
  revenueSharePct: '' as string,
})

async function load() {
  loading.value = true
  error.value = ''
  editing.value = false
  saved.value = false
  try {
    data.value = (await people.payoutDetails(props.userId)).data
    fillForm()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load the bank details.'
  } finally {
    loading.value = false
  }
}

function fillForm() {
  const d = data.value
  form.value = {
    idDocumentPath: d?.idDocumentPath ?? null,
    resumePath: d?.resumePath ?? null,
    bankCountry: d?.bankCountry ?? '',
    bankName: d?.bankName ?? '',
    accountName: d?.accountName ?? '',
    accountNumber: d?.accountNumber ?? '',
    branch: d?.branch ?? '',
    swift: d?.swift ?? '',
    payoutCurrency: d?.payoutCurrency ?? '',
    revenueSharePct: d?.revenueSharePct == null ? '' : String(d.revenueSharePct),
  }
}

watch(() => props.userId, load, { immediate: true })

/** Thailand is the one country with a list, and picking from it fills in the
 *  SWIFT code — eight characters of nothing-in-particular and the most
 *  mistyped field on the form. */
const thaiBanks = computed(() => data.value?.thaiBanks ?? [])
const inThailand = computed(() => form.value.bankCountry === 'TH')

function pickThaiBank(name: string) {
  form.value.bankName = name
  const bank = thaiBanks.value.find((b) => b.name.en === name || b.name.th === name)
  if (bank) form.value.swift = bank.swift
}

async function save() {
  saving.value = true
  error.value = ''
  saved.value = false
  try {
    const blank = (s: string) => (s.trim() === '' ? null : s.trim())
    await people.savePayoutDetails(props.userId, {
      idDocumentPath: form.value.idDocumentPath,
      resumePath: form.value.resumePath,
      bankCountry: blank(form.value.bankCountry),
      bankName: blank(form.value.bankName),
      accountName: blank(form.value.accountName),
      accountNumber: blank(form.value.accountNumber),
      branch: blank(form.value.branch),
      swift: blank(form.value.swift),
      payoutCurrency: blank(form.value.payoutCurrency),
      // Empty puts them back on the school-wide figure, which only the server
      // can resolve — so it is sent as null, never as nought percent.
      revenueSharePct:
        form.value.revenueSharePct.trim() === '' ? null : Number(form.value.revenueSharePct),
    })
    await load()
    saved.value = true
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not save.'
  } finally {
    saving.value = false
  }
}

const labelClass = 'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400'
const inputClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90'

const countryName = computed(
  () =>
    (data.value?.countries ?? []).find((c) => c.code === data.value?.bankCountry)?.name.en ??
    data.value?.bankCountry ??
    '—',
)
</script>

<template>
  <div>
    <p v-if="loading" class="text-sm text-gray-500">Loading…</p>
    <p v-else-if="error" role="alert" class="text-sm text-error-500">{{ error }}</p>

    <template v-else-if="data">
      <!-- Reading -->
      <template v-if="!editing">
        <dl
          v-if="data.accountNumber"
          class="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2"
        >
          <div>
            <dt class="text-gray-400">Country</dt>
            <dd class="text-gray-800 dark:text-white/90">{{ countryName }}</dd>
          </div>
          <div>
            <dt class="text-gray-400">Bank</dt>
            <dd class="text-gray-800 dark:text-white/90">{{ data.bankName || '—' }}</dd>
          </div>
          <div>
            <dt class="text-gray-400">Account name</dt>
            <dd class="text-gray-800 dark:text-white/90">{{ data.accountName || '—' }}</dd>
          </div>
          <div>
            <dt class="text-gray-400">Account number</dt>
            <dd class="font-medium tabular-nums text-gray-800 dark:text-white/90">
              {{ data.accountNumber }}
            </dd>
          </div>
          <div>
            <dt class="text-gray-400">Branch</dt>
            <dd class="text-gray-800 dark:text-white/90">{{ data.branch || '—' }}</dd>
          </div>
          <div>
            <dt class="text-gray-400">SWIFT / BIC</dt>
            <dd class="text-gray-800 dark:text-white/90">{{ data.swift || '—' }}</dd>
          </div>
          <div v-if="data.payoutCurrency">
            <dt class="text-gray-400">Would rather be paid in</dt>
            <dd class="text-gray-800 dark:text-white/90">
              {{ data.payoutCurrency }}
              <span class="text-xs text-gray-400">— earnings are kept in baht</span>
            </dd>
          </div>
          <div>
            <dt class="text-gray-400">Share of a sale</dt>
            <dd class="text-gray-800 dark:text-white/90">
              <template v-if="data.revenueSharePct !== null">
                {{ data.revenueSharePct }}%
              </template>
              <template v-else>
                {{ data.houseSharePct }}%
                <span class="text-xs text-gray-400">— the school's usual rate</span>
              </template>
            </dd>
          </div>
        </dl>

        <p v-else class="text-sm text-gray-500 dark:text-gray-400">
          Nothing filled in yet. Teachers enter this themselves under My account, or you can
          fill it in for them.
        </p>
      </template>

      <!-- Correcting -->
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label :class="labelClass">Country</label>
          <select v-model="form.bankCountry" :class="inputClass">
            <option value="">—</option>
            <option v-for="c in data.countries" :key="c.code" :value="c.code">
              {{ c.name.en }}
            </option>
          </select>
        </div>
        <div>
          <label :class="labelClass">Bank</label>
          <select
            v-if="inThailand"
            :value="form.bankName"
            :class="inputClass"
            @change="pickThaiBank(($event.target as HTMLSelectElement).value)"
          >
            <option value="">—</option>
            <option v-for="b in thaiBanks" :key="b.swift" :value="b.name.en">
              {{ b.name.en }} · {{ b.name.th }}
            </option>
          </select>
          <input v-else v-model="form.bankName" maxlength="120" :class="inputClass" />
          <p v-if="inThailand" class="mt-1 text-xs text-gray-400">
            Picking one fills in the SWIFT code.
          </p>
        </div>
        <div>
          <label :class="labelClass">Account name</label>
          <input v-model="form.accountName" maxlength="150" :class="inputClass" />
        </div>
        <div>
          <label :class="labelClass">Account number</label>
          <input v-model="form.accountNumber" maxlength="64" :class="inputClass" />
        </div>
        <div>
          <label :class="labelClass">Branch</label>
          <input v-model="form.branch" maxlength="120" :class="inputClass" />
        </div>
        <div>
          <label :class="labelClass">SWIFT / BIC</label>
          <input v-model="form.swift" maxlength="16" :class="inputClass" />
        </div>
        <div>
          <label :class="labelClass">Would rather be paid in</label>
          <select v-model="form.payoutCurrency" :class="inputClass">
            <option value="">No preference</option>
            <option v-for="c in data.currencies" :key="c.code" :value="c.code">
              {{ c.code }} — {{ c.name.en }}
            </option>
          </select>
        </div>
        <div>
          <label :class="labelClass">Share of a sale (%)</label>
          <input
            v-model="form.revenueSharePct"
            inputmode="numeric"
            :placeholder="`Leave empty for ${data.houseSharePct}%`"
            :class="inputClass"
          />
          <p class="mt-1 text-xs text-gray-400">
            What this teacher keeps of what the school receives, after any discount. Agreed with
            the person, so it applies to every course of theirs. Changing it does not move
            earnings already recorded.
          </p>
        </div>
      </div>

      <div class="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
        <!-- The CV they applied with. It lives on the application, and once
             that was decided nothing pointed at it — so it is surfaced here,
             beside the other document about who this person is. -->
        <div class="mb-4">
          <p class="text-xs font-medium uppercase tracking-wide text-gray-400">CV</p>
          <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              v-if="data.resumeUrl"
              :href="data.resumeUrl"
              target="_blank"
              rel="noopener"
              class="text-sm text-brand-500 hover:text-brand-600"
            >
              Open the CV
            </a>
            <p v-else class="text-sm text-gray-500 dark:text-gray-400">None on file.</p>
            <!-- Which of the two it is. The application copy is evidence for a
                 decision already made and is never replaced; an uploaded one
                 is simply the current CV. -->
            <span v-if="data.resumeUrl" class="text-xs text-gray-400">
              {{ data.resumeIsCurrent ? 'Uploaded since they joined' : 'The one they applied with' }}
            </span>
          </div>

          <div v-if="editing" class="mt-3">
            <FileField
              v-model="form.resumePath"
              purpose="teacher-resume"
              :user-id="userId"
              label="Replace the CV"
              accept=".pdf,.doc,.docx,image/*"
              hint="Their application copy is kept either way — it is the document the approval was made on."
            />
          </div>
        </div>

        <p class="text-xs font-medium uppercase tracking-wide text-gray-400">ID / Passport</p>

        <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <a
            v-if="data.idDocumentUrl"
            :href="data.idDocumentUrl"
            target="_blank"
            rel="noopener"
            class="text-sm text-brand-500 hover:text-brand-600"
          >
            Open the document
          </a>
          <p v-else class="text-sm text-gray-500 dark:text-gray-400">Not uploaded.</p>

          <!-- Said out loud, because a document supplied by the same desk that
               typed the bank details is the one pair worth a second look. -->
          <span
            v-if="data.idDocumentUrl && data.idDocumentByAdmin"
            class="rounded-full bg-warning-50 px-2 py-0.5 text-xs text-warning-600 dark:bg-warning-500/15"
          >
            Uploaded by an administrator, not the teacher
          </span>
          <span v-else-if="data.idDocumentUrl" class="text-xs text-gray-400">
            Uploaded by the teacher
          </span>
        </div>

        <div v-if="editing" class="mt-3">
          <FileField
            v-model="form.idDocumentPath"
            purpose="identity-document"
            :user-id="userId"
            label="Replace the document"
            accept="image/*,application/pdf"
            hint="Only when the teacher cannot upload it themselves — a photo sent by message, for instance. Your name is kept with it."
          />
        </div>

        <p class="mt-2 text-xs text-gray-400">
          The link works for five minutes. Opening this is recorded against your account, and so
          is any change you make here.
        </p>
      </div>

      <div class="mt-5 flex items-center gap-3">
        <button
          v-if="!editing"
          type="button"
          class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          @click="editing = true"
        >
          Edit bank details
        </button>
        <template v-else>
          <button
            type="button"
            :disabled="saving"
            class="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            @click="((editing = false), fillForm())"
          >
            Cancel
          </button>
        </template>
        <p v-if="saved" class="text-sm text-success-600 dark:text-success-400">Saved.</p>
      </div>
    </template>
  </div>
</template>
