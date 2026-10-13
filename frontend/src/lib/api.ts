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

import { i18n } from '@/locales'

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
 * hold on to a token that has since been replaced.
 */
export function getAccessToken(): string | null {
  return accessToken
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
  locale: 'th' | 'en' | 'jp' | 'vn' | 'id' | 'zh' | 'ko' | 'tw'
  roles: ('admin' | 'teacher' | 'student')[]
  avatarPath: string | null
  /** Carried on the session so a form can fill it in — see `PublicUser` on the
   *  API side for why. */
  phoneCountryCode: string | null
  phoneNational: string | null
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

/** One renewal at a time, shared by everyone waiting on it. */
let renewal: Promise<boolean> | null = null

/**
 * Trades the refresh cookie for a new access token. Returns false rather than
 * throwing when there is no session: on first load that is the normal case,
 * not an error.
 *
 * Single-flight, and that is load-bearing rather than tidy. A page that starts
 * four requests at once gets four 401s at once, and without this each of them
 * posts its own `/auth/refresh` with the same cookie. The server rotates the
 * token on every one of those, so one browser ends up holding several live
 * sessions — the account settings screen then lists the same laptop four
 * times, and the replay check that rotation exists for stops meaning anything.
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

  /**
   * The devices currently signed in as this account.
   *
   * One of them is the browser asking — `current` says which, worked out from
   * the refresh cookie, so the settings page never offers to sign you out of
   * the session you are reading it in.
   */
  sessions: () => send<{ data: AccountSession[] }>('/auth/sessions'),

  /** Signs one device out. 204 whether or not that session was yours, so the
   *  reply cannot be used to find out which session ids exist. */
  revokeSession: (id: number) => send<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),

  /** Needs the current password, and signs every device out afterwards —
   *  including this one, which is the point of changing it. */
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    send<{ message: string }>('/auth/change-password', { method: 'POST', body }),

  /** Permission to upload one file into one folder, for a short while. The
   *  bytes go straight to the store; see `lib/upload.ts`. */
  uploadTicket: (body: {
    purpose: 'avatar' | 'chat-file' | 'application-resume' | 'application-video'
    threadId?: number
  }) =>
    send<{ data: UploadTicket }>('/uploads/ticket', { method: 'POST', body }),

  /**
   * Ties uploaded files to the application the caller has waiting.
   *
   * Each is left alone unless it is sent, so a video that failed to upload
   * cannot wipe the CV that went up a moment before it.
   */
  attachApplicationFiles: (body: { resumePath?: string; sampleVideoPath?: string }) =>
    send<{ data: { ok: true } }>('/me/application-files', { method: 'POST', body }),

  /**
   * Every category, flat.
   *
   * `totalCourseCount` is the published count in this reader's language —
   * which is what the card beside it links to — while `courseCount` is every
   * course filed there, drafts included.
   */
  categories: () =>
    send<{ data: PublicCategory[] }>(`/categories?all=1&locale=${readingLocale()}`),

  acceptPrivacy: () => send<{ user: SessionUser }>('/auth/accept-privacy', { method: 'POST', body: {} }),

  /**
   * Your own account record, in full.
   *
   * The session carries what every page needs — name, roles, photo — and this
   * carries the rest, such as the birthdate, which only the settings screen
   * asks about. Keeping it out of the session keeps it off every other
   * request.
   */
  myProfile: () => send<{ data: MyProfile }>('/me/profile'),

  /**
   * What you have agreed to be sent.
   *
   * Never 404: having touched none of the switches is the ordinary state and
   * it has an answer — no to the two we have to ask for, yes to the one about
   * access you paid for running out.
   */
  myConsents: () => send<{ data: Consents }>('/me/consents'),

  /** Only the switches sent are changed; the rest are left as they were. */
  saveMyConsents: (body: Partial<Omit<Consents, 'updatedAt'>>) =>
    send<{ data: Consents }>('/me/consents', { method: 'PUT', body }),


  /**
   * Your own account's details. The API takes the whole block, so a caller
   * changing one field sends the rest unchanged — `avatarPath` left out keeps
   * the photo, and sending null removes it.
   */
  updateProfile: (body: {
    firstName: string
    lastName: string
    phoneCountryCode?: string | null
    phoneNational?: string | null
    locale: 'th' | 'en' | 'jp' | 'vn' | 'id' | 'zh' | 'ko' | 'tw'
    avatarPath?: string | null
  }) => send<{ data: unknown }>('/me/profile', { method: 'PATCH', body }),

  /**
   * The catalog, in the language the site is being read in.
   *
   * Every list of courses on the public site is narrowed to what this reader
   * can take: the courses taught in their language, plus the ones a teacher
   * marked as suiting every language. The server adds `all` itself, so one
   * code is enough here.
   *
   * Added in the client rather than at each call because there are nine of
   * them — home rails, search, the basket's suggestions, the recommendations
   * on a course page — and a list that forgot would quietly offer somebody
   * courses taught in a language they do not read. A caller that genuinely
   * wants every language passes `locales` itself.
   *
   * `facets: true` adds the counts beside each filter option.
   */
  courses: (params: CourseQuery = {}) =>
    send<CourseListResponse>(
      `/courses${queryString({
        ...params,
        // An empty array counts as "not asked", not as "no languages": the
        // catalogue builds its query from the filter panel and sends `[]` for
        // every group nobody has touched.
        locales: params.locales?.length ? params.locales : ([readingLocale()] as ContentLocale[]),
      })}`,
    ),

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

  /* ---------------- buying ---------------- */

  /**
   * What a basket costs, without buying it.
   *
   * Every price, discount and total in the answer is worked out on the server.
   * Nothing here sends an amount, and nothing here should ever add one up —
   * the only thing stopping somebody paying ฿1 for a ฿1,900 course is that the
   * sum is not done in the browser.
   */
  quote: (lines: QuoteLine[], couponCode?: string) =>
    send<{ data: Quote }>('/checkout/quote', {
      method: 'POST',
      body: { lines, ...(couponCode ? { couponCode } : {}) },
    }),

  /**
   * Starts a payment, and returns where to send the buyer.
   *
   * `url` is null when the basket came to nothing: a free order is granted
   * outright rather than sent to a payment page for zero.
   */
  checkout: (input: CheckoutInput) =>
    send<{ data: { order: PublicOrder; url: string | null } }>('/checkout', {
      method: 'POST',
      body: input,
    }),

  /** One of the buyer's own orders, by the number support would ask for. */
  orderByNo: (orderNo: string) =>
    send<{ data: PublicOrder }>(`/orders/by-no/${encodeURIComponent(orderNo)}`),

  /* ---------------- the basket ---------------- */

  /**
   * Every call returns the whole basket, priced. One round trip per change,
   * and no chance of the browser's idea of it drifting from the server's.
   */
  cart: () => send<{ data: CartResponse }>('/cart'),

  /**
   * The courses this account may study, with how far through each it is.
   *
   * Built from entitlements rather than from orders, so a free enrolment, a
   * paid order and an order a superadmin marked paid by hand all appear here
   * the same way.
   */
  myCourses: () => send<{ data: MyCourseItem[] }>('/me/courses'),

  /**
   * This account's own orders, newest first.
   *
   * Failed and cancelled ones are included: the question people come to this
   * page with is usually whether they were charged.
   */
  myOrders: () => send<{ data: MyOrder[] }>('/me/orders'),

  /** Who receipts are from. Null throughout until an admin fills it in. */
  seller: () => send<{ data: Seller }>('/settings/seller'),

  /** The inside of a course, for the member entitled to it. 403 when they are
   *  not, which is what the player's locked state is drawn from. */
  studyCurriculum: (ref: string) =>
    send<{ data: StudyCurriculum }>(`/me/courses/${encodeURIComponent(ref)}/curriculum`),

  /** A URL that plays one lesson, for a few hours. Asked for as the lesson is
   *  opened, so a page left open is not holding a dozen live links. */
  playLesson: (lessonId: number) =>
    send<{ data: StudyPlayable }>(`/me/lessons/${lessonId}/play`),

  /* -------- the questions under a lesson -------- */

  /** Every question on the course, newest first. Asked from a lesson, read
   *  across the whole course. */
  courseQuestions: (ref: string) =>
    send<{ data: QaThread[] }>(`/me/courses/${encodeURIComponent(ref)}/questions`),

  /** The captcha token rides along with the text; see `lib/captcha.ts`. */
  askQuestion: (lessonId: number, body: string, captcha?: string) =>
    send<{ data: { id: number } }>(`/me/lessons/${lessonId}/questions`, {
      method: 'POST',
      body: { body, ...(captcha ? { captcha } : {}) },
    }),

  replyToQuestion: (questionId: number, body: string, captcha?: string) =>
    send<{ data: { id: number; answered: boolean } }>(`/me/questions/${questionId}/replies`, {
      method: 'POST',
      body: { body, ...(captcha ? { captcha } : {}) },
    }),

  /** One's own, under the same rule as deleting it: a question reworded under
   *  three answers leaves the answers talking about something else. */
  editQuestion: (postId: number, body: string, captcha?: string) =>
    send<{ data: { id: number; body: string } }>(`/me/questions/${postId}`, {
      method: 'PATCH',
      body: { body, ...(captcha ? { captcha } : {}) },
    }),

  /** One's own, and only while nothing has replied to it. */
  deleteQuestion: (postId: number) =>
    send<void>(`/me/questions/${postId}`, { method: 'DELETE' }),

  /* -------- the course's test -------- */

  /** The paper, with no answer key on it — see the API side for why that is a
   *  rule rather than an omission. */
  quizPaper: (ref: string) =>
    send<{ data: QuizPaper }>(`/me/courses/${encodeURIComponent(ref)}/quiz`),

  /** Starts one, or carries on with the attempt already open. */
  startAttempt: (ref: string) =>
    send<{ data: QuizAttemptStart }>(`/me/courses/${encodeURIComponent(ref)}/quiz/attempts`, {
      method: 'POST',
      body: {},
    }),

  saveQuizDraft: (attemptId: number, answers: Record<string, number[]>) =>
    send<{ data: { attemptId: number } }>(`/me/quiz-attempts/${attemptId}/draft`, {
      method: 'PUT',
      body: { answers },
    }),

  submitQuiz: (attemptId: number, answers: Record<string, number[]>) =>
    send<{ data: QuizMarked }>(`/me/quiz-attempts/${attemptId}/submit`, {
      method: 'POST',
      body: { answers },
    }),

  submitEssay: (
    questionId: number,
    body: { body: string; attachmentPath?: string | null; attachmentName?: string | null; sizeBytes?: number | null },
  ) =>
    send<{ data: { submissionId: number; version: number; status: string } }>(
      `/me/quiz-questions/${questionId}/essay`,
      { method: 'POST', body },
    ),

  quizResult: (ref: string) =>
    send<{ data: QuizResult }>(`/me/courses/${encodeURIComponent(ref)}/result`),

  /** A signed link to one of the course's handouts, fetched as it is clicked:
   *  the links expire, and a page left open should not be holding them. */
  documentLink: (documentId: number) =>
    send<{ data: { id: number; fileName: string; url: string } }>(
      `/me/documents/${documentId}/link`,
    ),

  /** How far through a lesson they are. Sent every few seconds while playing;
   *  the server decides what counts as finished. */
  saveProgress: (lessonId: number, body: { positionSeconds: number; completed?: boolean }) =>
    send<{ data: StudyProgressSaved }>(`/me/lessons/${lessonId}/progress`, {
      method: 'PUT',
      body,
    }),

  /**
   * Where this member's tax invoices go, so the checkout asks once rather than
   * every time. Null when nothing is saved, which is the ordinary case.
   */
  myBilling: () => send<{ data: MemberBilling | null }>('/me/billing'),

  saveMyBilling: (body: InvoiceRequest) =>
    send<{ data: MemberBilling }>('/me/billing', { method: 'PUT', body }),

  forgetMyBilling: () => send<void>('/me/billing', { method: 'DELETE' }),

  addToCart: (courseId: number) =>
    send<{ data: CartResponse }>('/cart/items', { method: 'POST', body: { courseId } }),

  removeFromCart: (courseId: number) =>
    send<{ data: CartResponse }>(`/cart/items/${courseId}`, { method: 'DELETE' }),

  selectInCart: (courseId: number, selected: boolean) =>
    send<{ data: CartResponse }>(`/cart/items/${courseId}`, {
      method: 'PATCH',
      body: { selected },
    }),

  selectAllInCart: (selected: boolean) =>
    send<{ data: CartResponse }>('/cart', { method: 'PATCH', body: { selected } }),
}

