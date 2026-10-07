import type { FastifyRequest } from 'fastify'
import { db } from '../db/client'
import { auditLogs } from '../db/schema/audit'
import type { RoleName } from '../plugins/auth'

/**
 * Writing to the audit log.
 *
 * Two rules it follows, both learned the hard way elsewhere:
 *
 * It never throws. An audit write failing must not turn a successful refund
 * into a 500 — the money has already moved, and failing the request would tell
 * the operator a lie about what happened. A lost log line is logged as an
 * error and the request carries on.
 *
 * It never awaits by default. `record()` returns a promise the caller is free
 * to ignore, so a page of writes does not pay a round trip each.
 */

export type AuditActorRole = RoleName | 'system'

export interface AuditEntry {
  action: string
  subjectType?: string
  subjectId?: number | null
  summary?: string
  /** `{ price: [169000, 99000] }`. Use `diff()` to build it from two objects. */
  changes?: Record<string, [unknown, unknown]> | null
}

interface Actor {
  id: number | null
  role: AuditActorRole
  email?: string | null
  ip?: string | null
  userAgent?: string | null
}

/** Pulls the actor out of a request. Unauthenticated means the system or a
 *  failed attempt, both of which are worth a row with no actor id. */
export function actorOf(req: FastifyRequest, email?: string | null): Actor {
  const roles = req.user?.roles ?? []
  const role: AuditActorRole = roles.includes('admin')
    ? 'admin'
    : roles.includes('teacher')
      ? 'teacher'
      : roles.includes('student')
        ? 'student'
        : 'system'

  return {
    id: req.user?.sub ?? null,
    role,
    email: email ?? null,
    ip: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
  }
}

export async function record(actor: Actor, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email ?? null,
      action: entry.action,
      subjectType: entry.subjectType ?? null,
      subjectId: entry.subjectId ?? null,
      summary: entry.summary ?? null,
      changes: entry.changes ?? null,
      ip: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    })
  } catch {
    // Swallowed on purpose; see the note at the top of this file.
  }
}

/** Shorthand for the common case: an authenticated request doing one thing. */
export function audit(req: FastifyRequest, entry: AuditEntry): void {
  void record(actorOf(req), entry)
}

/**
 * The fields that actually changed, as `[before, after]` pairs.
 *
 * Only the keys present in `after` are compared, so a PATCH that touches three
 * fields logs three fields rather than the whole row — which is what makes the
 * log readable a year later.
 */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, [unknown, unknown]> | null {
  const out: Record<string, [unknown, unknown]> = {}
  for (const [key, next] of Object.entries(after)) {
    const prev = before[key]
    // Dates and arrays compare badly with ===; JSON is close enough for a log.
    if (JSON.stringify(prev) !== JSON.stringify(next)) out[key] = [prev, next]
  }
  return Object.keys(out).length ? out : null
}
