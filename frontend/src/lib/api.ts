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

  /** Finishes what the emailed link started. The API clears the refresh
   *  cookie, so whoever did this has to sign in again — which is the point:
   *  anyone already signed in on another device is signed out with it. */
  resetPassword: (token: string, password: string) =>
    send<{ message: string }>('/auth/reset-password', { method: 'POST', body: { token, password } }),

  verifyEmail: (token: string) =>
    send<{ user: SessionUser }>('/auth/verify-email', { method: 'POST', body: { token } }),

  /** Sends another verification link to the signed-in account. */
  sendVerifyEmail: () =>
    send<{ message: string }>('/auth/verify-email/send', { method: 'POST', body: {} }),

  sessions: () => send<{ data: unknown[] }>('/auth/sessions'),

  /** Every category, flat. `courseCount` counts only published courses. */
  categories: () => send<{ data: PublicCategory[] }>('/categories'),

  acceptPrivacy: () => send<{ user: SessionUser }>('/auth/accept-privacy', { method: 'POST', body: {} }),

  /** The catalog. `facets: true` adds the counts beside each filter option. */
  courses: (params: CourseQuery = {}) =>
    send<CourseListResponse>(`/courses${queryString(params)}`),

  /** One course, by slug or by id. */
  course: (ref: string | number) =>
    send<{ data: PublicCourse }>(`/courses/${encodeURIComponent(String(ref))}`),

  curriculum: (ref: string | number) =>
    send<{ data: Curriculum }>(`/courses/${encodeURIComponent(String(ref))}/curriculum`),

  /**
   * A free sample lesson, playable without an account. The link it returns is
   * signed and expires, so it is fetched when the sample is opened rather than
   * handed out with the curriculum.
   */
  lessonPreview: (ref: string | number, lessonId: number) =>
    send<{ data: LessonPreview }>(
      `/courses/${encodeURIComponent(String(ref))}/lessons/${lessonId}/preview`,
    ),

  /** Published articles, newest first. */
  posts: (params: PostQuery = {}) => send<PostListResponse>(`/posts/public${queryString(params)}`),

  /** One published article, by the slug in its URL. */
  post: (slug: string) =>
    send<{ data: PublicPostDetail }>(`/posts/public/${encodeURIComponent(slug)}`),

  /**
   * What each reserved advertising box is showing, or null where nothing is
   * sold. Several at once, because a page has more than one box.
   */
  ads: (placements: AdPlacement[], locale?: ContentLocale) =>
    send<{ data: Record<string, PublicAd | null> }>(
      `/ads/public${queryString({ placements, locale })}`,
    ),
}

/* ---------------- advertising ---------------- */

/** One key per reserved box on the site. The school sells a position. */
export type AdPlacement =
  | 'home-top'
  | 'home-bottom'
  | 'catalog-inline'
  | 'catalog-bottom'
  | 'course'
  | 'blog'
  | 'article'
  | 'account'
  | 'learn'

export interface PublicAd {
  id: number
  placement: AdPlacement
  href: string
  /** 4:1. A store path — pass it through `mediaUrl`. */
  imageDesktopPath: string | null
  /** 4:5, for a phone. */
  imageMobilePath: string | null
  imageAlt: string | null
}

/* ---------------- the blog ---------------- */

/** An article as a card shows it. The body is only on the detail. */
export interface PublicPost {
  id: number
  title: string
  slug: string
  excerpt: string | null
  coverPath: string | null
  contentLocale: ContentLocale
  publishedAt: string | null
  updatedAt: string | null
  categoryId: number | null
  categoryName: string | null
  /** The teacher's public name where they have one, else the account's. */
  authorName: string | null
  authorHeadline: string | null
  authorBio: string | null
  authorAvatarPath: string | null
}

export interface PublicPostDetail extends PublicPost {
  /** Written in the admin's editor. The school's own markup. */
  contentHtml: string | null
}

export interface PostListResponse {
  data: PublicPost[]
  meta: { page: number; perPage: number; total: number; totalPages: number }
}

export interface PostQuery {
  page?: number
  perPage?: number
  locale?: ContentLocale
  categoryId?: number
  q?: string
  /** Left out of the results, for the "other articles" beside one being read. */
  excludeId?: number
}

