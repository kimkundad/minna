import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { memberConsents } from '../../db/schema/index'
import { instant } from '../../lib/sql'

/**
 * What a member has agreed to be sent.
 *
 * Three switches, and the difference between them matters. Two are marketing —
 * the newsletter and the new-course announcement — and both start off, because
 * silence is not consent and nobody opted in by registering. The third is the
 * warning that access somebody paid for is about to lapse; it starts on,
 * because it is about their own purchase rather than ours, and a school that
 * let a course expire silently would be doing them a disservice.
 *
 * Nothing sends mail off the back of these yet. Recording the answer before
 * there is anything to send is the right way round: the alternative is sending
 * first and asking afterwards.
 */

export interface Consents {
  news: boolean
  newCourses: boolean
  expiryAlert: boolean
  /** Null until they have touched a switch. */
  updatedAt: string | null
}

/** What somebody who has never answered is taken to have said. */
const UNANSWERED: Consents = {
  news: false,
  newCourses: false,
  expiryAlert: true,
  updatedAt: null,
}

export async function get(userId: number): Promise<Consents> {
  const [row] = await db
    .select()
    .from(memberConsents)
    .where(eq(memberConsents.userId, userId))
    .limit(1)
  if (!row) return { ...UNANSWERED }
  return {
    news: Boolean(row.news),
    newCourses: Boolean(row.newCourses),
    expiryAlert: Boolean(row.expiryAlert),
    updatedAt: instant(row.updatedAt),
  }
}

/**
 * Writes the switches that were sent and leaves the rest alone, so a screen
 * showing one of them cannot quietly clear the others.
 */
export async function save(
  userId: number,
  changes: Partial<Omit<Consents, 'updatedAt'>>,
): Promise<Consents> {
  const current = await get(userId)
  const next = {
    news: changes.news ?? current.news,
    newCourses: changes.newCourses ?? current.newCourses,
    expiryAlert: changes.expiryAlert ?? current.expiryAlert,
  }

  if (current.updatedAt === null) {
    await db.insert(memberConsents).values({ userId, ...next })
  } else {
    await db.update(memberConsents).set(next).where(eq(memberConsents.userId, userId))
  }
  return get(userId)
}
