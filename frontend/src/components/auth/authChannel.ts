import { ref } from 'vue'

/**
 * One place to ask for the sign-in dialog from anywhere — the header, a locked
 * lesson, the cart's checkout button — without every one of them owning a copy
 * of it. `AuthModal` is mounted once in `App.vue` and watches this.
 *
 * `reason` is shown above the form, so a gate can say what the person was
 * trying to do rather than leaving them to guess why they were interrupted.
 */
export type AuthStep = 'login' | 'register'

export interface AuthRequest {
  step: AuthStep
  reason?: string
  /** Run after a successful sign-in — continue to checkout, open the lesson. */
  onDone?: () => void
}

export const authRequest = ref<AuthRequest | null>(null)

export function openAuth(request: AuthRequest = { step: 'login' }): void {
  authRequest.value = request
}

export function closeAuth(): void {
  authRequest.value = null
}
