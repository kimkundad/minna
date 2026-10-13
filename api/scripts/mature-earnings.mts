/**
 * Moves earnings past their refund window from pending to payable.
 *
 *   npx tsx scripts/mature-earnings.mts
 *
 * Meant for a daily schedule. Safe to run as often as you like: it only ever
 * touches rows whose date has already passed, and says how many it moved
 * rather than claiming to have done something.
 */
import { matureDue } from '../src/modules/commerce/earnings.service'

const moved = await matureDue()
console.log(moved ? `  ${moved} earnings are now payable` : '  nothing is due yet')
process.exit(0)
