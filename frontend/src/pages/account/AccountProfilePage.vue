<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppModal from '@/components/ui/AppModal.vue'
import PhoneField from '@/components/ui/PhoneField.vue'
import {
  ApiError,
  api,
  mediaUrl,
  type AccountSession,
  type InvoiceRequest,
  type Consents,
  type MemberBilling,
  type MyProfile,
} from '@/lib/api'
import { UploadError, uploadAvatar } from '@/lib/upload'
import { useAuthStore } from '@/stores/auth'
import { LOCALES, LOCALE_META, storeLocale, type AppLocale } from '@/locales'
import { dateLong, dateTime } from '@/lib/format'

/**
 * Account settings.
 *
 * Every box here is one the API will actually accept. The prototype's form
 * asked for a veterinary licence, a clinic, a province and a set of interests
 * drawn from a veterinary taxonomy; none of those exist as columns, so none of
 * them are here — a field that saves nowhere is worse than a missing one,
 * because somebody fills it in and believes it.
 *
 * What is left is in three parts: who you are, where your tax invoices go, and
 * who is signed in as you. The email is shown and not editable, which matches
 * the API: an address is the account's identity and changing it is a flow with
 * a confirmation mail behind it, not a text box.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const locale = computed(() => String(route.params.locale ?? 'th') as AppLocale)
const path = (p: string) => `/${locale.value}${p}`

/* ---------------- who you are ---------------- */

interface Basic {
  firstName: string
  lastName: string
  phoneCountryCode: string
  phoneNational: string
  locale: AppLocale
  /** `YYYY-MM-DD`, which is what a date input reads and writes. */
  birthdate: string
}

/** The rest of the account row. The session does not carry the birthdate —
 *  only this screen asks about it — so it is fetched alongside. */
const record = ref<MyProfile | null>(null)

/**
 * What is saved, as the form would hold it. Two sources because the session
 * carries what every page needs and `record` carries the rest; a mismatch
 * between them is what "unsaved changes" is measured against.
 */
function fromSaved(): Basic {
  const u = auth.user
  return {
    firstName: u?.firstName ?? '',
    lastName: u?.lastName ?? '',
    phoneCountryCode: u?.phoneCountryCode ?? '+66',
    phoneNational: u?.phoneNational ?? '',
    locale: (u?.locale ?? 'th') as AppLocale,
    birthdate: record.value?.birthdate ?? '',
  }
}

/**
 * A date input will not offer tomorrow, or 1850.
 *
 * Read off the reader's own calendar. `toISOString` is UTC, so between
 * midnight and seven in the morning in Bangkok it says yesterday — and a
 * birthday field that will not accept today is the sort of thing nobody
 * reports, they just give up.
 */
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const earliest = `${now.getFullYear() - 120}-01-01`

const basic = reactive<Basic>(fromSaved())

/** The record lands after the first paint. Seeding the field then is safe
 *  while nobody has typed in it; after that, their typing wins. */
watch(record, (row) => {
  if (row && !basic.birthdate) basic.birthdate = row.birthdate ?? ''
})
const basicErrors = reactive<Record<string, string>>({})
const basicSaving = ref(false)
const basicSaved = ref(false)
const phoneValid = ref<boolean | null>(null)

watch(
  () => auth.user,
  () => Object.assign(basic, fromSaved()),
)

const basicDirty = computed(() => {
  const was = fromSaved()
  return (Object.keys(was) as (keyof Basic)[]).some((k) => basic[k] !== was[k])
})

const avatar = computed(() =>
  auth.user?.avatarPath ? mediaUrl(auth.user.avatarPath) : null,
)
const initials = computed(() => {
  const u = auth.user
  return `${u?.firstName?.[0] ?? ''}${u?.lastName?.[0] ?? ''}`.trim()
})

