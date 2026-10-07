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

export interface SessionUser {
  id: number
  email: string
  firstName: string
  lastName: string
  locale: 'th' | 'en' | 'jp' | 'vn'
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

  uploadTicket: (body: { purpose: UploadPurpose; courseId?: number }) =>
    send<{ data: UploadTicket }>('/uploads/ticket', { method: 'POST', body }),

  signPath: (path: string, ttl?: number) =>
    send<{ data: { url: string } }>('/uploads/sign', { method: 'POST', body: { path, ttl } }),

  reorder: (courseId: number, what: 'modules' | 'lessons', ids: number[]) =>
    send<void>(`/courses/${courseId}/reorder/${what}`, { method: 'POST', body: { ids } }),
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

export interface Category {
  id: number
  parentId: number | null
  name: string
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
  normalPrice: number | null
  status: CourseStatus
  sellable: boolean
  featured: boolean
  durationSeconds: number
  publishedAt: string | null
  createdAt: string
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
  contentLocale?: 'th' | 'en' | 'jp' | 'vn'
  price?: number
  normalPrice?: number | null
  accessType?: 'lifetime' | 'limited'
  accessDurationDays?: number | null
  status?: CourseStatus
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
  instructors?: { id: number; firstName: string; lastName: string; avatarPath: string | null }[]
}

export type UploadPurpose = 'course-thumbnail' | 'course-video' | 'course-document' | 'avatar'

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

  create: (body: CreateMemberInput) =>
    send<{ data: Member; inviteUrl: string | null }>('/members', { method: 'POST', body }),

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
  locale?: 'th' | 'en' | 'jp' | 'vn'
  /** False returns the set-password link instead of emailing it. */
  sendInvite?: boolean
  /** Set one and the account works immediately, with no link involved. */
  password?: string
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
  passPct: number
  timerMinutes: number | null
  questions: QuizQuestion[]
}

export interface QuizInput {
  title: string
  passPct: number
  timerMinutes?: number | null
  lessonId?: number | null
}

export interface QuestionInput {
  type: QuestionType
  text: string
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
