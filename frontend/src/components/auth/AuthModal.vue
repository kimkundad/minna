<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import FileDropZone from '@/components/ui/FileDropZone.vue'
import PhoneField from '@/components/ui/PhoneField.vue'
import { api } from '@/lib/api'
import { uploadApplicationResume, uploadApplicationVideo } from '@/lib/upload'
import type { AppLocale } from '@/locales'
import { useAuthStore, ApiError } from '@/stores/auth'
import { authRequest, closeAuth, type AuthStep } from './authChannel'

/**
 * Sign in and sign up, against the real API.
 *
 * Mounted once in App.vue and opened through the `authRequest` channel, so a
 * locked lesson, the cart and the header all raise the same dialog and the one
 * that was interrupted gets its continuation run afterwards.
 *
 * Markup follows the prototype's `U.modal`: `.modal-root.is-sheet` with a
 * backdrop, grabber, head, body and foot, because the slide-up-sheet behaviour
 * at ≤767px comes out of that nesting.
 */
const { t, locale } = useI18n()
const router = useRouter()

/** `jp` and `vn` are our own URL spellings; Intl wants real language tags. */
const localeTag = computed(
  () =>
    ({ th: 'th-TH', en: 'en-GB', jp: 'ja-JP', vn: 'vi-VN' })[locale.value as string] ?? 'th-TH',
)
const auth = useAuthStore()

/** 'forgot' is reached from inside the dialog only, so it is not an AuthStep:
 *  nothing elsewhere should be able to open straight onto it. */
type Step = AuthStep | 'forgot'
const step = ref<Step>('login')
const dialog = ref<HTMLElement | null>(null)
const titleId = 'auth-modal-title'

const email = ref('')
const password = ref('')
const firstName = ref('')
const lastName = ref('')

/**
 * Birthdate goes in as three plain fields rather than a date picker: a picker
 * opens on the current year and makes someone born in 1995 scroll back three
 * decades to reach their own birthday.
 *
 * The year is Gregorian, which is also what the column stores, so nothing is
 * converted on the way in or out.
 */
const birthDay = ref('')
const birthMonth = ref('')
const birthYear = ref('')

const phoneCountryCode = ref('+66')
const phoneNational = ref('')
/** Null until libphonenumber loads; false only once it says the number is wrong. */
const phoneValid = ref<boolean | null>(null)

/** Ticked by default, as the design has it. It decides whether the refresh
 *  cookie survives closing the browser. */
const remember = ref(true)

/** The terms and the privacy notice, one box. The API refuses a registration
 *  without it, so this is the same rule on both sides rather than a courtesy. */
const acceptedTerms = ref(false)

/**
 * Which registration form to show. Both make the same kind of account —
 * picking 'teacher' files an application for an admin to approve rather than
 * handing anyone the role, which is why there is no third option and no
 * difference in what is created.
 */
const memberType = ref<'student' | 'teacher'>('student')

const teachSubject = ref('')
const teachExperience = ref('')
const teachReason = ref('')
const teachContactTime = ref('')
/**
 * The two files, held until there is an account to attach them to.
 *
 * Kept as `File` objects from the dropzones rather than read off a file input
 * at submit time: a retry has to be able to send the same file again, and a
 * file input that has been through a failed submit is the browser's to own.
 */
const resumeFile = ref<File | null>(null)
const resumeProblem = ref('')
const clipFile = ref<File | null>(null)
/** Percent, so a hundred-megabyte upload does not read as a frozen dialog. */
const clipProgress = ref(0)
/** Registered, but the two required files have not gone up. The form becomes a
 *  send-your-files until they do. */
const filesOutstanding = ref(false)
/** True from the moment the first byte leaves until the server has the lot. */
const uploading = ref(false)

/** Shown after a password-reset request, in place of the form. */
const resetSent = ref(false)

const thisYear = new Date().getFullYear()

/** Newest first: most people signing up were born recently, not in 1905. */
const years = Array.from({ length: 121 }, (_, i) => thisYear - i)

