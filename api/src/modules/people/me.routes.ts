import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../db/client'
import { LOCALES } from '../../db/schema/auth'
import { teacherProfiles, users } from '../../db/schema/index'
import { audit, diff } from '../../lib/audit'
import { notFound } from '../../lib/errors'
import * as people from './people.service'

/**
 * Your own account.
 *
 * Deliberately narrow. Email, roles and status are not here: changing an email
 * needs the new address proved, and the two things that decide what somebody
 * can do are not things they should be able to hand themselves. Those stay on
 * the admin screens, where they are audited as one person acting on another.
 *
 * What is left is the stuff nobody else should have to do for you — your name,
 * your photo, your phone, the language you read the admin in — and, for a
 * teacher, the public page that goes on their courses.
 */

const profileBody = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(100),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(100),
  phoneCountryCode: z.string().trim().max(8).nullish(),
  phoneNational: z.string().trim().max(32).nullish(),
  locale: z.enum(LOCALES),
  /** Set after the browser has uploaded it with a ticket. */
  avatarPath: z.string().trim().max(512).nullish(),
})

/** The same shape the admin's teacher-profile screen sends. */
const teacherProfileBody = z.object({
  displayName: z.string().trim().min(1).max(150),
  shortName: z.string().trim().min(1).max(100),
  headline: z.string().trim().max(180).nullish(),
  bio: z.string().trim().max(5000).nullish(),
  languages: z.array(z.enum(LOCALES)).max(4).optional(),
  credentials: z.string().trim().max(5000).nullish(),
  yearsExperience: z.coerce.number().int().min(0).max(80).nullish(),
})

export default async function meRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: app.authenticate }

  app.get('/me/profile', signedIn, async (req) => {
    return { data: await people.getMember(req.user.sub) }
  })

  app.patch('/me/profile', signedIn, async (req) => {
    const body = profileBody.parse(req.body)
    const before = await people.getMember(req.user.sub)

    await db
      .update(users)
      .set({
        firstName: body.firstName,
        lastName: body.lastName,
        phoneCountryCode: body.phoneCountryCode ?? null,
        phoneNational: body.phoneNational ?? null,
        locale: body.locale,
        // Undefined leaves the photo alone; null is "remove it". Collapsing the
        // two would wipe somebody's photo every time they fixed a typo.
        ...(body.avatarPath === undefined ? {} : { avatarPath: body.avatarPath }),
      })
      .where(eq(users.id, req.user.sub))

    const after = await people.getMember(req.user.sub)
    audit(req, {
      action: 'member.self_updated',
      subjectType: 'user',
      subjectId: req.user.sub,
      summary: `${after.firstName} ${after.lastName}`,
      changes: diff(before, after),
    })
    return { data: after }
  })

  /**
   * A teacher's own public page.
   *
   * The same record the admin can edit, written by its owner. The slug and
   * whether they are listed are not here: a slug is a published URL that other
   * pages point at, and a teacher removing themselves from the site is a
   * decision for whoever runs it.
   */
  app.get('/me/teacher-profile', signedIn, async (req) => {
    if (!req.user.roles.includes('teacher')) return { data: null }
    return { data: await people.getTeacherProfile(req.user.sub) }
  })

  app.put('/me/teacher-profile', { preHandler: app.requireRole('teacher') }, async (req) => {
    const body = teacherProfileBody.parse(req.body)

    const [existing] = await db
      .select({ slug: teacherProfiles.slug, listed: teacherProfiles.listed })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.userId, req.user.sub))
      .limit(1)
    if (!existing) {
      throw notFound(
        'Your public page has not been set up yet. An administrator creates it with your web address.',
      )
    }

    // saveTeacherProfile already returns both sides, for exactly this.
    const { before, after } = await people.saveTeacherProfile(req.user.sub, {
      ...body,
      // Carried over rather than taken from the request: neither is theirs to
      // change, and sending them back would let a crafted request try.
      slug: existing.slug,
      listed: existing.listed,
    })

    audit(req, {
      action: 'teacher.self_updated',
      subjectType: 'user',
      subjectId: req.user.sub,
      summary: after.displayName,
      changes: before ? diff(before as never, after as never) : null,
    })
    return { data: after }
  })
}
