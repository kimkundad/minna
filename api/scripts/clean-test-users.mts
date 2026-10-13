/**
 * Clears out the accounts the test scripts left behind.
 *
 *   npm run clean:test-users          # say what would go
 *   npm run clean:test-users -- --yes # actually delete them
 *
 * `remove-test-user.mts` already deletes the one account a flow created, and
 * every flow calls it. This is for the pile that builds up anyway — a run that
 * crashed, a test interrupted halfway — which `remove-test-user` has been
 * reporting the size of for a while with nothing to point at.
 *
 * The same address guard, for the same reason: without it this is a script that
 * deletes customers.
 */
import { eq, like, or } from 'drizzle-orm'
import { db } from '../src/db/client'
import { orders, users } from '../src/db/schema/index'

const TEST_ADDRESS = /^(flow|smoke|pwcheck|test)-[\w.+-]*@example\.(com|invalid)$/i
const confirmed = process.argv.includes('--yes')

const found = await db
  .select({ id: users.id, email: users.email, createdAt: users.createdAt })
  .from(users)
  .where(
    or(
      like(users.email, 'flow-%@example.com'),
      like(users.email, 'smoke-%@example.com'),
      like(users.email, 'pwcheck-%@example.com'),
      like(users.email, 'test-%@example.com'),
      like(users.email, 'flow-%@example.invalid'),
      like(users.email, 'smoke-%@example.invalid'),
    ),
  )

// Belt and braces: the LIKE patterns above and the regex have to agree, and the
// regex is the one that has been reviewed.
const safe = found.filter((u) => TEST_ADDRESS.test(u.email))
const refused = found.filter((u) => !TEST_ADDRESS.test(u.email))

if (!safe.length) {
  console.log('no test accounts left')
  process.exit(0)
}

for (const u of safe) console.log(`  ${u.email}  (#${u.id})`)
if (refused.length) {
  console.log(`\n  ${refused.length} matched the pattern but not the guard, and are left alone`)
}

if (!confirmed) {
  console.log(`\n${safe.length} to delete. Run again with --yes to do it.`)
  process.exit(0)
}

let orderCount = 0
for (const u of safe) {
  // Orders first: `orders.user_id` is ON DELETE RESTRICT so that deleting a
  // customer cannot quietly take a record of money with it. A test buyer's
  // orders are not that record.
  const [{ affectedRows } = { affectedRows: 0 }] = await db
    .delete(orders)
    .where(eq(orders.userId, u.id))
  orderCount += affectedRows
  await db.delete(users).where(eq(users.id, u.id))
}

console.log(
  `\nremoved ${safe.length} test accounts` + (orderCount ? ` and ${orderCount} of their orders` : ''),
)
process.exit(0)