async function saveBasic(): Promise<void> {
  Object.keys(basicErrors).forEach((k) => delete basicErrors[k])
  if (!basic.firstName.trim()) basicErrors.firstName = t('account.profile.errFirstName')
  if (!basic.lastName.trim()) basicErrors.lastName = t('account.profile.errLastName')
  // Only when something was typed: the phone is optional, and an empty box is
  // not a wrong one.
  if (basic.phoneNational.trim() && phoneValid.value === false) {
    basicErrors.phone = t('account.profile.errPhone')
  }
  if (Object.keys(basicErrors).length) return

  basicSaving.value = true
  basicSaved.value = false
  try {
    await api.updateProfile({
      firstName: basic.firstName.trim(),
      lastName: basic.lastName.trim(),
      phoneCountryCode: basic.phoneNational.trim() ? basic.phoneCountryCode : null,
      phoneNational: basic.phoneNational.trim() || null,
      locale: basic.locale,
      ...(basic.birthdate ? { birthdate: basic.birthdate } : {}),
    })
    record.value = (await api.myProfile().catch(() => ({ data: record.value }))).data
    await auth.refreshUser()
    // The site follows the language the account is set to, so saving it here
    // and leaving the page in the old one would be two answers to one question.
    storeLocale(basic.locale)
    if (basic.locale !== locale.value) {
      await router.replace({
        name: route.name ?? undefined,
        params: { ...route.params, locale: basic.locale },
        query: route.query,
        hash: route.hash,
      })
    }
    basicSaved.value = true
  } catch (err) {
    if (err instanceof ApiError && err.fields) Object.assign(basicErrors, err.fields)
    else basicErrors.form = err instanceof ApiError ? err.message : t('account.profile.errSave')
  } finally {
    basicSaving.value = false
  }
}

function resetBasic(): void {
  Object.assign(basic, fromSaved())
  Object.keys(basicErrors).forEach((k) => delete basicErrors[k])
  basicSaved.value = false
}

/* ---------------- the photo ---------------- */

const photoInput = ref<HTMLInputElement | null>(null)
const photoBusy = ref(false)
const photoError = ref('')

async function pickPhoto(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  photoError.value = ''
  photoBusy.value = true
  try {
    const { path: stored } = await uploadAvatar(file)
    // Saved separately from the rest of the form: a picture is chosen, not
    // typed, and waiting for a Save button to apply it reads as broken.
    await api.updateProfile({
      firstName: basic.firstName.trim() || (auth.user?.firstName ?? ''),
      lastName: basic.lastName.trim() || (auth.user?.lastName ?? ''),
      phoneCountryCode: auth.user?.phoneCountryCode ?? null,
      phoneNational: auth.user?.phoneNational ?? null,
      locale: (auth.user?.locale ?? 'th') as AppLocale,
      avatarPath: stored,
    })
    await auth.refreshUser()
  } catch (err) {
    photoError.value =
      err instanceof UploadError || err instanceof ApiError
        ? err.message
        : t('account.profile.errPhoto')
  } finally {
    photoBusy.value = false
    if (photoInput.value) photoInput.value.value = ''
  }
}

async function removePhoto(): Promise<void> {
  photoBusy.value = true
  photoError.value = ''
  try {
    await api.updateProfile({
      firstName: auth.user?.firstName ?? '',
      lastName: auth.user?.lastName ?? '',
      phoneCountryCode: auth.user?.phoneCountryCode ?? null,
      phoneNational: auth.user?.phoneNational ?? null,
      locale: (auth.user?.locale ?? 'th') as AppLocale,
      avatarPath: null,
    })
    await auth.refreshUser()
  } catch (err) {
    photoError.value = err instanceof ApiError ? err.message : t('account.profile.errPhoto')
  } finally {
    photoBusy.value = false
  }
}

/* ---------------- the email ---------------- */

const verified = computed(() => Boolean(auth.user?.emailVerifiedAt))
const verifySent = ref(false)
const verifyBusy = ref(false)

async function resendVerify(): Promise<void> {
  verifyBusy.value = true
  try {
    await api.sendVerifyEmail()
    verifySent.value = true
  } catch {
    // The API rate-limits this; saying "sent" either way is the honest answer
    // to "did you send it", and a second mail is not worth an error box.
    verifySent.value = true
  } finally {
    verifyBusy.value = false
  }
}

/* ---------------- where the tax invoice goes ---------------- */

const billing = ref<MemberBilling | null>(null)
const billingForm = reactive<InvoiceRequest>({
  type: 'individual',
  name: '',
  taxId: '',
  branchType: 'head',
  branchCode: '',
  address: '',
})
const billingErrors = reactive<Record<string, string>>({})
const billingSaving = ref(false)
const billingSaved = ref(false)

