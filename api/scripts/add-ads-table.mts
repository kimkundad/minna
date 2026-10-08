/**
 * The advertising table.
 *
 *   npx tsx scripts/add-ads-table.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL has `sql_require_primary_key = ON`). Safe to run twice.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const [row] = await db.execute(sql`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'ads'
`)
if (Number((row as unknown as { n: number }[])[0]?.n ?? 0) > 0) {
  console.log('the ads table is already there — nothing to do')
  process.exit(0)
}

await db.execute(sql`
  CREATE TABLE ads (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    placement ENUM(
      'home-top','home-bottom','catalog-inline','catalog-bottom',
      'course','blog','article','account','learn'
    ) NOT NULL,
    advertiser VARCHAR(150),
    href VARCHAR(512) NOT NULL,
    image_desktop_path VARCHAR(512),
    image_mobile_path VARCHAR(512),
    image_alt VARCHAR(255),
    locale ENUM('th','en','jp','vn','all') NOT NULL DEFAULT 'all',
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ads_live_idx (placement, status, starts_at, ends_at),
    KEY ads_locale_idx (locale)
  )
`)

console.log('created the ads table')
process.exit(0)
