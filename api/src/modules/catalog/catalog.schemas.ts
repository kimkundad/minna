import { z } from 'zod'
import { LOCALES } from '../../db/schema/auth'
import { COURSE_LEVELS, LESSON_TYPES } from '../../db/schema/catalog'

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

export const categoryBody = z.object({
  name: z.string().min(1, 'A name is required.').max(150),
  slug,
  /** A top-level category has none. */
  parentId: z.coerce.number().int().positive().nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
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
    description: z.string().max(20000).nullable().optional(),
    outcomes: z.array(z.string().max(300)).max(30).optional(),
    audience: z.array(z.string().max(300)).max(30).optional(),
    thumbnailPath: z.string().max(512).nullable().optional(),
    sampleVideoPath: z.string().max(512).nullable().optional(),
    level: z.enum(COURSE_LEVELS).nullable().optional(),
    contentLocale: z.enum(LOCALES).default('th'),
    /** Satang. */
    price: money.default(0),
    /** The struck-through "was" price. Null when there is no discount. */
    normalPrice: money.nullable().optional(),
    accessType: z.enum(['lifetime', 'limited']).default('lifetime'),
    accessDurationDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
    status: z.enum(['draft', 'pending', 'approved', 'rejected', 'ended']).default('draft'),
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
  .refine((v) => v.instructorIds?.length === 1, {
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

export const courseListQuery = listQuery.extend({
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'ended']).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  sort: z.enum(['newest', 'title', 'price', 'popularity']).default('newest'),
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
    description: z.string().max(10000).nullable().optional(),
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
