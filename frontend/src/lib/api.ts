/**
 * The HTTP client every call to our API goes through.
 *
 * The access token is held in memory only. Keeping it out of localStorage means
 * an XSS bug cannot read it back out; the refresh token lives in an httpOnly
 * cookie the API sets, which script cannot reach either. The cost is that a
 * page reload starts with no access token, which is what `refresh()` on boot is
 * for.
 *
 * A 401 is retried exactly once, after a refresh. More than once and a genuinely
 * expired session would spin.
 */

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** Per-field messages, ready to put under the inputs that caused them. */
  readonly fields: Record<string, string>

  constructor(status: number, body: Partial<ApiErrorBody>) {
    const error = body.error
    super(error?.message ?? 'Something went wrong.')
    this.name = 'ApiError'
    this.status = status
    this.code = error?.code ?? 'unknown'
    this.fields = error?.fields ?? {}
  }
}

const BASE = '/api/v1'

let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function hasAccessToken(): boolean {
  return accessToken !== null
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Set on the refresh call itself, so a failed refresh cannot refresh again. */
  skipRefresh?: boolean
}

async function send<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    // Without this the browser withholds the refresh cookie and every session
    // ends at the first reload.
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (res.status === 401 && !options.skipRefresh) {
    const renewed = await refresh()
    if (renewed) return send<T>(path, { ...options, skipRefresh: true })
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // A non-JSON body means something upstream answered instead of the API.
  }

  if (!res.ok) throw new ApiError(res.status, (body ?? {}) as Partial<ApiErrorBody>)
  return body as T
}

export interface SessionUser {
  id: number
  email: string
  firstName: string
  lastName: string
  locale: 'th' | 'en' | 'jp' | 'vn'
  roles: ('admin' | 'teacher' | 'student')[]
  avatarPath: string | null
  privacyAcceptedAt: string | null
  emailVerifiedAt: string | null
}

interface SessionResponse {
  user: SessionUser
  accessToken: string
  refreshToken: string
}

export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
  /** Gregorian, YYYY-MM-DD. The form collects a Buddhist year and converts. */
  birthdate?: string
  /** Dialling code with its plus, e.g. "+66". */
  phoneCountryCode?: string
  phoneNational?: string
  locale?: string
  /** The terms and the privacy notice, accepted together. The API refuses
   *  anything but true, so the form cannot submit without the box ticked. */
  acceptedTerms: true
  /** Which form was filled in. 'teacher' also files an application an admin
   *  approves; it does not grant the role. */
  memberType?: 'student' | 'teacher'
  teacher?: {
    subject: string
    experience: string
    reason?: string
    contactTime?: string
  }
}

/**
 * Trades the refresh cookie for a new access token. Returns false rather than
 * throwing when there is no session: on first load that is the normal case, not
 * an error.
 */
export async function refresh(): Promise<boolean> {
  try {
    const data = await send<SessionResponse>('/auth/refresh', {
      method: 'POST',
      body: {},
      skipRefresh: true,
    })
    accessToken = data.accessToken
    return true
  } catch {
    accessToken = null
    return false
  }
}

export const api = {
  /** `remember` decides whether the refresh cookie outlives the browser. */
  login: (email: string, password: string, opts: { deviceLabel?: string; remember?: boolean } = {}) =>
    send<SessionResponse>('/auth/login', {
      method: 'POST',
      body: {
        email,
        password,
        ...(opts.deviceLabel ? { deviceLabel: opts.deviceLabel } : {}),
        ...(opts.remember === undefined ? {} : { remember: opts.remember }),
      },
    }),

  register: (input: RegisterInput) =>
    send<SessionResponse>('/auth/register', { method: 'POST', body: input }),

  logout: () => send<void>('/auth/logout', { method: 'POST', body: {} }),

  logoutAll: () => send<void>('/auth/logout-all', { method: 'POST', body: {} }),

  me: () => send<{ user: SessionUser }>('/auth/me'),

  forgotPassword: (email: string) =>
    send<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } }),

  sessions: () => send<{ data: unknown[] }>('/auth/sessions'),

  categories: () =>
    send<{ data: { id: number; parentId: number | null; name: string; slug: string }[] }>(
      '/categories',
    ),

  acceptPrivacy: () => send<{ user: SessionUser }>('/auth/accept-privacy', { method: 'POST', body: {} }),
}

/* ---------------- the home slideshow ---------------- */

export interface PublicHeroSlide {
  id: number
  eyebrow: string | null
  /** The headline is two parts: the second is styled differently. */
  titleA: string
  titleB: string | null
  subtitle: string | null
  /** A store path. Pass it through `mediaUrl` to get something loadable. */
  imagePath: string | null
  imageAlt: string | null
  /** Percentages. Which part of the picture to keep when it is cropped. */
  focalX: number
  focalY: number
  ctaLabel: string | null
  ctaHref: string | null
  cta2Label: string | null
  cta2Href: string | null
}

/**
 * A permanent address for a picture the school uploaded.
 *
 * The store is private and signs its URLs, which expire. This one does not: the
 * API signs the real address when the browser follows it, so the link in a page
 * stays good.
 */
export function mediaUrl(path: string): string {
  return `${BASE}/media/${path.replace(/^\/+/, '')}`
}

/** The slides for one language. Published, inside their dates, in order. */
export function heroSlides(locale: string): Promise<{ data: PublicHeroSlide[] }> {
  return send<{ data: PublicHeroSlide[] }>(`/hero-slides/public?locale=${encodeURIComponent(locale)}`)
}
