/**
 * The shapes the vendored store hands back, written down only as far as the
 * account pages actually read them.
 *
 * They are deliberately partial: store.js is the specification, and copying all
 * of it into TypeScript would create a second one to keep in step.
 */

export interface CourseLike {
  id: string
  title: string
  category: string
  status: string
  endedAt?: string
  image?: Record<string, unknown>
  instructors: { id: string }[]
}

export interface LearningItemLike {
  course: CourseLike
  access: { has: boolean; source?: string | null }
  entitlement: { source: string; endAt?: string | null } | null
  accessDate: string | null
  expiry: string | null
  group: 'in-progress' | 'not-started' | 'completed' | 'expired'
  progress: {
    pct: number
    done: number
    total: number
    lessonsDone: boolean
    resume?: { id: string; title: string; type: string } | null
    activityAt?: string | null
  }
  quiz: { choicePassed: boolean; essayStatus: string; completed: boolean }
  view: {
    state: string
    badges: { kind: string; text: string; icon?: string }[]
    lock?: { type: string } | null
  }
}

export interface PlanLike {
  id: string
  tier: 'free' | 'online' | 'print'
  name: string
  price: number
  priceLabel: string
  period: string | null
  badge: string | null
  includesCourses: boolean
  featured?: boolean
  features: { t: string; ok: boolean }[]
}

export interface PkgInfoLike {
  plan: PlanLike
  status: 'active' | 'expiring' | 'expired'
  startAt: string | null
  endAt: string | null
  daysLeft: number | null
  isPaidPlan: boolean
  memberType: 'vet' | 'student'
}

export interface OrderItemLike {
  cid: string
  price: number
  normal: number | null
  coupon: string | null
  disc: number
  net: number
}

export interface OrderLike {
  id: string
  at: string
  items: OrderItemLike[]
  subtotal: number
  courseDisc: number
  orderDisc: number
  net: number
  method: 'card' | 'qr' | 'free' | string
  status: 'paid' | 'free' | 'failed' | 'cancelled' | string
  receipt: { want: boolean; type?: string; status?: string }
}

export interface NotificationLike {
  id: string
  type: string
  title: string
  desc: string
  at: string
  read: boolean
  cta?: { label: string; href: string } | null
}

export interface ProfileLike {
  prefix: string
  firstName: string
  lastName: string
  email: string
  phone: string
  workplace: string
  province: string
  licenseNo: string
  licenseExpiry: string
  note: string
  pdpa: boolean
}

export interface DeviceLike {
  id: string
  name: string
  icon: string
  location: string
  last: string
  current?: boolean
}
