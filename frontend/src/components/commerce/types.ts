/** The shapes the commerce pages read out of the vendored fixture data. */

export interface CourseImageSource {
  src?: string
  id?: string
  alt?: string
  fp?: string
}

export interface CommerceCourse {
  id: string
  title: string
  category: string
  price: number
  normalPrice: number | null
  isFree: boolean
  ce: number
  durationLabel: string
  accessDays: number
  status: string
  sellable: boolean
  instructors: { id: string; role?: string }[]
  image: CourseImageSource | null
}

export interface CommerceCategory {
  id: string
  name: string
  th: string
  icon: string
  palette?: number
}

export interface Coupon {
  code: string
  name: string
  scope: 'course' | 'order'
  courseId?: string
  type: 'percent' | 'amount'
  value: number
  max?: number
  minSubtotal?: number
  condition: string
  expires: string
}

/** One line of `store.computeTotals`. */
export interface TotalsLine {
  cid: string
  course: CommerceCourse
  price: number
  normal: number | null
  coupon: Coupon | null
  disc: number
  net: number
}

export interface Totals {
  lines: TotalsLine[]
  subtotal: number
  courseDisc: number
  orderCoupon: Coupon | null
  orderCouponInvalid: boolean
  orderDisc: number
  totalDisc: number
  net: number
  allFree: boolean
  normalTotal: number
}

export interface OrderItem {
  cid: string
  price: number
  normal: number | null
  coupon: string | null
  disc: number
  net: number
}

export interface Order {
  id: string
  at: string
  items: OrderItem[]
  subtotal: number
  courseDisc: number
  orderDisc: number
  orderCoupon: string | null
  net: number
  method: 'qr' | 'card' | 'free'
  status: 'paid' | 'free' | 'failed' | 'cancelled'
  buyer?: { name?: string; email?: string; phone?: string } | null
  receipt: {
    want: boolean
    type?: 'corporate' | 'individual'
    name?: string
    branch?: string
    status?: string
  }
  renewed?: string[]
}

/** An access note on a cart or checkout line: why this purchase is worth
 *  making, or why it is not needed. */
export interface AccessNote {
  icon: string
  tone: 'info' | 'success' | 'renew' | 'package' | 'muted'
  /** Which message to render; each has its own interpolation. */
  kind: 'blocked' | 'blocked-link' | 'free' | 'renew' | 'renew-short' | 'access' | 'access-pkg'
  text?: string
  pct?: number
  days?: number
  link?: { href: string; label: string } | null
}

/** Everything section 2 to 4 of the order page collects. */
export interface CheckoutForm {
  buyerName: string
  buyerEmail: string
  buyerPhone: string
  taxWant: 'yes' | 'no'
  taxType: 'corporate' | 'individual'
  company: string
  taxId: string
  branchType: 'head' | 'branch'
  branchNo: string
  taxFirstName: string
  taxLastName: string
  idCard: string
  address: string
  method: 'qr' | 'card'
  terms: boolean
}

export type CheckoutErrors = Partial<Record<keyof CheckoutForm, string>>
