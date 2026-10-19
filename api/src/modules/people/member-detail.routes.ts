import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { teacherApplications, teacherPayoutDetails, users } from '../../db/schema/index'
import { audit, diff } from '../../lib/audit'
import {
  PAYOUT_COUNTRIES,
  PAYOUT_CURRENCIES,
  THAI_BANKS,
  isPayoutCountry,
  isPayoutCurrency,
  isSwift,
} from '../../lib/banks'
import { getDefaultRevenueSharePct } from '../../lib/settings'
import { forbidden, notFound } from '../../lib/errors'
import { signedUrl, storageRoot } from '../../lib/storage'
import * as service from './member-detail.service'

/**
 * The tabs on a member's page.
 *
 * One endpoint per tab, because they are opened one at a time and most support
 * calls never leave the first — loading somebody's whole learning history to
 * answer "what is their email" is work nobody asked for.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })

const billingBody = z.object({
  type: z.enum(['corporate', 'individual']),
  name: z.string().trim().min(1).max(255),
  taxId: z.string().trim().min(13).max(20),
  branchType: z.enum(['head', 'branch']).nullish(),
  branchCode: z.string().trim().max(10).nullish(),
  address: z.string().trim().min(1).max(1000),
})

/**
 * What an administrator may change about where a teacher's money goes.
 *
 * The identity document is not here, and that is deliberate. It is the
 * teacher's proof of who they are; an administrator who could replace it could
 * make the bank details match a document nobody outside the building has ever
 * seen. They upload their own, or nobody does.
 */
const payoutBody = z.object({
  /**
   * A path in private storage, which the browser gets back from its upload
   * ticket. Checked against the shape the ticket route issues for this
   * teacher, so a crafted request cannot point one person's record at
   * another's document.
   *
   * Undefined leaves what is there alone; null removes it. Collapsing the two
   * would wipe somebody's passport every time a sort code was corrected.
   */
  idDocumentPath: z.string().trim().max(512).nullish(),
  /** Their CV as it stands now. The one on their application is untouched. */
  resumePath: z.string().trim().max(512).nullish(),
  bankCountry: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => isPayoutCountry(c), 'We do not pay into that country yet.')
    .nullish(),
  bankName: z.string().trim().max(120).nullish(),
  accountName: z.string().trim().max(150).nullish(),
  accountNumber: z.string().trim().max(64).nullish(),
  branch: z.string().trim().max(120).nullish(),
  swift: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => !c || isSwift(c), 'That is not a SWIFT/BIC code.')
    .nullish(),
  payoutCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => isPayoutCurrency(c), 'That is not a currency we pay in.')
    .nullish(),
  /**
   * What this teacher keeps of what the school receives.
   *
   * Admin-only by living on this route and nowhere else: a teacher's own save
   * goes through `/me/payout-details`, which has no such field and so cannot
   * carry one. Null puts them back on the school-wide figure.
   */
  revenueSharePct: z.coerce.number().int().min(0).max(100).nullish(),
})

