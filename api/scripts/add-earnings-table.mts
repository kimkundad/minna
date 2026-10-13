/**
 * What each course sale owes its teacher.
 *
 *   npx tsx scripts/add-earnings-table.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL has `sql_require_primary_key = ON`). Safe to run twice.
 *
 * One row per order line, written when the order is paid and never recomputed.
 * The share percentage and every figure behind it are copied in, for the same
 * reason `order_items` copies the price: a teacher's rate may be renegotiated,
 * and last quarter's earnings must not move when it is.
 *
 * A refund does not edit the row it reverses. It writes a second row for the
 * negative amount, so the ledger reads as what happened rather than as what
 * is currently true — which is what somebody disputing a payout needs to see.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [row] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'teacher_earnings'
`)
if (Number((row as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('the teacher_earnings table is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  CREATE TABLE teacher_earnings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    order_item_id BIGINT UNSIGNED,
    course_id BIGINT UNSIGNED,

    kind ENUM('royalty','refund','adjustment') NOT NULL DEFAULT 'royalty',

    -- Everything the amount was worked out from, frozen at the sale.
    gross INT NOT NULL COMMENT 'satang actually received for this line, after every discount',
    vat INT NOT NULL DEFAULT 0 COMMENT 'satang of that which is VAT',
    base INT NOT NULL COMMENT 'gross - vat: what the share is taken from',
    share_pct SMALLINT UNSIGNED NOT NULL,
    amount INT NOT NULL COMMENT 'satang owed to the teacher; negative on a refund',

    -- pending until the refund window has passed, then payable, then paid.
    status ENUM('pending','payable','paid','cancelled') NOT NULL DEFAULT 'pending',
    /** When it stops being reversible and may be paid out. */
    matures_at DATETIME NOT NULL,
    paid_at DATETIME NULL,
    payout_ref VARCHAR(64) NULL COMMENT 'which payout run settled it',

    /** The row this one reverses, on a refund. */
    reverses_id BIGINT UNSIGNED NULL,

    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    -- One royalty row per line per teacher. The webhook can arrive twice and
    -- the success page asks as well; without this, a double delivery pays
    -- twice.
    UNIQUE KEY teacher_earnings_line_unique (order_item_id, user_id, kind),
    KEY teacher_earnings_user_idx (user_id, status, matures_at),
    KEY teacher_earnings_order_idx (order_id),
    CONSTRAINT teacher_earnings_user_fk FOREIGN KEY (user_id)
      REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT teacher_earnings_order_fk FOREIGN KEY (order_id)
      REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT teacher_earnings_item_fk FOREIGN KEY (order_item_id)
      REFERENCES order_items (id) ON DELETE SET NULL,
    CONSTRAINT teacher_earnings_course_fk FOREIGN KEY (course_id)
      REFERENCES courses (id) ON DELETE SET NULL
  )
`)

/** The rate this course pays, so a renegotiation does not move old earnings. */
const [col] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'courses' AND column_name = 'revenue_share_pct'
`)
if (Number((col as unknown as { n: number }[])[0]?.n ?? 0) === 0) {
  await db.execute(sql`
    ALTER TABLE courses
      ADD COLUMN revenue_share_pct SMALLINT UNSIGNED NOT NULL DEFAULT 25
      COMMENT 'percent of the ex-VAT line total paid to the teacher'
      AFTER repurchase
  `)
  console.log('courses.revenue_share_pct added, defaulting to 25')
}

console.log('teacher_earnings created.')
process.exit(0)