export interface CartResponse {
  items: { courseId: number; selected: boolean; addedAt: string }[]
  /** Covers the ticked rows only — an unticked course stays in the basket and
   *  out of the total. Null when nothing is ticked. */
  quote: Quote | null
  /**
   * Why there is no total, when there is none and there should be — a basket
   * filled before courses could be priced in different currencies may still
   * hold two, and it has to open so the row can be taken out.
   */
  problem: string | null
  alreadyOwned: number[]
}

/* ---------------- buying ---------------- */

export interface QuoteLine {
  kind: 'course' | 'package'
  id: number
  /** A coupon that applies to this line only. */
  couponCode?: string
}

/** Money is satang throughout, as it is in the database. */
export interface QuotedLine {
  kind: 'course' | 'package'
  id: number
  title: string
  unitPrice: number
  discount: number
  couponId: number | null
  accessType: 'lifetime' | 'limited'
  accessDurationDays: number | null
}

export interface Quote {
  lines: QuotedLine[]
  subtotal: number
  courseDiscount: number
  orderDiscount: number
  orderCouponId: number | null
  vatAmount: number
  /**
   * Whether that VAT is already inside `total` or was added to it. The school
   * sets which, and a summary that does not say reads as a charge added on
   * where the price was tax-inclusive all along.
   */
  vatInclusive: boolean
  total: number
  currency: string
  /** Course ids the buyer already has access to. Worth saying before they pay
   *  twice for the same thing. */
  alreadyOwned: number[]
}

