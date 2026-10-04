import { z } from 'zod'
import { LOCALES } from '../../db/schema/auth'

/** Long enough to resist guessing, and mixed enough to resist a dictionary. */
const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(200)
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.')

export const registerBody = z.object({
  email: z.string().email('Enter a valid email address.').max(255),
  password,
  firstName: z.string().min(1, 'Enter your first name.').max(100),
  lastName: z.string().min(1, 'Enter your last name.').max(100),
  /**
   * Gregorian, YYYY-MM-DD. Required: it is how a course meant for adults can
   * tell who it is dealing with, and asking later is harder than asking once.
   * The regex only shapes the string; `refine` is what rejects 2026-02-31.
   */
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
    .refine((value) => {
      const [y, m, d] = value.split('-').map(Number) as [number, number, number]
      const date = new Date(Date.UTC(y, m - 1, d))
      return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    }, 'That date does not exist.')
    .refine((value) => {
      const year = Number(value.slice(0, 4))
      const now = new Date().getUTCFullYear()
      return year >= now - 120 && year <= now
    }, 'Enter a realistic year of birth.'),
  phoneCountryCode: z.string().max(8).optional(),
  phoneNational: z.string().max(32).optional(),
  locale: z.enum(LOCALES).default('th'),
})

export const loginBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1, 'Enter your password.').max(200),
  /** Shown in the active-devices list, so people can tell sessions apart. */
  deviceLabel: z.string().max(120).optional(),
})

export const refreshBody = z.object({
  /** Optional: the cookie is used when the body leaves it out. */
  refreshToken: z.string().min(1).optional(),
})

export const forgotPasswordBody = z.object({
  email: z.string().email().max(255),
})

export const resetPasswordBody = z.object({
  token: z.string().min(1),
  password,
})

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
})

export const userResponse = z.object({
  id: z.number(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  locale: z.enum(LOCALES),
  roles: z.array(z.enum(['admin', 'teacher', 'student'])),
  avatarPath: z.string().nullable(),
  privacyAcceptedAt: z.date().nullable(),
  emailVerifiedAt: z.date().nullable(),
})

export const sessionResponse = z.object({
  id: z.number(),
  deviceLabel: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.date(),
  expiresAt: z.date(),
  current: z.boolean(),
})

export type RegisterBody = z.infer<typeof registerBody>
export type LoginBody = z.infer<typeof loginBody>
