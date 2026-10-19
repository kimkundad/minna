import { richTextField } from '../../lib/rich-text'
import { z } from 'zod'
import { LOCALES } from '../../db/schema/auth'
import { COURSE_LEVELS, COURSE_LOCALES, LESSON_TYPES } from '../../db/schema/catalog'
import { isCurrencyCode } from '../../lib/currencies'
import { queryBool } from '../../lib/query'

/**
 * Validation for the catalog.
 *
 * Money is in satang throughout. The admin form shows baht and converts on the
 * way in, so a price arriving here as 169000 means ฿1,690.00 and a price
 * arriving as 1690 means ฿16.90 — which is why nothing in this file ever
 * multiplies or divides by a hundred.
 */

/** Lowercase, digits and single hyphens. What ends up in a public URL. */
const slug = z
  .string()
  .min(1, 'A slug is required.')
  .max(150)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.')

/**
 * The languages a category name can be translated into — every language the
 * site has, less the one the name itself is written in. Driven off `LOCALES`
 * so that adding a fifth language does not need an edit here.
 */
export const TRANSLATABLE_LOCALES = LOCALES.filter((l) => l !== 'th')

/**
 * The name in the other languages, keyed by locale.
 *
 * Thai is rejected rather than ignored: it is `name` on the category itself,
 * and accepting a second copy of it would create two places to edit one name
 * and no way to tell which of them the site is showing.
 *
 * An empty string is allowed, and means "no translation" — it is what a
 * cleared field in the form sends, and clearing a field has to be possible.
 */
export const categoryNames = z
  .record(z.string(), z.string().max(150))
  .refine((names) => Object.keys(names).every((l) => (TRANSLATABLE_LOCALES as string[]).includes(l)), {
    message: `Translations are only kept for: ${TRANSLATABLE_LOCALES.join(', ')}.`,
  })

export const categoryBody = z.object({
  name: z.string().min(1, 'A name is required.').max(150),
  slug,
  /** A top-level category has none. */
  parentId: z.coerce.number().int().positive().nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  names: categoryNames.optional(),
})

export const categoryPatch = categoryBody.partial()

/** Shared by every list endpoint, so paging works the same everywhere. */
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(200).optional(),
})

const money = z.coerce.number().int().min(0, 'A price cannot be negative.')

/** The fields on their own. The cross-field rules live on `courseBody`;
 *  a PATCH cannot check them because it only carries what changed. */
const courseFields = z.object({
    title: z.string().min(1, 'A title is required.').max(255),
    slug: slug.max(255),
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    shortDesc: z.string().max(500).nullable().optional(),
    description: richTextField(20000),
    outcomes: z.array(z.string().max(300)).max(30).optional(),
    audience: z.array(z.string().max(300)).max(30).optional(),
    thumbnailPath: z.string().max(512).nullable().optional(),
    sampleVideoPath: z.string().max(512).nullable().optional(),
    level: z.enum(COURSE_LEVELS).nullable().optional(),
    contentLocale: z.enum(COURSE_LOCALES).default('th'),
    /**
     * What this course is priced in, and what Stripe charges. No conversion
     * happens on the way to a buyer: a course priced at €49 takes €49 from
     * everybody, whatever language they are reading the site in.
     */
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .refine((c) => isCurrencyCode(c), 'That is not a currency we can charge in.')
      .default('THB'),
    /** The currency's smallest unit — hundredths, including for yen. */
    price: money.default(0),
    /** The struck-through "was" price. Null when there is no discount. */
    normalPrice: money.nullable().optional(),
    accessType: z.enum(['lifetime', 'limited']).default('lifetime'),
    accessDurationDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
    status: z.enum(['draft', 'pending', 'approved', 'rejected', 'ended']).default('draft'),
    /**
     * Why a course was sent back. Written by an administrator alongside
     * `status: 'rejected'`, and shown to the teacher in the notice and on the
     * course itself — without it the verdict says only that something is
     * wrong, and the next step is a conversation somewhere else.
     */
    reviewNote: z.string().trim().max(1000).nullable().optional(),
    /**
     * How this one looks when shared, where that should differ from the
     * page itself — a title that reads well on a page and badly in a chat
     * window, or a cover that is beautiful at 16:9 and cropped to nonsense
     * at 1200×630. Empty is the normal state: it shares as the page reads.
     */
    ogTitle: z.string().trim().max(255).nullable().optional(),
    ogDescription: z.string().trim().max(500).nullable().optional(),
    ogImagePath: z.string().trim().max(512).nullable().optional(),
    sellable: z.boolean().default(true),
    repurchase: z.boolean().default(true),
    badge: z.enum(['bestseller', 'recommended', 'new', 'free']).nullable().optional(),
    featured: z.boolean().default(false),
    /**
     * Who teaches it. Exactly one: a course belongs to a teacher, and the
     * card, the questions and the marking all have a single person behind
     * them.
     *
     * It stays an array because the pivot allows more, and widening the rule
     * later should not mean changing the shape every caller sends.
     *
     * Optional on a PATCH, which may be changing something else entirely;
     * `courseBody` makes it required when a course is created.
     */
    instructorIds: z.array(z.coerce.number().int().positive()).max(1).optional(),
})

