import { richTextField } from '../../lib/rich-text'
import { desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../db/client'
import { LOCALES } from '../../db/schema/auth'
import { birthdate } from '../auth/auth.schemas'
import { teacherApplications, teacherPayoutDetails, teacherProfiles, users } from '../../db/schema/index'
import { audit, diff } from '../../lib/audit'
import { PAYOUT_COUNTRIES, THAI_BANKS, isPayoutCountry, isSwift } from '../../lib/banks'
import { isCurrencyCode, CURRENCIES } from '../../lib/currencies'
import { getDefaultRevenueSharePct } from '../../lib/settings'
import { conflict, forbidden, notFound } from '../../lib/errors'
import { signedUrl, storageRoot } from '../../lib/storage'
import * as myCourses from '../learning/mycourses.service'
import * as memberDetail from './member-detail.service'
import * as consents from './consents.service'
import * as notify from './notify.service'
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
  /**
   * The same rule registration applies, because it is the same fact.
   *
   * Editable here: nothing in the system turns on it today, it was typed once
   * while someone was in a hurry to get in, and the person it belongs to is
   * the one who knows what it should say. Optional only so a client sending
   * the rest of the form without it does not wipe it.
   */
  birthdate: birthdate.optional(),
  phoneCountryCode: z.string().trim().max(8).nullish(),
  /** Digits only. See the note in `auth.schemas.ts`. */
  phoneNational: z
    .string()
    .trim()
    .max(32)
    .nullish()
    .transform((v) => (v === null || v === undefined ? v : v.replace(/\D/g, ''))),
  locale: z.enum(LOCALES),
  /** Set after the browser has uploaded it with a ticket. */
  avatarPath: z.string().trim().max(512).nullish(),
})

/** The same shape the admin's member-billing screen sends. */
const billingBody = z.object({
  type: z.enum(['corporate', 'individual']),
  name: z.string().trim().min(1).max(255),
  taxId: z.string().trim().min(13).max(20),
  branchType: z.enum(['head', 'branch']).nullish(),
  branchCode: z.string().trim().max(10).nullish(),
  address: z.string().trim().min(1).max(1000),
})

