import { and, desc, eq, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../db/client'
import { auditLogs, users } from '../../db/schema/index'

/**
 * Reading the audit log.
 *
 * Superadmin only, and read-only — there is no endpoint that writes or deletes
 * one from outside. A log an operator can edit is not evidence of anything, and
 * the people most likely to want a row gone are the ones it is about.
 *
 * Entries are never removed here. If they ever need pruning it should be a
 * scheduled job with a retention period, not a button.
 */
export default async function auditRoutes(app: FastifyInstance) {
  const superOnly = { preHandler: app.requireRole('superadmin') }

  app.get('/audit', superOnly, async (req) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(30),
        /**
         * Actions are named `thing.verb`, so a group of them is a prefix:
         * `coupon.` is every coupon change. Comma separated for "money", which
         * is orders, invoices and coupons together.
         *
         * A prefix rather than the full list of action names, because the list
         * grows and a query string holding thirty of them is both ugly and, at
         * one point here, long enough to be rejected.
         */
        prefix: z.string().max(200).optional(),
        /** The inverse, for "everything except sign-ins". */
        notPrefix: z.string().max(200).optional(),
        actorId: z.coerce.number().int().positive().optional(),
        subjectType: z.string().max(40).optional(),
        subjectId: z.coerce.number().int().positive().optional(),
        /** Matches the summary, the actor's email, or the action. */
        q: z.string().max(100).optional(),
        since: z.string().datetime({ offset: true }).optional(),
      })
      .parse(req.query)

    const term = `%${query.q ?? ''}%`
    const list = (v: string | undefined) =>
      v?.split(',').map((p) => p.trim()).filter(Boolean) ?? []

    const include = list(query.prefix)
    const exclude = list(query.notPrefix)

    const where = [
      include.length
        ? or(...include.map((p) => sql`${auditLogs.action} LIKE ${`${p}%`}`))
        : undefined,
      exclude.length
        ? and(...exclude.map((p) => sql`${auditLogs.action} NOT LIKE ${`${p}%`}`))
        : undefined,
      query.actorId ? eq(auditLogs.actorId, query.actorId) : undefined,
      query.subjectType ? eq(auditLogs.subjectType, query.subjectType) : undefined,
      query.subjectId ? eq(auditLogs.subjectId, query.subjectId) : undefined,
      query.since ? sql`${auditLogs.createdAt} >= ${new Date(query.since)}` : undefined,
      query.q
        ? sql`(${auditLogs.summary} LIKE ${term} OR ${auditLogs.actorEmail} LIKE ${term}
               OR ${auditLogs.action} LIKE ${term})`
        : undefined,
    ].filter(Boolean)
    const filter = where.length ? and(...(where as never[])) : undefined

    const [{ value: total } = { value: 0 }] = await db
      .select({ value: sql<number>`COUNT(*)` })
      .from(auditLogs)
      .where(filter)

    const rows = await db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorRole: auditLogs.actorRole,
        /** Copied in at the time, so it survives the account being deleted. */
        actorEmail: auditLogs.actorEmail,
        action: auditLogs.action,
        subjectType: auditLogs.subjectType,
        subjectId: auditLogs.subjectId,
        summary: auditLogs.summary,
        changes: auditLogs.changes,
        ip: auditLogs.ip,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(filter)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage)

    return {
      data: rows,
      meta: {
        page: query.page,
        perPage: query.perPage,
        total: Number(total),
        totalPages: Math.max(1, Math.ceil(Number(total) / query.perPage)),
      },
    }
  })

  /**
   * What the filters can offer.
   *
   * Taken from the rows that exist rather than from a list in the code: an
   * action nobody has ever performed is not worth a line in a dropdown, and one
   * added later appears without anything being changed here.
   */
  app.get('/audit/filters', superOnly, async () => {
    const actions = await db
      .select({ action: auditLogs.action, count: sql<number>`COUNT(*)` })
      .from(auditLogs)
      .groupBy(auditLogs.action)
      .orderBy(auditLogs.action)

    // Grouped by the actor alone, with the most recent email they were
    // recorded under. Grouping by email as well split one person into several
    // rows — the entries written before the email was being stored came back
    // as their own "unknown" line beside their real one.
    const actors = await db
      .select({
        id: auditLogs.actorId,
        email: sql<string | null>`SUBSTRING_INDEX(
          GROUP_CONCAT(${auditLogs.actorEmail} ORDER BY ${auditLogs.createdAt} DESC), ',', 1)`,
        role: sql<string>`SUBSTRING_INDEX(
          GROUP_CONCAT(${auditLogs.actorRole} ORDER BY ${auditLogs.createdAt} DESC), ',', 1)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(auditLogs)
      .where(sql`${auditLogs.actorId} IS NOT NULL`)
      .groupBy(auditLogs.actorId)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(50)

    return {
      data: {
        actions: actions.map((a) => ({ ...a, count: Number(a.count) })),
        actors: actors.map((a) => ({ ...a, count: Number(a.count) })),
      },
    }
  })

  /**
   * Everything that has happened to one thing.
   *
   * The question is almost never "what happened at 14:32" — it is "what has
   * been done to this order", and that is a different query from the list.
   */
  app.get('/audit/subject/:type/:id', superOnly, async (req) => {
    const { type, id } = z
      .object({ type: z.string().max(40), id: z.coerce.number().int().positive() })
      .parse(req.params)

    const rows = await db
      .select({
        id: auditLogs.id,
        actorEmail: auditLogs.actorEmail,
        actorRole: auditLogs.actorRole,
        action: auditLogs.action,
        summary: auditLogs.summary,
        changes: auditLogs.changes,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(and(eq(auditLogs.subjectType, type), eq(auditLogs.subjectId, id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100)

    return { data: rows }
  })
}
