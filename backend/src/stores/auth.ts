import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, refresh, setAccessToken, type RoleName, type SessionUser } from '@/lib/api'

/**
 * Who is signed in to the admin.
 *
 * `ready` is what the router waits on. Without it, the first navigation after a
 * reload happens before `bootstrap()` has traded the refresh cookie for a
 * token, so the guard would see a signed-out user and bounce an admin to the
 * sign-in page on every refresh.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null)
  const ready = ref(false)
  const busy = ref(false)

  const isLoggedIn = computed(() => user.value !== null)
  const roles = computed<RoleName[]>(() => user.value?.roles ?? [])
  const isSuperadmin = computed(() => roles.value.includes('superadmin'))
  // A superadmin does everything an admin does, so every 'is this an admin'
  // check has to say yes for one. The API decides the same way.
  const isAdmin = computed(() => isSuperadmin.value || roles.value.includes('admin'))
  const isTeacher = computed(() => roles.value.includes('teacher'))

  /** Everyone who may use this app at all. A student account has no business
   *  here even though it signs in against the same API. */
  const canUseAdmin = computed(() => isAdmin.value || isTeacher.value)

  const displayName = computed(() =>
    user.value ? `${user.value.firstName} ${user.value.lastName}`.trim() : '',
  )

  const initials = computed(() => {
    if (!user.value) return ''
    const { firstName, lastName } = user.value
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  })

  /** Called once before the app mounts. */
  async function bootstrap(): Promise<void> {
    if (await refresh()) {
      try {
        user.value = (await api.me()).user
      } catch {
        // A token that refreshes but cannot fetch its own user is not a session
        // worth keeping.
        setAccessToken(null)
        user.value = null
      }
    }
    ready.value = true
  }

  async function login(email: string, password: string, remember = true): Promise<SessionUser> {
    busy.value = true
    try {
      const res = await api.login(email, password, { deviceLabel: deviceLabel(), remember })
      setAccessToken(res.accessToken)
      user.value = res.user
      return res.user
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
      busy.value = false
    }
  }

  return {
    user,
    ready,
    busy,
    isLoggedIn,
    roles,
    isAdmin,
    isSuperadmin,
    isTeacher,
    canUseAdmin,
    displayName,
    initials,
    bootstrap,
    login,
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
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Macintosh/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return [browser, os].filter(Boolean).join(' · ') + ' (admin)'
}