/** Month names in whatever language the page is in, rather than a second list
 *  to translate and keep in step. */
const months = computed(() => {
  const fmt = new Intl.DateTimeFormat(localeTag.value, { month: 'long' })
  return Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: fmt.format(new Date(Date.UTC(2001, i, 1))),
  }))
})

/**
 * How many days the chosen month actually has, so 31 February is not on the
 * list at all. Day 0 of the next month is the last day of this one.
 */
const daysInMonth = computed(() => {
  const m = Number(birthMonth.value)
  const y = Number(birthYear.value)
  if (!m) return 31
  return new Date(Date.UTC(y || 2000, m, 0)).getUTCDate()
})

const days = computed(() => Array.from({ length: daysInMonth.value }, (_, i) => i + 1))

// Picking February after choosing the 31st would otherwise leave a day the
// month does not have still selected.
watch(daysInMonth, (count) => {
  if (Number(birthDay.value) > count) birthDay.value = ''
})

/** YYYY-MM-DD, or null when any part is still unchosen. */
const birthdateValue = computed<string | null>(() => {
  const d = Number(birthDay.value)
  const m = Number(birthMonth.value)
  const y = Number(birthYear.value)
  if (!d || !m || !y) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${y}-${pad(m)}-${pad(d)}`
})

const submitIcon = computed(() =>
  step.value === 'login' ? 'log-in' : step.value === 'register' ? 'user' : 'mail',
)

const submitLabel = computed(() =>
  // Registered already, with the files still to go: the button is no longer
  // offering to sign anybody up, and saying so is the only way the person
  // knows pressing it again will not be refused as a duplicate address.
  filesOutstanding.value
    ? t('auth.teachFilesRetry')
    : step.value === 'login'
      ? t('common.login')
      : step.value === 'register'
        ? t('common.register')
        : t('auth.sendResetLink'),
)

/** Server-side messages, keyed by field, shown under the input that caused them. */
const fieldErrors = ref<Record<string, string>>({})
const formError = ref('')

const open = computed(() => authRequest.value !== null)
let returnTo: HTMLElement | null = null

function reset() {
  password.value = ''
  fieldErrors.value = {}
  formError.value = ''
  resetSent.value = false
}

watch(authRequest, async (next) => {
  if (!next) return
  step.value = next.step
  reset()
  returnTo = document.activeElement as HTMLElement | null
  await nextTick()
  dialog.value?.querySelector<HTMLInputElement>('input')?.focus()
})

function dismiss() {
  /**
   * Not while a file is going up.
   *
   * The clip can be a hundred megabytes and takes minutes. Closing the dialog
   * mid-upload leaves somebody registered with an application missing the
   * files it was told it must have — and the backdrop, the X and the Escape
   * key all lead here, so this is the one place to stop it.
   */
  if (uploading.value) return

  closeAuth()
  // Hand focus back to whatever opened the dialog, so a keyboard user is not
  // dropped at the top of the document.
  returnTo?.focus?.()
  returnTo = null
}

function switchTo(next: Step) {
  step.value = next
  reset()
  nextTick(() => dialog.value?.querySelector<HTMLInputElement>('input')?.focus())
}

/**
 * Puts the two required files up and ties them to the application.
 *
 * Called straight after registering, and again on its own if that failed —
 * which is why it keeps nothing from the registration: the files are read from
 * the dropzones each time, so somebody can pick a smaller clip and try again.
 */
async function sendApplicationFiles() {
  resumeProblem.value = ''
  const cv = resumeFile.value
  const clip = clipFile.value

  if (!cv || !clip) {
    filesOutstanding.value = true
    resumeProblem.value = t('auth.teachFilesRequired')
    return
  }

  uploading.value = true
  try {
    const attach: { resumePath?: string; sampleVideoPath?: string } = {}
    attach.resumePath = (await uploadApplicationResume(cv)).path
    // A hundred megabytes over a phone connection takes long enough that a
    // still dialog reads as a hung one.
    attach.sampleVideoPath = (
      await uploadApplicationVideo(clip, {
        onProgress: (f) => (clipProgress.value = Math.round(f * 100)),
      })
    ).path
    await api.attachApplicationFiles(attach)
    filesOutstanding.value = false
  } catch {
    // Registered, but the application is not complete. Say so plainly and
    // leave the form in the one state from which it can be finished.
    filesOutstanding.value = true
    resumeProblem.value = t('auth.teachFilesFailed')
  } finally {
    uploading.value = false
    clipProgress.value = 0
  }
}

async function submit() {
  fieldErrors.value = {}
  formError.value = ''
  const done = authRequest.value?.onDone

  /**
   * Registration already succeeded; only the files are outstanding.
   *
   * The two files are required, but they cannot go up until the account
   * exists, because an upload needs a token and registering is what returns
   * one. So a failure here leaves somebody registered with an application
   * missing the things it was told it must have — and pressing the button
   * again would try to register an address that now exists and fail on that
   * instead, which explains nothing.
   *
   * This is the way back: the form stops being a sign-up and becomes a
   * send-your-files, until they are sent.
   */
  if (filesOutstanding.value) {
    await sendApplicationFiles()
    if (resumeProblem.value) return
    closeAuth()
    returnTo = null
    done?.()
    return
  }

  try {
    if (step.value === 'forgot') {
      await api.forgotPassword(email.value.trim())
      // The API answers the same whether or not the address is registered, and
      // so does this: saying "no such account" would turn the form into a way
      // of finding out who has one.
      resetSent.value = true
      return
    }

    if (step.value === 'login') {
      await auth.login(email.value.trim(), password.value, remember.value)
    } else {
      if (!acceptedTerms.value) {
        fieldErrors.value = { acceptedTerms: t('auth.termsRequired') }
        return
      }

      // Before libphonenumber loads this is null, which is not a rejection.
      if (phoneValid.value === false) {
        fieldErrors.value = { phoneNational: t('auth.phoneInvalid') }
        return
      }

      const birthdate = birthdateValue.value
      if (!birthdate) {
        fieldErrors.value = { birthdate: t('auth.birthdateRequired') }
        return
      }

      const phone = phoneNational.value.replace(/\D/g, '')
      await auth.register({
        email: email.value.trim(),
        password: password.value,
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        birthdate,
        ...(phone ? { phoneCountryCode: phoneCountryCode.value, phoneNational: phone } : {}),
        acceptedTerms: true,
        memberType: memberType.value,
        ...(memberType.value === 'teacher'
          ? {
              teacher: {
                subject: teachSubject.value.trim(),
                experience: teachExperience.value.trim(),
                ...(teachReason.value.trim() ? { reason: teachReason.value.trim() } : {}),
                ...(teachContactTime.value.trim()
                  ? { contactTime: teachContactTime.value.trim() }
                  : {}),
              },
            }
          : {}),
      })

      /**
       * The CV, once there is an account to hang it on.
       *
       * Registering is what creates the key: the applicant is nobody until it
       * returns, and an upload needs a token. So this happens after, in the
       * same click — the person picked a file and pressed one button.
       *
       * A failure here is reported beside the field and nothing else. They are
       * registered, the application is filed, and the file is the one part
       * that can be sent on by other means; turning a successful signup into
       * an error because an attachment did not go up would be the wrong trade.
       */
      if (memberType.value === 'teacher') {
        await sendApplicationFiles()
        if (resumeProblem.value) return
      }
    }
    closeAuth()
    returnTo = null
    done?.()
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.value = err.fields
      // Only surface the summary when no field owns the problem; otherwise it
      // repeats what is already next to the input.
      formError.value = Object.keys(err.fields).length ? '' : err.message
      return
    }
    formError.value = t('auth.networkError')
  }
}

/* --- focus trap, Escape, and locking the page behind the dialog --- */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    dismiss()
    return
  }
  if (e.key !== 'Tab' || !dialog.value) return

  const items = Array.from(dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (!items.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement

  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(open, (isOpen) => {
  document.body.classList.toggle('has-modal', isOpen)
})

/**
 * Leaving while the clip is uploading.
 *
 * Two ways out, and each needs its own answer. Closing the tab or typing a new
 * address is the browser's to warn about, and it only will if something asks —
 * `preventDefault` on `beforeunload` is that asking, and the browser writes
 * its own wording. Clicking a link inside the site never reaches that event at
 * all, because the router swaps the page without unloading anything, so the
 * guard below catches it and says so in our own words.
 *
 * Both are only armed while bytes are actually moving. A dialog that argues
 * about leaving when nothing is happening teaches people to click through the
 * warning that matters.
 */
function warnIfLeaving(e: BeforeUnloadEvent) {
  if (!uploading.value) return
  e.preventDefault()
  e.returnValue = ''
}

const stopRouteGuard = router.beforeEach(() => {
  if (!uploading.value) return true
  // eslint-disable-next-line no-alert
  return window.confirm(t('auth.teachClipLeaveWarning'))
})

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', warnIfLeaving)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', warnIfLeaving)
  stopRouteGuard()
  document.body.classList.remove('has-modal')
})
</script>

<template>
  <Teleport to="body">
    <div v-if="authRequest" class="modal-root is-sheet">
      <div class="modal-backdrop" @click="dismiss" />
      <div
        ref="dialog"
        class="modal modal--sm"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div class="sheet-grabber" aria-hidden="true" />

        <div class="modal-head">
          <div style="min-width: 0">
            <h2 class="modal-title" :id="titleId">{{ t(`auth.${step}Title`) }}</h2>
            <p class="modal-sub">{{ t(`auth.${step}Sub`) }}</p>
          </div>
          <button
            type="button"
            class="icon-btn icon-btn--ghost icon-btn--sm modal-close"
            :aria-label="t('common.close')"
            @click="dismiss"
          >
            <AppIcon name="x" />
          </button>
        </div>

        <div class="modal-body">
          <form class="stack" style="--stack: 16px" novalidate @submit.prevent="submit">
            <AppNotice v-if="authRequest.reason" tone="info" :text="authRequest.reason" />
            <AppNotice v-if="formError" tone="danger" :text="formError" />

            <template v-if="step === 'register' && !resetSent">
              <fieldset class="fieldset">
                <legend>{{ t('auth.memberType') }}</legend>
                <div class="seg seg--block" role="radiogroup">
                  <label>
                    <input v-model="memberType" type="radio" value="student" />
                    <span><AppIcon name="graduation" />{{ t('auth.memberStudent') }}</span>
                  </label>
                  <label>
                    <input v-model="memberType" type="radio" value="teacher" />
                    <span><AppIcon name="users" />{{ t('auth.memberTeacher') }}</span>
                  </label>
                </div>
              </fieldset>

              <AppNotice
                v-if="memberType === 'teacher'"
                tone="info"
                :text="t('auth.teacherNotice')"
              />

              <div class="form-grid">
                <div class="field">
                  <label class="label" for="auth-first">
                    {{ t('auth.firstName') }} <span class="req">*</span>
                  </label>
                  <input
                    id="auth-first"
                    v-model="firstName"
                    class="input"
                    autocomplete="given-name"
                    :aria-invalid="fieldErrors.firstName ? 'true' : undefined"
                  />
                  <span v-if="fieldErrors.firstName" class="field-error">
                    <AppIcon name="alert-circle" :size="16" />{{ fieldErrors.firstName }}
                  </span>
                </div>
                <div class="field">
                  <label class="label" for="auth-last">
                    {{ t('auth.lastName') }} <span class="req">*</span>
                  </label>
                  <input
                    id="auth-last"
                    v-model="lastName"
                    class="input"
                    autocomplete="family-name"
                    :aria-invalid="fieldErrors.lastName ? 'true' : undefined"
                  />
                  <span v-if="fieldErrors.lastName" class="field-error">
                    <AppIcon name="alert-circle" :size="16" />{{ fieldErrors.lastName }}
                  </span>
                </div>
              </div>
            </template>

            <AppNotice v-if="resetSent" tone="success" :text="t('auth.resetSent')" />

            <div v-if="!resetSent" class="field">
              <label class="label" for="auth-email">
                {{ t('auth.email') }} <span class="req">*</span>
              </label>
              <input
                id="auth-email"
                v-model="email"
                class="input"
                type="email"
                autocomplete="email"
                inputmode="email"
                :aria-invalid="fieldErrors.email ? 'true' : undefined"
              />
              <span v-if="fieldErrors.email" class="field-error">
                <AppIcon name="alert-circle" :size="16" />{{ fieldErrors.email }}
              </span>
            </div>

            <div v-if="step !== 'forgot' && !resetSent" class="field">
              <label class="label" for="auth-password">
                {{ t('auth.password') }} <span class="req">*</span>
              </label>
              <input
                id="auth-password"
                v-model="password"
                class="input"
                type="password"
                :autocomplete="step === 'login' ? 'current-password' : 'new-password'"
                :aria-describedby="step === 'register' ? 'auth-password-help' : undefined"
                :aria-invalid="fieldErrors.password ? 'true' : undefined"
              />
              <span v-if="step === 'register'" id="auth-password-help" class="field-help">
                {{ t('auth.passwordHelp') }}
              </span>
              <span v-if="fieldErrors.password" class="field-error">
                <AppIcon name="alert-circle" :size="16" />{{ fieldErrors.password }}
              </span>
            </div>

            <template v-if="step === 'register' && !resetSent">
              <div class="field">
                <span class="label" id="auth-birth-label">
                  {{ t('auth.birthdate') }} <span class="req">*</span>
                </span>
                <!-- Three lists rather than a date picker: a picker opens on
                     the current year and makes someone born in 1995 scroll back
                     three decades to reach their own birthday. The day list is
                     built from the chosen month, so 31 February is never on it. -->
                <div class="auth-birth" role="group" aria-labelledby="auth-birth-label">
                  <select
                    v-model="birthDay"
                    class="input"
                    :aria-label="t('auth.day')"
                    :aria-invalid="fieldErrors.birthdate ? 'true' : undefined"
                  >
                    <option value="">{{ t('auth.day') }}</option>
                    <option v-for="d in days" :key="d" :value="String(d)">{{ d }}</option>
                  </select>
                  <select
                    v-model="birthMonth"
                    class="input"
                    :aria-label="t('auth.month')"
                    :aria-invalid="fieldErrors.birthdate ? 'true' : undefined"
                  >
                    <option value="">{{ t('auth.month') }}</option>
                    <option v-for="m in months" :key="m.value" :value="String(m.value)">
                      {{ m.label }}
                    </option>
                  </select>
                  <select
                    v-model="birthYear"
                    class="input"
                    :aria-label="t('auth.year')"
                    :aria-invalid="fieldErrors.birthdate ? 'true' : undefined"
                  >
                    <option value="">{{ t('auth.year') }}</option>
                    <option v-for="y in years" :key="y" :value="String(y)">{{ y }}</option>
                  </select>
                </div>
                <span v-if="fieldErrors.birthdate" class="field-error">
                  <AppIcon name="alert-circle" :size="16" />{{ fieldErrors.birthdate }}
                </span>
              </div>

              <div class="field">
                <label class="label" for="auth-phone">
                  {{ t('auth.phone') }}
                  <!-- An application is answered by phone, so on that form the
                       number stops being optional. The API enforces the same. -->
                  <span v-if="memberType === 'teacher'" class="req">*</span>
                  <span v-else class="opt">{{ t('auth.optional') }}</span>
                </label>
                <PhoneField
                  id="auth-phone"
                  v-model:country-code="phoneCountryCode"
                  v-model:national="phoneNational"
                  :locale="(locale as AppLocale)"
                  :placeholder="t('auth.phonePlaceholder')"
                  :invalid="Boolean(fieldErrors.phoneNational)"
                  @validity="phoneValid = $event"
                />
                <span v-if="fieldErrors.phoneNational" class="field-error">
                  <AppIcon name="alert-circle" :size="16" />{{ fieldErrors.phoneNational }}
                </span>
              </div>

              <!-- The teaching application, following the fields the old
                   "สมัครสอน" form collected. Submitting it creates an ordinary
                   account plus a pending application. -->
              <template v-if="memberType === 'teacher'">
                <div class="field">
                  <label class="label" for="auth-teach-cat">
                    {{ t('auth.teachSubject') }} <span class="req">*</span>
                  </label>
                  <input
                    id="auth-teach-cat"
                    v-model="teachSubject"
                    class="input"
                    maxlength="150"
                    :placeholder="t('auth.teachSubjectPlaceholder')"
                    :aria-invalid="fieldErrors['teacher.subject'] ? 'true' : undefined"
                  />
                  <span v-if="fieldErrors['teacher.subject']" class="field-error">
                    <AppIcon name="alert-circle" :size="16" />{{
                      fieldErrors['teacher.subject']
                    }}
                  </span>
                </div>

                <div class="field">
                  <label class="label" for="auth-teach-exp">
                    {{ t('auth.teachExperience') }} <span class="req">*</span>
                  </label>
                  <textarea
                    id="auth-teach-exp"
                    v-model="teachExperience"
                    class="textarea"
                    rows="3"
                    :placeholder="t('auth.teachExperiencePlaceholder')"
                    :aria-invalid="fieldErrors['teacher.experience'] ? 'true' : undefined"
                  />
                  <span v-if="fieldErrors['teacher.experience']" class="field-error">
                    <AppIcon name="alert-circle" :size="16" />{{
                      fieldErrors['teacher.experience']
                    }}
                  </span>
                </div>

                <div class="field">
                  <label class="label" for="auth-teach-reason">
                    {{ t('auth.teachReason') }} <span class="opt">{{ t('auth.optional') }}</span>
                  </label>
                  <textarea
                    id="auth-teach-reason"
                    v-model="teachReason"
                    class="textarea"
                    rows="3"
                    :placeholder="t('auth.teachReasonPlaceholder')"
                  />
                </div>

                <div class="field">
                  <label class="label" for="auth-teach-when">
                    {{ t('auth.teachContactTime') }}
                    <span class="opt">{{ t('auth.optional') }}</span>
                  </label>
                  <input
                    id="auth-teach-when"
                    v-model="teachContactTime"
                    class="input"
                    :placeholder="t('auth.teachContactTimePlaceholder')"
                  />
                </div>

                <!-- The file goes up after the account exists, so a failure
                     there must not read as a failed registration — they are
                     signed up either way, and can send it on afterwards. That
                     is why these hold the file rather than sending it. -->
                <FileDropZone
                  id="auth-teach-cv"
                  :label="t('auth.teachResume')"
                  :hint="t('auth.teachResumeHint')"
                  accept=".pdf,.doc,.docx,image/*"
                  :max-mb="10"
                  required
                  :busy="uploading"
                  :error="resumeProblem"
                  @update:file="resumeFile = $event"
                />

                <FileDropZone
                  id="auth-teach-clip"
                  :label="t('auth.teachClip')"
                  :hint="t('auth.teachClipHint')"
                  accept="video/*"
                  :max-mb="100"
                  required
                  :busy="uploading"
                  @update:file="clipFile = $event"
                >
                  <!-- A hundred megabytes over a phone connection runs for
                       minutes. Without something moving, the dialog reads as
                       hung and people close it — which is exactly the thing
                       that must not happen while bytes are in flight. -->
                  <template #progress>
                    <div v-if="uploading" class="upl">
                      <div
                        class="upl-bar"
                        role="progressbar"
                        :aria-valuenow="clipProgress"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        :aria-label="t('auth.teachClipSending', { pct: clipProgress })"
                      >
                        <span class="upl-fill" :style="{ width: clipProgress + '%' }" />
                      </div>
                      <p class="hint upl-note">
                        {{ t('auth.teachClipSending', { pct: clipProgress }) }}
                        <br />
                        <strong>{{ t('auth.teachClipStay') }}</strong>
                      </p>
                    </div>
                  </template>
                </FileDropZone>
              </template>

              <div class="field">
                <label class="check">
                  <input v-model="acceptedTerms" type="checkbox" />
                  <span>
                    <i18n-t keypath="auth.acceptTerms" tag="span">
                      <template #terms>
                        <RouterLink :to="`/${locale}/terms`" class="link" target="_blank">
                          {{ t('auth.termsLink') }}
                        </RouterLink>
                      </template>
                      <template #privacy>
                        <RouterLink :to="`/${locale}/privacy`" class="link" target="_blank">
                          <b>{{ t('auth.privacyLink') }}</b>
                        </RouterLink>
                      </template>
                    </i18n-t>
                  </span>
                </label>
                <span v-if="fieldErrors.acceptedTerms" class="field-error">
                  <AppIcon name="alert-circle" :size="16" />{{ fieldErrors.acceptedTerms }}
                </span>
              </div>
            </template>

            <div v-if="step === 'login' && !resetSent" class="field-row">
              <label class="check">
                <input v-model="remember" type="checkbox" />
                <span>{{ t('auth.rememberMe') }}</span>
              </label>
              <button type="button" class="link text-sm" @click="switchTo('forgot')">
                {{ t('auth.forgotPassword') }}
              </button>
            </div>

            <button
              v-if="!resetSent"
              type="submit"
              class="btn btn--primary btn--block btn--lg"
              :disabled="auth.busy || uploading"
            >
              <AppIcon :name="submitIcon" />
              <!-- The percentage goes on the button as well as beside the
                   field. The bar sits where the file was chosen, which on a
                   short screen is above the fold by the time somebody has
                   scrolled down to press this — and the button they just
                   pressed is the one thing they are certainly looking at. -->
              {{
                uploading
                  ? t('auth.teachClipSending', { pct: clipProgress })
                  : auth.busy
                    ? t('auth.working')
                    : submitLabel
              }}
            </button>

            <p class="auth-switch text-center text-sm">
              <template v-if="step === 'login'">
                {{ t('auth.noAccount') }}
                <button type="button" class="link" @click="switchTo('register')">
                  {{ t('common.register') }}
                </button>
              </template>
              <template v-else-if="step === 'forgot'">
                {{ t('auth.rememberedIt') }}
                <button type="button" class="link" @click="switchTo('login')">
                  {{ t('common.login') }}
                </button>
              </template>
              <template v-else>
                {{ t('auth.haveAccount') }}
                <button type="button" class="link" @click="switchTo('login')">
                  {{ t('common.login') }}
                </button>
              </template>
            </p>
          </form>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* The line offering the other form. It used to carry `style="margin: 0"` to
   drop the browser's default <p> margins, but that also beat `.stack > * + *`,
   so the one thing meant to stand apart from the submit button ended up flush
   against it. Only the bottom margin needs removing; the top is the stack's
   own spacing, with a little more because a solid block button crowds whatever
   follows it. */
.auth-switch {
  margin: 24px 0 0;
}

/* Day / month / year sit on one row, with the year wider because it holds four
   digits. Below 420px they stack rather than squeeze to unusable widths. */
.auth-birth {
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  gap: 10px;
}

/* The dialling code is as narrow as its longest entry needs; the number takes
   the rest. */
.auth-phone {
  display: grid;
  grid-template-columns: minmax(0, 11rem) minmax(0, 1fr);
  gap: 10px;
}

@media (max-width: 420px) {
  .auth-birth,
  .auth-phone {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* The clip's upload, while it runs. Deliberately plain: the only job is to
   move, so that minutes of silence do not read as a frozen dialog. */
.upl {
  margin-top: 0.6rem;
}
.upl-bar {
  height: 8px;
  border-radius: 999px;
  background: var(--c-border, #e2e8f0);
  overflow: hidden;
}
.upl-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--c-brand, #0ea5b7);
  transition: width 0.25s ease;
}
.upl-note {
  margin-top: 0.4rem;
}
</style>