/** Only the switches that were sent. An absent one is left as it was. */
const consentBody = z
  .object({
    news: z.boolean().optional(),
    newCourses: z.boolean().optional(),
    expiryAlert: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' })

/** The same shape the admin's teacher-profile screen sends. */
const teacherProfileBody = z.object({
  /**
   * Their own web address.
   *
   * Optional, so a client that sends nothing leaves it where it was rather
   * than clearing it. Uniqueness is checked on save, which is the only place
   * that can see every other teacher's.
   */
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(150)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letters, numbers and hyphens.')
    .optional(),
  displayName: z.string().trim().min(1).max(150),
  shortName: z.string().trim().min(1).max(100),
  headline: z.string().trim().max(180).nullish(),
  bio: richTextField(5000),
  languages: z.array(z.enum(LOCALES)).max(4).optional(),
  credentials: z.string().trim().max(5000).nullish(),
  yearsExperience: z.coerce.number().int().min(0).max(80).nullish(),
})

/**
 * What the school needs in order to pay somebody.
 *
 * The account number is kept as the bank writes it, hyphens and all, rather
 * than reduced to digits: a transfer is typed from what the teacher wrote, and
 * silently reformatting somebody's account number is how money goes to the
 * wrong place.
 */
const payoutDetailsBody = z.object({
  /**
   * A path in private storage, which the browser gets back from its upload
   * ticket. Checked against the shape the ticket route issues, so that a
   * crafted request cannot point this record at somebody else's document and
   * make the admin screen show it as this teacher's.
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
    .refine((c) => isCurrencyCode(c), 'That is not a currency we pay in.')
    .nullish(),
})

export default async function meRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: app.authenticate }

  /**
   * Everything this member may study.
   *
   * Drawn from entitlements, so free enrolments, paid orders and an order a
   * superadmin marked paid by hand all appear the same way — which is the point:
   * what is on this page is what access exists, not what was bought.
   */
  /**
   * Where this member's tax invoices go.
   *
   * The same details the checkout asks for, kept so it only has to ask once.
   * Their own, not anybody else's — the admin has its own pair of these on the
   * member screen, and this one can only ever read and write the account that
   * is signed in.
   *
   * Null rather than 404 when nothing is saved: "we have nothing for you" is an
   * answer, and a checkout asking this on every visit should not have to treat
   * the ordinary case as an error.
   */
  app.get('/me/billing', signedIn, async (req) => {
    return { data: await memberDetail.billing(req.user.sub) }
  })

  app.put('/me/billing', signedIn, async (req) => {
    const body = billingBody.parse(req.body)
    const { before, after } = await memberDetail.saveBilling(req.user.sub, body)

    audit(req, {
      action: before ? 'member.billing_updated' : 'member.billing_added',
      subjectType: 'user',
      subjectId: req.user.sub,
      summary: body.name,
      changes: diff(before ?? {}, after ?? {}),
    })
    return { data: after }
  })

  app.delete('/me/billing', signedIn, async (req, reply) => {
    const before = await memberDetail.clearBilling(req.user.sub)
    audit(req, {
      action: 'member.billing_removed',
      subjectType: 'user',
      subjectId: req.user.sub,
      summary: before.name,
    })
    return reply.status(204).send()
  })

  /**
   * What this member has agreed to be sent.
   *
   * Never 404: nobody has touched a switch is the ordinary case, and it has an
   * answer — no to the two we would have to ask for, yes to the one about
   * access they paid for running out. A client should not have to treat the
   * normal state as an error.
   */
  app.get('/me/consents', signedIn, async (req) => {
    return { data: await consents.get(req.user.sub) }
  })

  /**
   * Only the switches that were sent are changed, so a screen that shows one
   * of them cannot silently clear the others.
   *
   * Audited, because withdrawing consent is the half somebody may later need
   * to prove they did.
   */
  app.put('/me/consents', signedIn, async (req) => {
    const body = consentBody.parse(req.body)
    const before = await consents.get(req.user.sub)
    const after = await consents.save(req.user.sub, body)

    audit(req, {
      action: 'member.consents_updated',
      subjectType: 'user',
      subjectId: req.user.sub,
      summary: Object.keys(body).join(', '),
      changes: diff({ ...before }, { ...after }),
    })
    return { data: after }
  })

  /* ---------------- what happened while you were away ---------------- */

  /**
   * Your own notifications, for one app.
   *
   * `surface` is required rather than defaulted, because the two apps hold
   * different things: a learner's receipt links into the public site and a
   * teacher's essay queue into the admin, and a list that mixed them would
   * offer links half of which lead nowhere the reader can go.
   */
  app.get('/me/notifications', signedIn, async (req) => {
    const query = z
      .object({
        surface: z.enum(['site', 'admin']),
        unreadOnly: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(30),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query)

    const { rows, ...meta } = await notify.listFor(req.user.sub, query.surface, {
      unreadOnly: query.unreadOnly ?? false,
      limit: query.limit,
      page: query.page,
    })
    return { data: rows, meta }
  })

  /** Just the badge. Cheap enough to ask for on every page. */
  app.get('/me/notifications/unread-count', signedIn, async (req) => {
    const { surface } = z.object({ surface: z.enum(['site', 'admin']) }).parse(req.query)
    return { data: { unread: await notify.unreadCount(req.user.sub, surface) } }
  })

  /** 204 whether or not it was yours: the reply must not say which ids exist. */
  app.post('/me/notifications/:id/read', signedIn, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    await notify.markRead(req.user.sub, id)
    return reply.status(204).send()
  })

  app.post('/me/notifications/read-all', signedIn, async (req) => {
    const { surface } = z
      .object({ surface: z.enum(['site', 'admin']) })
      .parse((req.body as Record<string, unknown>) ?? {})
    return { data: { read: await notify.markAllRead(req.user.sub, surface) } }
  })

  app.get('/me/courses', signedIn, async (req) => {
    return { data: await myCourses.myCourses(req.user.sub) }
  })

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
        ...(body.birthdate === undefined ? {} : { birthdate: body.birthdate }),
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
      /**
       * Their own web address, theirs to change.
       *
       * It was carried over from the stored record for a while, on the
       * reasoning that a published URL is not one person's to break — a course
       * page, a shared link and a search result all point at it. That is true,
       * and it is still their name on the page, so the school decided they may
       * change it. Uniqueness is enforced below either way; what is lost is
       * only that old links to the old address stop working.
       */
      slug: body.slug ?? existing.slug,
      // Not theirs: a teacher removing themselves from the site, or adding
      // themselves to it, is a decision for whoever runs it.
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

  /**
   * The CV that goes with an application to teach.
   *
   * Sent moments after registering, by the applicant, who at that point is an
   * ordinary member — applying does not grant the role, so this cannot be
   * gated on being a teacher. It is gated on there being an application in
   * their name that nobody has decided yet.
   *
   * Separate from registering because the file is uploaded with a token the
   * registration itself returns: the form signs the person up, gets a key to
   * the door, puts the file through it, and then says which application it
   * belongs to. One click for the applicant, three steps underneath.
   */
  app.post('/me/application-files', signedIn, async (req) => {
    const body = z
      .object({
        resumePath: z.string().trim().max(512).nullish(),
        sampleVideoPath: z.string().trim().max(512).nullish(),
      })
      .parse(req.body)

    // The ticket route only ever issues this person's own folder, so anything
    // else was not obtained through it.
    const mine = `${storageRoot()}/applications/${req.user.sub}/`
    for (const path of [body.resumePath, body.sampleVideoPath]) {
      if (path && !path.startsWith(mine)) {
        throw forbidden('That file was not uploaded by you.')
      }
    }

    const [me] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, req.user.sub))
      .limit(1)
    if (!me) throw notFound('That account does not exist.')

    // Matched on the address they applied with, which is how an application
    // and an account are tied together everywhere else. Newest first: somebody
    // who applied, was turned down and applied again means the latest one.
    const [application] = await db
      .select({ id: teacherApplications.id, status: teacherApplications.status })
      .from(teacherApplications)
      .where(eq(teacherApplications.email, me.email))
      .orderBy(desc(teacherApplications.id))
      .limit(1)

    if (!application) throw notFound('You have no application to attach this to.')
    if (application.status !== 'pending') {
      throw conflict('That application has already been decided.')
    }

    await db
      .update(teacherApplications)
      .set({
        // Each file is left alone unless one was sent, so a failed video
        // upload cannot wipe the CV that went up a moment earlier.
        ...(body.resumePath ? { resumePath: body.resumePath } : {}),
        ...(body.sampleVideoPath ? { sampleVideoPath: body.sampleVideoPath } : {}),
      })
      .where(eq(teacherApplications.id, application.id))

    return { data: { ok: true } }
  })

  /**
   * How a teacher gets paid: their identity document and their bank.
   *
   * Only ever their own. There is no route here that reads anybody else's —
   * an administrator making a payout reads it from the admin screens, where
   * one person acting on another is audited as such.
   *
   * The currencies come back with it so that the form does not keep its own
   * copy of the list and drift from what the server will accept.
   */
  app.get('/me/payout-details', { preHandler: app.requireRole('teacher') }, async (req) => {
    const [row] = await db
      .select()
      .from(teacherPayoutDetails)
      .where(eq(teacherPayoutDetails.userId, req.user.sub))
      .limit(1)

    /**
     * The CV they sent when they applied.
     *
     * Their own document, and they should be able to see which one the school
     * is holding — not least to know whether it is still the right one.
     */
    const [me] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, req.user.sub))
      .limit(1)
    const [application] = me
      ? await db
          .select({ resumePath: teacherApplications.resumePath })
          .from(teacherApplications)
          .where(eq(teacherApplications.email, me.email))
          .orderBy(desc(teacherApplications.id))
          .limit(1)
      : []

    return {
      data: {
        idDocumentPath: row?.idDocumentPath ?? null,
        idDocumentUploadedAt: row?.idDocumentUploadedAt ?? null,
        bankCountry: row?.bankCountry ?? null,
        bankName: row?.bankName ?? null,
        accountName: row?.accountName ?? null,
        accountNumber: row?.accountNumber ?? null,
        branch: row?.branch ?? null,
        swift: row?.swift ?? null,
        payoutCurrency: row?.payoutCurrency ?? null,
        /** Read-only here. Only an administrator sets it, through the member
         *  route — this one has no field for it, so a save cannot carry one. */
        revenueSharePct: row?.revenueSharePct ?? null,
        currencies: CURRENCIES.map((c) => ({ code: c.code, name: c.name })),
        /** What an empty share falls back to, so the form can say so rather than
         *  leaving the reader to guess what blank means. */
        houseSharePct: await getDefaultRevenueSharePct(),
        /** The CV from their application, as a link that expires. */
        /**
         * Their CV: the one they have replaced it with, or the one they applied
         * with until they do. Two columns, one answer — the screen asks "what CV
         * is on file", not "which table is it in".
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
      },
    }
  })

  app.put('/me/payout-details', { preHandler: app.requireRole('teacher') }, async (req) => {
    const body = payoutDetailsBody.parse(req.body)

    /**
     * The document must be one this teacher uploaded.
     *
     * The ticket route only ever issues `…/identity/<the requester's id>/`, so
     * anything else arriving here was not obtained through it. Without this
     * check a teacher could point their record at another teacher's document
     * — and the admin screen, which trusts this field to say whose passport it
     * is showing, would show the wrong person's.
     */
    // Their ID and their CV share the folder, so they share the rule.
    const mine = `${storageRoot()}/identity/${req.user.sub}/`
    for (const path of [body.idDocumentPath, body.resumePath]) {
      if (path && !path.startsWith(mine)) {
        throw forbidden('That file was not uploaded by you.')
      }
    }

    const [before] = await db
      .select()
      .from(teacherPayoutDetails)
      .where(eq(teacherPayoutDetails.userId, req.user.sub))
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
      // Undefined leaves the document alone; null removes it. Collapsing the
      // two would wipe somebody's passport every time they corrected a sort
      // code.
      ...(body.idDocumentPath === undefined
        ? {}
        : {
            idDocumentPath: body.idDocumentPath,
            idDocumentUploadedAt: body.idDocumentPath ? new Date() : null,
          }),
      // Undefined leaves it alone; null takes it off. The same two meanings
      // the document above has, for the same reason.
      ...(body.resumePath === undefined
        ? {}
        : {
            resumePath: body.resumePath,
            resumeUploadedAt: body.resumePath ? new Date() : null,
          }),
    }

    if (before) {
      await db
        .update(teacherPayoutDetails)
        .set(values)
        .where(eq(teacherPayoutDetails.userId, req.user.sub))
    } else {
      await db.insert(teacherPayoutDetails).values({ userId: req.user.sub, ...values })
    }

    const [after] = await db
      .select()
      .from(teacherPayoutDetails)
      .where(eq(teacherPayoutDetails.userId, req.user.sub))
      .limit(1)

    // The same CV the read above returns, so the card does not lose it the
    // moment somebody corrects a sort code.
    const [me] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, req.user.sub))
      .limit(1)
    const [application] = me
      ? await db
          .select({ resumePath: teacherApplications.resumePath })
          .from(teacherApplications)
          .where(eq(teacherApplications.email, me.email))
          .orderBy(desc(teacherApplications.id))
          .limit(1)
      : []

    /**
     * Audited without the numbers.
     *
     * An audit row is read by more people than the record it describes, and a
     * diff of this one would copy the account number into a second table that
     * nothing redacts. What is worth keeping is that it changed and when; the
     * value itself is one query away for whoever is entitled to it.
     */
    audit(req, {
      action: 'payout_details.self_updated',
      subjectType: 'user',
      subjectId: req.user.sub,
      summary: before ? 'updated' : 'first saved',
      changes: null,
    })

    return {
      data: {
        idDocumentPath: after?.idDocumentPath ?? null,
        idDocumentUploadedAt: after?.idDocumentUploadedAt ?? null,
        bankCountry: after?.bankCountry ?? null,
        bankName: after?.bankName ?? null,
        accountName: after?.accountName ?? null,
        accountNumber: after?.accountNumber ?? null,
        branch: after?.branch ?? null,
        swift: after?.swift ?? null,
        payoutCurrency: after?.payoutCurrency ?? null,
        /** Read-only here. Only an administrator sets it, through the member
         *  route — this one has no field for it, so a save cannot carry one. */
        revenueSharePct: after?.revenueSharePct ?? null,
        currencies: CURRENCIES.map((c) => ({ code: c.code, name: c.name })),
        /** What an empty share falls back to, so the form can say so rather than
         *  leaving the reader to guess what blank means. */
        houseSharePct: await getDefaultRevenueSharePct(),
        /** The CV from their application, as a link that expires. */
        /**
         * Their CV: the one they have replaced it with, or the one they applied
         * with until they do. Two columns, one answer — the screen asks "what CV
         * is on file", not "which table is it in".
         */
        resumeUrl: (() => {
          const path = after?.resumePath ?? application?.resumePath
          return path ? signedUrl(path, 300) : null
        })(),
        /** True when it is their own upload rather than the application copy. */
        resumeIsCurrent: Boolean(after?.resumePath),
        resumePath: after?.resumePath ?? null,
        countries: PAYOUT_COUNTRIES,
        thaiBanks: THAI_BANKS,
      },
    }
  })
}