export const courseBody = courseFields
  // Every course belongs to somebody who teaches it. A course with no teacher
  // has nobody to answer its questions or mark its written answers, and the
  // card has no face to show.
  /**
   * Left out, a teacher's own course is put under their name.
   *
   * It used to be required here, which made the route's fallback for exactly
   * that case unreachable — and meant a teacher could not create a course
   * without naming an instructor from a list only admins may read. The route
   * refuses an admin who names nobody; it is their choice to make, and there
   * is no obvious answer to fall back on.
   */
  .refine((v) => v.instructorIds === undefined || v.instructorIds.length === 1, {
    message: 'Choose who teaches this course.',
    path: ['instructorIds'],
  })
  // 'limited' access without a length is access that never expires, dressed up
  // as access that does. The two fields only mean something together.
  .refine((v) => v.accessType !== 'limited' || Boolean(v.accessDurationDays), {
    message: 'Say how many days limited access lasts.',
    path: ['accessDurationDays'],
  })
  // A "was" price that is not higher than the price is not a discount, and
  // showing one would be a lie told in strikethrough.
  .refine((v) => v.normalPrice == null || v.normalPrice > v.price, {
    message: 'The original price has to be higher than the price being charged.',
    path: ['normalPrice'],
  })

export const coursePatch = courseFields.partial()

/**
 * A filter the catalog's panel offers as checkboxes.
 *
 * Sent as one comma-separated parameter rather than repeated ones, so the
 * address a visitor copies out of the bar stays short enough to paste.
 */
function csv<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter((s): s is T[number] => (values as readonly string[]).includes(s))
        : undefined,
    )
}

export const courseListQuery = listQuery.extend({
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'ended']).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  /** Several at once: the panel is checkboxes, not a radio group. */
  categoryIds: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isInteger(n) && n > 0)
        : undefined,
    ),
  levels: csv(['beginner', 'intermediate', 'advanced'] as const),
  locales: csv(LOCALES),
  durations: csv(['le1', '1-3', '3-6', 'gt6'] as const),
  prices: csv(['free', 'lt1000', '1000-2000', 'gt2000'] as const),
  access: csv(['free', 'course', 'package'] as const),
  sort: z
    .enum(['recommended', 'newest', 'title', 'price', 'price-desc', 'popularity'])
    .default('newest'),
  /**
   * Also return how many courses each filter option would give.
   *
   * On the list endpoint rather than its own, so the numbers beside the
   * checkboxes and the results they sit next to come from one request — two
   * requests can land either side of a course being published and disagree.
   */
  facets: queryBool,
  /**
   * Which list this is: the shop, or the desk behind it.
   *
   * 'public' is the catalogue, and it is the same catalogue for everybody —
   * the signed-out visitor, the student, the teacher and the admin all see
   * what is published and on sale.
   *
   * 'manage' is the admin's own list: drafts included, and narrowed to a
   * teacher's own courses when a teacher asks.
   *
   * It is asked for rather than worked out from the token. It used to be
   * inferred — staff got drafts and a teacher got only their own courses — and
   * the public catalogue carries the reader's token, so signing in as a
   * teacher turned the shop into a list of that teacher's own courses and
   * nothing else could be bought. An admin, meanwhile, was shown unpublished
   * courses on the public site. Who you are decides what you may ask for; it
   * must not silently decide what you asked.
   */
  scope: z.enum(['public', 'manage']).default('public'),
})

/* ---------------- curriculum ---------------- */

export const moduleBody = z.object({
  title: z.string().min(1, 'A title is required.').max(255),
  sortOrder: z.coerce.number().int().min(0).default(0),
})

export const modulePatch = moduleBody.partial()

export const lessonBody = z
  .object({
    /** A lesson may sit directly on the course, outside any module. */
    moduleId: z.coerce.number().int().positive().nullable().optional(),
    type: z.enum(LESSON_TYPES),
    title: z.string().min(1, 'A title is required.').max(255),
    subtitle: z.string().max(255).nullable().optional(),
    description: richTextField(10000),
    /** Seconds. Course length is the sum of these. */
    durationSeconds: z.coerce.number().int().min(0).max(86400).default(0),
    videoPath: z.string().max(512).nullable().optional(),
    documentPath: z.string().max(512).nullable().optional(),
    /** Playable before buying. */
    isPreview: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).default(0),
  })
  // A video lesson with no video is a lesson that cannot be taken. The file is
  // uploaded separately, so this only applies once something claims to be one.
  .refine((v) => v.type !== 'video' || v.videoPath !== undefined, {
    message: 'A video lesson needs a video.',
    path: ['videoPath'],
  })

export const lessonPatch = lessonBody.innerType().partial()

/** New order for a course's lessons or modules, as ids in the order wanted. */
export const reorderBody = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500),
})
