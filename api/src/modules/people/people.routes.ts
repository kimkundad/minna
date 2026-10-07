import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit } from '../../lib/audit'
import { conflict, forbidden } from '../../lib/errors'
import { env } from '../../config/env'
import { emailVerifiedMail, passwordResetMail } from '../../lib/email-templates'
import { sendMail } from '../../lib/mailer'
import * as schemas from './people.schemas'
import * as authService from '../auth/auth.service'
import * as service from './people.service'

/**
 * Members, their roles, and the applications to teach.
 *
 * Reading is an admin's job. Granting roles and suspending accounts are a
 * superadmin's, because they are the two powers that could be turned on the
 * people who hold them: an admin who can grant roles can make itself a
 * superadmin, and the distinction stops meaning anything.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })

export default async function peopleRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }
  const superOnly = { preHandler: app.requireRole('superadmin') }

  app.get('/members', adminOnly, async (req) => {
    const query = schemas.memberListQuery.parse(req.query)
    return service.listMembers(query)
  })

  app.get('/members/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.getMember(id) }
  })

  /**
   * Creates a staff account with the password its creator typed.
   *
   * A link to the person's own inbox would be better — nobody else would ever
   * know the password — but the page that link lands on does not exist yet, so
   * a link would create accounts that cannot be opened. Until it does, the
   * creator types one and the audit log records that they did.
   */
  app.post('/members', superOnly, async (req, reply) => {
    const body = schemas.createMemberBody.parse(req.body)
    const created = await service.createMember(body)
    await service.setPassword(created.id, body.password)

    audit(req, {
      action: 'member.created',
      subjectType: 'user',
      subjectId: created.id,
      summary: `${created.email} as ${created.roles.join(', ')}, password set by its creator`,
    })

    return reply.status(201).send({ data: created })
  })

  /**
   * Sets a member's password outright.
   *
   * The set-password link is the better route and stays available, but it has
   * to reach an inbox. Until mail is working a team would otherwise have no way
   * to get a new administrator in at all, so a superadmin can type one.
   *
   * It is a loud action by design: every session of theirs ends, and the audit
   * log names who did it. A password two people know is not a password, and the
   * record is what makes that recoverable rather than invisible.
   */
  app.put('/members/:id/password', superOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = schemas.setPasswordBody.parse(req.body)
    const member = await service.setPassword(id, body.password)

    audit(req, {
      action: 'member.password_set',
      subjectType: 'user',
      subjectId: id,
      summary: `${member.email} — set by another administrator`,
    })
    return { data: { id, email: member.email } }
  })

  app.post('/members/:id/password-reset', superOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const member = await service.getMember(id)

    const reset = await authService.createPasswordReset(member.email)
    const url = reset ? `${env.APP_URL}/reset-password?token=${reset.token}` : null
    if (url) {
      void sendMail({ ...passwordResetMail(member.firstName, url), to: member.email }, req.log)
    }

    audit(req, {
      action: 'member.password_reset_sent',
      subjectType: 'user',
      subjectId: id,
      summary: member.email,
    })

    return reply.status(202).send({ sent: Boolean(url) })
  })

  app.put('/members/:id/roles', superOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const { roles } = schemas.setRolesBody.parse(req.body)

    // Taking your own superadmin away locks you out of the screen that could
    // give it back. If that is really the intent, another superadmin can do it.
    if (id === req.user.sub && !roles.includes('superadmin')) {
      throw conflict('You cannot remove your own superadmin role.')
    }

    const target = await service.getMember(id)
    if (
      target.roles.includes('superadmin') &&
      !roles.includes('superadmin') &&
      (await service.countSuperadmins()) <= 1
    ) {
      throw conflict('That is the only superadmin. Promote someone else first.')
    }

    const { before, after } = await service.setRoles(id, roles)

    audit(req, {
      action: 'member.roles_changed',
      subjectType: 'user',
      subjectId: id,
      summary: target.email,
      changes: { roles: [before, after] },
    })
    return { data: await service.getMember(id) }
  })

  app.put('/members/:id/status', superOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = schemas.setStatusBody.parse(req.body)

    if (id === req.user.sub && body.status === 'suspended') {
      throw conflict('You cannot suspend your own account.')
    }

    const { before, after, member } = await service.setStatus(id, body.status)

    audit(req, {
      action: body.status === 'suspended' ? 'member.suspended' : 'member.reinstated',
      subjectType: 'user',
      subjectId: id,
      summary: body.reason ? `${member.email} — ${body.reason}` : member.email,
      changes: { status: [before, after] },
    })
    return { data: await service.getMember(id) }
  })

  /* ---------------- teacher applications ---------------- */

  app.get('/teacher-applications', adminOnly, async (req) => {
    const query = schemas.applicationListQuery.parse(req.query)
    return service.listApplications(query)
  })

  app.get('/teacher-applications/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.getApplication(id) }
  })

  app.post('/teacher-applications/:id/decision', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = schemas.decideApplicationBody.parse(req.body)

    const { application, granted } = await service.decideApplication(
      id,
      body.decision,
      req.user.sub,
      body.categoryId,
    )

    // An approval that nobody is told about is an approval that does not
    // happen: the applicant has no way to know their account changed.
    if (body.decision === 'approved' && application.account) {
      void sendMail(
        {
          ...emailVerifiedMail(application.name),
          to: application.email,
          subject: 'You can now teach on Minna',
          text: `Hello ${application.name},\n\nYour application to teach has been approved. Sign in and you will find your courses in the admin.\n\n— Minna`,
          html: `<p>Hello ${application.name},</p><p>Your application to teach has been approved. Sign in and you will find your courses in the admin.</p><p>— Minna</p>`,
        },
        req.log,
      )
    }

    audit(req, {
      action: body.decision === 'approved' ? 'application.approved' : 'application.rejected',
      subjectType: 'teacher_application',
      subjectId: id,
      summary: body.note ? `${application.email} — ${body.note}` : application.email,
      ...(granted ? { changes: { teacherRole: [false, true] } } : {}),
    })

    return { data: application, granted }
  })

  // Deleting a member is not offered. Everything they bought, were taught and
  // were marked on hangs off their id, and `status: suspended` stops an account
  // without taking a year of someone else's records with it.
  app.delete('/members/:id', superOnly, async () => {
    throw forbidden('Members are suspended, not deleted.')
  })
}
