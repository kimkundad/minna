import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { siteSettings } from '../../db/schema/index'
import { validationFailed } from '../../lib/errors'
import { clearSettingsCache } from '../../lib/settings'
import { scopedPath, storageRoot } from '../../lib/storage'

/**
 * Site settings.
 *
 * A fixed set of keys, not a free-form key/value store an admin can invent
 * rows in. Every one of these is read by name somewhere in the code, so a key
 * that nothing reads is a box someone fills in and then wonders about — and a
 * typo in a key name would silently stop a real setting working.
 *
 * `editable` is the list. Anything else in the table is left alone.
 */

interface Definition {
  key: string
  group: 'branding' | 'billing' | 'seller' | 'contact' | 'social' | 'sharing'
  label: string
  /** What it does, in the admin. Blank where the label says it. */
  help?: string
  type: 'percent' | 'boolean' | 'email' | 'phone' | 'url' | 'image' | 'text' | 'multiline' | 'taxid'
  /**
   * The widest a `percent` may sensibly be. Not a legal limit, a sanity one:
   * a rate outside it is a typo, and the cost of accepting a typo is every
   * price or payout on the site being wrong.
   *
   * It belongs to the setting rather than to the type, because the two
   * percentages here are nothing alike — VAT above 30 is a mistake, while a
   * teacher keeping 70% of their own course is a deal somebody struck.
   */
  max?: number
  /**
   * What the box shows before anybody has saved it, where the empty-looking
   * answer would be a lie. A percent defaults to 0, which is right for VAT on
   * a business that has not registered and wrong for a teacher's share — the
   * screen would read 0% while the code paid 25%.
   */
  initial?: string
  /** False where nothing reads it yet, so the screen can say so rather than
   *  letting someone fill in a box that changes nothing. */
  live: boolean
}

