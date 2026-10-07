<template>
  <FullScreenLayout>
    <div class="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <div
        class="relative flex lg:flex-row w-full h-screen justify-center flex-col dark:bg-gray-900"
      >
        <div class="flex flex-col flex-1 lg:w-1/2 w-full">
          <div class="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
            <div>
              <div class="mb-5 sm:mb-8">
                <h1
                  class="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md"
                >
                  Sign in
                </h1>
                <p class="text-sm text-gray-500 dark:text-gray-400">Minna staff accounts only.</p>
              </div>

              <form @submit.prevent="handleSubmit">
                <div class="space-y-5">
                  <!-- Email -->
                  <div>
                    <label
                      for="email"
                      class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
                    >
                      Email<span class="text-error-500">*</span>
                    </label>
                    <input
                      id="email"
                      v-model="email"
                      type="email"
                      name="email"
                      autocomplete="username"
                      required
                      placeholder="you@minna.local"
                      class="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                    />
                  </div>

                  <!-- Password -->
                  <div>
                    <label
                      for="password"
                      class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
                    >
                      Password<span class="text-error-500">*</span>
                    </label>
                    <div class="relative">
                      <input
                        id="password"
                        v-model="password"
                        :type="showPassword ? 'text' : 'password'"
                        autocomplete="current-password"
                        required
                        placeholder="Enter your password"
                        class="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pl-4 pr-11 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                      />
                      <button
                        type="button"
                        :aria-label="showPassword ? 'Hide password' : 'Show password'"
                        class="absolute z-30 text-gray-500 -translate-y-1/2 cursor-pointer right-4 top-1/2 dark:text-gray-400"
                        @click="showPassword = !showPassword"
                      >
                        <svg
                          v-if="!showPassword"
                          class="fill-current"
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M10.0002 13.8619C7.23361 13.8619 4.86803 12.1372 3.92328 9.70241C4.86804 7.26761 7.23361 5.54297 10.0002 5.54297C12.7667 5.54297 15.1323 7.26762 16.0771 9.70243C15.1323 12.1372 12.7667 13.8619 10.0002 13.8619ZM10.0002 4.04297C6.48191 4.04297 3.49489 6.30917 2.4155 9.4593C2.3615 9.61687 2.3615 9.78794 2.41549 9.94552C3.49488 13.0957 6.48191 15.3619 10.0002 15.3619C13.5184 15.3619 16.5055 13.0957 17.5849 9.94555C17.6389 9.78797 17.6389 9.6169 17.5849 9.45932C16.5055 6.30919 13.5184 4.04297 10.0002 4.04297ZM9.99974 7.84413C8.97445 7.84413 8.14351 8.67507 8.14351 9.70036C8.14351 10.7256 8.97445 11.5566 9.99974 11.5566H10.0012C11.0265 11.5566 11.8574 10.7256 11.8574 9.70036C11.8574 8.67507 11.0265 7.84413 10.0012 7.84413H9.99974Z"
                            fill="#98A2B3"
                          />
                        </svg>
                        <svg
                          v-else
                          class="fill-current"
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M4.63803 3.57709C4.34513 3.2842 3.87026 3.2842 3.57737 3.57709C3.28447 3.86999 3.28447 4.34486 3.57737 4.63775L4.85323 5.91362C3.74609 6.84199 2.89363 8.06395 2.4155 9.45936C2.3615 9.61694 2.3615 9.78801 2.41549 9.94558C3.49488 13.0957 6.48191 15.3619 10.0002 15.3619C11.255 15.3619 12.4422 15.0737 13.4994 14.5598L15.3625 16.4229C15.6554 16.7158 16.1302 16.7158 16.4231 16.4229C16.716 16.13 16.716 15.6551 16.4231 15.3622L4.63803 3.57709ZM12.3608 13.4212L10.4475 11.5079C10.3061 11.5423 10.1584 11.5606 10.0064 11.5606C8.98111 11.5606 8.15017 10.7296 8.15017 9.70433C8.15017 9.55237 8.1685 9.40469 8.20291 9.26331L5.93839 6.99879C5.03609 7.72615 4.33596 8.69082 3.93852 9.70247C4.88326 12.1373 7.24884 13.8619 10.0154 13.8619C10.8431 13.8619 11.6333 13.7075 12.3608 13.4212Z"
                            fill="#98A2B3"
                          />
                          <path
                            d="M10.0002 5.54224C9.6837 5.54224 9.37366 5.56482 9.0702 5.60845L7.78297 4.32122C8.49329 4.1394 9.23679 4.04224 10.0002 4.04224C13.5184 4.04224 16.5055 6.30846 17.5849 9.45859C17.6389 9.61617 17.6389 9.78724 17.5849 9.94481C17.2187 11.0135 16.6039 11.9668 15.8081 12.7333L14.7405 11.6657C15.3253 11.1194 15.7889 10.4494 16.0771 9.7017C15.1323 7.26688 12.7667 5.54224 10.0002 5.54224Z"
                            fill="#98A2B3"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <!-- Stay signed in. No "forgot password?" here on purpose:
                       a staff password is reset by another administrator, not
                       by whoever can reach this page. -->
                  <label class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-400">
                    <input
                      v-model="keepLoggedIn"
                      type="checkbox"
                      class="h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900"
                    />
                    Keep me signed in
                  </label>

                  <!-- Whatever the API said went wrong, above the button that
                       caused it. -->
                  <p
                    v-if="formError"
                    role="alert"
                    class="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
                  >
                    {{ formError }}
                  </p>

                  <div>
                    <button
                      type="submit"
                      :disabled="auth.busy"
                      class="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-white transition rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {{ auth.busy ? 'Signing in…' : 'Sign in' }}
                    </button>
                  </div>

                  <p class="text-center text-xs text-gray-500 dark:text-gray-400">
                    Lost your password? Ask another administrator to reset it for you.
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div
          class="lg:w-1/2 w-full h-full bg-brand-950 dark:bg-white/5 lg:grid items-center hidden relative"
        >
          <div class="items-center justify-center flex z-1">
            <common-grid-shape />
            <div class="flex flex-col items-center max-w-xs">
              <p class="text-2xl font-semibold text-white">Minna No Nihongo</p>
              <p class="mt-2 text-center text-gray-400 dark:text-white/60">Administration</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </FullScreenLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CommonGridShape from '@/components/common/CommonGridShape.vue'
