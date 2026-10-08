import { useCartStore } from './cart'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  api,
  ApiError,
  refresh,
  setAccessToken,
  type RegisterInput,
  type SessionUser,
} from '@/lib/api'
import { store as fixtures } from '@/vendor'

/**
 * Who is signed in, according to our own API.
 *
 * While the pages still read their course data from the vendored prototype
 * store, this keeps the two in step: a real sign-in also flips that store's
 * session, so the interface switches to its signed-in state and the fixture
 * data a member would see appears. When the catalog comes from the API, the
 * calls to `fixtures` here are the only thing that has to go.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null)
  const ready = ref(false)
  const busy = ref(false)

  const isLoggedIn = computed(() => user.value !== null)
  const displayName = computed(() =>
    user.value ? `${user.value.firstName} ${user.value.lastName}`.trim() : '',
  )
  const isAdmin = computed(() => user.value?.roles.includes('admin') ?? false)
  const isTeacher = computed(() => user.value?.roles.includes('teacher') ?? false)

  /** Mirrors the real session onto the fixture store the pages still read. */
  function syncFixtures(signedIn: boolean) {
    const s = fixtures as unknown as {
      login: (kind: 'free' | 'paid') => void
      logout: () => void
      isLoggedIn: () => boolean
    }
    if (signedIn) {
      // Everyone lands on the paid fixture for now: it is the only one with
      // courses, progress and orders to show. Entitlements will decide this
      // once they come from the API.
      if (!s.isLoggedIn()) s.login('paid')
    } else if (s.isLoggedIn()) {
      s.logout()
    }
  }

  function adopt(session: { user: SessionUser; accessToken: string }) {
    setAccessToken(session.accessToken)
    user.value = session.user
    syncFixtures(true)
  }

  /**
   * Restores a session from the refresh cookie on first load. Called before the
   * app mounts, so the header never flashes the signed-out state at someone who
   * is signed in.
   */
  async function bootstrap(): Promise<void> {
    if (ready.value) return
    try {
      if (await refresh()) {
        const { user: me } = await api.me()
        user.value = me
        syncFixtures(true)
      }
    } catch {
      // A failed restore is just a signed-out visitor.
    } finally {
      ready.value = true
    }
  }

  /**
   * Re-reads the account after something changed it elsewhere.
   *
   * Checkout saves a phone number to the profile; without this the session
   * would keep the old one and the next order would prefill what was just
   * replaced.
   */
  async function refreshUser(): Promise<void> {
    if (!user.value) return
    try {
      const { user: me } = await api.me()
      user.value = me
    } catch {
      // The session is what it was. Nothing here is worth interrupting for.
    }
  }

  async function login(email: string, password: string, remember = true): Promise<void> {
    busy.value = true
    try {
      adopt(await api.login(email, password, { deviceLabel: deviceLabel(), remember }))
    } finally {
      busy.value = false
    }
  }

  async function register(input: RegisterInput): Promise<void> {
    busy.value = true
    try {
      adopt(await api.register(input))
    } finally {
      busy.value = false
    }
  }

  async function logout(): Promise<void> {
    busy.value = true
    try {
      await api.logout()
    } catch {
      // Clearing the session locally matters more than the server's answer: if
      // the call failed, signing out must still sign you out here.
    } finally {
      setAccessToken(null)
      user.value = null
      // The basket belongs to the account that just left. Leaving it in the
      // badge would show the next person at this browser somebody else's.
      useCartStore().clear()
      syncFixtures(false)
      busy.value = false
    }
  }

  return {
    user,
    ready,
    busy,
    isLoggedIn,
    displayName,
    isAdmin,
    isTeacher,
    bootstrap,
    refreshUser,
    login,
    register,
    logout,
  }
})

/** Shown in the active-devices list, so sessions can be told apart. */
function deviceLabel(): string {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : 'Unknown'
  return `${browser} on ${os}`
}

export { ApiError }