function fillBilling(row: MemberBilling | null): void {
  billing.value = row
  Object.assign(billingForm, {
    type: row?.type ?? 'individual',
    name: row?.name ?? '',
    taxId: row?.taxId ?? '',
    branchType: row?.branchType ?? 'head',
    branchCode: row?.branchCode ?? '',
    address: row?.address ?? '',
  })
}

async function saveBilling(): Promise<void> {
  Object.keys(billingErrors).forEach((k) => delete billingErrors[k])
  if (!billingForm.name.trim()) billingErrors.name = t('account.profile.errBillingName')
  if (billingForm.taxId.replace(/\D/g, '').length !== 13) {
    billingErrors.taxId = t('account.profile.errTaxId')
  }
  if (!billingForm.address.trim()) billingErrors.address = t('account.profile.errAddress')
  if (
    billingForm.type === 'corporate' &&
    billingForm.branchType === 'branch' &&
    !String(billingForm.branchCode ?? '').trim()
  ) {
    billingErrors.branchCode = t('account.profile.errBranch')
  }
  if (Object.keys(billingErrors).length) return

  billingSaving.value = true
  billingSaved.value = false
  try {
    const corporate = billingForm.type === 'corporate'
    const saved = await api.saveMyBilling({
      type: billingForm.type,
      name: billingForm.name.trim(),
      taxId: billingForm.taxId.replace(/\D/g, ''),
      branchType: corporate ? (billingForm.branchType ?? 'head') : null,
      branchCode: corporate
        ? billingForm.branchType === 'branch'
          ? String(billingForm.branchCode ?? '').trim()
          : '00000'
        : null,
      address: billingForm.address.trim(),
    })
    fillBilling(saved.data)
    billingSaved.value = true
  } catch (err) {
    if (err instanceof ApiError && err.fields) Object.assign(billingErrors, err.fields)
    else billingErrors.form = err instanceof ApiError ? err.message : t('account.profile.errSave')
  } finally {
    billingSaving.value = false
  }
}

const confirmForget = ref(false)

async function forgetBilling(): Promise<void> {
  confirmForget.value = false
  try {
    await api.forgetMyBilling()
    fillBilling(null)
    billingSaved.value = false
  } catch (err) {
    billingErrors.form = err instanceof ApiError ? err.message : t('account.profile.errSave')
  }
}

/* ---------------- who is signed in as you ---------------- */

const sessions = ref<AccountSession[]>([])
const sessionsLoading = ref(true)
const others = computed(() => sessions.value.filter((s) => !s.current))

async function loadSessions(): Promise<void> {
  sessionsLoading.value = true
  try {
    sessions.value = (await api.sessions()).data
  } catch {
    sessions.value = []
  } finally {
    sessionsLoading.value = false
  }
}

async function signOutDevice(id: number): Promise<void> {
  await api.revokeSession(id)
  await loadSessions()
}

const confirmAll = ref(false)

/** Signs this browser out too, which is what "everywhere" means. */
async function signOutEverywhere(): Promise<void> {
  confirmAll.value = false
  await auth.logoutEverywhere()
  await router.push(path(''))
}

/** A browser that never said what it was. The IP is all there is. */
function deviceName(s: AccountSession): string {
  return s.deviceLabel?.trim() || t('account.profile.unknownDevice')
}
function deviceIcon(s: AccountSession): string {
  const label = (s.deviceLabel ?? '').toLowerCase()
  if (/iphone|android|mobile/.test(label)) return 'smartphone'
  if (/ipad|tablet/.test(label)) return 'tablet'
  return 'monitor'
}

/* ---------------- what may be sent to you ---------------- */

const CONSENTS = ['news', 'newCourses', 'expiryAlert'] as const
type ConsentKey = (typeof CONSENTS)[number]

const consents = ref<Consents>({
  news: false,
  newCourses: false,
  expiryAlert: true,
  updatedAt: null,
})
const consentBusy = ref<ConsentKey | null>(null)
const consentError = ref('')

/**
 * Saved the moment it is touched. Asking somebody to flick a switch and then
 * press Save, for a preference with no other state to agree with, is a step
 * that exists only to be forgotten.
 */
async function setConsent(key: ConsentKey, on: boolean): Promise<void> {
  const was = consents.value[key]
  consents.value = { ...consents.value, [key]: on }
  consentBusy.value = key
  consentError.value = ''
  try {
    consents.value = (await api.saveMyConsents({ [key]: on })).data
  } catch (err) {
    // Put the switch back rather than leave it showing a preference the
    // server never took.
    consents.value = { ...consents.value, [key]: was }
    consentError.value = err instanceof ApiError ? err.message : t('account.profile.errSave')
  } finally {
    consentBusy.value = null
  }
}