export default async function memberDetailRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }
  const superOnly = { preHandler: app.requireRole('superadmin') }

  /**
   * Where one teacher's money goes, and the document proving who they are.
   *
   * Read one person at a time, and every read is recorded. A list would mean
   * every account number in the school sitting in a browser tab to draw a
   * table nobody asked to read, and an audit row written on opening a page is
   * the same as no audit row at all — it says only that somebody looked at the
   * screen, which everybody does.
   *
   * The identity document comes back as a link that expires in minutes. It
   * lives outside `content/`, the one folder served without a signature, so
   * this is the only way to see it; signed here rather than through the
   * signing route so that one act leaves one trace.
   */
  app.get('/members/:id/payout-details', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)

    const [person] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    if (!person) throw notFound('That member does not exist.')

    const [row] = await db
      .select()
      .from(teacherPayoutDetails)
      .where(eq(teacherPayoutDetails.userId, id))
      .limit(1)

    /**
     * The CV they sent when they applied.
     *
     * It lives on the application, and once that was decided nothing pointed
     * at it any more: the person became a teacher and the one document saying
     * who they said they were sat in a queue nobody opens twice. Matched on
     * the address, the way an application and an account are tied together
     * everywhere else, and newest first for somebody who applied more than
     * once.
     */
    const [application] = await db
      .select({ resumePath: teacherApplications.resumePath })
      .from(teacherApplications)
      .where(eq(teacherApplications.email, person.email))
      .orderBy(desc(teacherApplications.id))
      .limit(1)

    audit(req, {
      action: 'payout_details.viewed',
      subjectType: 'user',
      subjectId: id,
      summary: `${person.firstName} ${person.lastName}`.trim() || person.email,
    })

    return {
      data: {
        name: `${person.firstName} ${person.lastName}`.trim(),
        email: person.email,
        bankCountry: row?.bankCountry ?? null,
        bankName: row?.bankName ?? null,
        accountName: row?.accountName ?? null,
        accountNumber: row?.accountNumber ?? null,
        branch: row?.branch ?? null,
        swift: row?.swift ?? null,
        payoutCurrency: row?.payoutCurrency ?? null,
        revenueSharePct: row?.revenueSharePct ?? null,
        idDocumentUploadedAt: row?.idDocumentUploadedAt ?? null,
        // Minutes, not hours: long enough to read, short enough that a link
        // copied out of a network tab is useless by the time it travels.
        idDocumentPath: row?.idDocumentPath ?? null,
        idDocumentUrl: row?.idDocumentPath ? signedUrl(row.idDocumentPath, 300) : null,
        /**
         * Whether the teacher sent their own proof, or somebody here did.
         *
         * A document supplied by the same desk that typed the bank details is
         * not wrong, and sometimes it is the only way to help — but it is a
         * different thing, and a second person should be able to see which
         * happened without reading the audit log.
         */
        idDocumentByAdmin: row?.idDocumentBy != null && row.idDocumentBy !== id,
        /** The CV from their application, as a link that expires. Null when
         *  they never sent one. */
        /**
         * Their CV: the one they have replaced it with, or the one they
         * applied with until they do. Two columns, one answer — the screen
         * asks what CV is on file, not which table it is in.
         */
        resumeUrl: (() => {
          const path = row?.resumePath ?? application?.resumePath
          return path ? signedUrl(path, 300) : null
        })(),
        /** True when it is their own upload rather than the application copy. */
        resumeIsCurrent: Boolean(row?.resumePath),
        resumePath: row?.resumePath ?? null,
        countries: PAYOUT_COUNTRIES,
        thaiBanks: THAI_BANKS,
        /**
         * The lists the form builds its dropdowns from.
         *
         * `currencies` was left out of this answer once, and the result was
         * not an empty dropdown anybody would report — it was a dropdown with
         * only "No preference" in it, which matched nothing, so opening the
         * form to fix a branch name quietly cleared whatever currency the
         * teacher had chosen. A select can only hold a value it was given an
         * option for.
         */
        currencies: PAYOUT_CURRENCIES,
        /** What an empty share falls back to, so the form can say so rather than
         *  leaving the reader to guess what blank means. */
        houseSharePct: await getDefaultRevenueSharePct(),
      },
    }
  })

  /**
   * An administrator correcting the bank details.
   *
   * Teachers fill these in themselves, and most of the time should. This is
   * for the cases that reach a support desk instead: a number typed wrong, a
   * bank changed over the phone, a teacher who cannot work the form.
   *
   * It is also the most dangerous button in the admin, because changing where
   * somebody's money goes is exactly what a fraud would do. So the audit row
   * names which fields moved, and records the last four digits of the account
   * number on each side rather than the number itself — enough to see that it
   * changed and to recognise which account, without copying the whole thing
   * into a table more people can read than can read this one.
   */
  app.put('/members/:id/payout-details', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = payoutBody.parse(req.body)

    const [person] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    if (!person) throw notFound('That member does not exist.')

    /**
     * The document must be one uploaded into this teacher's folder.
     *
     * The ticket route only ever issues a folder named after the teacher it is
     * for, so anything else arriving here was not obtained through it — and
     * this screen trusts the field to say whose passport it is showing.
     */
    if (body.idDocumentPath) {
      const theirs = `${storageRoot()}/identity/${id}/`
      if (!body.idDocumentPath.startsWith(theirs)) {
        throw forbidden('That document was not uploaded for this teacher.')
      }
    }

    const [before] = await db
      .select()
      .from(teacherPayoutDetails)
      .where(eq(teacherPayoutDetails.userId, id))
      .limit(1)

    const values = {
      /**
       * Omitted means unchanged; null means cleared.
       *
       * These used to be written unconditionally, so a request carrying one
       * field blanked every other — a client that sent only a new CV erased
       * the bank account the money goes to. The two meanings are worth
       * keeping apart on a record whose whole purpose is being correct.
       */
      ...(body.bankCountry === undefined ? {} : { bankCountry: body.bankCountry ?? null }),
      ...(body.bankName === undefined ? {} : { bankName: body.bankName ?? null }),
      ...(body.accountName === undefined ? {} : { accountName: body.accountName ?? null }),
      ...(body.accountNumber === undefined ? {} : { accountNumber: body.accountNumber ?? null }),
      ...(body.branch === undefined ? {} : { branch: body.branch ?? null }),
      ...(body.swift === undefined ? {} : { swift: body.swift ?? null }),
      ...(body.payoutCurrency === undefined ? {} : { payoutCurrency: body.payoutCurrency ?? null }),
      ...(body.revenueSharePct === undefined ? {} : { revenueSharePct: body.revenueSharePct ?? null }),
      /**
       * Who supplied the proof, kept beside it.
       *
       * Only when the document itself changed. The form sends every field it
       * is showing, including the path it loaded, so a saved correction to a
       * sort code arrives carrying the teacher's own document — and stamping
       * the administrator on that would rewrite the one fact this column
       * exists to record. It said an administrator had supplied a document the
       * teacher had sent themselves, which is the opposite of the truth and
       * the version that looks worse.
       *
       * Undefined leaves it alone; null removes it; a different path is a new
       * document and is stamped with whoever sent it.
       */
      ...(body.resumePath === undefined
        ? {}
        : {
            resumePath: body.resumePath,
            resumeUploadedAt: body.resumePath ? new Date() : null,
          }),
      ...(body.idDocumentPath === undefined || body.idDocumentPath === before?.idDocumentPath
        ? {}
        : {
            idDocumentPath: body.idDocumentPath,
            idDocumentUploadedAt: body.idDocumentPath ? new Date() : null,
            idDocumentBy: body.idDocumentPath ? req.user.sub : null,
          }),
    }

    if (before) {
      await db
        .update(teacherPayoutDetails)
        .set(values)
        .where(eq(teacherPayoutDetails.userId, id))
    } else {
      await db.insert(teacherPayoutDetails).values({ userId: id, ...values })
    }

    /** The last four digits stand in for the number everywhere it is logged. */
    const tail = (n: string | null | undefined) => (n ? `***${n.slice(-4)}` : null)

    audit(req, {
      action: 'payout_details.changed_by_admin',
      subjectType: 'user',
      subjectId: id,
      summary: `${person.firstName} ${person.lastName}`.trim() || person.email,
      changes: diff(
        {
          bankCountry: before?.bankCountry ?? null,
          bankName: before?.bankName ?? null,
          accountName: before?.accountName ?? null,
          accountNumber: tail(before?.accountNumber),
          branch: before?.branch ?? null,
          swift: before?.swift ?? null,
          payoutCurrency: before?.payoutCurrency ?? null,
          revenueSharePct: before?.revenueSharePct ?? null,
        },
        { ...values, accountNumber: tail(values.accountNumber) },
      ),
    })

    return { data: { ok: true } }
  })

  app.get('/members/:id/summary', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.summary(id) }
  })

  app.get('/members/:id/courses', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.courseAccess(id) }
  })

  app.get('/members/:id/learning', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.learning(id) }
  })

  app.get('/members/:id/payments', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.payments(id) }
  })

  app.get('/members/:id/billing', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    return { data: await service.billing(id) }
  })

  app.put('/members/:id/billing', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = billingBody.parse(req.body)
    const { before, after } = await service.saveBilling(id, body)

    audit(req, {
      action: before ? 'member.billing_updated' : 'member.billing_added',
      subjectType: 'user',
      subjectId: id,
      summary: after?.name,
      changes: before && after ? diff(before, after) : null,
    })
    return { data: after }
  })

  app.delete('/members/:id/billing', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const before = await service.clearBilling(id)

    audit(req, {
      action: 'member.billing_removed',
      subjectType: 'user',
      subjectId: id,
      summary: before.name,
    })
    return reply.status(204).send()
  })

  /**
   * Ends or restores access to one course by hand.
   *
   * Superadmin, because it takes away something somebody paid for without
   * giving their money back — which is a decision, not an edit.
   */
  app.post('/members/:id/entitlements/:entitlementId/toggle', superOnly, async (req) => {
    const { id, entitlementId } = z
      .object({
        id: z.coerce.number().int().positive(),
        entitlementId: z.coerce.number().int().positive(),
      })
      .parse(req.params)

    const result = await service.revokeAccess(id, entitlementId)

    audit(req, {
      action: result.now === 'revoked' ? 'entitlement.revoked' : 'entitlement.restored',
      subjectType: 'user',
      subjectId: id,
      summary: result.courseTitle,
      changes: { status: [result.was, result.now] },
    })
    return { data: result }
  })

  /**
   * Moves when access runs out — usually to give somebody a few more days.
   *
   * Superadmin, for the same reason as the toggle above: this hands out (or
   * takes back) something that was paid for, and that is a decision rather
   * than an edit. The audit log keeps the old date beside the new one.
   */
  app.patch('/members/:id/entitlements/:entitlementId', superOnly, async (req) => {
    const { id, entitlementId } = z
      .object({
        id: z.coerce.number().int().positive(),
        entitlementId: z.coerce.number().int().positive(),
      })
      .parse(req.params)

    const { expiresAt } = z
      .object({
        /** A date, or null for lifetime. Null is a real value here. */
        expiresAt: z.string().datetime({ offset: true }).nullable(),
      })
      .parse(req.body)

    const result = await service.setAccessExpiry(
      id,
      entitlementId,
      expiresAt ? new Date(expiresAt) : null,
    )

    audit(req, {
      action: 'entitlement.expiry_changed',
      subjectType: 'user',
      subjectId: id,
      summary: result.courseTitle,
      changes: { expiresAt: [result.was ?? 'lifetime', result.now ?? 'lifetime'] },
    })
    return { data: result }
  })
}
