import { z } from 'zod'

/**
 * Members, staff and the applications to become staff.
 */

export const memberListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(200).optional(),
  role: z.enum(['superadmin', 'admin', 'teacher', 'student']).optional(),
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