export const DEFINITIONS: Definition[] = [
  {
    key: 'logo_path',
    group: 'branding',
    label: 'Logo',
    help: 'Shown at the top of every page on the public site and in the admin. A wide picture with transparent background suits the header best — roughly 340×140.',
    type: 'image',
    live: true,
  },
  {
    key: 'logo_icon_path',
    group: 'branding',
    label: 'Square logo',
    help: 'Used where the wide one will not fit: the admin menu when it is collapsed. Square, around 160×160. Left blank, the built-in mark is used.',
    type: 'image',
    live: true,
  },
  {
    key: 'favicon_path',
    group: 'branding',
    label: 'Browser icon (favicon)',
    help: 'The small icon in the browser tab and on a bookmark. Square PNG, 512×512 — browsers scale it down, and the same file is used when somebody saves the site to a phone home screen. Keep it simple: at 16 pixels a wordmark is a smudge.',
    type: 'image',
    live: true,
  },
  {
    key: 'revenue_share_pct',
    group: 'billing',
    label: "Teacher's share of a sale",
    help: "What a teacher keeps out of what the school receives for their course, after any discount. This is the figure a new course starts at — each course carries its own, so one can be agreed differently without moving anybody else. Changing it here does not touch courses that already exist, or earnings already recorded.",
    type: 'percent',
    max: 100,
    // The figure the column has always carried, so the screen agrees with what
    // courses were already created at.
    initial: '25',
    live: true,
  },
  {
    key: 'vat_percent',
    group: 'billing',
    label: 'VAT',
    help: 'Thailand charges 7%. Set it to 0 if the business is not VAT registered.',
    type: 'percent',
    live: true,
  },
  {
    key: 'vat_inclusive',
    group: 'billing',
    label: 'Prices already include VAT',
    help: 'On, a ฿1,690 course is ฿1,690 and the tax is worked out from inside it. Off, the tax is added at checkout and the customer pays more than the price shown.',
    type: 'boolean',
    live: true,
  },
  /**
   * Who the receipt is from.
   *
   * A receipt without the seller's registered name and tax ID is not a
   * receipt, so the buyer's copy leaves this block out entirely until it is
   * filled in rather than printing an official-looking document with a hole
   * where the issuer should be.
   */
  {
    key: 'seller_name',
    group: 'seller',
    label: 'Registered name',
    help: 'The name on the company registration, as it should read on a receipt.',
    type: 'text',
    live: true,
  },
  {
    key: 'seller_tax_id',
    group: 'seller',
    label: 'Tax ID',
    help: '13 digits. Leave blank if the business is not registered.',
    type: 'taxid',
    live: true,
  },
  {
    key: 'seller_branch',
    group: 'seller',
    label: 'Branch',
    help: 'Printed as written — "สำนักงานใหญ่" for a head office, or the branch code.',
    type: 'text',
    live: true,
  },
  {
    key: 'seller_address',
    group: 'seller',
    label: 'Address',
    help: 'The registered address, over as many lines as it takes.',
    type: 'multiline',
    live: true,
  },
  { key: 'contact_email', group: 'contact', label: 'Contact email', type: 'email', live: false },
  { key: 'contact_phone', group: 'contact', label: 'Contact phone', type: 'phone', live: false },
  { key: 'facebook_url', group: 'social', label: 'Facebook', type: 'url', live: false },
  { key: 'instagram_url', group: 'social', label: 'Instagram', type: 'url', live: false },
  { key: 'youtube_url', group: 'social', label: 'YouTube', type: 'url', live: false },
  { key: 'line_url', group: 'social', label: 'LINE', type: 'url', live: false },

  /**
   * What a shared link looks like, per language and site-wide.
   *
   * A course or an article shares as its own title, description and cover;
   * these are the fallback for everything else, and for anything that has
   * said nothing. See api/src/modules/content/og.routes.ts.
   */
  {
    key: 'og_title',
    group: 'sharing',
    label: 'Share title — Thai',
    help: 'What a shared link is called when the page it points at has nothing of its own. Thai is the one the others fall back to.',
    type: 'text',
    live: true,
  },
  {
    key: 'og_description',
    group: 'sharing',
    label: 'Share description — Thai',
    help: 'The line under the title in a chat window or a feed. Two short sentences is as much as any of them show.',
    type: 'text',
    live: true,
  },
  {
    key: 'og_image_path',
    group: 'sharing',
    label: 'Share picture — Thai',
    help: '1200×630. A full address, or a path in storage. frontend/scripts/build-og-image.mjs draws the ones shipped with the site.',
    type: 'text',
    live: true,
  },
  {
    key: 'og_title_en',
    group: 'sharing',
    label: 'Share title — English',
    help: '',
    type: 'text',
    live: true,
  },
  {
    key: 'og_description_en',
    group: 'sharing',
    label: 'Share description — English',
    help: '',
    type: 'text',
    live: true,
  },
  {
    key: 'og_image_path_en',
    group: 'sharing',
    label: 'Share picture — English',
    help: '',
    type: 'text',
    live: true,
  },
  {
    key: 'og_title_jp',
    group: 'sharing',
    label: 'Share title — Japanese',
    help: '',
    type: 'text',
    live: true,
  },
  {
    key: 'og_description_jp',
    group: 'sharing',
    label: 'Share description — Japanese',
    help: '',
    type: 'text',
    live: true,
  },
  {
    key: 'og_image_path_jp',
    group: 'sharing',
    label: 'Share picture — Japanese',
    help: '',
    type: 'text',
    live: true,
  },
  {
    key: 'og_title_vn',
    group: 'sharing',
    label: 'Share title — Vietnamese',
    help: '',
    type: 'text',
    live: true,
  },
  {
    key: 'og_description_vn',
    group: 'sharing',
    label: 'Share description — Vietnamese',
    help: '',
    type: 'text',
    live: true,
  },
  {
    key: 'og_image_path_vn',
    group: 'sharing',
    label: 'Share picture — Vietnamese',
    help: '',
    type: 'text',
    live: true,
  },
]

const BY_KEY = new Map(DEFINITIONS.map((d) => [d.key, d]))

export async function list() {
  const rows = await db.select().from(siteSettings)
  const stored = new Map(rows.map((r) => [r.key, r.value ?? '']))

  // Driven by the definitions rather than by the table, so a setting that has
  // never been written still appears, with its default.
  return DEFINITIONS.map((d) => ({
    ...d,
    value: stored.get(d.key) ?? defaultFor(d),
  }))
}

function defaultFor(d: Definition): string {
  if (d.initial !== undefined) return d.initial
  if (d.type === 'boolean') return 'true'
  if (d.type === 'percent') return '0'
  return ''
}