/* ---------------- the password ---------------- */

const pwOpen = ref(false)
const pw = reactive({ current: '', next: '', confirm: '' })
const pwErrors = reactive<Record<string, string>>({})
const pwBusy = ref(false)

function openPassword(): void {
  pw.current = ''
  pw.next = ''
  pw.confirm = ''
  Object.keys(pwErrors).forEach((k) => delete pwErrors[k])
  pwOpen.value = true
}

async function submitPassword(): Promise<void> {
  Object.keys(pwErrors).forEach((k) => delete pwErrors[k])
  if (!pw.current) pwErrors.currentPassword = t('account.profile.errCurrentPw')
  if (pw.next.length < 8) pwErrors.newPassword = t('account.profile.errNewPw')
  if (pw.next !== pw.confirm) pwErrors.confirm = t('account.profile.errConfirmPw')
  if (Object.keys(pwErrors).length) return

  pwBusy.value = true
  try {
    await api.changePassword({ currentPassword: pw.current, newPassword: pw.next })
    // Changing it ends every session, including this one. Rather than let the
    // next click fail with a 401, the page says so and sends them to sign in.
    pwOpen.value = false
    await auth.logout()
    await router.push(path(''))
  } catch (err) {
    if (err instanceof ApiError && err.fields) Object.assign(pwErrors, err.fields)
    else pwErrors.form = err instanceof ApiError ? err.message : t('account.profile.errSave')
  } finally {
    pwBusy.value = false
  }
}

onMounted(async () => {
  if (!auth.isLoggedIn) return
  Object.assign(basic, fromSaved())
  await Promise.all([
    api.myProfile().then((r) => (record.value = r.data)).catch(() => {}),
    api.myBilling().then((r) => fillBilling(r.data)).catch(() => fillBilling(null)),
    api.myConsents().then((r) => (consents.value = r.data)).catch(() => {}),
    loadSessions(),
  ])
})
</script>

