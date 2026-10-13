import { z } from 'zod'
import { LOCALES } from '../../db/schema/auth'

/** Long enough to resist guessing, and mixed enough to resist a dictionary. */
const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(200)
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.')

/**
 * Gregorian, YYYY-MM-DD.
 *
 * Asked for at registration because asking later is harder than asking once.
 * Exported so the settings screen can let somebody correct a typo in it
 * against this rule rather than a looser copy of it.
 *
 * The regex only shapes the string; the first `refine` is what rejects
 * 2026-02-31, and the second what rejects a year nobody was born in.
 */
export const birthdate = z
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
  }, 'Enter a realistic year of birth.')

export const registerBody = z.object({
  email: z.string().email('Enter a valid email address.').max(255),
  password,
  firstName: z.string().min(1, 'Enter your first name.').max(100),
  lastName: z.string().min(1, 'Enter your last name.').max(100),
  birthdate,
  phoneCountryCode: z.string().max(8).optional(),
  /** Digits only once stored: the field people type into formats as they go
   *  ("81 123 4567"), and two spellings of one number is one too many. */
  phoneNational: z
    .string()
    .max(32)
    .optional()
    .transform((v) => (v === undefined ? undefined : v.replace(/\D/g, ''))),
  locale: z.enum(LOCALES).default('th'),
  /**
   * The terms and the privacy notice, accepted together as one box, as the
   * design has it. `literal(true)` rather than `boolean()`: consent that can
   * be sent as false is not consent, and the only honest answer to an
   * unchecked box is to refuse the registration.
   *
   * It is recorded as `privacyAcceptedAt` on the user, because what matters
   * later is when someone agreed, not that they did.
   */
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Please accept the terms and the privacy notice.' }),
  }),
  /**
   * Which form was filled in. Both create the same kind of account: nobody
   * gets to hand themselves the teacher role by picking it from a list.
   * 'teacher' additionally files an application for an admin to approve, which
   * is what the `teacher_applications` table has a status column for.
   */
  memberType: z.enum(['student', 'teacher']).default('student'),
  /** Required when memberType is 'teacher'; ignored otherwise. */
  teacher: z
    .object({
      subject: z.string().min(1, 'Say what you would like to teach.').max(150),
      experience: z.string().min(1, 'Tell us about your experience.').max(5000),
      reason: z.string().max(5000).optional(),
      contactTime: z.string().max(120).optional(),
    })
    .optional(),
})
  .refine((v) => v.memberType !== 'teacher' || v.teacher !== undefined, {
    message: 'Fill in the teaching details.',
    path: ['teacher'],
  })
  // A teacher application is how someone is contacted back, so the phone
  // number stops being optional on that form.
  .refine((v) => v.memberType !== 'teacher' || Boolean(v.phoneNational), {
    message: 'A phone number is required to apply as a teacher.',
    path: ['phoneNational'],
  })

export const loginBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1, 'Enter your password.').max(200),
  /** Shown in the active-devices list, so people can tell sessions apart. */
  deviceLabel: z.string().max(120).optional(),
  /**
   * "Stay signed in". It decides how long the refresh cookie lives, not how
   * long the token is valid: off, the cookie is dropped when the browser
   * closes, which is what someone on a shared machine is asking for.
   *
   * Defaults to on, because the box is ticked by default and an old client
   * that does not send the field should behave as it did before.
   */
  remember: z.boolean().default(true),
})

export const refreshBody = z.object({
  /** Optional: the cookie is used when the body leaves it out. */
  refreshToken: z.string().min(1).optional(),
})

export const forgotPasswordBody = z.object({
  email: z.string().email().max(255),
})

export const verifyEmailBody = z.object({
  token: z.string().min(1),
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
