/**
 * Turning a course as the API sends it into a course as the design shows it.
 *
 * Everything here is presentation: labels, a price in baht, which badges, which
 * button. It lives apart from the components so a card, a course page and a
 * cart row cannot describe the same course differently — the duration under a
 * card and the duration on the page it links to come out of one function.
 *
 * Nothing here knows whether you have bought the course. That is entitlement,
 * it needs a signed-in session the student API does not serve yet, and guessing
 * at it would mean a card claiming progress nobody made.
 */
import type { CourseInstructor, PublicCategory, PublicCourse } from './api'
import { mediaUrl } from './api'
import { num } from './format'

export interface BadgeSpec {
  kind: string
  text: string
  icon?: string
}

export interface CtaAction {
  /** Dispatch key the page handles, e.g. 'buy' or 'add-cart'. */
  action?: string
  label: string
  icon?: string
  /** primary, secondary, ghost or danger. */
  variant?: string
  href?: string
  disabled?: boolean
}

/** A teacher as the avatar and the name line need them. */
export interface Person {
  id: string
  name: string
  short: string
  initials: string
  color: number
  photo: string | null
}

/**
 * Initials from a name, for the avatar drawn when there is no photo.
 *
 * Two words give two letters; one word gives one, which is right for a name
 * written as a single unit — "田中愛子" has no second word to take a letter
 * from, and slicing two characters out of it would say something else.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return [...parts[0]!][0] ?? '?'
  const last = parts[parts.length - 1]!
  return `${[...parts[0]!][0] ?? ''}${[...last][0] ?? ''}`
}

export function personOf(i: CourseInstructor): Person {
  return {
    id: String(i.id),
    name: i.name,
    short: i.short ?? i.name,
    initials: initialsOf(i.short ?? i.name),
    // Fixed per teacher, for the same reason the category palette is.
    color: i.id % 6,
    photo: i.avatarPath ? mediaUrl(i.avatarPath) : null,
  }
}

/** What a card and a course page both read. Money is baht, not satang. */
export interface CourseView {
  id: number
  slug: string
  title: string
  shortDesc: string
  href: string
  image: { src: string; alt: string } | null
  categoryName: string
  categoryIcon: string
  categoryPalette: number
  people: Person[]
  durationLabel: string
  lessonCount: number
  levelLabel: string
  spokenLabel: string
  price: number
  normalPrice: number | null
  isFree: boolean
  inPackage: boolean
  badges: BadgeSpec[]
  primary: CtaAction
  secondary: CtaAction | null

  /**
   * What the signed-in learner's own state adds, where anything knows it.
   *
   * All optional, and all absent on the public catalog: a card built from the
   * catalog API has no session behind it. The account pages still build their
   * cards from the prototype store, which does, and they set these.
   */
  showPrice?: boolean
  showProgress?: boolean
  progressPct?: number
  resumeTitle?: string
  locked?: boolean
  expired?: boolean
  note?: string | null
}

/** Satang to baht. The API counts in satang so nothing rounds twice. */
export function baht(satang: number): number {
  return Math.round(satang) / 100
}

/**
 * A sub-category's own name is often only half of one — "สนทนา" is the name of
 * four different categories until its parent is named with it. The parent is
 * dropped for a top-level category, where it would just repeat itself.
 */
export function categoryLabel(cat: PublicCategory, all: PublicCategory[]): string {
  if (!cat.parentId) return cat.name
  const parent = all.find((c) => c.id === cat.parentId)
  return parent ? `${parent.name} · ${cat.name}` : cat.name
}

/**
 * The fallback art is drawn in one of six palettes. There is no palette column,
 * so it comes from the category id: an arbitrary but fixed choice, which is the
 * requirement — the same category has to get the same colours every time or the
 * grid flickers between renders.
 */
function palette(categoryId: number | null): number {
  return categoryId === null ? 0 : categoryId % 6
}

/** Seconds as the design writes a course length. */
export function durationLabel(seconds: number, t: Translate): string {
  const m = Math.round((seconds || 0) / 60)
  if (m < 60) return t('minutes', { n: num(m) })
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? t('hoursMinutes', { h: num(h), m: num(rest) }) : t('hours', { n: num(h) })
}