<template>
  <AccountShell page="profile">
    <nav class="acct-jump" :aria-label="t('account.profile.jumpLabel')">
      <ul role="list">
        <li><a href="#pf-basic"><AppIcon name="user" />{{ t('account.profile.basic') }}</a></li>
        <li><a href="#pf-billing"><AppIcon name="file-text" />{{ t('account.profile.billing') }}</a></li>
        <li><a href="#pf-security"><AppIcon name="shield-check" />{{ t('account.profile.security') }}</a></li>
        <li><a href="#pf-consent"><AppIcon name="bell" />{{ t('account.profile.consent') }}</a></li>
      </ul>
    </nav>

    <div class="acct-stack">
      <!-- Who you are -->
      <section class="acct-card acct-pf" id="pf-basic" aria-labelledby="pf-basic-h">
        <div class="acct-pf-head">
          <h2 id="pf-basic-h"><AppIcon name="user" />{{ t('account.profile.basic') }}</h2>
          <p>{{ t('account.profile.basicNote') }}</p>
        </div>

        <div class="acct-photo">
          <AppAvatar
            :name="auth.displayName"
            :initials="initials"
            :photo="avatar"
            extra-class="avatar--xl"
          />
          <div class="acct-photo-txt">
            <b>{{ t('account.profile.photo') }}</b>
            <p>{{ t('account.profile.photoHint') }}</p>
            <p v-if="photoError" class="acct-photo-err">{{ photoError }}</p>
          </div>
          <div class="acct-photo-act">
            <input
              ref="photoInput"
              id="pf-photo"
              class="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              :disabled="photoBusy"
              @change="pickPhoto"
            />
            <label class="btn btn--secondary btn--sm" for="pf-photo">
              <AppIcon name="upload" />
              {{ photoBusy ? t('account.profile.photoUploading') : t('account.profile.photoChoose') }}
            </label>
            <button
              v-if="avatar"
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="photoBusy"
              @click="removePhoto"
            >
              {{ t('account.profile.photoRemove') }}
            </button>
          </div>
        </div>

        <form class="acct-form" novalidate @submit.prevent="saveBasic">
          <div class="form-grid">
            <div class="field">
              <label class="label" for="pf-fn">
                {{ t('account.profile.firstName') }}<span class="req" aria-hidden="true">*</span>
              </label>
              <input
                class="input"
                :class="{ 'is-invalid': basicErrors.firstName }"
                id="pf-fn"
                type="text"
                v-model="basic.firstName"
                autocomplete="given-name"
                maxlength="100"
              />
              <span v-if="basicErrors.firstName" class="field-error">{{ basicErrors.firstName }}</span>
            </div>

            <div class="field">
              <label class="label" for="pf-ln">
                {{ t('account.profile.lastName') }}<span class="req" aria-hidden="true">*</span>
              </label>
              <input
                class="input"
                :class="{ 'is-invalid': basicErrors.lastName }"
                id="pf-ln"
                type="text"
                v-model="basic.lastName"
                autocomplete="family-name"
                maxlength="100"
              />
              <span v-if="basicErrors.lastName" class="field-error">{{ basicErrors.lastName }}</span>
            </div>

            <div class="field">
              <label class="label" for="pf-email">{{ t('account.profile.email') }}</label>
              <input
                class="input"
                id="pf-email"
                type="email"
                :value="auth.user?.email"
                readonly
                aria-readonly="true"
                aria-describedby="pf-email-h"
                autocomplete="email"
              />
              <span class="field-help" id="pf-email-h">
                <AppIcon name="lock" :size="13" />{{ t('account.profile.emailHelp') }}
              </span>
            </div>

            <div class="field">
              <label class="label" for="pf-phone">
                {{ t('account.profile.phone') }}
                <span class="opt">{{ t('account.profile.optional') }}</span>
              </label>
              <PhoneField
                id="pf-phone"
                v-model:country-code="basic.phoneCountryCode"
                v-model:national="basic.phoneNational"
                :locale="locale"
                :invalid="Boolean(basicErrors.phone)"
                @validity="phoneValid = $event"
              />
              <span v-if="basicErrors.phone" class="field-error">{{ basicErrors.phone }}</span>
            </div>

            <div class="field">
              <label class="label" for="pf-lang">{{ t('account.profile.language') }}</label>
              <select class="select" id="pf-lang" v-model="basic.locale">
                <option v-for="l in LOCALES" :key="l" :value="l">{{ LOCALE_META[l].name }}</option>
              </select>
              <span class="field-help">{{ t('account.profile.languageHelp') }}</span>
            </div>

            <div class="field">
              <label class="label" for="pf-dob">{{ t('account.profile.birthdate') }}</label>
              <input
                class="input"
                :class="{ 'is-invalid': basicErrors.birthdate }"
                id="pf-dob"
                type="date"
                v-model="basic.birthdate"
                :max="today"
                :min="earliest"
                autocomplete="bday"
                aria-describedby="pf-dob-h"
              />
              <span class="field-help" id="pf-dob-h">
                {{ basic.birthdate
                  ? t('account.profile.birthdateHelp', { date: dateLong(basic.birthdate) })
                  : t('account.profile.birthdateEmpty') }}
              </span>
              <span v-if="basicErrors.birthdate" class="field-error">
                {{ basicErrors.birthdate }}
              </span>
            </div>
          </div>

          <p v-if="!verified" class="acct-lic-note">
            <AppIcon name="alert-circle" />
            <span>{{ t('account.profile.emailUnverified') }}</span>
            <button
              type="button"
              class="btn btn--secondary btn--sm"
              :disabled="verifyBusy || verifySent"
              @click="resendVerify"
            >
              {{ verifySent ? t('account.profile.verifySent') : t('account.profile.verifyResend') }}
            </button>
          </p>

          <div class="acct-form-actions">
            <p class="acct-dirty" :class="{ 'is-saved': basicSaved && !basicDirty }" aria-live="polite">
              <template v-if="basicErrors.form">
                <AppIcon name="alert-circle" />{{ basicErrors.form }}
              </template>
              <template v-else-if="basicSaved && !basicDirty">
                <AppIcon name="check-circle" />{{ t('account.profile.saved') }}
              </template>
              <template v-else-if="basicDirty">
                <AppIcon name="alert-circle" />{{ t('account.profile.unsaved') }}
              </template>
            </p>
            <button
              type="button"
              class="btn btn--ghost"
              :disabled="!basicDirty || basicSaving"
              @click="resetBasic"
            >
              {{ t('account.profile.undo') }}
            </button>
            <button type="submit" class="btn btn--primary" :disabled="!basicDirty || basicSaving">
              <AppIcon name="check" />
              {{ basicSaving ? t('account.profile.saving') : t('account.profile.save') }}
            </button>
          </div>
        </form>
      </section>

      <!-- Where the tax invoice goes -->
      <section class="acct-card acct-pf" id="pf-billing" aria-labelledby="pf-bill-h">
        <div class="acct-pf-head">
          <h2 id="pf-bill-h"><AppIcon name="file-text" />{{ t('account.profile.billing') }}</h2>
          <p>{{ t('account.profile.billingNote') }}</p>
        </div>

        <form class="acct-form" novalidate @submit.prevent="saveBilling">
          <div class="form-grid">
            <div class="field">
              <label class="label" for="pf-btype">{{ t('account.profile.taxType') }}</label>
              <select class="select" id="pf-btype" v-model="billingForm.type">
                <option value="individual">{{ t('account.orders.taxType.individual') }}</option>
                <option value="corporate">{{ t('account.orders.taxType.corporate') }}</option>
              </select>
            </div>

            <div class="field">
              <label class="label" for="pf-btax">
                {{ billingForm.type === 'corporate'
                  ? t('account.profile.taxIdCorporate')
                  : t('account.profile.taxIdIndividual') }}
                <span class="req" aria-hidden="true">*</span>
              </label>
              <input
                class="input"
                :class="{ 'is-invalid': billingErrors.taxId }"
                id="pf-btax"
                type="text"
                inputmode="numeric"
                maxlength="20"
                v-model="billingForm.taxId"
              />
              <span v-if="billingErrors.taxId" class="field-error">{{ billingErrors.taxId }}</span>
            </div>

            <div class="field span-2">
              <label class="label" for="pf-bname">
                {{ billingForm.type === 'corporate'
                  ? t('account.profile.billingNameCorporate')
                  : t('account.profile.billingNameIndividual') }}
                <span class="req" aria-hidden="true">*</span>
              </label>
              <input
                class="input"
                :class="{ 'is-invalid': billingErrors.name }"
                id="pf-bname"
                type="text"
                maxlength="255"
                v-model="billingForm.name"
              />
              <span v-if="billingErrors.name" class="field-error">{{ billingErrors.name }}</span>
            </div>

            <template v-if="billingForm.type === 'corporate'">
              <div class="field">
                <label class="label" for="pf-bbranch">{{ t('account.profile.branch') }}</label>
                <select class="select" id="pf-bbranch" v-model="billingForm.branchType">
                  <option value="head">{{ t('account.profile.branchHead') }}</option>
                  <option value="branch">{{ t('account.profile.branchOther') }}</option>
                </select>
              </div>
              <div class="field" v-if="billingForm.branchType === 'branch'">
                <label class="label" for="pf-bbcode">
                  {{ t('account.profile.branchCode') }}<span class="req" aria-hidden="true">*</span>
                </label>
                <input
                  class="input"
                  :class="{ 'is-invalid': billingErrors.branchCode }"
                  id="pf-bbcode"
                  type="text"
                  inputmode="numeric"
                  maxlength="10"
                  v-model="billingForm.branchCode as string"
                />
                <span v-if="billingErrors.branchCode" class="field-error">
                  {{ billingErrors.branchCode }}
                </span>
              </div>
            </template>

            <div class="field span-2">
              <label class="label" for="pf-baddr">
                {{ t('account.profile.address') }}<span class="req" aria-hidden="true">*</span>
              </label>
              <textarea
                class="textarea acct-note"
                :class="{ 'is-invalid': billingErrors.address }"
                id="pf-baddr"
                rows="3"
                maxlength="1000"
                v-model="billingForm.address"
              ></textarea>
              <span v-if="billingErrors.address" class="field-error">{{ billingErrors.address }}</span>
            </div>
          </div>

          <div class="acct-form-actions">
            <p class="acct-dirty" :class="{ 'is-saved': billingSaved }" aria-live="polite">
              <template v-if="billingErrors.form">
                <AppIcon name="alert-circle" />{{ billingErrors.form }}
              </template>
              <template v-else-if="billingSaved">
                <AppIcon name="check-circle" />{{ t('account.profile.saved') }}
              </template>
              <template v-else-if="billing">
                <AppIcon name="clock" />
                {{ t('account.profile.billingUpdated', { when: dateTime(billing.updatedAt) }) }}
              </template>
            </p>
            <button
              v-if="billing"
              type="button"
              class="btn btn--ghost"
              @click="confirmForget = true"
            >
              {{ t('account.profile.billingForget') }}
            </button>
            <button type="submit" class="btn btn--primary" :disabled="billingSaving">
              <AppIcon name="check" />
              {{ billingSaving ? t('account.profile.saving') : t('account.profile.save') }}
            </button>
          </div>
        </form>
      </section>

      <!-- Who is signed in as you -->
      <section class="acct-card acct-pf" id="pf-security" aria-labelledby="pf-sec-h">
        <div class="acct-pf-head">
          <h2 id="pf-sec-h"><AppIcon name="shield-check" />{{ t('account.profile.security') }}</h2>
          <p>{{ t('account.profile.securitySub') }}</p>
        </div>

        <div class="acct-row">
          <span class="acct-row-ico" aria-hidden="true"><AppIcon name="key" /></span>
          <div class="acct-row-txt">
            <b>{{ t('account.profile.password') }}</b>
            <p>{{ t('account.profile.passwordHint') }}</p>
          </div>
          <button type="button" class="btn btn--secondary btn--sm" @click="openPassword">
            <AppIcon name="key" />{{ t('account.profile.changePassword') }}
          </button>
        </div>

        <div id="pf-devices">
          <div class="acct-dev-head">
            <h3 id="pf-dev-h" tabindex="-1">
              {{ t('account.profile.devices') }}
              <span class="acct-count">{{ sessions.length }}</span>
            </h3>
          </div>

          <p v-if="sessionsLoading" class="acct-row-txt">{{ t('account.profile.devicesLoading') }}</p>

          <ul v-else class="acct-dev-list" role="list">
            <li
              v-for="s in sessions"
              :key="s.id"
              class="acct-dev"
              :class="{ 'is-current': s.current }"
            >
              <span class="acct-dev-ico" aria-hidden="true"><AppIcon :name="deviceIcon(s)" /></span>
              <div class="acct-dev-txt">
                <b>
                  <span>{{ deviceName(s) }}</span>
                  <AppBadge
                    v-if="s.current"
                    :badge="{ kind: 'info', icon: 'check-circle', text: t('account.profile.thisDevice') }"
                  />
                </b>
                <small>
                  <AppIcon name="map-pin" />
                  <span>
                    {{ s.ip ?? t('account.profile.unknownIp') }} ·
                    {{ t('account.profile.signedInAt', { when: dateTime(s.createdAt) }) }}
                  </span>
                </small>
              </div>
              <button
                v-if="!s.current"
                type="button"
                class="icon-btn icon-btn--ghost icon-btn--sm acct-dev-out"
                :aria-label="t('account.profile.signOutDevice', { name: deviceName(s) })"
                @click="signOutDevice(s.id)"
              >
                <AppIcon name="log-out" />
              </button>
            </li>
          </ul>

          <div v-if="others.length" class="acct-dev-all">
            <div class="acct-row-txt">
              <b>{{ t('account.profile.signOutAllTitle') }}</b>
              <p>{{ t('account.profile.signOutAllText', { count: others.length }) }}</p>
            </div>
            <button type="button" class="btn btn--danger btn--sm" @click="confirmAll = true">
              <AppIcon name="log-out" />{{ t('account.profile.signOutAll') }}
            </button>
          </div>
        </div>
      </section>

      <!-- What may be sent to you -->
      <section class="acct-card acct-pf" id="pf-consent" aria-labelledby="pf-cons-h">
        <div class="acct-pf-head">
          <h2 id="pf-cons-h"><AppIcon name="bell" />{{ t('account.profile.consent') }}</h2>
          <p>{{ t('account.profile.consentSub') }}</p>
        </div>

        <ul class="acct-switch-list" role="list">
          <li v-for="key in CONSENTS" :key="key" class="acct-switch-row">
            <div class="acct-switch-txt">
              <b :id="`cs-${key}-l`">{{ t(`account.profile.consents.${key}.title`) }}</b>
              <p :id="`cs-${key}-d`">{{ t(`account.profile.consents.${key}.text`) }}</p>
            </div>
            <label class="switch">
              <input
                type="checkbox"
                role="switch"
                :checked="consents[key]"
                :disabled="consentBusy === key"
                :aria-labelledby="`cs-${key}-l`"
                :aria-describedby="`cs-${key}-d`"
                @change="setConsent(key, ($event.target as HTMLInputElement).checked)"
              />
              <span class="acct-switch-state" aria-hidden="true">
                {{ consents[key] ? t('account.profile.on') : t('account.profile.off') }}
              </span>
            </label>
          </li>
        </ul>

        <p v-if="consentError" class="field-error">{{ consentError }}</p>
        <p class="acct-lic-note" style="margin-top: 18px">
          <AppIcon name="info" />
          <span>
            {{ consents.updatedAt
              ? t('account.profile.consentUpdated', { when: dateTime(consents.updatedAt) })
              : t('account.profile.consentNever') }}
          </span>
        </p>
      </section>
    </div>

    <!-- Changing the password -->
    <AppModal
      :open="pwOpen"
      :title="t('account.profile.changePassword')"
      size="sm"
      @close="pwOpen = false"
    >
      <template #sub>{{ t('account.profile.passwordModalSub') }}</template>

      <form id="pf-pw-form" class="acct-form" novalidate @submit.prevent="submitPassword">
        <div class="field">
          <label class="label" for="pw-cur">{{ t('account.profile.currentPassword') }}</label>
          <input
            class="input"
            :class="{ 'is-invalid': pwErrors.currentPassword }"
            id="pw-cur"
            type="password"
            v-model="pw.current"
            autocomplete="current-password"
          />
          <span v-if="pwErrors.currentPassword" class="field-error">
            {{ pwErrors.currentPassword }}
          </span>
        </div>
        <div class="field">
          <label class="label" for="pw-new">{{ t('account.profile.newPassword') }}</label>
          <input
            class="input"
            :class="{ 'is-invalid': pwErrors.newPassword }"
            id="pw-new"
            type="password"
            v-model="pw.next"
            autocomplete="new-password"
          />
          <span class="field-help">{{ t('account.profile.newPasswordHelp') }}</span>
          <span v-if="pwErrors.newPassword" class="field-error">{{ pwErrors.newPassword }}</span>
        </div>
        <div class="field">
          <label class="label" for="pw-conf">{{ t('account.profile.confirmPassword') }}</label>
          <input
            class="input"
            :class="{ 'is-invalid': pwErrors.confirm }"
            id="pw-conf"
            type="password"
            v-model="pw.confirm"
            autocomplete="new-password"
          />
          <span v-if="pwErrors.confirm" class="field-error">{{ pwErrors.confirm }}</span>
        </div>
        <p v-if="pwErrors.form" class="field-error">{{ pwErrors.form }}</p>
      </form>

      <template #foot>
        <button type="button" class="btn btn--ghost" @click="pwOpen = false">
          {{ t('common.cancel') }}
        </button>
        <button type="submit" form="pf-pw-form" class="btn btn--primary" :disabled="pwBusy">
          {{ pwBusy ? t('account.profile.saving') : t('account.profile.changePassword') }}
        </button>
      </template>
    </AppModal>

    <!-- Signing every device out -->
    <AppModal
      :open="confirmAll"
      :title="t('account.profile.signOutAllTitle')"
      size="sm"
      @close="confirmAll = false"
    >
      <p style="margin: 0">{{ t('account.profile.signOutAllConfirm') }}</p>
      <template #foot>
        <button type="button" class="btn btn--ghost" @click="confirmAll = false">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="btn btn--danger" @click="signOutEverywhere">
          {{ t('account.profile.signOutAll') }}
        </button>
      </template>
    </AppModal>

    <!-- Forgetting the tax details -->
    <AppModal
      :open="confirmForget"
      :title="t('account.profile.billingForget')"
      size="sm"
      @close="confirmForget = false"
    >
      <p style="margin: 0">{{ t('account.profile.billingForgetConfirm') }}</p>
      <template #foot>
        <button type="button" class="btn btn--ghost" @click="confirmForget = false">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="btn btn--danger" @click="forgetBilling">
          {{ t('account.profile.billingForget') }}
        </button>
      </template>
    </AppModal>
  </AccountShell>
</template>
