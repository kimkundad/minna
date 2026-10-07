import { z } from 'zod'
import { LOCALES } from '../../db/schema/auth'
import { COURSE_LEVELS } from '../../db/schema/catalog'

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
    /** User ids. The first is the lead, which is the one a course card shows. */
    instructorIds: z.array(z.coerce.number().int().positive()).max(10).optional(),
})

export const courseBody = courseFields
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