type Translate = (key: string, named?: Record<string, unknown>) => string

/**
 * The badges a course earns, most important first and at most two — a tile has
 * room for two and the marketing ones earn the space.
 *
 * Package membership is deliberately not one of them: it is shown on the course
 * page, where there is room to say what the package is.
 */
function badgesFor(course: PublicCourse, t: Translate): BadgeSpec[] {
  const out: BadgeSpec[] = []

  if (course.price === 0) {
    out.push({ kind: 'free', text: t('catalog.priceFree'), icon: 'gift' })
  } else if (course.normalPrice && course.normalPrice > course.price) {
    const off = Math.round((1 - course.price / course.normalPrice) * 100)
    if (off > 0) out.push({ kind: 'discount', text: t('course.discountOff', { percent: off }), icon: 'tag' })
  }

  // The admin's own label, which is the school saying what it wants pushed.
  // 'free' is skipped: a free course already says so above, from its price,
  // which cannot be out of date the way a hand-set badge can.
  const marketing: Record<string, { text: string; icon: string }> = {
    bestseller: { text: t('badge.bestseller'), icon: 'flame' },
    recommended: { text: t('badge.recommended'), icon: 'sparkles' },
    new: { text: t('badge.new'), icon: 'sparkles' },
  }
  const chosen = course.badge ? marketing[course.badge] : undefined
  if (chosen) out.push({ kind: course.badge as string, ...chosen })

  return out.slice(0, 2)
}

/**
 * What the button says.
 *
 * Three cases a visitor can be in without us knowing anything about them: the
 * course is free, the course is for sale, or it is not for sale — in which case
 * the only honest offer is to go and read about it.
 */
function actionsFor(course: PublicCourse, t: Translate, href: string) {
  if (!course.sellable && course.price > 0) {
    return {
      primary: { label: t('cta.courseDetail'), href, variant: 'secondary', icon: 'info' },
      secondary: null,
    }
  }
  if (course.price === 0) {
    return {
      primary: { label: t('cta.enrollFree'), action: 'enroll-free', variant: 'primary', icon: 'play' },
      secondary: null,
    }
  }
  return {
    primary: { label: t('cta.buyCourse'), action: 'buy', variant: 'primary', icon: 'cart' },
    secondary: { label: t('cta.addToCart'), action: 'add-cart', variant: 'secondary', icon: 'cart' },
  }
}

export interface ViewContext {
  locale: string
  t: Translate
  /** For the parent name in a sub-category's label, and for its icon. */
  categories?: PublicCategory[]
}

export function courseView(course: PublicCourse, ctx: ViewContext): CourseView {
  const { t } = ctx
  const href = `/${ctx.locale}/courses/${course.slug}`
  const cat = ctx.categories?.find((c) => c.id === course.categoryId)

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    shortDesc: course.shortDesc ?? '',
    href,
    image: course.thumbnailPath
      ? { src: mediaUrl(course.thumbnailPath), alt: course.title }
      : null,
    categoryName: cat
      ? categoryLabel(cat, ctx.categories ?? [])
      : (course.categoryName ?? ''),
    // The parent's icon when a sub-category has none of its own, which is the
    // usual case: "สนทนา" is not a thing with a glyph, "ภาษาญี่ปุ่น" is.
    categoryIcon:
      cat?.icon ??
      ctx.categories?.find((c) => c.id === cat?.parentId)?.icon ??
      'book-open',
    categoryPalette: palette(course.categoryId),
    people: course.instructors.map(personOf),
    durationLabel: durationLabel(course.durationSeconds, t),
    lessonCount: course.lessonCount,
    levelLabel: course.level ? t(`catalog.level${capitalise(course.level)}`) : '',
    spokenLabel: t(`spoken.${course.contentLocale}`),
    price: baht(course.price),
    normalPrice: course.normalPrice === null ? null : baht(course.normalPrice),
    isFree: course.price === 0,
    inPackage: course.inPackage,
    badges: badgesFor(course, t),
    ...actionsFor(course, t, href),
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
