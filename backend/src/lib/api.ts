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

export type UploadPurpose =
  | 'course-thumbnail'
  | 'course-video'
  | 'course-document'
  | 'avatar'
  /** A picture dropped into an article or a course description. Filed by month,
   *  and the one folder served without a signature. */
  | 'content-image'

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
  locale?: 'th' | 'en' | 'jp' | 'vn'
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
  languages: ('th' | 'en' | 'jp' | 'vn')[] | null
  hasProfile: boolean
}

export interface TeacherProfile {
  userId: number
  displayName: string
  shortName: string
  slug: string
  headline: string | null
  bio: string | null
  languages: ('th' | 'en' | 'jp' | 'vn')[] | null
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
  languages?: ('th' | 'en' | 'jp' | 'vn')[]
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

  /** Takes the money back and revokes the access it granted. */
  refund: (id: number, reason?: string) =>
    send<{ data: OrderDetail }>(`/orders/${id}/refund`, {
      method: 'POST',
      body: reason ? { reason } : {},
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
  group: 'billing' | 'contact' | 'social'
  label: string
  help?: string
  type: 'percent' | 'boolean' | 'email' | 'phone' | 'url'
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

export const settings = {
  list: () => send<{ data: SiteSetting[] }>('/settings'),

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
  locale: 'th' | 'en' | 'jp' | 'vn'
  /** Omit to leave the photo alone; null removes it. */
  avatarPath?: string | null
}

/** What a teacher may change about their own public page. The slug and whether
 *  they are listed are not theirs to set. */
export interface MyTeacherProfileInput {
  displayName: string
  shortName: string
  headline?: string | null
  bio?: string | null
  languages?: ('th' | 'en' | 'jp' | 'vn')[]
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

export interface Post {
  id: number
  title: string
  slug: string
  excerpt: string | null
  coverPath: string | null
  contentHtml?: string | null
  contentLocale: 'th' | 'en' | 'jp' | 'vn'
  status: 'draft' | 'published'
  /** Stamped when it first went live, and never moved afterwards. */
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  authorId: number | null
  authorFirstName?: string | null
  authorLastName?: string | null
}

export interface PostInput {
  title: string
  slug: string
  excerpt: string | null
  coverPath: string | null
  contentHtml: string | null
  contentLocale: 'th' | 'en' | 'jp' | 'vn'
  status: 'draft' | 'published'
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
