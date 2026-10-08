/**
 * Turning what the checkout API says into what the checkout page shows.
 *
 * Nothing here adds anything up. The server prices the basket and this maps its
 * answer onto the courses being bought — the one arithmetic it does is satang
 * to baht for display, and that is division by a hundred at the last moment.
 */
import { ApiError, api } from './api'
import type {
  ContentLocale,
  PublicCategory,
  PublicCourse,
  Quote,
  QuoteLine,
} from './api'
import { courseView, type CourseView } from './course'

/** One course on the order, priced. Money is baht, for showing. */
export interface CheckoutLine {
  courseId: number
  slug: string
  view: CourseView
  unitPrice: number
  normalPrice: number | null
  discount: number
  net: number
  couponCode: string | null
  accessType: 'lifetime' | 'limited'
  accessDurationDays: number | null
  /** The buyer already has this one. Shown rather than silently dropped. */
  owned: boolean
}

export interface CheckoutTotals {
  lines: CheckoutLine[]
  subtotal: number
  courseDiscount: number
  orderDiscount: number
  vatAmount: number
  vatInclusive: boolean
  total: number
  /** Everything on the order is free, so there is nothing to pay. */
  allFree: boolean
}

/** Satang to baht, at the last moment and nowhere else. */
export function baht(satang: number): number {
  return Math.round(satang) / 100
}

/**
 * What a basket was asked for.
 *
 * The address carries slugs, because that is what a course card links by and
 * what somebody would paste. The API prices by id, so they are resolved here —
 * and the course is wanted anyway, for its picture and its teacher.
 */
export interface ResolvedItem {
  course: PublicCourse
  /** A coupon the buyer typed against this course alone. */
  couponCode?: string
}

export interface Unavailable {
  ref: string
  reason: 'missing' | 'not-for-sale'
  title?: string
}

/**
 * Looks up each thing the address named.
 *
 * A reference that does not resolve is reported rather than dropped: somebody
 * who followed a link to buy something is owed an answer about it, and
 * "nothing to buy" with no explanation is the page this replaces.
 */
export async function resolveItems(
  refs: string[],
): Promise<{ items: ResolvedItem[]; unavailable: Unavailable[] }> {
  const items: ResolvedItem[] = []
  const unavailable: Unavailable[] = []
  const seen = new Set<string>()

  for (const ref of refs) {
    const clean = ref.trim()
    if (!clean || seen.has(clean.toLowerCase())) continue
    seen.add(clean.toLowerCase())

    try {
      const { data } = await api.course(clean)
      // A course can be published and still withdrawn from sale. That is not
      // the same as not existing, and it does not read the same either.
      if (!data.sellable && data.price > 0) {
        unavailable.push({ ref: clean, reason: 'not-for-sale', title: data.title })
        continue
      }
      items.push({ course: data })
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        unavailable.push({ ref: clean, reason: 'missing' })
      } else {
        throw err
      }
    }
  }

  return { items, unavailable }
}

export function quoteLines(items: ResolvedItem[]): QuoteLine[] {
  return items.map((i) => ({
    kind: 'course' as const,
    id: i.course.id,
    ...(i.couponCode ? { couponCode: i.couponCode } : {}),
  }))
}

export interface MapContext {
  locale: string
  t: (key: string, named?: Record<string, unknown>) => string
  categories?: PublicCategory[]
}

/**
 * The quote, line by line, beside the courses it priced.
 *
 * Matched by course id rather than by position: the server is free to return
 * the lines in whatever order suits it, and an order that silently showed one
 * course's price under another's name would be the worst kind of bug here.
 */
export function mapQuote(
  quote: Quote,
  items: ResolvedItem[],
  ctx: MapContext,
): CheckoutTotals {
  const owned = new Set(quote.alreadyOwned)

  const lines: CheckoutLine[] = quote.lines.flatMap((q) => {
    if (q.kind !== 'course') return []
    const found = items.find((i) => i.course.id === q.id)
    if (!found) return []

    return [
      {
        courseId: q.id,
        slug: found.course.slug,
        view: courseView(found.course, {
          locale: ctx.locale,
          t: ctx.t,
          categories: ctx.categories,
        }),
        unitPrice: baht(q.unitPrice),
        normalPrice:
          found.course.normalPrice && found.course.normalPrice > q.unitPrice
            ? baht(found.course.normalPrice)
            : null,
        discount: baht(q.discount),
        net: baht(Math.max(0, q.unitPrice - q.discount)),
        couponCode: found.couponCode ?? null,
        accessType: q.accessType,
        accessDurationDays: q.accessDurationDays,
        owned: owned.has(q.id),
      },
    ]
  })

  return {
    lines,
    subtotal: baht(quote.subtotal),
    courseDiscount: baht(quote.courseDiscount),
    orderDiscount: baht(quote.orderDiscount),
    vatAmount: baht(quote.vatAmount),
    vatInclusive: quote.vatInclusive,
    total: baht(quote.total),
    allFree: quote.total === 0,
  }
}

/** The reader's language, as the API's content locales name them. */
export function asContentLocale(value: unknown): ContentLocale {
  const v = String(value)
  return v === 'en' || v === 'jp' || v === 'vn' ? v : 'th'
}
