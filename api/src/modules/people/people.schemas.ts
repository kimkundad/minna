import { z } from 'zod'

/**
 * Members, staff and the applications to become staff.
 */

export const memberListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(200).optional(),
  role: z.enum(['superadmin', 'admin', 'teacher', 'student']).optional(),
  /** Which screen is asking. Three, because they are three different jobs:
   *  finding a customer, looking after the people who teach, and controlling
   *  who can get in. */
  group: z.enum(['students', 'teachers', 'admins']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  sort: z.enum(['newest', 'name', 'email']).default('newest'),
})

/**
 * The whole set of roles someone should hold, not a single one to add.
 *
 * Sending the full set means the request carries what the operator saw on the
 * screen, so two people editing at once cannot each add a role and silently
 * lose the other's change.
 */
export const setRolesBody = z.object({
  roles: z.array(z.enum(['superadmin', 'admin', 'teacher', 'student'])).max(4),
})

export const setStatusBody = z.object({
  status: z.enum(['active', 'suspended']),
  /** Written into the audit log. Suspending someone deserves a reason. */
  reason: z.string().max(255).optional(),
})

export const applicationListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  q: z.string().max(200).optional(),
})

export const decideApplicationBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  /** Which category the free-text subject turned out to be. */
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  note: z.string().max(500).optional(),
})

/**
 * A staff account created from the admin.
 *
 * The creator sets the password. A link to an inbox would be better — nobody
 * else would ever know it — but the page that link lands on does not exist
 * yet, so a link would create accounts that cannot be opened.
 *
 * The confirmation is checked here as well as in the form: a mistyped password
 * locks someone out of an account only a superadmin can rescue.
 */
export const createMemberBody = z.object({
  email: z.string().email('Enter a valid email address.').max(255),
  firstName: z.string().min(1, 'Enter a first name.').max(100),
  lastName: z.string().min(1, 'Enter a last name.').max(100),
  roles: z.array(z.enum(['superadmin', 'admin', 'teacher', 'student'])).min(1, 'Pick at least one role.'),
  locale: z.enum(['th', 'en', 'jp', 'vn']).default('th'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(200)
    .regex(/[A-Za-z]/, 'Include at least one letter.')
    .regex(/[0-9]/, 'Include at least one number.'),
  confirmPassword: z.string(),
})
  .refine((v) => v.password === v.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  })

/**
 * A password set for someone else by a superadmin.
 *
 * Normally nobody but the account holder picks their password. This exists
 * because the set-password link has to reach an inbox, and a team that cannot
 * send mail yet would otherwise have no way to get a new administrator in.
 *
 * The confirmation is checked here as well as in the form: a mistyped password
 * locks the person out of an account only a superadmin can rescue, and the
 * check costs nothing.
 */
export const setPasswordBody = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .max(200)
      .regex(/[A-Za-z]/, 'Include at least one letter.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  })

/**
 * A teacher's public profile.
 *
 * Separate from the account because it is a different kind of fact: the
 * account is how someone signs in, this is a page strangers read before
 * deciding to pay.
 */
export const teacherProfileBody = z.object({
  displayName: z.string().min(1, 'A display name is required.').max(150),
  shortName: z.string().min(1, 'A short name is required.').max(100),
  slug: z
    .string()
    .min(1, 'A slug is required.')
    .max(150)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.'),
  headline: z.string().max(180).nullable().optional(),
  bio: z.string().max(5000).nullable().optional(),
  languages: z.array(z.enum(['th', 'en', 'jp', 'vn'])).max(4).optional(),
  credentials: z.string().max(2000).nullable().optional(),
  yearsExperience: z.coerce.number().int().min(0).max(80).nullable().optional(),
  listed: z.boolean().default(true),
  /** Saved onto the account, not the profile: a person has one picture, and
   *  two would mean choosing which is current every time it changes. */
  avatarPath: z.string().max(512).nullable().optional(),
})
