import { z } from 'zod'

/**
 * A boolean from a query string.
 *
 * Not `z.coerce.boolean()`, which is `Boolean(value)` — and `Boolean('false')`
 * is `true`. A caller writing `?unansweredOnly=false` to mean "no" would get
 * the opposite, which is the kind of thing that works in every test because the
 * tests only ever send it when they mean yes.
 *
 * Only the words that obviously mean true are true; everything else, including
 * an absent value, is false.
 */
export const queryBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (typeof v === 'boolean') return v
    if (v === undefined) return undefined
    return ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase())
  })
