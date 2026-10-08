import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { siteSettings } from '../../db/schema/index'
import { validationFailed } from '../../lib/errors'
import { clearSettingsCache } from '../../lib/settings'

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
  group: 'billing' | 'contact' | 'social'
  label: string
  /** What it does, in the admin. Blank where the label says it. */
  help?: string
  type: 'percent' | 'boolean' | 'email' | 'phone' | 'url'
  /** False where nothing reads it yet, so the screen can say so rather than
   *  letting someone fill in a box that changes nothing. */
  live: boolean
}

export const DEFINITIONS: Definition[] = [
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
  { key: 'contact_email', group: 'contact', label: 'Contact email', type: 'email', live: false },
  { key: 'contact_phone', group: 'contact', label: 'Contact phone', type: 'phone', live: false },
  { key: 'facebook_url', group: 'social', label: 'Facebook', type: 'url', live: false },
  { key: 'instagram_url', group: 'social', label: 'Instagram', type: 'url', live: false },
  { key: 'youtube_url', group: 'social', label: 'YouTube', type: 'url', live: false },
  { key: 'line_url', group: 'social', label: 'LINE', type: 'url', live: false },
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
      // Not a legal limit, a sanity one: a rate outside this is a typo, and the
      // cost of accepting it is every price on the site being wrong.
      if (n < 0 || n > 30) return { error: 'A VAT rate is between 0 and 30 percent.' }
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
    case 'url':
      if (value && !/^https?:\/\/\S+$/.test(value)) {
        return { error: 'Enter a full address starting http:// or https://' }
      }
      return { value }
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
