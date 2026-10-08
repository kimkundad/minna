<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { ApiError, api } from '@/lib/api'

/**
 * Where the "forgot your password" email lands.
 *
 * The token is in the address, so the only thing asked for is the new
 * password — proving who you are was the email's job. Typing it twice, because
 * a password nobody can read back is the one field where a typo is only found
 * out later, at the worst moment.
 *
 * Succeeding signs every device out, including this one: the API clears the
 * refresh cookie and drops the sessions. Somebody resetting a password after it
 * leaked would be badly served by a page that left the thief signed in, so the
 * page says plainly that signing in again is the next step rather than trying
 * to be clever and do it for them.
 */
const route = useRoute()
const { t } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const token = computed(() => String(route.query.token ?? ''))

const password = ref('')
const confirm = ref('')
const busy = ref(false)
const done = ref(false)

/** The message under the form, and the one under each box. */
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
/** A token that was refused. Different from a wrong password: there is nothing
 *  to correct here, only a new link to ask for. */
const tokenRefused = ref(false)

async function submit() {
  error.value = ''
  fieldErrors.value = {}

  if (password.value !== confirm.value) {
    fieldErrors.value.confirm = t('auth.resetMismatch')
    return
  }

  busy.value = true
  try {
    await api.resetPassword(token.value, password.value)
    done.value = true
  } catch (err) {
    if (err instanceof ApiError) {
      // A spent, expired or unknown token comes back 401. Nothing on this form
      // could fix that, so it gets the panel rather than a line of red under a
      // box the reader is being invited to correct.
      if (err.status === 401 || err.fields.token) {
        tokenRefused.value = true
      } else {
        fieldErrors.value = err.fields
        error.value = Object.keys(err.fields).length ? '' : err.message
      }
    } else {
      error.value = t('auth.networkError')
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page-hero">
    <div class="container">
      <h1>{{ t('auth.resetTitle') }}</h1>
      <p v-if="!done && token && !tokenRefused">{{ t('auth.resetSub') }}</p>
    </div>
  </div>

  <section class="container auth-page">
    <!-- The link arrived without a token at all -->
    <div v-if="!token" class="auth-note">
      <AppIcon name="alert-circle" />
      <div>
        <h2>{{ t('auth.resetNoToken') }}</h2>
        <p>{{ t('auth.resetNoTokenSub') }}</p>
        <RouterLink class="btn btn--primary" :to="`/${locale}`">
          {{ t('auth.goHome') }}
        </RouterLink>
      </div>
    </div>

    <!-- The token was refused: expired, already used, or not ours -->
    <div v-else-if="tokenRefused" class="auth-note">
      <AppIcon name="alert-circle" />
      <div>
        <h2>{{ t('auth.resetBadToken') }}</h2>
        <p>{{ t('auth.resetBadTokenSub') }}</p>
        <RouterLink class="btn btn--primary" :to="`/${locale}?auth=forgot`">
          {{ t('auth.resetAskAgain') }}
        </RouterLink>
      </div>
    </div>

    <!-- Done -->
    <div v-else-if="done" class="auth-note auth-note--good">
      <AppIcon name="check-circle" />
      <div>
        <h2>{{ t('auth.resetDone') }}</h2>
        <p>{{ t('auth.resetDoneSub') }}</p>
        <RouterLink class="btn btn--primary" :to="`/${locale}?auth=login`">
          {{ t('auth.goSignIn') }}
        </RouterLink>
      </div>
    </div>

    <!-- The form -->
    <form v-else class="auth-form" @submit.prevent="submit">
      <div class="field">
        <label class="label" for="rp-new">
          {{ t('auth.resetNewPassword') }} <span class="req">*</span>
        </label>
        <input
          id="rp-new"
          v-model="password"
          class="input"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          autofocus
        />
        <span class="field-help">{{ t('auth.passwordHelp') }}</span>
        <span v-if="fieldErrors.password" class="field-error">{{ fieldErrors.password }}</span>
      </div>

      <div class="field">
        <label class="label" for="rp-again">
          {{ t('auth.resetConfirm') }} <span class="req">*</span>
        </label>
        <input
          id="rp-again"
          v-model="confirm"
          class="input"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
        />
        <span v-if="fieldErrors.confirm" class="field-error">{{ fieldErrors.confirm }}</span>
      </div>

      <p v-if="error" class="field-error" role="alert">{{ error }}</p>

      <button class="btn btn--primary btn--block btn--lg" type="submit" :disabled="busy">
        {{ busy ? t('auth.working') : t('auth.resetSubmit') }}
      </button>
    </form>
  </section>
</template>
