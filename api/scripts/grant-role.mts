/**
 * Gives a test account a role, so a flow can act as staff.
 *
 *   npx tsx scripts/grant-role.mts <email> <role>
 *
 * Only accounts whose address marks them as a test — the same guard as
 * `remove-test-user.mts`, and for a stronger reason: this one hands out
 * permissions rather than taking an account away. Promoting a real person is
 * an admin screen's job, where it is audited as one person acting on another.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { roles, userRoles, users } from '../src/db/schema/index'

const TEST_ADDRESS = /^(flow|smoke|pwcheck|test)-[\w.+-]*@example\.(com|invalid)$/i
const ROLES = ['admin', 'superadmin', 'teacher', 'student']

const [email, role] = [process.argv[2]?.trim(), process.argv[3]?.trim()]
if (!email || !role) {
  console.error('usage: npx tsx scripts/grant-role.mts <email> <role>')
  process.exit(1)
}
if (!TEST_ADDRESS.test(email)) {
  console.error(`refusing to promote "${email}": only test accounts can be given a role this way`)
  process.exit(1)
}
if (!ROLES.includes(role)) {
  console.error(`no such role "${role}" — one of ${ROLES.join(', ')}`)
  process.exit(1)
}

const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
if (!user) {
  console.error(`no account ${email}`)
  process.exit(1)
}

const [named] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, role)).limit(1)
if (!named) {
  console.error(`the role "${role}" is not in the database`)
  process.exit(1)
}

const [already] = await db
  .select({ userId: userRoles.userId })
  .from(userRoles)
  .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, named.id)))
  .limit(1)

if (already) {
  console.log(`${email} is already ${role}`)
  process.exit(0)
}

await db.execute(sql`INSERT INTO user_roles (user_id, role_id) VALUES (${user.id}, ${named.id})`)
console.log(`${email} is now ${role}`)
process.exit(0)
