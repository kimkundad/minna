/**
 * Deletes an account a test created, and everything that cascades from it.
 *
 *   npx tsx scripts/remove-test-user.mts <email>
 *
 * Only accounts whose address marks them as a test. A browser flow has to be
 * able to clear up after itself, and the alternative — leaving them behind —
 * is how this database came to hold a dozen `smoke-*` students nobody meant to
 * keep.
 *
 * The guard is the point: without it this is a script that deletes a customer
 * because somebody pasted the wrong address into it.
 */
import { eq, like, or } from 'drizzle-orm'
import { db } from '../src/db/client'
import { orders, users } from '../src/db/schema/index'

const TEST_ADDRESS = /^(flow|smoke|pwcheck|test)-[\w.+-]*@example\.(com|invalid)$/i

const email = process.argv[2]?.trim()
if (!email) {
  console.error('usage: npx tsx scripts/remove-test-user.mts <email>')
  process.exit(1)
}

if (!TEST_ADDRESS.test(email)) {
  console.error(
    `refusing to delete "${email}": only addresses like flow-…@example.com are test accounts`,
  )
  process.exit(1)
}

const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
if (!row) {
  console.log(`no account ${email} — nothing to do`)
  process.exit(0)
}

/**
 * Orders first.
 *
 * `orders.user_id` is ON DELETE RESTRICT, and deliberately: a paid order is a
 * record of money changing hands, and deleting a customer must not quietly
 * take one with it. Everything else that hangs off an account cascades.
 *
 * A test buyer's orders are not that record, so they go — explicitly, here,
 * where it is obvious that is what is happening.
 */
const [{ affectedRows: ordersGone } = { affectedRows: 0 }] = await db
  .delete(orders)
  .where(eq(orders.userId, row.id))

await db.delete(users).where(eq(users.id, row.id))
console.log(
  `removed ${email} (#${row.id})` + (ordersGone ? ` and ${ordersGone} of its orders` : ''),
)

// While we are here: say how many older test accounts are still lying about,
// so the pile is visible rather than quietly growing.
const leftovers = await db
  .select({ email: users.email })
  .from(users)
  .where(
    or(
      like(users.email, 'smoke-%@example.com'),
      like(users.email, 'flow-%@example.com'),
      like(users.email, 'pwcheck-%@example.com'),
    ),
  )
if (leftovers.length) {
  console.log(`  ${leftovers.length} older test accounts remain — 'npm run clean:test-users'`)
}

process.exit(0)
