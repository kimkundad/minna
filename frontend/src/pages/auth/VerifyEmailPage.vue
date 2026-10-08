<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

/**
 * Where the "confirm your email" link lands.
 *
 * Nothing is asked of the reader: clicking the link was the whole act, so the
 * page gets on with it on arrival rather than showing a button that repeats
 * what they already did.
 *
 * It does not sign anybody in. The token proves an address was reachable, not
 * that whoever opened the mailbox is the account's owner — a shared machine
 * with a webmail tab still open would hand the account over.
 */
const route = useRoute()
const { t } = useI18n()
const auth = useAuthStore()

const locale = computed(() => String(route.params.locale ?? 'th'))
const token = computed(() => String(route.query.token ?? ''))

type State = 'working' | 'done' | 'failed' | 'no-token'
const state = ref<State>('working')

/** Offered only to somebody already signed in — the endpoint that sends another
 *  one needs an account to send it to. */
const canResend = computed(() => auth.isLoggedIn && state.value === 'failed')
const resending = ref(false)
const resent = ref(false)

async function resend() {
  resending.value = true
  try {
    await api.sendVerifyEmail()
    resent.value = true
  } catch {
    // The button simply stops offering. The API answers the same way whether
    // or not it sent anything, so there is nothing truthful to report.
    resent.value = true
  } finally {
    resending.value = false
  }
}

onMounted(async () => {
  if (!token.value) {
    state.value = 'no-token'
    return
  }
  try {
    await api.verifyEmail(token.value)
    // The signed-in copy of the user now has a stale `emailVerifiedAt`, and the
    // account pages read it.
    if (auth.isLoggedIn) await auth.bootstrap()
    state.value = 'done'
  } catch (err) {
    state.value = err instanceof ApiError ? 'failed' : 'failed'
  }
})
</script>

<template>
  <div class="page-hero">
    <div class="container">
      <h1>
        {{
          state === 'done'
            ? t('auth.verifyDone')
            : state === 'working'
              ? t('auth.verifyTitle')
              : state === 'no-token'
                ? t('auth.verifyNoToken')
                : t('auth.verifyFailed')
        }}
      </h1>
    </div>
  </div>

  <section class="container auth-page">
    <div v-if="state === 'working'" class="auth-note">
      <AppIcon name="mail" />
      <div>
        <h2>{{ t('auth.verifyWorking') }}</h2>
      </div>
    </div>

    <div v-else-if="state === 'done'" class="auth-note auth-note--good">
      <AppIcon name="check-circle" />
      <div>
        <h2>{{ t('auth.verifyDone') }}</h2>
        <p>{{ t('auth.verifyDoneSub') }}</p>
        <RouterLink class="btn btn--primary" :to="`/${locale}`">
          {{ t('auth.goHome') }}
        </RouterLink>
      </div>
    </div>

    <div v-else-if="state === 'no-token'" class="auth-note">
      <AppIcon name="alert-circle" />
      <div>
        <h2>{{ t('auth.verifyNoToken') }}</h2>
        <p>{{ t('auth.verifyNoTokenSub') }}</p>
        <RouterLink class="btn btn--primary" :to="`/${locale}`">
          {{ t('auth.goHome') }}
        </RouterLink>
      </div>
    </div>

    <div v-else class="auth-note">
      <AppIcon name="alert-circle" />
      <div>
        <h2>{{ t('auth.verifyFailed') }}</h2>
        <p>{{ t('auth.verifyFailedSub') }}</p>
        <div class="auth-note-actions">
          <button
            v-if="canResend && !resent"
            class="btn btn--primary"
            type="button"
            :disabled="resending"
            @click="resend"
          >
            {{ resending ? t('auth.working') : t('auth.resetAskAgain') }}
          </button>
          <RouterLink class="btn btn--secondary" :to="`/${locale}`">
            {{ t('auth.goHome') }}
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
