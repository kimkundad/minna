/**
 * The HTTP client every call to our API goes through.
 *
 * Deliberately the same shape as the public site's `src/lib/api.ts`: access
 * token in memory, refresh token in an httpOnly cookie the API sets, one retry
 * after a 401. Two apps talking to one API should not have two different ideas
 * about how a session works — and an admin token is the one most worth keeping
 * out of localStorage, because it is the one that can do the most damage.
 *
 * Vite proxies /api to the API in development, so this is a same-origin call
 * and the cookie travels without cross-site rules.
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

/**
 * The token itself, for the one caller that cannot go through `send`.
 *
 * Reading the chat's event stream needs the header on a `fetch` this module
 * does not make. Exported as a function and not as the value, so nobody can
 * hold a token that has since been replaced.
 */
export function getAccessToken(): string | null {
  return accessToken
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Set on the refresh call itself, so a failed refresh cannot refresh again. */
  skipRefresh?: boolean
  query?: Record<string, string | number | boolean | undefined>
}

function withQuery(path: string, query: RequestOptions['query']): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export async function send<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(`${BASE}${withQuery(path, options.query)}`, {
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

export type RoleName = 'superadmin' | 'admin' | 'teacher' | 'student'

/**
 * The languages the site is translated into: what an account is set to, and
 * what mail to that account is written in. Eight since the customer asked for
 * Indonesian, Chinese, Korean and Taiwanese.
 */
export type UiLocale = 'th' | 'en' | 'jp' | 'vn' | 'id' | 'zh' | 'ko' | 'tw'

/** The same list plus `all`, for a piece of content aimed at one language or
 *  at everybody. */
export type ContentLocale = UiLocale | 'all'

/**
 * What a teacher may say they teach — deliberately not `UiLocale`.
 *
 * The site being translated into Korean does not mean the school teaches it,
 * and the API refuses anything outside this list.
 */
export type TaughtLanguage = 'th' | 'en' | 'jp' | 'vn'

export interface SessionUser {
  id: number
  email: string
  firstName: string
  lastName: string
  locale: UiLocale
  roles: RoleName[]
  avatarPath: string | null
  privacyAcceptedAt: string | null
  emailVerifiedAt: string | null
}

interface SessionResponse {
  user: SessionUser
  accessToken: string
  refreshToken: string
}

/**
 * Trades the refresh cookie for a new access token. Returns false rather than
 * throwing when there is no session: on first load that is the normal case, not
 * an error.
 */
/** One renewal at a time, shared by everyone waiting on it. */
let renewal: Promise<boolean> | null = null

/**
 * Single-flight, and that is load-bearing rather than tidy.
 *
 * A cold load starts this twice — `main.ts` bootstraps the session and the
 * router guard bootstraps it again before the first has settled — and both
 * posted the same refresh cookie. The server rotates on each, so one request
 * wins and the other is told its token was replaced; whichever answered last
 * then wrote its own answer over the first. When that was the loser it cleared
 * the access token, `bootstrap()` saw no session, and the guard sent somebody
 * who was perfectly signed in to the sign-in page.
 *
 * Which is why it only ever happened on a reload: clicking through the app
 * never asks twice at once.
 */
export async function refresh(): Promise<boolean> {
  renewal ??= send<SessionResponse>('/auth/refresh', {
    method: 'POST',
    body: {},
    skipRefresh: true,
  })
    .then((data) => {
      accessToken = data.accessToken
      return true
    })
    .catch(() => {
      accessToken = null
      return false
    })
    .finally(() => {
      renewal = null
    })
  return renewal
}

export const api = {
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

  logout: () => send<void>('/auth/logout', { method: 'POST', body: {} }),

  me: () => send<{ user: SessionUser }>('/auth/me'),

  forgotPassword: (email: string) =>
    send<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } }),

  /* ---------------- catalog ---------------- */

  /** Every category, for a select box. */
  categories: () => send<{ data: Category[] }>('/categories', { query: { all: 1 } }),

  /** A page of them, for the admin table. Paged by top-level category, so a
   *  parent and its children never land on different pages. */
  categoryPage: (query: { page?: number; perPage?: number; q?: string } = {}) =>
    send<Paged<Category>>('/categories', { query }),

  createCategory: (body: CategoryInput) =>
    send<{ data: Category }>('/categories', { method: 'POST', body }),

  updateCategory: (id: number, body: Partial<CategoryInput>) =>
    send<{ data: Category }>(`/categories/${id}`, { method: 'PATCH', body }),

  deleteCategory: (id: number) => send<void>(`/categories/${id}`, { method: 'DELETE' }),

  courses: (query: CourseListQuery) => send<Paged<CourseRow>>('/courses', { query }),

  course: (id: number) => send<{ data: CourseDetail }>(`/courses/${id}`),

  createCourse: (body: CourseInput) =>
    send<{ data: CourseDetail }>('/courses', { method: 'POST', body }),

  updateCourse: (id: number, body: Partial<CourseInput>) =>
    send<{ data: CourseDetail }>(`/courses/${id}`, { method: 'PATCH', body }),

  deleteCourse: (id: number) => send<void>(`/courses/${id}`, { method: 'DELETE' }),

  /* ---------------- curriculum ---------------- */

  curriculum: (courseId: number) =>
    send<{ data: Curriculum }>(`/courses/${courseId}/curriculum`),

  createModule: (courseId: number, body: ModuleInput) =>
    send<{ data: CourseModule }>(`/courses/${courseId}/modules`, { method: 'POST', body }),

  updateModule: (courseId: number, moduleId: number, body: Partial<ModuleInput>) =>
    send<{ data: CourseModule }>(`/courses/${courseId}/modules/${moduleId}`, {
      method: 'PATCH',
      body,
    }),

  deleteModule: (courseId: number, moduleId: number) =>
    send<void>(`/courses/${courseId}/modules/${moduleId}`, { method: 'DELETE' }),

  createLesson: (courseId: number, body: LessonInput) =>
    send<{ data: Lesson }>(`/courses/${courseId}/lessons`, { method: 'POST', body }),

  updateLesson: (courseId: number, lessonId: number, body: Partial<LessonInput>) =>
    send<{ data: Lesson }>(`/courses/${courseId}/lessons/${lessonId}`, {
      method: 'PATCH',
      body,
    }),

  deleteLesson: (courseId: number, lessonId: number) =>
    send<void>(`/courses/${courseId}/lessons/${lessonId}`, { method: 'DELETE' }),

  /* ---------------- uploads ---------------- */

  uploadTicket: (body: {
    purpose: UploadPurpose
    courseId?: number
    threadId?: number
    /** Whose file, when it is not the uploader own. The API decides. */
    userId?: number
  }) =>
    send<{ data: UploadTicket }>('/uploads/ticket', { method: 'POST', body }),

  currencies: () => send<{ data: Currency[] }>('/currencies'),

  signPath: (path: string, ttl?: number) =>
    send<{ data: { url: string } }>('/uploads/sign', { method: 'POST', body: { path, ttl } }),

  reorder: (courseId: number, what: 'modules' | 'lessons', ids: number[]) =>
    send<void>(`/courses/${courseId}/reorder/${what}`, { method: 'POST', body: { ids } }),

  /* ---------------- handouts that belong to the course ---------------- */

  /** Shown in the learning room under every lesson, not just one. */
  documents: (courseId: number) =>
    send<{ data: CourseDocument[] }>(`/courses/${courseId}/documents`),

  addDocument: (courseId: number, body: { fileName: string; filePath: string; sizeBytes?: number }) =>
    send<{ data: CourseDocument }>(`/courses/${courseId}/documents`, { method: 'POST', body }),

  /** The name only. Swapping the file is a remove and an add, so a link
   *  somebody already holds never becomes a different document. */
  renameDocument: (courseId: number, documentId: number, fileName: string) =>
    send<{ data: CourseDocument }>(`/courses/${courseId}/documents/${documentId}`, {
      method: 'PATCH',
      body: { fileName },
    }),

  deleteDocument: (courseId: number, documentId: number) =>
    send<void>(`/courses/${courseId}/documents/${documentId}`, { method: 'DELETE' }),
}

export interface CourseDocument {
  id: number
  fileName: string
  /** Where it sits in the store. Never a URL. */
  filePath: string
  sizeBytes: number | null
  createdAt: string
}

export type LessonType = 'video' | 'document' | 'quiz'