/* ---------------- the catalog ---------------- */

export interface PublicCategory {
  id: number
  parentId: number | null
  name: string
  slug: string
  /** A lucide glyph name. Null on most sub-categories, which borrow a parent's. */
  icon: string | null
  sortOrder: number
  /** Filed on this category itself. What the admin needs before deleting one. */
  courseCount: number
  /** This category and everything beneath it. Nothing is filed on a parent,
   *  so this is what a visitor means by a parent's name. */
  totalCourseCount: number
}

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'
export type ContentLocale = 'th' | 'en' | 'jp' | 'vn'
export type DurationBand = 'le1' | '1-3' | '3-6' | 'gt6'
export type PriceBand = 'free' | 'lt1000' | '1000-2000' | 'gt2000'
export type AccessBand = 'free' | 'course' | 'package'
export type CourseSort =
  | 'recommended'
  | 'newest'
  | 'title'
  | 'price'
  | 'price-desc'
  | 'popularity'

export interface CourseInstructor {
  id: number
  name: string
  short: string | null
  headline: string | null
  slug: string | null
  avatarPath: string | null
}

/** A course as the catalog and the cards show it. Money is satang. */
export interface PublicCourse {
  id: number
  title: string
  slug: string
  categoryId: number | null
  categoryName: string | null
  shortDesc: string | null
  thumbnailPath: string | null
  level: CourseLevel | null
  contentLocale: ContentLocale
  price: number
  normalPrice: number | null
  badge: 'bestseller' | 'recommended' | 'new' | 'free' | null
  featured: boolean
  sellable: boolean
  repurchase: boolean
  accessType: 'lifetime' | 'limited'
  accessDurationDays: number | null
  durationSeconds: number
  lessonCount: number
  inPackage: boolean
  popularity: number
  publishedAt: string | null
  updatedAt: string | null
  instructors: CourseInstructor[]
}

/** The course page needs more than a card does. */
export interface PublicCourseDetail extends PublicCourse {
  description: string | null
  outcomes: string[] | null
  audience: string[] | null
  sampleVideoPath: string | null
  status: string
}

export interface CourseFacets {
  total: number
  /** Keyed by category id, as a string. */
  category: Record<string, number>
  level: Record<string, number>
  locale: Record<string, number>
  duration: Record<string, number>
  price: Record<string, number>
  access: Record<string, number>
}

export interface CourseListResponse {
  data: PublicCourse[]
  meta: { page: number; perPage: number; total: number; totalPages: number }
  facets?: CourseFacets
}

export interface CourseQuery {
  page?: number
  perPage?: number
  q?: string
  categoryIds?: number[]
  levels?: CourseLevel[]
  locales?: ContentLocale[]
  durations?: DurationBand[]
  prices?: PriceBand[]
  access?: AccessBand[]
  sort?: CourseSort
  facets?: boolean
}

export interface CurriculumLesson {
  id: number
  moduleId: number | null
  type: 'video' | 'document' | 'quiz' | 'essay' | 'live'
  title: string
  subtitle: string | null
  description: string | null
  durationSeconds: number
  isPreview: boolean
  sortOrder: number
}

export interface LessonPreview {
  id: number
  title: string
  subtitle: string | null
  courseTitle: string
  durationSeconds: number
  /** Null when the lesson is marked as a sample but nothing is uploaded yet. */
  url: string | null
}

export interface Curriculum {
  modules: { id: number; title: string; sortOrder: number; lessons: CurriculumLesson[] }[]
  /** Lessons attached to the course rather than to a module. */
  loose: CurriculumLesson[]
  totalSeconds: number
}

/**
 * The filter arrays go as one comma-separated parameter each, which is what
 * the API expects and what keeps a shared link short enough to paste.
 */
function queryString(params: CourseQuery | PostQuery | Record<string, unknown>): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) q.set(key, value.join(','))
    } else if (typeof value === 'boolean') {
      if (value) q.set(key, 'true')
    } else {
      q.set(key, String(value))
    }
  }
  const s = q.toString()
  return s ? `?${s}` : ''
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
