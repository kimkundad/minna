/**
 * The tables behind the "how learning works here" band on the home page.
 *
 *   npx tsx scripts/add-journey.mts
 *
 * Applied by hand because `drizzle-kit push` cannot run against this database
 * (DigitalOcean's MySQL sets `sql_require_primary_key = ON`). Safe to run
 * twice: it creates nothing that is already there.
 *
 * The band was four steps and a heading written into the page in Thai. Every
 * other language showed the Thai, and changing a word of it meant changing the
 * page — so the school could not write its own copy, in its own languages,
 * which is what these are for.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { LOCALES } from '../src/db/schema/auth'

const list = LOCALES.map((l) => `'${l}'`).join(',')

async function exists(table: string): Promise<boolean> {
  const [rows] = await db.execute(sql`
    SELECT COUNT(*) AS n FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ${table}
  `)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0) > 0
}

let made = 0

if (await exists('journey_sections')) {
  console.log('  journey_sections is already there')
} else {
  // The locale is the primary key: one heading per language, and a second row
  // for the same language could only ever disagree with the first.
  await db.execute(
    sql.raw(`
      CREATE TABLE journey_sections (
        locale ENUM(${list}) NOT NULL,
        eyebrow VARCHAR(120) NULL,
        heading VARCHAR(200) NOT NULL,
        intro TEXT NULL,
        cta_label VARCHAR(80) NULL,
        cta_href VARCHAR(512) NULL,
        status ENUM('draft','published') NOT NULL DEFAULT 'draft',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (locale)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
  )
  console.log('  journey_sections created')
  made += 1
}

if (await exists('journey_steps')) {
  console.log('  journey_steps is already there')
} else {
  await db.execute(
    sql.raw(`
      CREATE TABLE journey_steps (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        locale ENUM(${list}) NOT NULL DEFAULT 'th',
        icon VARCHAR(64) NOT NULL DEFAULT 'circle',
        title VARCHAR(200) NOT NULL,
        text TEXT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY journey_steps_shown_idx (locale, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
  )
  console.log('  journey_steps created')
  made += 1
}

console.log(made ? `\n${made} table(s) created.` : '\nNothing to do.')
process.exit(0)
