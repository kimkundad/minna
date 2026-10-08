/**
 * Turning an article as the API sends it into an article as the design shows
 * it — the counterpart of `course.ts`, and for the same reason: a card, the
 * blog list and the article page all read one object, so none of them can
 * describe an article differently from the others.
 */
import type { PublicCategory, PublicPost } from './api'
import { mediaUrl } from './api'
import { categoryLabel, initialsOf } from './course'

export interface ArticleView {
  id: number
  slug: string
  href: string
  title: string
  excerpt: string
  image: { src: string; alt: string } | null
  categoryId: number | null
  categoryName: string
  categoryIcon: string
  categoryPalette: number
  categoryHref: string | null
  authorName: string
  authorHeadline: string
  authorBio: string
  authorAvatar: string | null
  authorInitials: string
  authorColor: number
  dateLabel: string
  /** For `<time datetime>`, which wants the machine form. */
  dateIso: string
}

export interface ArticleContext {
  locale: string
  categories?: PublicCategory[]
  /** How this site writes a date. Passed in so one formatter serves the lot. */
  formatDate: (value: unknown) => string
}

/** The same rule the course cards use, so one category looks the same
 *  everywhere: the parent's own icon when a child has none. */
function iconFor(cat: PublicCategory | undefined, all: PublicCategory[]): string {
  if (!cat) return 'newspaper'
  return cat.icon ?? all.find((c) => c.id === cat.parentId)?.icon ?? 'newspaper'
}

export function articleView(post: PublicPost, ctx: ArticleContext): ArticleView {
  const all = ctx.categories ?? []
  const cat = post.categoryId ? all.find((c) => c.id === post.categoryId) : undefined
  const author = post.authorName ?? ''

  return {
    id: post.id,
    slug: post.slug,
    href: `/${ctx.locale}/blog/${post.slug}`,
    title: post.title,
    excerpt: post.excerpt ?? '',
    image: post.coverPath ? { src: mediaUrl(post.coverPath), alt: post.title } : null,
    categoryId: post.categoryId,
    categoryName: cat ? categoryLabel(cat, all) : (post.categoryName ?? ''),
    categoryIcon: iconFor(cat, all),
    // Fixed per category, for the same reason a course's is: the same subject
    // has to get the same colours every time or the grid flickers.
    categoryPalette: post.categoryId === null ? 0 : post.categoryId % 6,
    categoryHref: post.categoryId ? `/${ctx.locale}/blog?category=${post.categoryId}` : null,
    authorName: author,
    authorHeadline: post.authorHeadline ?? '',
    authorBio: post.authorBio ?? '',
    authorAvatar: post.authorAvatarPath ? mediaUrl(post.authorAvatarPath) : null,
    authorInitials: initialsOf(author),
    authorColor: post.id % 6,
    dateLabel: ctx.formatDate(post.publishedAt),
    dateIso: post.publishedAt ?? '',
  }
}

/**
 * How long the article takes to read, in minutes.
 *
 * Counted from the text with the markup stripped, at 200 words a minute for
 * Latin script and 300 characters a minute for Thai, Japanese and Chinese,
 * which have no spaces to count words by. Rounded up, and never less than one:
 * "0 นาที" would read as an error rather than as a short article.
 */
export function readingMinutes(html: string | null | undefined): number {
  if (!html) return 1
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .trim()
  if (!text) return 1

  const cjkAndThai = (text.match(/[฀-๿぀-ヿ一-鿿]/g) ?? []).length
  const latinWords = text
    .replace(/[฀-๿぀-ヿ一-鿿]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length

  return Math.max(1, Math.ceil(cjkAndThai / 300 + latinWords / 200))
}

export interface Heading {
  id: string
  text: string
}

/**
 * The article's own `h2`s, for the contents list beside it, and an `id` added
 * to each so the list can link to them.
 *
 * Done on the parsed document rather than with a regular expression, because
 * the body is arbitrary markup from an editor and a heading can carry nested
 * tags, attributes or quotes that a pattern would mangle.
 *
 * Returns the rewritten HTML alongside the headings: the ids have to exist in
 * what is rendered, and adding them afterwards in the DOM would race the render.
 */
export function withHeadings(html: string | null | undefined): {
  html: string
  headings: Heading[]
} {
  if (!html) return { html: '', headings: [] }
  if (typeof DOMParser === 'undefined') return { html, headings: [] }

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const headings: Heading[] = []
  const used = new Set<string>()

  doc.body.querySelectorAll('h2').forEach((el, i) => {
    const text = (el.textContent ?? '').trim()
    if (!text) return
    // A number, not a slug of the text: the headings are Thai and Japanese as
    // often as not, and a percent-encoded fragment is unreadable in the
    // address bar and fragile when copied.
    let id = el.id || `s${i + 1}`
    while (used.has(id)) id = `${id}x`
    used.add(id)
    el.id = id
    headings.push({ id, text })
  })

  return { html: doc.body.innerHTML, headings }
}