export interface CourseModule {
  id: number
  courseId: number
  title: string
  sortOrder: number
}

export interface ModuleInput {
  title: string
  sortOrder?: number
}

export interface Lesson {
  id: number
  courseId: number
  moduleId: number | null
  type: LessonType
  title: string
  subtitle: string | null
  description: string | null
  durationSeconds: number
  videoPath: string | null
  documentPath: string | null
  isPreview: boolean
  sortOrder: number
}

export interface LessonInput {
  moduleId?: number | null
  type: LessonType
  title: string
  subtitle?: string | null
  description?: string | null
  durationSeconds?: number
  videoPath?: string | null
  documentPath?: string | null
  isPreview?: boolean
  sortOrder?: number
}

export interface Curriculum {
  modules: (CourseModule & { lessons: Lesson[] })[]
  /** Lessons attached to the course itself, outside any module. */
  loose: Lesson[]
  totalSeconds: number
}

export interface Paged<T> {
  data: T[]
  meta: { page: number; perPage: number; total: number; totalPages: number }
}

/** The name in each of the other site languages. Missing keys are untranslated. */
/** Every UI language but Thai, which is the canonical name on the category
 *  itself. Partial because a blank translation is a valid state — the public
 *  site falls back to Thai. */
export type CategoryNames = Partial<
  Record<'en' | 'jp' | 'vn' | 'id' | 'zh' | 'ko' | 'tw', string>
>

export interface Category {
  id: number
  parentId: number | null
  /** Thai: the canonical name, and what an untranslated language falls back to. */
  name: string
  names?: CategoryNames
  slug: string
  icon: string | null
  sortOrder: number
  /** Only on the list; how many courses would lose their category. */
  courseCount?: number
}

export interface CategoryInput {
  name: string
  slug: string
  parentId?: number | null
  icon?: string | null
  sortOrder?: number
  /** A blank value removes that language's translation. */
  names?: CategoryNames
}

export type CourseStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'ended'
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'

export interface CourseListQuery extends Record<string, string | number | boolean | undefined> {
  page?: number
  perPage?: number
  q?: string
  status?: CourseStatus
  categoryId?: number
  sort?: 'newest' | 'title' | 'price' | 'popularity'
}

export interface CourseRow {
  id: number
  title: string
  slug: string
  categoryId: number | null
  categoryName: string | null
  thumbnailPath: string | null
  level: CourseLevel | null
  /** Satang. Divide by 100 only when showing it. */
  price: number
  /** What the price is in. Buyers are charged this, never a conversion. */
  currency: string
  normalPrice: number | null
  /** Only sent to somebody entitled to see it: an admin, or the course's own
   *  teacher. Absent on the public course page. */
  revenueSharePct?: number
  status: CourseStatus
  sellable: boolean
  featured: boolean
  durationSeconds: number
  publishedAt: string | null
  createdAt: string
  /**
   * How many people may study this course today.
   *
   * Counted from entitlements, so a free enrolment and an access granted by
   * hand count like a sale — it is the size of the class, not the number of
   * receipts. Access that was revoked or has run out is left out.
   */
  enrolmentCount: number
}

export interface CourseInput {
  title: string
  slug: string
  categoryId?: number | null
  shortDesc?: string | null
  description?: string | null
  outcomes?: string[]
  audience?: string[]
  thumbnailPath?: string | null
  sampleVideoPath?: string | null
  level?: CourseLevel | null
  /** 'all' for a course that belongs to every language rather than one. */
  contentLocale?: ContentLocale
  price?: number
  currency?: string
  normalPrice?: number | null
  /**
   * What the teacher keeps of what the school receives for this course.
   * Admin-only: the API refuses it from anybody else, and a new course left
   * without one takes the figure from the settings page.
   */
  revenueSharePct?: number
  accessType?: 'lifetime' | 'limited'
  accessDurationDays?: number | null
  status?: CourseStatus
  /**
   * Why a course was sent back. Written by an administrator with
   * `status: 'rejected'`, read by the teacher. Cleared the moment the course
   * moves anywhere else, because it described a verdict that no longer holds.
   */
  reviewNote?: string | null
  /**
   * How this looks when shared, where that should differ from the page —
   * a title that reads well on a page and badly in a chat window, or a
   * cover that is cropped to nonsense at 1200×630. Empty is normal.
   */
  ogTitle?: string | null
  ogDescription?: string | null
  ogImagePath?: string | null
  sellable?: boolean
  repurchase?: boolean
  badge?: 'bestseller' | 'recommended' | 'new' | 'free' | null
  featured?: boolean
  instructorIds?: number[]
}

export interface CourseDetail extends CourseInput {
  id: number
  durationSeconds: number
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  /**
   * Who teaches it, as the course page introduces them.
   *
   * A teacher's display name — "อ. ธนา รักดี" — and the short form a card
   * uses, not the first and last name on their account. This said `firstName`
   * and `lastName` for a while, which the API has never sent: the compiler was
   * satisfied, and a warning on the course form printed the words "undefined
   * undefined" where a person's name belonged.
   */
  instructors?: {
    id: number
    name: string
    short: string
    headline: string | null
    slug: string
    avatarPath: string | null
  }[]
}

/**
 * How a teacher gets paid.
 *
 * Only ever your own — there is no route that reads somebody else's. The
 * document is a path in private storage, not a URL: a URL would expire, and
 * one is asked for only at the moment something has to be shown.
 */
export interface PayoutDetails {
  idDocumentPath: string | null
  idDocumentUploadedAt: string | null
  /** ISO 3166-1 alpha-2, which decides what the rest of these fields mean. */
  bankCountry: string | null
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  branch: string | null
  swift: string | null
  payoutCurrency: string | null
  /** Set by the school, shown here only. Null means the school-wide figure. */
  revenueSharePct: number | null
  houseSharePct: number
  /** Their CV: their own upload if there is one, otherwise the application
   *  copy. */
  resumeUrl: string | null
  resumeIsCurrent: boolean
  resumePath: string | null
  /** Sent with the record so the form never keeps its own copy of these lists
   *  and drifts from what the server will accept. */
  currencies: { code: string; name: { en: string; th: string } }[]
  countries: { code: string; name: { en: string; th: string } }[]
  thaiBanks: { swift: string; name: { en: string; th: string } }[]
}

/**
 * What a teacher may save about themselves.
 *
 * The share and the reference lists are left out on purpose: the share is the
 * school's to set and the API refuses it here, so a type that offered it would
 * invite a request that is always rejected.
 */
export type PayoutDetailsInput = Omit<
  PayoutDetails,
  | 'currencies'
  | 'countries'
  | 'thaiBanks'
  | 'revenueSharePct'
  | 'houseSharePct'
  // Worked out by the server from `resumePath` and the application copy, so
  // there is nothing here to send back.
  | 'resumeUrl'
  | 'resumeIsCurrent'
>

/**
 * What an administrator sees when they are about to transfer money.
 *
 * Fetched one teacher at a time, and the server records each read — so this
 * type has no place in a list, only in something somebody opened on purpose.
 */
export interface AdminPayoutDetails {
  name: string
  email: string
  /** ISO 3166-1 alpha-2, which decides what the rest of these fields mean. */
  bankCountry: string | null
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  branch: string | null
  swift: string | null
  payoutCurrency: string | null
  /** What this teacher keeps of a sale. Null means the school-wide figure. */
  revenueSharePct: number | null
  /** What null falls back to, so the form can name it. */
  houseSharePct: number
  /** Their CV: their own upload if there is one, otherwise the application
   *  copy. Null when neither exists. */
  resumeUrl: string | null
  /** True when it is their own upload rather than the application copy. */
  resumeIsCurrent: boolean
  /** Their own upload, as a stored path. Null means only the application copy
   *  exists, which cannot be replaced from here. */
  resumePath: string | null
  idDocumentUploadedAt: string | null
  idDocumentPath: string | null
  /** A link that expires in five minutes, or null when none was uploaded. */
  idDocumentUrl: string | null
  /** Whether somebody here supplied the proof rather than the teacher. */
  idDocumentByAdmin: boolean
  /** Sent with the record so the form cannot offer what the API refuses. */
  countries: { code: string; name: { en: string; th: string } }[]
  thaiBanks: { swift: string; name: { en: string; th: string } }[]
  currencies: { code: string; name: { en: string; th: string } }[]
}