/**
 * Checks one value against what its key is for.
 *
 * Returns the value as it should be stored, or a message. Done per key rather
 * than per type because the useful limits are specific: a VAT rate of 400% is
 * the wrong shape of mistake to describe as "not a number".
 */
function check(d: Definition, raw: string): { value: string } | { error: string } {
  const value = raw.trim()

  switch (d.type) {
    case 'percent': {
      const n = Number(value)
      if (!Number.isFinite(n)) return { error: 'Enter a number.' }
      if (!Number.isInteger(n)) return { error: 'Enter a whole percent.' }
      const max = d.max ?? 30
      if (n < 0 || n > max) return { error: `Enter a whole percent between 0 and ${max}.` }
      return { value: String(n) }
    }
    case 'boolean':
      if (value !== 'true' && value !== 'false') return { error: 'Expected true or false.' }
      return { value }
    case 'email':
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { error: 'Enter a valid email address.' }
      }
      return { value }
    case 'phone':
      if (value.length > 32) return { error: 'That is too long for a phone number.' }
      return { value }
    case 'image': {
      if (!value) return { value: '' }

      // The store hands back `minna/content/site/logo.png` while the folder it
      // was uploaded to was named `content/site`, so the prefix check has to be
      // made on the settled form — the same way `media.routes.ts` does it.
      // Comparing the raw string refused every real upload.
      if (value.includes('..') || value.includes('\\')) {
        return { error: 'That is not a picture in our store.' }
      }
      const scoped = scopedPath(value)
      const root = storageRoot()
      const publicFolder = root ? `${root}/content/` : 'content/'
      if (!scoped.startsWith(publicFolder)) {
        return { error: 'A logo has to be uploaded into the public folder.' }
      }
      if (!/\.(png|jpe?g|webp|svg)$/i.test(scoped)) {
        return { error: 'A logo should be a PNG, JPEG, WebP or SVG.' }
      }
      // Stored settled, like every course thumbnail, so one form is in the
      // database rather than two.
      return { value: scoped }
    }
    case 'url':
      if (value && !/^https?:\/\/\S+$/.test(value)) {
        return { error: 'Enter a full address starting http:// or https://' }
      }
      return { value }
    case 'text':
      if (value.length > 255) return { error: 'Keep that under 255 characters.' }
      return { value }
    case 'multiline':
      if (value.length > 1000) return { error: 'Keep that under 1,000 characters.' }
      return { value }
    case 'taxid': {
      if (!value) return { value: '' }
      // Spaces and dashes are how people write one down; the digits are what
      // is stored, because that is what has to match the Revenue Department.
      const digits = value.replace(/[\s-]/g, '')
      if (!/^\d{13}$/.test(digits)) return { error: 'A Thai tax ID is 13 digits.' }
      return { value: digits }
    }
  }
}

/**
 * Writes the settings that were sent, and leaves the rest alone.
 *
 * All or nothing on validation: a form with two bad fields should come back
 * with both marked rather than saving the good one and arguing about the
 * other.
 */
export async function update(changes: Record<string, string>) {
  const errors: Record<string, string> = {}
  const clean: { key: string; value: string; group: string }[] = []

  for (const [key, raw] of Object.entries(changes)) {
    const d = BY_KEY.get(key)
    if (!d) {
      errors[key] = 'There is no such setting.'
      continue
    }
    const result = check(d, raw)
    if ('error' in result) errors[key] = result.error
    else clean.push({ key, value: result.value, group: d.group })
  }

  if (Object.keys(errors).length) throw validationFailed(errors)

  const before = await current()

  for (const row of clean) {
    const [existing] = await db
      .select({ id: siteSettings.id })
      .from(siteSettings)
      .where(eq(siteSettings.key, row.key))
      .limit(1)

    if (existing) {
      await db
        .update(siteSettings)
        .set({ value: row.value })
        .where(eq(siteSettings.id, existing.id))
    } else {
      await db.insert(siteSettings).values(row)
    }
  }

  // Pricing reads these through a one-minute cache. Without this an admin who
  // changes VAT watches the old rate for a minute and reasonably concludes it
  // did not save.
  clearSettingsCache()

  return { before, after: await current() }
}

/** The editable values as a flat object, for the audit log's before/after. */
async function current(): Promise<Record<string, string>> {
  const rows = await list()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
