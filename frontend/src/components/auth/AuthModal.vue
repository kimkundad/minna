<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
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
const { t } = useI18n()
const auth = useAuthStore()

const step = ref<AuthStep>('login')
const dialog = ref<HTMLElement | null>(null)
const titleId = 'auth-modal-title'

const email = ref('')
const password = ref('')
const firstName = ref('')
const lastName = ref('')

/** Server-side messages, keyed by field, shown under the input that caused them. */
const fieldErrors = ref<Record<string, string>>({})
const formError = ref('')

const open = computed(() => authRequest.value !== null)
let returnTo: HTMLElement | null = null

function reset() {
  password.value = ''
  fieldErrors.value = {}
  formError.value = ''
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
  closeAuth()
  // Hand focus back to whatever opened the dialog, so a keyboard user is not
  // dropped at the top of the document.
  returnTo?.focus?.()
  returnTo = null
}

function switchTo(next: AuthStep) {
  step.value = next
  reset()
  nextTick(() => dialog.value?.querySelector<HTMLInputElement>('input')?.focus())
}

async function submit() {
  fieldErrors.value = {}
  formError.value = ''
  const done = authRequest.value?.onDone

  try {
    if (step.value === 'login') {
      await auth.login(email.value.trim(), password.value)
    } else {
      await auth.register({
        email: email.value.trim(),
        password: password.value,
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
      })
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

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
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
            <h2 class="modal-title" :id="titleId">
              {{ step === 'login' ? t('auth.loginTitle') : t('auth.registerTitle') }}
            </h2>
            <p class="modal-sub">
              {{ step === 'login' ? t('auth.loginSub') : t('auth.registerSub') }}
            </p>
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

            <template v-if="step === 'register'">
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

            <div class="field">
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

            <div class="field">
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

            <button type="submit" class="btn btn--primary btn--block btn--lg" :disabled="auth.busy">
              <AppIcon :name="step === 'login' ? 'log-in' : 'user'" />
              {{ auth.busy ? t('auth.working') : step === 'login' ? t('common.login') : t('common.register') }}
            </button>

            <p class="text-center text-sm" style="margin: 0">
              <template v-if="step === 'login'">
                {{ t('auth.noAccount') }}
                <button type="button" class="link" @click="switchTo('register')">
                  {{ t('common.register') }}
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
