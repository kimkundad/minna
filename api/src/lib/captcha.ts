import { env } from '../config/env'
import { validationFailed } from './errors'

/**
 * reCAPTCHA, in front of anything a stranger can write into the site.
 *
 * Version 3: no puzzle to solve, a score instead. Google watches the session
 * and returns 0.0 to 1.0 on how human it looked, and the threshold is ours to
 * set. The alternative — the checkbox — asks every honest student to prove
 * themselves on every post, which is a tax on the many to stop the few.
 *
 * The score is advisory and occasionally wrong, so it is one of two defences
 * and not the only one: the cooldown beside it is what actually caps how fast
 * anything can be written, and that one cannot be talked out of.
 *
 * Unconfigured, this does nothing and says so once at boot. That is on purpose
 * for development — a local copy with no Google keys should still be usable —
 * and `REQUIRED_IN_PRODUCTION` is what stops it shipping that way.
 */

/**
 * Below this, treat it as automated.
 *
 * Google's own suggested starting point, and the right one here now that the
 * cooldown behind this is twenty seconds rather than minutes: this check is
 * what actually stops a flood, so it is not the place to be generous. Lower it
 * if real students start being refused; the log line in `requireCaptcha` says
 * the score that was rejected.
 */
const THRESHOLD = 0.5

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

export function isCaptchaConfigured(): boolean {
  return Boolean(env.RECAPTCHA_SECRET)
}

export interface CaptchaResult {
  ok: boolean
  score: number | null
  /** Why it was refused, for the log. Never shown to the sender: telling a bot
   *  which check it failed is telling it what to fix. */
  reason?: string
}

/**
 * Checks one token.
 *
 * `action` is the name the browser used when it made the token, and it is
 * checked here: a token minted on the sign-up form must not be spendable on a
 * lesson thread.
 */
export async function verifyCaptcha(
  token: string | undefined,
  action: string,
  ip?: string,
): Promise<CaptchaResult> {
  if (!isCaptchaConfigured()) return { ok: true, score: null, reason: 'not configured' }

  if (!token) return { ok: false, score: null, reason: 'no token' }

  const form = new URLSearchParams({ secret: env.RECAPTCHA_SECRET!, response: token })
  if (ip) form.set('remoteip', ip)

  let body: {
    success?: boolean
    score?: number
    action?: string
    'error-codes'?: string[]
  }
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(5000),
    })
    body = (await res.json()) as typeof body
  } catch {
    // Google unreachable. Letting the post through is the lesser harm: the
    // cooldown still applies, and a school whose students cannot ask questions
    // because a third party is down has a worse problem than spam.
    return { ok: true, score: null, reason: 'verifier unreachable' }
  }

  if (!body.success) {
    return { ok: false, score: null, reason: (body['error-codes'] ?? []).join(',') || 'rejected' }
  }
  if (body.action && body.action !== action) {
    return { ok: false, score: body.score ?? null, reason: `action ${body.action}` }
  }

  const score = typeof body.score === 'number' ? body.score : null
  // A v2 token has no score at all, which is a pass: it means a human clicked
  // the box. Only a scored token is measured against the threshold.
  if (score !== null && score < THRESHOLD) {
    return { ok: false, score, reason: `score ${score}` }
  }
  return { ok: true, score }
}

/**
 * The same check, as a guard: passes quietly or throws the message the sender
 * sees.
 *
 * 422 under the field they were typing in, because that is where a person looks
 * when something they wrote is refused.
 */
export async function requireCaptcha(
  token: string | undefined,
  action: string,
  opts: { ip?: string; field?: string } = {},
): Promise<void> {
  const result = await verifyCaptcha(token, action, opts.ip)
  if (result.ok) return

  console.warn(`captcha refused (${action}): ${result.reason}`)
  throw validationFailed({
    [opts.field ?? 'captcha']: 'That did not look like a person typing. Reload the page and try again.',
  })
}