export interface AdminPayoutDetailsInput {
  /** Omit to leave it alone; null removes it. */
  resumePath?: string | null
  /** Admin-only. Null puts them back on the school-wide figure. */
  revenueSharePct: number | null
  /** Omit to leave the document alone; null removes it. */
  idDocumentPath?: string | null
  bankCountry: string | null
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  branch: string | null
  swift: string | null
  payoutCurrency: string | null
}

/** Reference data, served so the admin cannot offer what the API refuses. */
export interface Currency {
  code: string
  symbol: string
  /** Decimal places Stripe counts in. 0 for yen, won and dong. */
  exponent: 0 | 2
  name: { en: string; th: string }
}

export type UploadPurpose =
  | 'course-thumbnail'
  /** The free sample. Public, like the cover — it plays before anyone buys. */
  | 'course-sample'
  | 'course-video'
  | 'course-document'
  | 'avatar'
  /** A picture dropped into an article or a course description. Filed by month,
   *  and the one folder served without a signature. */
  | 'content-image'
  /** The school's logo, for the public site and this admin alike. */
  | 'site-logo'
  /**
   * A teacher's ID card or passport, so the school can check it is paying the
   * person it agreed to pay. Private storage, never `content/` — showing it
   * needs a signed link, and the server issues one only to its owner or to an
   * administrator.
   */
  | 'identity-document'
  /** A teacher's CV, replaced after they joined. Beside their ID document, in
   *  the same private folder. */
  | 'teacher-resume'
  /** A picture or a document dropped into a staff conversation. Filed under
   *  the thread, and reachable only through it. */
  | 'chat-file'

export interface UploadTicket {
  ticket: string
  expiresAt: string
  /** The store's own origin. Not this API: the bytes go straight there. */
  baseUrl: string
  folder: string
  maxSize: number
}

/* ---------------- people ---------------- */

export interface Member {
  id: number
  email: string
  firstName: string
  lastName: string
  status: 'active' | 'suspended'
  locale: string
  avatarPath: string | null
  emailVerifiedAt: string | null
  createdAt: string
  roles: RoleName[]
}