import FullScreenLayout from '@/components/layout/FullScreenLayout.vue'
import { ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

/**
 * The only way into the admin.
 *
 * No social sign-in, no sign-up, no self-service password reset. Staff accounts
 * are created and reset by another administrator — a reset form here would let
 * anyone who knows a staff address send mail to it, and the whole point of this
 * app is that getting in is deliberate.
 */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
// Ticked by default: an admin signs in on their own machine and does it often.
const keepLoggedIn = ref(true)
const formError = ref('')

const NO_ACCESS = 'That account does not have access to the admin.'

onMounted(() => {
  // The guard sends a student here rather than looping them through a page
  // they are allowed to see; they deserve to know why.
  if (route.query.denied) formError.value = NO_ACCESS
})

const handleSubmit = async () => {
  formError.value = ''
  try {
    const user = await auth.login(email.value.trim(), password.value, keepLoggedIn.value)

    if (!user.roles.some((r) => r === 'admin' || r === 'teacher')) {
      // Signed in, but not for here. Drop the session rather than leaving a
      // student holding an admin-app token.
      await auth.logout()
      formError.value = NO_ACCESS
      return
    }

    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await router.replace(next)
  } catch (err) {
    formError.value =
      err instanceof ApiError ? err.message : 'Could not reach the server. Try again.'
  }
}
</script>
