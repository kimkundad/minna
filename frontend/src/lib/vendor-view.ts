/**
 * The prototype store's course, in the shape `CourseCard` now expects.
 *
 * Temporary. The catalog and the course page are served by our own API; the
 * account pages, the cart and the checkout still read the prototype's
 * localStorage fixtures, because the student-facing API — entitlements,
 * progress, cart — does not exist yet. This adapter is what lets those pages
 * keep working while the card itself stops knowing about the fixtures.
 *
 * Delete it, and `@/vendor`'s course types with it, once the last page has
 * moved. Nothing new should be written against it.
 */
import { courseView as protoView, store } from '@/vendor'
import type { CtaAction } from '@/vendor'
import type { CourseView, Person } from './course'

interface ProtoPerson {
  id: string
  name: string
  short: string
  initials: string
  color: number
  photo?: string | null
}

type Dict = Record<string, unknown>

export function vendorCourseView(courseId: string, locale: string): CourseView {
  const view = protoView(courseId)
  const course = (view as unknown as { course: Dict }).course
  const api = store as unknown as Record<string, (...args: never[]) => never>

  const category = (api.category as unknown as (id: string) => Dict | undefined)(
    String(course.category),
  )
  const lessons = (api.lessons as unknown as (c: unknown) => unknown[])(course)
  const instructor = api.instructor as unknown as (id: string) => ProtoPerson

  const people: Person[] = ((course.instructors as { id: string }[]) ?? []).map((i) => {
    const p = instructor(i.id)
    return {
      id: p.id,
      name: p.name,
      short: p.short,
      initials: p.initials,
      color: p.color,
      photo: p.photo ?? null,
    }
  })

  /**
   * The reference offers a certificate link once a course is finished. Minna
   * issues none, so that action falls back to the course's own CTA rather than
   * pointing at a page that will not exist.
   */
  const card = (view as unknown as { card?: CtaAction }).card ?? view.primary
  const target = card?.action ?? (card as { act?: string } | undefined)?.act ?? ''
  const isCertificate = target.includes('cert') || card?.href?.includes('certificate')
  const chosen = isCertificate ? view.primary : card

  return {
    id: Number(String(courseId).replace(/\D/g, '')) || 0,
    slug: courseId,
    title: String(course.title ?? ''),
    shortDesc: String(course.shortDesc ?? ''),
    href: `/${locale}/courses/${courseId}`,
    image: (course.image as { src: string; alt: string } | null) ?? null,
    categoryName: String(category?.name ?? ''),
    categoryIcon: String(category?.icon ?? 'book-open'),
    categoryPalette: Number(category?.palette ?? 0),
    people,
    durationLabel: String(course.durationLabel ?? ''),
    lessonCount: lessons.length,
    levelLabel: String(course.levelLabel ?? ''),
    spokenLabel: String(course.languageLabel ?? ''),
    price: Number(course.price ?? 0),
    normalPrice: (course.normalPrice as number | null) ?? null,
    isFree: Boolean(course.isFree),
    inPackage: Boolean(course.packageIncluded),
    accessDays: (course.accessDays as number | undefined) ?? null,
    // Package membership is shown on the course page, not on cards: a tile has
    // room for two badges and the marketing ones earn the space.
    badges: view.badges.filter((b) => b.kind !== 'package').slice(0, 2),
    primary: chosen as CourseView['primary'],
    secondary: (view.secondary ?? null) as CourseView['secondary'],

    showPrice: view.showPrice,
    showProgress: view.showProgress,
    progressPct: view.progress.pct,
    resumeTitle: resumeTitleOf(view),
    locked: ['ended', 'access-expired', 'pkg-expired'].includes(view.state),
    expired: view.state === 'ended' || view.state === 'access-expired',
    note: view.note ?? null,
  }
}

function resumeTitleOf(view: ReturnType<typeof protoView>): string {
  const r = view.progress.resume
  if (!r) return ''
  return r.type === 'quiz' ? 'แบบทดสอบท้ายคอร์ส' : r.title
}

/**
 * The prototype's `[{ id }]` instructor list, as `InstructorLine` wants it.
 *
 * Same temporary bridge as above, for the pages that render the row without
 * going through a card.
 */
export function vendorPeople(instructors: { id: string }[] | null | undefined): Person[] {
  const instructor = (store as unknown as Record<string, unknown>).instructor as (
    id: string,
  ) => ProtoPerson
  return (instructors ?? []).map((i) => {
    const p = instructor(i.id)
    return {
      id: p.id,
      name: p.name,
      short: p.short,
      initials: p.initials,
      color: p.color,
      photo: p.photo ?? null,
    }
  })
}
