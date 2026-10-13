import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { audit, diff } from '../../lib/audit'
import { CURRENCIES } from '../../lib/currencies'
import { getSetting, getVatRules, vatOf } from '../../lib/settings'
import * as service from './settings.service'

/**
 * Site settings.
 *
 * Reading is admin, writing is superadmin: VAT decides what every customer is
 * charged, and that is not a thing to leave to whoever happens to be signed in.
 * Changes are audited with their before and after, because "when did the rate
 * change" is a question an accountant asks.
 */
export default async function settingsRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: app.requireRole('admin') }
  const superadminOnly = { preHandler: app.requireRole('superadmin') }

  /**
   * The money the school can deal in.
   *
   * Open, because it is not a secret and both apps need it: the admin to offer
   * a teacher a currency for their course, the public site to write a price
   * with the right symbol and the right number of decimal places.
   *
   * Served rather than copied into each app so that the list cannot drift from
   * what the server will accept — a form offering a currency the API refuses
   * is a save that fails for no visible reason.
   */
  app.get('/currencies', async () => ({
    data: CURRENCIES.map((c) => ({
      code: c.code,
      symbol: c.symbol,
      exponent: c.exponent,
      name: c.name,
    })),
  }))

  /**
   * The logo, for anyone.
   *
   * Open deliberately: the public site asks for this before anybody signs in,
   * and so does the admin's own sign-in page. Nothing here is a secret — it is
   * the picture at the top of every page.
   *
   * Paths, not URLs. Each app turns a stored path into an address with its own
   * `mediaUrl`, which is the same function that already handles every other
   * picture the school has uploaded.
   */
  app.get('/settings/branding', async () => {
    return {
      data: {
        logoPath: (await getSetting('logo_path')) || null,
        logoIconPath: (await getSetting('logo_icon_path')) || null,
        faviconPath: (await getSetting('favicon_path')) || null,
      },
    }
  })

  /**
   * Who the receipt is from.
   *
   * Public because it is printed on every receipt and tax invoice the school
   * issues — a registered name and tax ID are published facts, not secrets.
   * Null throughout until an admin fills them in, and the buyer's copy leaves
   * the block out rather than printing an issuer-shaped hole.
   */
  app.get('/settings/seller', async () => {
    const name = (await getSetting('seller_name')) || null
    return {
      data: {
        name,
        taxId: (await getSetting('seller_tax_id')) || null,
        branch: (await getSetting('seller_branch')) || null,
        address: (await getSetting('seller_address')) || null,
        configured: Boolean(name),
      },
    }
  })

  app.get('/settings', adminOnly, async () => {
    return { data: await service.list() }
  })

  app.put('/settings', superadminOnly, async (req) => {
    // Settings are stored as text, but a client sending a numeric setting as a
    // JSON number — which is what a browser's number input does — is being
    // reasonable, not wrong. Accept both and normalise here rather than making
    // every caller remember to quote.
    const body = z
      .record(
        z
          .union([z.string().max(500), z.number(), z.boolean()])
          .transform((v) => String(v)),
      )
      .parse(req.body)
    const { before, after } = await service.update(body)

    audit(req, {
      action: 'settings.updated',
      subjectType: 'settings',
      summary: Object.keys(body).join(', '),
      changes: diff(before, after),
    })
    return { data: await service.list() }
  })

  /**
   * What the current rules do to one amount.
   *
   * The admin shows this under the VAT fields, because inclusive and exclusive
   * are easy to read past and the difference is what the customer pays. Worked
   * out here rather than in the browser so the screen cannot disagree with the
   * checkout about the same sum.
   */
  app.get('/settings/vat-preview', adminOnly, async (req) => {
    const { amount } = z
      .object({ amount: z.coerce.number().int().min(0).default(169000) })
      .parse(req.query)

    const rules = await getVatRules()
    const tax = vatOf(amount, rules)
    return {
      data: {
        percent: rules.percent,
        inclusive: rules.inclusive,
        /** The price as listed on the course. */
        listed: amount,
        tax,
        customerPays: rules.inclusive ? amount : amount + tax,
      },
    }
  })
}