export interface MemberListQuery extends Record<string, string | number | boolean | undefined> {
  page?: number
  perPage?: number
  q?: string
  role?: RoleName
  status?: 'active' | 'suspended'
  /** Which screen is asking: three jobs, three lists. */
  group?: 'students' | 'teachers' | 'admins'
  sort?: 'newest' | 'name' | 'email'
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface TeacherApplication {
  id: number
  name: string
  email: string
  phone: string | null
  subject: string | null
  categoryId: number | null
  categoryName?: string | null
  status: ApplicationStatus
  contactTime: string | null
  createdAt: string
  approvedAt: string | null
  /** Only on the detail read. */
  experience?: string | null
  reason?: string | null
  resumePath?: string | null
  /** A link to the CV that expires in five minutes, or null when none was
   *  sent. The stored path is never openable on its own. */
  resumeUrl?: string | null
  /** When they ticked the box agreeing to the terms. */
  agreedAt?: string | null
  /** A link to the sample lesson, good for fifteen minutes. Null once the
   *  application has been decided: deciding deletes the file. */
  sampleVideoUrl?: string | null
  account?: { id: number; email: string; status: string } | null
}

export interface ApplicationListQuery
  extends Record<string, string | number | boolean | undefined> {
  page?: number
  perPage?: number
  status?: ApplicationStatus
  q?: string
}

export const people = {
  members: (query: MemberListQuery = {}) => send<Paged<Member>>('/members', { query }),

  member: (id: number) => send<{ data: Member }>(`/members/${id}`),

  /**
   * One teacher's bank details. Its own call, not part of any list: the server
   * records every read, and that only means something when looking was a
   * deliberate act rather than part of drawing a table.
   */
  payoutDetails: (userId: number) =>
    send<{ data: AdminPayoutDetails }>(`/members/${userId}/payout-details`),

  /** Correcting them on a teacher's behalf — audited field by field, with the
   *  account number logged as its last four digits only. */
  savePayoutDetails: (userId: number, body: AdminPayoutDetailsInput) =>
    send<{ data: { ok: true } }>(`/members/${userId}/payout-details`, { method: 'PUT', body }),

  create: (body: CreateMemberInput) =>
    send<{ data: Member }>('/members', { method: 'POST', body }),

  setPassword: (id: number, password: string, confirmPassword: string) =>
    send<{ data: { id: number; email: string } }>(`/members/${id}/password`, {
      method: 'PUT',
      body: { password, confirmPassword },
    }),

  sendPasswordReset: (id: number) =>
    send<{ sent: boolean }>(`/members/${id}/password-reset`, { method: 'POST', body: {} }),

  setRoles: (id: number, roles: RoleName[]) =>
    send<{ data: Member }>(`/members/${id}/roles`, { method: 'PUT', body: { roles } }),

  setStatus: (id: number, status: 'active' | 'suspended', reason?: string) =>
    send<{ data: Member }>(`/members/${id}/status`, {
      method: 'PUT',
      body: { status, ...(reason ? { reason } : {}) },
    }),

  applications: (query: ApplicationListQuery = {}) =>
    send<Paged<TeacherApplication>>('/teacher-applications', { query }),

  application: (id: number) =>
    send<{ data: TeacherApplication }>(`/teacher-applications/${id}`),

  decide: (
    id: number,
    body: { decision: 'approved' | 'rejected'; categoryId?: number | null; note?: string },
  ) =>
    send<{ data: TeacherApplication; granted: boolean }>(
      `/teacher-applications/${id}/decision`,
      { method: 'POST', body },
    ),
}

export interface CreateMemberInput {
  email: string
  firstName: string
  lastName: string
  roles: RoleName[]
  locale?: UiLocale
  password: string
  /** Checked on both sides: a mistyped password locks someone out of an
   *  account only a superadmin can rescue. */
  confirmPassword: string
}

/* ---------------- quiz ---------------- */

export type QuestionType = 'single' | 'multiple' | 'essay'

export interface QuizChoice {
  id?: number
  text: string
  /** Staff-only. The learner's side of the app never receives this. */
  isCorrect: boolean
}

export interface QuizQuestion {
  id: number
  type: QuestionType
  text: string
  imagePath: string | null
  maxLength: number
  attachmentAllowed: boolean
  sortOrder: number
  choices: (QuizChoice & { id: number; sortOrder: number })[]
}

export interface Quiz {
  id: number
  courseId: number
  lessonId: number | null
  title: string
  imagePath: string | null
  passPct: number
  timerMinutes: number | null
  questions: QuizQuestion[]
}

export interface QuizInput {
  title: string
  passPct: number
  timerMinutes?: number | null
  lessonId?: number | null
  imagePath?: string | null
}

export interface QuestionInput {
  type: QuestionType
  text: string
  imagePath?: string | null
  maxLength?: number
  attachmentAllowed?: boolean
  sortOrder?: number
  choices?: { text: string; isCorrect: boolean }[]
}

export const quiz = {
  get: (courseId: number) => send<{ data: Quiz | null }>(`/courses/${courseId}/quiz`),

  save: (courseId: number, body: QuizInput) =>
    send<{ data: Quiz }>(`/courses/${courseId}/quiz`, { method: 'PUT', body }),

  remove: (courseId: number) => send<void>(`/courses/${courseId}/quiz`, { method: 'DELETE' }),

  addQuestion: (courseId: number, body: QuestionInput) =>
    send<{ data: QuizQuestion }>(`/courses/${courseId}/quiz/questions`, { method: 'POST', body }),

  updateQuestion: (courseId: number, questionId: number, body: QuestionInput) =>
    send<{ data: QuizQuestion }>(`/courses/${courseId}/quiz/questions/${questionId}`, {
      method: 'PUT',
      body,
    }),

  deleteQuestion: (courseId: number, questionId: number) =>
    send<void>(`/courses/${courseId}/quiz/questions/${questionId}`, { method: 'DELETE' }),

  reorder: (courseId: number, ids: number[]) =>
    send<void>(`/courses/${courseId}/quiz/reorder`, { method: 'POST', body: { ids } }),
}

/* ---------------- essay review ---------------- */

export type EssayStatus = 'pending' | 'revision' | 'resubmitted' | 'passed'

export interface EssayQueueRow {
  id: number
  status: EssayStatus
  currentVersion: number
  submittedAt: string
  resolvedAt: string | null
  questionId: number
  questionText: string
  courseId: number
  courseTitle: string
  learnerId: number
  learnerName: string
  learnerEmail: string
}

export interface EssayVersion {
  id: number
  version: number
  body: string
  attachmentPath: string | null
  attachmentName: string | null
  sizeBytes: number | null
  submittedAt: string
}

export interface EssayReviewRow {
  id: number
  version: number
  result: 'passed' | 'revision'
  comment: string
  attachmentPath: string | null
  reviewedAt: string
  reviewerId: number | null
  reviewerName: string | null
}

export interface EssaySubmission extends EssayQueueRow {
  quizId: number
  maxLength: number
  attachmentAllowed: boolean
  versions: EssayVersion[]
  reviews: EssayReviewRow[]
}

export interface EssayQueueQuery extends Record<string, string | number | boolean | undefined> {
  page?: number
  perPage?: number
  status?: 'todo' | EssayStatus
  courseId?: number
  q?: string
}

export const essays = {
  queue: (query: EssayQueueQuery = {}) => send<Paged<EssayQueueRow>>('/essay-reviews', { query }),

  waiting: () => send<{ waiting: number }>('/essay-reviews/waiting'),

  one: (id: number) => send<{ data: EssaySubmission }>(`/essay-reviews/${id}`),

  review: (
    id: number,
    body: { result: 'passed' | 'revision'; comment: string; attachmentPath?: string | null },
  ) => send<{ data: EssaySubmission }>(`/essay-reviews/${id}`, { method: 'POST', body }),
}

export interface QuizOverviewRow {
  courseId: number
  courseTitle: string
  courseStatus: CourseStatus
  /** Null when that course has no quiz yet — the row worth seeing. */
  quizId: number | null
  title: string | null
  passPct: number | null
  timerMinutes: number | null
  lessonId: number | null
  questionCount: number
  essayCount: number
}

export interface QuizListQuery extends Record<string, string | number | boolean | undefined> {
  page?: number
  perPage?: number
  q?: string
  has?: 'with' | 'without'
}

export const quizzes = {
  list: (query: QuizListQuery = {}) => send<Paged<QuizOverviewRow>>('/quizzes', { query }),
}

/* ---------------- teacher profiles ---------------- */

export interface TeacherOption {
  id: number
  email: string
  firstName: string
  lastName: string
  avatarPath: string | null
  /** The display name when there is a profile, the account name otherwise. */
  name: string
  short: string
  headline: string | null
  languages: TaughtLanguage[] | null
  hasProfile: boolean
}

export interface TeacherProfile {
  userId: number
  displayName: string
  shortName: string
  slug: string
  headline: string | null
  bio: string | null
  languages: TaughtLanguage[] | null
  credentials: string | null
  yearsExperience: number | null
  listed: boolean
}

export interface TeacherProfileInput {
  displayName: string
  shortName: string
  slug: string
  headline?: string | null
  bio?: string | null
  languages?: TaughtLanguage[]
  credentials?: string | null
  yearsExperience?: number | null
  listed?: boolean
}

export const teachers = {
  /** Everyone who can be put on a course. */
  options: () => send<{ data: TeacherOption[] }>('/teachers'),

  profile: (userId: number) =>
    send<{ data: TeacherProfile | null }>(`/members/${userId}/teacher-profile`),

  saveProfile: (userId: number, body: TeacherProfileInput) =>
    send<{ data: TeacherProfile }>(`/members/${userId}/teacher-profile`, { method: 'PUT', body }),
}

/* ---------------- sales ---------------- */

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
export type PaymentMethod = 'card' | 'promptpay' | 'free'

export interface OrderRow {
  id: number
  orderNo: string
  userId: number
  email: string
  firstName: string
  lastName: string
  /** Every amount is satang. */
  subtotal: number
  courseDiscount: number
  orderDiscount: number
  vatAmount: number
  total: number
  currency: string
  status: OrderStatus
  paymentMethod: PaymentMethod | null
  provider: string
  providerRef: string | null
  paidAt: string | null
  createdAt: string
  itemCount: number
  /** The titles as they were sold, comma-separated. */
  itemSummary: string | null
}

export interface OrderItem {
  id: number
  courseId: number | null
  packageId: number | null
  titleSnapshot: string
  unitPrice: number
  discount: number
  couponId: number | null
  couponCode: string | null
  accessType: 'lifetime' | 'limited'
  accessDurationDays: number | null
}

export interface OrderDetail extends Omit<OrderRow, 'itemCount' | 'itemSummary' | 'email' | 'firstName' | 'lastName'> {
  /** The basket-wide coupon, if one was used. Per-line ones are on the items. */
  orderCouponCode: string | null
  /** The full tax invoice asked for with this order, if one was. A receipt
   *  calls itself a tax invoice only once a number has been allocated. */
  invoice: {
    type: 'corporate' | 'individual'
    name: string
    taxId: string
    branchType: 'head' | 'branch' | null
    branchCode: string | null
    address: string
    documentNo: string | null
    issuedAt: string | null
    status: 'issued' | 'processing'
  } | null
  buyer: {
    id: number
    email: string
    firstName: string
    lastName: string
    phoneCountryCode: string | null
    phoneNational: string | null
  } | null
  items: OrderItem[]
}

export interface OrderListQuery extends Record<string, string | number | boolean | undefined> {
  page?: number
  perPage?: number
  status?: OrderStatus
  method?: PaymentMethod
  q?: string
}

export const orders = {
  list: (query: OrderListQuery = {}) => send<Paged<OrderRow>>('/orders', { query }),

  get: (id: number) => send<{ data: OrderDetail }>(`/orders/${id}`),

  /**
   * Records a payment that arrived outside Stripe, and grants the access.
   * Superadmin only — the API refuses anybody else.
   */
  markPaid: (id: number, reason: string) =>
    send<{ data: OrderDetail }>(`/orders/${id}/mark-paid`, {
      method: 'POST',
      body: { reason },
    }),

  /** Takes the money back and revokes the access it granted. */
  refund: (id: number, reason?: string) =>
    send<{ data: OrderDetail }>(`/orders/${id}/refund`, {
      method: 'POST',
      body: reason ? { reason } : {},
    }),

  /**
   * Closes an order that was never paid.
   *
   * Only those: the API refuses a paid one, because flipping it to
   * "cancelled" would read like money returned while the learner kept the
   * course. Refunding is what undoes a payment, and it does all of it.
   */
  cancel: (id: number, reason: string) =>
    send<{ data: OrderDetail }>(`/orders/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
}

/** Whether it would work right now, as opposed to whether it is switched on. */
export type CouponStatus = 'live' | 'scheduled' | 'expired' | 'used_up' | 'off'

export interface Coupon {
  id: number
  code: string
  scope: 'course' | 'order'
  courseId: number | null
  courseTitle: string | null
  discountType: 'percent' | 'fixed'
  /** Whole percent, or satang for a fixed amount. */
  value: number
  maxDiscount: number | null
  minSubtotal: number | null
  startsAt: string | null
  expiresAt: string | null
  usageLimit: number | null
  usedCount: number
  active: boolean
  createdAt: string
  status: CouponStatus
  /** Satang given away so far. Absent on a single fetch. */
  discountGiven?: number
}

export interface CouponInput {
  code: string
  scope: 'course' | 'order'
  courseId: number | null
  discountType: 'percent' | 'fixed'
  value: number
  maxDiscount: number | null
  minSubtotal: number | null
  /** ISO, or null for no limit. */
  startsAt: string | null
  expiresAt: string | null
  usageLimit: number | null
  active: boolean
}

export interface CouponRedemption {
  id: number
  orderId: number
  orderNo: string
  orderStatus: OrderStatus
  userId: number
  email: string
  firstName: string
  lastName: string
  discountAmount: number
  redeemedAt: string
}

export interface CouponListQuery extends Record<string, string | number | boolean | undefined> {
  page?: number
  perPage?: number
  scope?: 'course' | 'order'
  status?: CouponStatus
  q?: string
}

export const coupons = {
  list: (query: CouponListQuery = {}) => send<Paged<Coupon>>('/coupons', { query }),

  get: (id: number) => send<{ data: Coupon }>(`/coupons/${id}`),

  redemptions: (id: number, query: { page?: number; perPage?: number } = {}) =>
    send<Paged<CouponRedemption>>(`/coupons/${id}/redemptions`, { query }),

  create: (body: CouponInput) => send<{ data: Coupon }>('/coupons', { method: 'POST', body }),

  update: (id: number, body: CouponInput) =>
    send<{ data: Coupon }>(`/coupons/${id}`, { method: 'PATCH', body }),

  remove: (id: number) => send<void>(`/coupons/${id}`, { method: 'DELETE' }),
}

/** Requested but not yet paid for, or issued with a document number. */
export type InvoiceStatus = 'requested' | 'issued'

export interface InvoiceRow {
  id: number
  orderId: number
  orderNo: string
  orderStatus: OrderStatus
  orderTotal: number
  orderVat: number
  paidAt: string | null
  type: 'corporate' | 'individual'
  /** The registered company name, or the person's full name. */
  name: string
  taxId: string
  branchType: 'head' | 'branch' | null
  branchCode: string | null
  /** Null until the order is paid. */
  documentNo: string | null
  issuedAt: string | null
  createdAt: string
  buyerEmail: string
}

export interface InvoiceDetail extends InvoiceRow {
  address: string
  buyerFirstName: string
  buyerLastName: string
}

export interface InvoiceInput {
  type: 'corporate' | 'individual'
  name: string
  taxId: string
  branchType: 'head' | 'branch' | null
  branchCode: string | null
  address: string
}

export interface InvoiceListQuery extends Record<string, string | number | boolean | undefined> {
  page?: number
  perPage?: number
  status?: InvoiceStatus
  type?: 'corporate' | 'individual'
  q?: string
}

export const invoices = {
  list: (query: InvoiceListQuery = {}) => send<Paged<InvoiceRow>>('/invoices', { query }),

  get: (id: number) => send<{ data: InvoiceDetail }>(`/invoices/${id}`),

  /** Allocates a document number by hand, for an order paid while something
   *  was wrong. Payment normally does this by itself. */
  issue: (id: number) => send<{ data: InvoiceDetail }>(`/invoices/${id}/issue`, { method: 'POST' }),

  /** Only possible while the number is still unspent. */
  amend: (id: number, body: InvoiceInput) =>
    send<{ data: InvoiceDetail }>(`/invoices/${id}`, { method: 'PATCH', body }),
}

/* ---------------- settings ---------------- */

export interface SiteSetting {
  key: string
  group: 'branding' | 'billing' | 'seller' | 'contact' | 'social' | 'sharing'
  label: string
  help?: string
  type: 'percent' | 'boolean' | 'email' | 'phone' | 'url' | 'image' | 'text' | 'multiline' | 'taxid'
  /** The widest a `percent` may be. VAT stops at 30; a teacher's share does
   *  not. Absent means the old limit. */
  max?: number
  /** False where nothing reads it yet, so the screen can say so. */
  live: boolean
  value: string
}

export interface VatPreview {
  percent: number
  inclusive: boolean
  /** All satang. */
  listed: number
  tax: number
  customerPays: number
}

export interface Branding {
  /** A stored path under `content/`, or null for the built-in logo. */
  logoPath: string | null
  logoIconPath: string | null
  /** The tab icon. Null until one is uploaded, which leaves the bundled one. */
  faviconPath: string | null
}

/** The school's own registered details, as printed at the top of a receipt. */
export interface Seller {
  name: string | null
  taxId: string | null
  branch: string | null
  address: string | null
  /** False until somebody fills them in, which leaves the block off the sheet
   *  rather than printing an issuer-shaped hole. */
  configured: boolean
}

export const settings = {
  list: () => send<{ data: SiteSetting[] }>('/settings'),

  /** The logo. Open to anyone, because the sign-in page wants it too. */
  branding: () => send<{ data: Branding }>('/settings/branding'),

  /** Who a receipt is from. Open for the same reason: a registered name and
   *  tax ID are published facts, printed on every document the school issues. */
  seller: () => send<{ data: Seller }>('/settings/seller'),

  /** Superadmin only. Sends just the keys that changed. */
  save: (changes: Record<string, string>) =>
    send<{ data: SiteSetting[] }>('/settings', { method: 'PUT', body: changes }),

  /** What the saved rules do to one price, worked out by the API so this
   *  screen cannot disagree with the checkout about the same sum. */
  vatPreview: (amount: number) =>
    send<{ data: VatPreview }>('/settings/vat-preview', { query: { amount } }),
}

/* ---------------- one member, behind tabs ---------------- */

export interface MemberSummary {
  activeCourses: number
  paidOrders: number
  /** Satang actually taken, refunds excluded. */
  lifetimeSpend: number
  essaysWaiting: number
}

export interface MemberCourseAccess {
  id: number
  courseId: number
  title: string
  slug: string
  source: string
  status: 'active' | 'revoked' | 'expired'
  grantedAt: string
  expiresAt: string | null
  /** True when `expiresAt` is in the past, worked out by the API. */
  expired: boolean
  orderId: number | null
  orderNo: string | null
  lessonsDone: number
  lessonsTotal: number
  lastWatchedAt: string | null
}

export interface MemberQuizAttempt {
  id: number
  quizId: number
  quizTitle: string
  courseId: number | null
  courseTitle: string | null
  attemptNo: number
  scorePct: number | null
  passed: boolean | null
  /** Whether it was submitted. An unfinished attempt has no score. */
  finished: boolean
  startedAt: string
  submittedAt: string | null
}

export interface MemberEssay {
  id: number
  quizId: number
  quizTitle: string
  courseId: number | null
  courseTitle: string | null
  questionId: number
  prompt: string
  status: string
  currentVersion: number
  submittedAt: string | null
  resolvedAt: string | null
}

export interface MemberLearning {
  attempts: MemberQuizAttempt[]
  essays: MemberEssay[]
  lastSeen: {
    courseId: number
    courseTitle: string
    lessonTitle: string | null
    lastWatchedAt: string | null
  } | null
}

export interface MemberOrder {
  id: number
  orderNo: string
  subtotal: number
  courseDiscount: number
  orderDiscount: number
  vatAmount: number
  total: number
  currency: string
  status: OrderStatus
  paymentMethod: PaymentMethod | null
  paidAt: string | null
  createdAt: string
  invoiceId: number | null
  invoiceDocumentNo: string | null
  itemSummary: string | null
}

export interface MemberPayments {
  orders: MemberOrder[]
  lifetimeSpend: number
}

/** The member's saved billing details — their current answer, not a document. */
export interface MemberBilling {
  userId: number
  type: 'corporate' | 'individual'
  name: string
  taxId: string
  branchType: 'head' | 'branch' | null
  branchCode: string | null
  address: string
  createdAt: string
  updatedAt: string
}

export const member = {
  detail: (id: number) => send<{ data: Member & { birthdate: string | null; phoneCountryCode: string | null; phoneNational: string | null; privacyAcceptedAt: string | null; updatedAt: string } }>(`/members/${id}`),

  summary: (id: number) => send<{ data: MemberSummary }>(`/members/${id}/summary`),

  courses: (id: number) => send<{ data: MemberCourseAccess[] }>(`/members/${id}/courses`),

  learning: (id: number) => send<{ data: MemberLearning }>(`/members/${id}/learning`),

  payments: (id: number) => send<{ data: MemberPayments }>(`/members/${id}/payments`),

  billing: (id: number) => send<{ data: MemberBilling | null }>(`/members/${id}/billing`),

  saveBilling: (id: number, body: InvoiceInput) =>
    send<{ data: MemberBilling }>(`/members/${id}/billing`, { method: 'PUT', body }),

  clearBilling: (id: number) => send<void>(`/members/${id}/billing`, { method: 'DELETE' }),

  /** Superadmin: ends or restores access to one course without a refund. */
  toggleAccess: (id: number, entitlementId: number) =>
    send<{ data: { courseTitle: string; was: string; now: string } }>(
      `/members/${id}/entitlements/${entitlementId}/toggle`,
      { method: 'POST' },
    ),

  /**
   * Superadmin: moves when access runs out, usually to hand back a few days.
   *
   * A date, or null for lifetime. Null is a real value here, not a blank —
   * which is why the caller sends it rather than leaving the field out.
   */
  setAccessExpiry: (id: number, entitlementId: number, expiresAt: string | null) =>
    send<{ data: { courseTitle: string; was: string | null; now: string | null; status: string } }>(
      `/members/${id}/entitlements/${entitlementId}`,
      { method: 'PATCH', body: { expiresAt } },
    ),
}

/* ---------------- dashboard ---------------- */

export interface DashboardData {
  /** Things sitting in somebody's queue right now. */
  waiting: {
    essays: number
    oldestEssayHours: number | null
    applications: number
    enquiries: number
    invoicesToIssue: number
    lessonQuestions: number
  }
  /** Things the admin can create that the public site cannot show. */
  problems: {
    coursesWithoutTeacher: number
    lessonsWithoutModule: number
    coursesWithoutLessons: number
    teachersWithoutProfile: number
  } | null
  counts: {
    students: number
    studentsThisMonth: number
    teachers: number
    publishedCourses: number
    draftCourses: number
    /** Satang. */
    revenueThisMonth: number
    revenueAllTime: number
    refundedAllTime: number
    ordersAwaitingPayment: number
    activeEnrolments: number
  } | null
  /**
   * The same counts, asked about one teacher's own classes.
   *
   * Null for an admin, who gets the school-wide `counts` instead. Exactly
   * one of the two is ever filled in.
   */
  teaching: {
    /** People. Somebody on two of your courses counts once. */
    learners: number
    learnersThisMonth: number
    /** Grants. The same person on two courses counts twice. */
    enrolments: number
    publishedCourses: number
    draftCourses: number
  } | null
  recentOrders: {
    id: number
    orderNo: string
    total: number
    status: OrderStatus
    createdAt: string
    firstName: string
    lastName: string
  }[]
  essayQueue: {
    id: number
    userId: number
    firstName: string
    lastName: string
    prompt: string
    courseId: number | null
    courseTitle: string | null
    status: string
    submittedAt: string | null
  }[]
}

export const dashboard = {
  load: () => send<{ data: DashboardData }>('/dashboard'),
}

/* ---------------- audit log ---------------- */

export interface AuditRow {
  id: number
  actorId: number | null
  actorRole: 'superadmin' | 'admin' | 'teacher' | 'student' | 'system'
  /** Copied in at the time, so it survives the account being deleted. */
  actorEmail: string | null
  action: string
  subjectType: string | null
  subjectId: number | null
  summary: string | null
  changes: Record<string, [unknown, unknown]> | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditFilters {
  actions: { action: string; count: number }[]
  actors: { id: number | null; email: string | null; role: string; count: number }[]
}

export interface AuditListQuery extends Record<string, string | number | boolean | undefined> {
  page?: number
  perPage?: number
  /** Action prefixes, comma separated. `coupon.` is every coupon change. */
  prefix?: string
  /** The inverse, for "everything except sign-ins". */
  notPrefix?: string
  actorId?: number
  subjectType?: string
  subjectId?: number
  q?: string
  since?: string
}

export const audit = {
  list: (query: AuditListQuery = {}) => send<Paged<AuditRow>>('/audit', { query }),

  filters: () => send<{ data: AuditFilters }>('/audit/filters'),

  /** Everything that has happened to one thing. */
  subject: (type: string, id: number) =>
    send<{ data: AuditRow[] }>(`/audit/subject/${type}/${id}`),
}

/* ---------------- your own account ---------------- */

export interface MyProfile extends Member {
  birthdate: string | null
  phoneCountryCode: string | null
  phoneNational: string | null
  privacyAcceptedAt: string | null
  updatedAt: string
}

export interface MyProfileInput {
  firstName: string
  lastName: string
  phoneCountryCode: string | null
  phoneNational: string | null
  locale: UiLocale
  /** Omit to leave the photo alone; null removes it. */
  avatarPath?: string | null
}

/** What a teacher may change about their own public page. The slug and whether
 *  they are listed are not theirs to set. */
export interface MyTeacherProfileInput {
  /** Their own web address. Changing it breaks links already shared. */
  slug?: string
  displayName: string
  shortName: string
  headline?: string | null
  bio?: string | null
  languages?: TaughtLanguage[]
  credentials?: string | null
  yearsExperience?: number | null
}

export const me = {
  profile: () => send<{ data: MyProfile }>('/me/profile'),

  save: (body: MyProfileInput) =>
    send<{ data: MyProfile }>('/me/profile', { method: 'PATCH', body }),

  /** Null when the signed-in person is not a teacher. */
  teacherProfile: () => send<{ data: TeacherProfile | null }>('/me/teacher-profile'),

  saveTeacherProfile: (body: MyTeacherProfileInput) =>
    send<{ data: TeacherProfile }>('/me/teacher-profile', { method: 'PUT', body }),

  payoutDetails: () => send<{ data: PayoutDetails }>('/me/payout-details'),

  savePayoutDetails: (body: PayoutDetailsInput) =>
    send<{ data: PayoutDetails }>('/me/payout-details', { method: 'PUT', body }),

  changePassword: (currentPassword: string, newPassword: string) =>
    send<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  sessions: () =>
    send<{ data: { id: number; deviceLabel: string | null; ip: string | null; createdAt: string; expiresAt: string; current: boolean }[] }>(
      '/auth/sessions',
    ),

  endSession: (id: number) => send<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),

  /** Signs out everywhere, including here. */
  endAllSessions: () => send<{ message: string }>('/auth/logout-all', { method: 'POST' }),
}

/* ---------------- the site's own content ---------------- */

/** The four languages, plus 'all' for an article shown in every one. */
export type PostLocale = ContentLocale

export interface Post {
  id: number
  title: string
  slug: string
  excerpt: string | null
  coverPath: string | null
  contentHtml?: string | null
  contentLocale: PostLocale
  status: 'draft' | 'published'
  categoryId: number | null
  categoryName?: string | null
  /** Stamped when it first went live, and never moved afterwards. */
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  authorId: number | null
  authorFirstName?: string | null
  authorLastName?: string | null
  /** The share overrides, read back so the form can show what is stored. */
  ogTitle?: string | null
  ogDescription?: string | null
  ogImagePath?: string | null
}

export interface PostInput {
  title: string
  slug: string
  excerpt: string | null
  coverPath: string | null
  contentHtml: string | null
  contentLocale: PostLocale
  status: 'draft' | 'published'
  /** One of the course categories, so an article and a course about the same
   *  subject can point at each other. Null when it fits nowhere. */
  categoryId: number | null
  /**
   * Who it is by — the name, headline and biography on the card at the end of
   * the article. Left out means the person creating it, or, on an edit,
   * whoever is already credited.
   */
  authorId?: number | null
  /**
   * How this looks when shared, where that should differ from the page —
   * a title that reads well on a page and badly in a chat window, or a
   * cover that is cropped to nonsense at 1200×630. Empty is normal.
   */
  ogTitle?: string | null
  ogDescription?: string | null
  ogImagePath?: string | null
}

export interface Testimonial {
  id: number
  name: string
  designation: string | null
  content: string
  rating: number
  avatarPath: string | null
  status: 'draft' | 'published'
  sortOrder: number
  createdAt: string
}

export type TestimonialInput = Omit<Testimonial, 'id' | 'createdAt'>

export interface ContactMessage {
  id: number
  name: string
  email: string
  subject: string
  message: string | null
  /** Set when somebody has dealt with it, and clearable again. */
  readAt: string | null
  createdAt: string
}

export interface Subscriber {
  id: number
  email: string
  confirmedAt: string | null
  unsubscribedAt: string | null
  createdAt: string
}

export const content = {
  posts: (query: Record<string, string | number | undefined> = {}) =>
    send<Paged<Post>>('/posts', { query }),
  post: (id: number) => send<{ data: Post }>(`/posts/${id}`),
  createPost: (body: PostInput) => send<{ data: Post }>('/posts', { method: 'POST', body }),
  updatePost: (id: number, body: PostInput) =>
    send<{ data: Post }>(`/posts/${id}`, { method: 'PUT', body }),
  deletePost: (id: number) => send<void>(`/posts/${id}`, { method: 'DELETE' }),

  testimonials: (query: Record<string, string | number | undefined> = {}) =>
    send<Paged<Testimonial>>('/testimonials', { query }),
  createTestimonial: (body: TestimonialInput) =>
    send<{ data: Testimonial }>('/testimonials', { method: 'POST', body }),
  updateTestimonial: (id: number, body: TestimonialInput) =>
    send<{ data: Testimonial }>(`/testimonials/${id}`, { method: 'PUT', body }),
  deleteTestimonial: (id: number) => send<void>(`/testimonials/${id}`, { method: 'DELETE' }),

  messages: (query: Record<string, string | number | boolean | undefined> = {}) =>
    send<Paged<ContactMessage> & { meta: { unread: number } }>('/contact-messages', { query }),
  setMessageRead: (id: number, read: boolean) =>
    send<{ data: ContactMessage }>(`/contact-messages/${id}/read`, { method: 'POST', body: { read } }),
  deleteMessage: (id: number) => send<void>(`/contact-messages/${id}`, { method: 'DELETE' }),

  subscribers: (query: Record<string, string | number | undefined> = {}) =>
    send<Paged<Subscriber> & { meta: { confirmed: number; pending: number; unsubscribed: number } }>(
      '/subscribers',
      { query },
    ),
  unsubscribe: (id: number) =>
    send<{ data: Subscriber }>(`/subscribers/${id}/unsubscribe`, { method: 'POST' }),
  /** The confirmed addresses as a file, for whoever sends the mail. */
  exportSubscribers: () => `${BASE}/subscribers/export`,
}

/* ---------------- quiz results ---------------- */

export interface QuizResultRow {
  quizId: number
  title: string
  courseId: number | null
  courseTitle: string | null
  passPct: number
  /** Finished attempts only — an unfinished one has no score. */
  attempts: number
  people: number
  passed: number
  averageScore: number | null
  lastAttemptAt: string | null
}

export interface QuizQuestionResult {
  id: number
  type: string
  text: string
  sortOrder: number
  answered: number
  wrong: number
  /** Null when nobody reached it. A high number usually means the question is
   *  badly worded rather than that the class cannot answer it. */
  wrongPct: number | null
}

export interface QuizResultDetail {
  quiz: {
    id: number
    title: string
    courseId: number | null
    courseTitle: string | null
    passPct: number
  }
  summary: { attempts: number; people: number; averageScore: number | null; passed: number }
  questions: QuizQuestionResult[]
  attempts: {
    id: number
    userId: number
    firstName: string
    lastName: string
    email: string
    attemptNo: number
    scorePct: number | null
    passed: boolean
    submittedAt: string | null
  }[]
}

export const quizResults = {
  list: () => send<{ data: QuizResultRow[] }>('/quiz-results'),
  get: (id: number) => send<{ data: QuizResultDetail }>(`/quiz-results/${id}`),
}

/* ---------------- who can open what ---------------- */

export interface AccessRow {
  id: number
  userId: number
  firstName: string
  lastName: string
  email: string
  courseId: number
  courseTitle: string
  source: string
  status: 'active' | 'revoked' | 'expired'
  grantedAt: string
  expiresAt: string | null
  expired: boolean
  orderNo: string | null
}

export interface AccessByCourse {
  courseId: number
  title: string
  active: number
  expired: number
  revoked: number
}

export const access = {
  list: (query: Record<string, string | number | undefined> = {}) =>
    send<Paged<AccessRow>>('/entitlements', { query }),
  byCourse: () => send<{ data: AccessByCourse[] }>('/entitlements/by-course'),
}

/* ---------------- lesson questions ---------------- */

export interface LessonQuestionReply {
  id: number
  parentId: number | null
  body: string
  createdAt: string
  isInstructor: boolean
  userId: number
  firstName: string
  lastName: string
}

export interface LessonQuestionRow {
  id: number
  body: string
  createdAt: string
  /** Stamped by the first reply, which is what drives the queue. */
  answeredAt: string | null
  userId: number
  firstName: string
  lastName: string
  courseId: number | null
  courseTitle: string | null
  lessonId: number | null
  lessonTitle: string | null
  replies: LessonQuestionReply[]
}

export const lessonQuestions = {
  list: (query: Record<string, string | number | boolean | undefined> = {}) =>
    send<Paged<LessonQuestionRow> & { meta: { unanswered: number } }>('/lesson-questions', { query }),

  answer: (id: number, body: string) =>
    send<{ data: { replyId: number; courseId: number | null } }>(
      `/lesson-questions/${id}/answer`,
      { method: 'POST', body: { body } },
    ),

  remove: (id: number) => send<void>(`/lesson-questions/${id}`, { method: 'DELETE' }),
}

/**
 * A permanent address for a picture inside a piece of writing.
 *
 * Everything in the store is reached through a signed URL that expires, which
 * is right for a lesson video and wrong for a picture written into an article:
 * the HTML is saved once and read for years. This address never changes, and
 * the API signs the real one when the browser follows it.
 *
 * Takes the path as the store returns it, with or without the storage root.
 */
export function mediaUrl(path: string): string {
  return `${BASE}/media/${path.replace(/^\/+/, '')}`
}

/* ---------------- the home page slideshow ---------------- */

/** Whether it would be on the site right now — not the same as `status`. */
export type HeroState = 'live' | 'scheduled' | 'finished' | 'draft'

/** A site language, or every one of them. */
export type HeroLocale = ContentLocale

export interface HeroSlide {
  id: number
  locale: HeroLocale
  eyebrow: string | null
  /** The headline is two lines by design; the second is styled differently. */
  titleA: string
  titleB: string | null
  subtitle: string | null
  imagePath: string | null
  imageAlt: string | null
  /** Percentages. Which part of the picture to keep when it is cropped. */
  focalX: number
  focalY: number
  ctaLabel: string | null
  ctaHref: string | null
  cta2Label: string | null
  cta2Href: string | null
  status: 'draft' | 'published'
  sortOrder: number
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
  state: HeroState
}

export type HeroSlideInput = Omit<
  HeroSlide,
  'id' | 'createdAt' | 'updatedAt' | 'state'
>

/** One step in the home page's "how learning works here" band. */
/** Which band at the foot of the home page. The same shape and the same
 *  screen; a journey step has a sentence under it, a chip does not. */
export type HomeBand = 'journey' | 'cta'

export interface JourneyStep {
  id: number
  band: HomeBand
  locale: UiLocale
  /** A name from the site's own icon set. The API refuses anything else, so
   *  the picker only ever offers what it will accept. */
  icon: string
  title: string
  text: string | null
  sortOrder: number
}

export interface JourneyStepInput {
  band: HomeBand
  locale: UiLocale
  icon: string
  title: string
  text: string | null
}

export interface JourneySection {
  band: HomeBand
  locale: UiLocale
  eyebrow: string | null
  heading: string
  intro: string | null
  ctaLabel: string | null
  ctaHref: string | null
  status: 'draft' | 'published'
  updatedAt: string | null
}

export type JourneySectionInput = Omit<JourneySection, 'band' | 'locale' | 'updatedAt'>

/**
 * The band on the home page, written per language.
 *
 * No 'all' language: every field is a sentence, and one sentence shared
 * across eight languages is a Thai paragraph on the Korean page.
 */
export const journey = {
  /** The heading and the steps for one language. Never 404s — a language
   *  nobody has written opens an empty form. */
  get: (band: HomeBand, locale: string) =>
    send<{ data: { section: JourneySection; steps: JourneyStep[] } }>('/journey', {
      query: { band, locale },
    }),

  /** How much is written in each language, for the picker. */
  summary: (band: HomeBand) =>
    send<{ data: { locale: UiLocale; status: string; heading: string; steps: number }[] }>(
      '/journey/summary',
      { query: { band } },
    ),

  /** Every icon the site can draw. Fetched rather than listed here, so the
   *  picker cannot offer one that renders as an empty circle. */
  icons: () => send<{ data: string[] }>('/journey/icons'),

  saveSection: (band: HomeBand, locale: string, body: JourneySectionInput) =>
    send<{ data: { section: JourneySection; steps: JourneyStep[] } }>(`/journey/${band}/${locale}`, {
      method: 'PUT',
      body,
    }),

  createStep: (body: JourneyStepInput) =>
    send<{ data: JourneyStep }>('/journey/steps', { method: 'POST', body }),

  updateStep: (id: number, body: JourneyStepInput) =>
    send<{ data: JourneyStep }>(`/journey/steps/${id}`, { method: 'PUT', body }),

  removeStep: (id: number) => send<void>(`/journey/steps/${id}`, { method: 'DELETE' }),

  /** The whole order for one language: moving one step moves several. */
  reorder: (band: HomeBand, locale: string, ids: number[]) =>
    send<{ data: JourneyStep[] }>('/journey/steps/order', {
      method: 'PUT',
      body: { band, locale, ids },
    }),
}

export const hero = {
  list: (locale?: string) =>
    send<{ data: HeroSlide[] }>('/hero-slides', { query: locale ? { locale } : {} }),

  create: (body: HeroSlideInput) => send<{ data: HeroSlide }>('/hero-slides', { method: 'POST', body }),

  update: (id: number, body: HeroSlideInput) =>
    send<{ data: HeroSlide }>(`/hero-slides/${id}`, { method: 'PUT', body }),

  remove: (id: number) => send<void>(`/hero-slides/${id}`, { method: 'DELETE' }),

  /** The whole order for one language, not a single move: dragging one slide
   *  changes the position of several. */
  reorder: (locale: string, ids: number[]) =>
    send<{ data: HeroSlide[] }>('/hero-slides/order', { method: 'PUT', body: { locale, ids } }),
}

/* ---------------- advertising ---------------- */

/** One key per reserved box on the public site. */
export const AD_PLACEMENTS = [
  'home-top',
  'home-bottom',
  'catalog-inline',
  'catalog-bottom',
  'course',
  'blog',
  'article',
  'account',
  'learn',
] as const
export type AdPlacement = (typeof AD_PLACEMENTS)[number]

export interface Ad {
  id: number
  name: string
  placement: AdPlacement
  advertiser: string | null
  href: string
  imageDesktopPath: string | null
  imageMobilePath: string | null
  imageAlt: string | null
  locale: ContentLocale
  status: 'draft' | 'published'
  startsAt: string | null
  endsAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type AdInput = Omit<Ad, 'id' | 'createdAt' | 'updatedAt'>

export const advertising = {
  list: (query: Record<string, string | number | boolean | undefined> = {}) =>
    send<Paged<Ad> & { live: Record<string, number> }>('/ads', { query }),

  get: (id: number) => send<{ data: Ad }>(`/ads/${id}`),

  create: (body: AdInput) => send<{ data: Ad }>('/ads', { method: 'POST', body }),

  update: (id: number, body: AdInput) =>
    send<{ data: Ad }>(`/ads/${id}`, { method: 'PUT', body }),

  remove: (id: number) => send<void>(`/ads/${id}`, { method: 'DELETE' }),
}

/* ---------------- what a teacher has earned ---------------- */

export interface EarningsSummary {
  /** Satang still inside the refund window. */
  pending: number
  /** Satang past it, waiting for a payout. */
  payable: number
  paidAllTime: number
  thisMonth: number
  /** The rates across their courses. Null when they teach none. */
  sharePctRange: { min: number; max: number } | null
}

export interface EarningRow {
  id: number
  kind: 'royalty' | 'refund' | 'adjustment' | string
  status: 'pending' | 'payable' | 'paid' | 'cancelled' | string
  courseId: number | null
  courseTitle: string | null
  orderNo: string
  /** Satang received for the line, after every discount. */
  gross: number
  vat: number
  /** gross − vat: what the share was taken from. */
  base: number
  sharePct: number
  /** Satang owed. Negative on a refund. */
  amount: number
  maturesAt: string | null
  paidAt: string | null
  createdAt: string
  note: string | null
}

export interface PayoutRow {
  userId: number
  name: string
  email: string
  payable: number
  pending: number
  lines: number
}

export const earnings = {
  /** Only ever the signed-in teacher's own. There is no id to pass. */
  mine: () =>
    send<{ data: { summary: EarningsSummary; lines: EarningRow[] } }>('/me/earnings'),

  payouts: () => send<{ data: PayoutRow[] }>('/earnings/payouts'),

  /** One teacher's bank details. A separate call because the server records
   *  every read of it, and that only means something when looking was a
   *  deliberate act rather than part of drawing a table. */
  payoutDetails: (userId: number) =>
    send<{ data: AdminPayoutDetails }>(`/earnings/payouts/${userId}/details`),

  /** The amount goes back for checking: a refund may have landed since the
   *  screen was drawn, and a stale figure is refused with a 409. */
  pay: (userId: number, amount: number, reference: string) =>
    send<{ data: { lines: number; amount: number } }>(`/earnings/payouts/${userId}`, {
      method: 'POST',
      body: { amount, reference },
    }),
}

/* ---------------- what happened while you were away ---------------- */

export interface AppNotification {
  id: number
  type: string
  surface: 'site' | 'admin'
  title: string
  body: string | null
  /** A path within this app, never a URL. */
  link: string | null
  readAt: string | null
  createdAt: string
}

/**
 * The admin asks for `admin` and only `admin`.
 *
 * A learner's receipt links into the public site, which this app cannot open;
 * mixing the two would fill the bell with dead ends.
 */
/** What the list says about itself. */
export interface NotificationPage {
  /** Unread in all, whatever this page is filtered to. */
  unread: number
  /** Matching the filter, which is a different number. */
  total: number
  page: number
  perPage: number
  totalPages: number
}

export const notifications = {
  list: (opts: { limit?: number; page?: number; unreadOnly?: boolean } = {}) => {
    const q = new URLSearchParams({
      surface: 'admin',
      limit: String(opts.limit ?? 20),
      page: String(opts.page ?? 1),
    })
    if (opts.unreadOnly) q.set('unreadOnly', 'true')
    return send<{ data: AppNotification[]; meta: NotificationPage }>(`/me/notifications?${q}`)
  },

  read: (id: number) => send<void>(`/me/notifications/${id}/read`, { method: 'POST', body: {} }),

  readAll: () =>
    send<{ data: { read: number } }>('/me/notifications/read-all', {
      method: 'POST',
      body: { surface: 'admin' },
    }),
}

/* ---------------- staff chat ---------------- */

export interface ChatThread {
  id: number
  /** Which side of the school this is. Learners and teachers never mix. */
  kind: 'teacher' | 'student'
  /** Null on a teacher's own thread: the other side is the school, not one
   *  person, so there is nobody to open a profile for. */
  withUserId: number | null
  name: string
  subtitle: string | null
  avatarPath: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  unread: number
}

export interface ChatMessage {
  id: number
  threadId: number
  userId: number | null
  name: string
  avatarPath: string | null
  /** Whether the signed-in reader wrote it, which decides the side and colour. */
  mine: boolean
  body: string | null
  attachment: { name: string; kind: 'image' | 'file'; sizeBytes: number | null } | null
  /** Relayed from a learner by an admin. The teacher is told this much and no
   *  more — never who asked. */
  forwarded: boolean
  /** Staff only: the learner's message this was relayed from. */
  forwardedFromId?: number | null
  createdAt: string
}

export const chat = {
  threads: () => send<{ data: ChatThread[] }>('/me/chats'),

  unreadCount: () => send<{ data: { unread: number } }>('/me/chats/unread-count'),

  /** A teacher sends nothing: the server gives them their own thread, which is
   *  the whole of the rule that they cannot choose who to write to. */
  open: (teacherId?: number) =>
    send<{ data: { id: number } }>('/me/chats', {
      method: 'POST',
      body: teacherId ? { teacherId } : {},
    }),

  messages: (threadId: number, opts: { before?: number; limit?: number } = {}) =>
    send<{ data: ChatMessage[]; meta: { hasMore: boolean } }>(`/me/chats/${threadId}/messages`, {
      query: { before: opts.before, limit: opts.limit ?? 40 },
    }),

  say: (
    threadId: number,
    body: {
      body?: string
      attachmentPath?: string
      attachmentName?: string
      attachmentKind?: 'image' | 'file'
      attachmentSize?: number
    },
  ) => send<{ data: ChatMessage }>(`/me/chats/${threadId}/messages`, { method: 'POST', body }),

  read: (threadId: number) => send<void>(`/me/chats/${threadId}/read`, { method: 'POST', body: {} }),

  /**
   * Passing a learner's question to a teacher.
   *
   * The only path between the two sides, and it runs through a person. What
   * arrives in the teacher's thread quotes the words and names nobody.
   */
  forward: (body: { messageId: number; teacherId: number; note?: string }) =>
    send<{ data: ChatMessage }>('/me/chats/forward', { method: 'POST', body }),

  /**
   * A short-lived link to one attachment, fetched and then put into `src`.
   *
   * Two steps rather than one because the access token lives in memory: an
   * `<img>` carries no Authorization header, so it cannot ask our API for the
   * file itself. It can load the store's signed URL, which needs none.
   */
  fileUrl: (threadId: number, messageId: number) =>
    send<{ data: { url: string; expiresIn: number } }>(
      `/me/chats/${threadId}/messages/${messageId}/file`,
    ),
}
