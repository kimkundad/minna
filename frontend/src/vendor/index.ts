/**
 * The prototype's data and business rules, vendored unchanged.
 *
 * icons.js, data.js and store.js come from the READ VPN prototype
 * (ideavivat/Frontend-Readvpn) and are kept byte-for-byte so the behaviour the
 * design was built around survives the port. store.js is the specification we
 * agreed to follow — the nine-state CTA machine, the two expiry types, coupon
 * stacking, how progress is counted — and rewriting it by hand would only
 * introduce drift.
 *
 * They are plain scripts that hang everything off `window.RV`, so this module
 * imports them for their side effects, in dependency order, and hands back a
 * typed view of the result.
 *
 * When the API is ready, the calls inside this module's wrappers change and the
 * components above it do not.
 */
import './icons.js'
import './data.js'
import './store.js'

export interface IconOptions {
  size?: number
  stroke?: number
  label?: string
  cls?: string
}

export interface CategoryRecord {
  id: string
  /** English name, shown as the tile's heading. */
  name: string
  /** Thai name, shown underneath it. */
  th: string
  icon: string
  palette?: number
}

export interface RvData {
  categories: CategoryRecord[]
  courses: Record<string, unknown>[]
  instructors: Record<string, unknown>[]
  packages: Record<string, unknown>[]
  articles: Record<string, unknown>[]
  heroSlides: Record<string, unknown>[]
  journey: Record<string, unknown>[]
  levels: Record<string, string>
  memberPhoto: string
  [key: string]: unknown
}

export interface RvGlobal {
  icon: (name: string, opts?: IconOptions) => string
  data: RvData
  store: Record<string, (...args: never[]) => unknown>
  courseView: (courseId: string) => CourseView
}

/** What `store.courseView(id)` returns: the single source for every CTA,
 *  badge and lock decision on a course card or detail page. */
export interface CourseView {
  state:
    | 'ended'
    | 'access-expired'
    | 'pkg-expired'
    | 'guest'
    | 'free-available'
    | 'buy'
    | 'completed'
    | 'result-pending'
    | 'in-progress'
    | 'not-started'
  primary: CtaAction
  secondary?: CtaAction | null
  tertiary?: CtaAction | null
  badges: BadgeSpec[]
  lock?: { type: string; title: string; text: string } | null
  note?: string | null
  showPrice: boolean
  showProgress: boolean
  access: { has: boolean; source?: string; ent?: Record<string, unknown>; renewed?: boolean }
  progress: {
    pct: number
    done: number
    total: number
    started: boolean
    lessonsDone: boolean
    resume?: { id: string; title: string; type: string } | null
    activityAt?: string | null
  }
  quiz: {
    attempts: number
    choicePassed: boolean
    essayStatus: 'none' | 'pending' | 'revision' | 'resubmitted' | 'passed'
    completed: boolean
  }
  cert?: unknown
}

export interface CtaAction {
  /** Dispatch key handled by the page, e.g. 'buy' or 'add-cart'. */
  act?: string
  action?: string
  label: string
  icon?: string
  /** Button style: primary, secondary, ghost or danger. */
  variant?: string
  kind?: string
  href?: string
  disabled?: boolean
}

export interface BadgeSpec {
  kind: string
  text: string
  icon?: string
}

const rv = (globalThis as unknown as { RV: RvGlobal }).RV

if (!rv?.icon || !rv?.data || !rv?.store) {
  throw new Error('vendor scripts did not register window.RV')
}

export const RV = rv
export const icon = rv.icon
export const store = rv.store
export const data = rv.data
export const courseView = rv.courseView