export interface InvoiceRequest {
  type: 'corporate' | 'individual'
  name: string
  taxId: string
  branchType?: 'head' | 'branch' | null
  branchCode?: string | null
  address: string
}

/** The saved version of the above, as the account holds it. */
export interface MemberBilling extends InvoiceRequest {
  userId: number
  updatedAt: string
}

export interface CheckoutInput {
  lines: QuoteLine[]
  couponCode?: string
  method: 'card' | 'promptpay'
  invoice?: InvoiceRequest | null
}

export interface PublicOrder {
  id: number
  orderNo: string
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
  paymentMethod: 'card' | 'promptpay' | 'free' | null
  subtotal: number
  courseDiscount: number
  orderDiscount: number
  vatAmount: number
  total: number
  currency: string
  paidAt: string | null
  createdAt: string
  items: {
    id: number
    courseId: number | null
    packageId: number | null
    /** Frozen at purchase time, so a later edit to the course never changes
     *  what somebody bought or what their receipt says. */
    titleSnapshot: string
    unitPrice: number
    discount: number
    accessType: string
    accessDurationDays: number | null
  }[]
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
  contentLocale: ContentLocaleOrAll
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
  /** The canonical name, in the language the admin filed it under. */
  name: string
  /**
   * The same name in each language that has one, keyed by locale — and always
   * including the canonical one, so a lookup by locale either finds a
   * translation or falls back without the caller having to know which.
   */
  names: Record<string, string>
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
export type ContentLocale = 'th' | 'en' | 'jp' | 'vn' | 'id' | 'zh' | 'ko' | 'tw'
/**
 * A course or an article may also belong to every language rather than one.
 * The catalogue's language filter still offers only the four — a course marked
 * 'all' answers to all of them — so this appears on what comes back, never on
 * what is asked for.
 */
export type ContentLocaleOrAll = ContentLocale | 'all'
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
  contentLocale: ContentLocaleOrAll
  price: number
  /** What the price is in. Buyers are charged this, never a conversion — a
   *  card that assumed baht would write the right number under the wrong
   *  currency's symbol. */
  currency: string
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
/** One row of "My courses". The course inside it is the ordinary card shape,
 *  so `courseView()` draws it like any other. */
export interface MyCourseItem {
  entitlementId: number
  source: 'purchase' | 'subscription' | 'free' | 'manual' | string
  grantedAt: string
  /** Null means lifetime. */
  expiresAt: string | null
  /** Why this cannot be studied, or null when it can. */
  blocked: 'expired' | 'ended' | null
  group: 'in-progress' | 'not-started' | 'completed' | 'expired'
  progress: {
    done: number
    total: number
    pct: number
    resume: { id: number; title: string; type: string } | null
    lastStudiedAt: string | null
  }
  /** Null when the course has no test at all. */
  quiz: { exists: boolean; passed: boolean; scorePct: number | null } | null
  course: PublicCourse
}


/** What a member has agreed to be sent. */
export interface Consents {
  /** The newsletter. Off until asked for. */
  news: boolean
  /** An announcement when a course opens. Off until asked for. */
  newCourses: boolean
  /** A warning before access runs out. On by default: it is about their own
   *  purchase, not ours. */
  expiryAlert: boolean
  /** Null until they have touched a switch. */
  updatedAt: string | null
}

/** The whole of your own account row, less the password. */
export interface MyProfile extends SessionUser {
  /** Gregorian `YYYY-MM-DD`. The Buddhist year is a display concern. */
  birthdate: string | null
  status: 'active' | 'suspended'
  createdAt: string
  updatedAt: string
}

/** One browser or app currently signed in as this account. */
export interface AccountSession {
  id: number
  /** What the browser called itself when it signed in. Null on an old one. */
  deviceLabel: string | null
  ip: string | null
  createdAt: string
  expiresAt: string
  /** The session reading this page. It is never offered a sign-out button. */
  current: boolean
}

/** Permission to write one file into one folder of the store, for a few
 *  minutes. The ticket goes to the store, never back to our API. */
export interface UploadTicket {
  ticket: string
  expiresAt: string
  /** The store's own origin. Not this API: the bytes go straight there. */
  baseUrl: string
  folder: string
  maxSize: number
}

/* ---------------- what this account has bought ---------------- */

/** Who a receipt is from: the school's own registered details. */
export interface Seller {
  name: string | null
  taxId: string | null
  branch: string | null
  address: string | null
  /** False until an admin has filled in at least the registered name. */
  configured: boolean
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
export type PaymentMethod = 'card' | 'promptpay' | 'free'

/**
 * One line of an order.
 *
 * `title`, `unitPrice` and `discount` are frozen at purchase; the course may
 * since have been renamed, repriced or withdrawn, and none of that may change
 * what a receipt says. `slug`, the picture and the category are current, which
 * is what makes the row linkable — and all three are null once the course is
 * gone.
 */
export interface MyOrderItem {
  id: number
  kind: 'course' | 'package'
  courseId: number | null
  packageId: number | null
  slug: string | null
  title: string
  /** Only when the course has been renamed since. */
  titleNow: string | null
  thumbnailPath: string | null
  categoryId: number | null
  categoryName: string | null
  categoryIcon: string | null
  unitPrice: number
  discount: number
  net: number
  couponCode: string | null
  accessType: string
  accessDurationDays: number | null
}

export interface MyOrder {
  id: number
  orderNo: string
  status: OrderStatus | string
  method: PaymentMethod | string | null
  createdAt: string
  paidAt: string | null
  subtotal: number
  courseDiscount: number
  orderDiscount: number
  vatAmount: number
  total: number
  currency: string
  orderCouponCode: string | null
  items: MyOrderItem[]
  /** The tax invoice asked for with this order, when one was. */
  invoice: {
    type: 'individual' | 'corporate' | string
    name: string
    documentNo: string | null
    issuedAt: string | null
    status: 'issued' | 'processing'
  } | null
}

/* ---------------- studying a course you own ---------------- */

export interface StudyLesson {
  id: number
  moduleId: number | null
  type: 'video' | 'document' | 'quiz'
  title: string
  subtitle: string | null
  description: string | null
  durationSeconds: number
  isPreview: boolean
  /** Whether a file exists behind it. Where it is kept never leaves the API. */
  hasVideo: boolean
  hasDocument: boolean
  progress: {
    lastPositionSeconds: number
    maxPositionSeconds: number
    completedAt: string | null
    lastWatchedAt: string | null
  }
}

export interface StudyCurriculum {
  course: {
    id: number
    title: string
    slug: string
    shortDesc: string | null
    thumbnailPath: string | null
    contentLocale: ContentLocaleOrAll
    level: string | null
    durationSeconds: number
  }
  modules: { id: number; title: string; sortOrder: number; lessons: StudyLesson[] }[]
  /** Lessons hung on the course rather than on a module. */
  loose: StudyLesson[]
  documents: { id: number; fileName: string; sizeBytes: number | null }[]
  progress: { done: number; total: number; pct: number }
  resumeLessonId: number | null
}

export interface QaPost {
  id: number
  body: string
  createdAt: string
  author: { id: number; name: string; avatarPath: string | null; isInstructor: boolean }
  /** The signed-in reader's own post. */
  mine: boolean
  /** Their own, and nothing hanging off it. */
  canDelete: boolean
}

export interface QaThread extends QaPost {
  /** Set when a teacher has answered. A classmate's reply does not set it. */
  answeredAt: string | null
  /** The lesson it was asked from, for the line above the question. */
  lesson: { id: number; title: string } | null
  /** Answers that go with it if it is withdrawn. */
  replyCount: number
  replies: QaPost[]
}

export interface QuizPaperQuestion {
  id: number
  type: 'single' | 'multiple' | 'essay'
  text: string
  imageUrl: string | null
  maxLength: number
  attachmentAllowed: boolean
  /** Text and id only. Which one is right never leaves the server. */
  choices: { id: number; text: string }[]
}

export interface QuizPaper {
  quiz: {
    id: number
    courseId: number
    lessonId: number | null
    title: string
    imageUrl: string | null
    passPct: number
    timerMinutes: number | null
    choiceCount: number
    essayCount: number
  }
  questions: QuizPaperQuestion[]
}

export interface QuizAttemptStart {
  attemptId: number
  attemptNo: number
  startedAt: string
  /** Question id to the choice ids ticked, as last autosaved. */
  draft: Record<string, number[]>
  resumed: boolean
}

export interface QuizMarked {
  attemptId: number
  attemptNo: number
  scorePct: number
  passed: boolean
  passPct: number
  answered: number
  correct: number
}

export interface QuizEssayResult {
  questionId: number
  questionText: string
  status: 'pending' | 'resubmitted' | 'revision' | 'passed' | string
  version: number
  submittedAt: string
  body: string
  attachment: { name: string | null; url: string | null } | null
  reviews: {
    version: number
    result: 'passed' | 'revision'
    comment: string
    reviewer: string | null
    reviewedAt: string
    attachmentUrl: string | null
  }[]
}

export interface QuizResult {
  quiz: { id: number; title: string; passPct: number; choiceCount: number; essayCount: number }
  latest: {
    attemptId: number
    attemptNo: number
    scorePct: number
    passed: boolean
    submittedAt: string
  } | null
  bestPct: number | null
  attempts: { attemptNo: number; scorePct: number; passed: boolean; submittedAt: string }[]
  essays: QuizEssayResult[]
  /** Choices passed and nothing written still waiting. */
  completed: boolean
}

export interface StudyPlayable {
  lessonId: number
  courseId: number
  type: 'video' | 'document' | 'quiz'
  /** Signed and short-lived. Never stored, always asked for again. */
  url: string
  expiresIn: number
  durationSeconds: number
  lastPositionSeconds: number
  maxPositionSeconds: number
  completedAt: string | null
}

export interface StudyProgressSaved {
  lessonId: number
  courseId: number
  lastPositionSeconds: number
  maxPositionSeconds: number
  completedAt: string | null
  course: { done: number; total: number; pct: number }
}

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
/**
 * The language the site is being read in, for the calls that are narrowed by
 * it.
 *
 * Read from i18n at call time rather than held: the router sets it on every
 * navigation, and a value captured at module load would be whatever was stored
 * before the address was looked at.
 */
function readingLocale(): string {
  return String(i18n.global.locale.value ?? 'th')
}

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

/** One step in the home page's "how learning works here" band. */
export interface JourneyStep {
  id: number
  /** A name from the site's own icon set; the API refuses anything else. */
  icon: string
  title: string
  text: string | null
}

export interface JourneyBand {
  eyebrow: string | null
  heading: string
  intro: string | null
  ctaLabel: string | null
  ctaHref: string | null
  steps: JourneyStep[]
}

/**
 * The band for one language, or null when nobody has written it.
 *
 * Null rather than a fallback to another language: every field is a sentence,
 * and a Thai paragraph under a Korean heading is worse than no band at all.
 */
/** Which band at the foot of the home page: the numbered journey, or the
 *  closing call to action. Same shape, same screen in the admin. */
export type HomeBandName = 'journey' | 'cta'

export function journey(
  locale: string,
  band: HomeBandName = 'journey',
): Promise<{ data: JourneyBand | null }> {
  return send<{ data: JourneyBand | null }>(
    `/journey/public?band=${band}&locale=${encodeURIComponent(locale)}`,
  )
}

export interface Branding {
  /** A stored path under `content/`, or null for the built-in logo. */
  logoPath: string | null
  logoIconPath: string | null
  /** The tab icon. Null until one is uploaded, which leaves the bundled one. */
  faviconPath: string | null
}

/** The school's logo. Open to anyone, because it is wanted before anybody has
 *  signed in. */
export function branding(): Promise<{ data: Branding }> {
  return send<{ data: Branding }>('/settings/branding')
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
 * Notifications are kept per app.
 *
 * The public site asks for `site` and the admin for `admin`, because a link
 * into the other one leads somewhere this app cannot open — and a learner has
 * no business seeing a teacher's queue in their bell.
 */
/** What the list says about itself: the badge, and where this page sits. */
export interface NotificationPage {
  /** Unread in all, whatever this page is filtered to. */
  unread: number
  /** Matching the filter, which is not the same number. */
  total: number
  page: number
  perPage: number
  totalPages: number
}

export const notifications = {
  list: (opts: { unreadOnly?: boolean; limit?: number; page?: number } = {}) =>
    send<{ data: AppNotification[]; meta: NotificationPage }>(
      `/me/notifications${queryString({ surface: 'site', ...opts })}`,
    ),

  unreadCount: () =>
    send<{ data: { unread: number } }>('/me/notifications/unread-count?surface=site'),

  read: (id: number) => send<void>(`/me/notifications/${id}/read`, { method: 'POST', body: {} }),

  readAll: () =>
    send<{ data: { read: number } }>('/me/notifications/read-all', {
      method: 'POST',
      body: { surface: 'site' },
    }),
}

/* ---------------- talking to the school ---------------- */

/**
 * A learner's one conversation.
 *
 * With the school, never with a teacher. A question reaches the person who
 * teaches the course only if an admin decides to pass it on, and what travels
 * is the question without the asker — so a mark cannot be traded for an
 * answer, and a teacher cannot be worn down privately by whoever is loudest.
 */
export interface ChatThread {
  id: number
  kind: 'teacher' | 'student'
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
  /** Whether this reader wrote it, which decides the side and the colour. */
  mine: boolean
  body: string | null
  attachment: { name: string; kind: 'image' | 'file'; sizeBytes: number | null } | null
  forwarded: boolean
  createdAt: string
}

export const chat = {
  /** Made on first use, so asking for it is how a learner starts. */
  open: () => send<{ data: { id: number } }>('/me/chats', { method: 'POST', body: {} }),

  threads: () => send<{ data: ChatThread[] }>('/me/chats'),

  unreadCount: () => send<{ data: { unread: number } }>('/me/chats/unread-count'),

  messages: (threadId: number, opts: { before?: number; limit?: number } = {}) =>
    send<{ data: ChatMessage[]; meta: { hasMore: boolean } }>(
      `/me/chats/${threadId}/messages${queryString({ limit: 40, ...opts })}`,
    ),

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
   * A short-lived link to one attachment, fetched and then put into `src`.
   *
   * Two steps because the access token lives in memory: an `<img>` carries no
   * Authorization header, so it cannot ask our API for the file itself. It can
   * load the store's signed URL, which needs none.
   */
  fileUrl: (threadId: number, messageId: number) =>
    send<{ data: { url: string; expiresIn: number } }>(
      `/me/chats/${threadId}/messages/${messageId}/file`,
    ),
}
