/**
 * Does a message actually leave this machine?
 *
 *   npx tsx scripts/smoke-mail.mts                  # say how mail is configured
 *   npx tsx scripts/smoke-mail.mts you@example.com  # and send one there
 *
 * The question this exists for is not "is the setting present" — that was
 * true in production while nothing was being delivered at all. DigitalOcean
 * blocks outbound SMTP, so every connection timed out at `CONN`, and because
 * mail is sent without being awaited, the failures went to the log and
 * nowhere else. Nobody noticed until a buyer said no receipt had come.
 *
 * So this sends a real message and waits for the answer. Run it on the server
 * after a deploy that touches mail, and on any machine whose credentials have
 * just changed.
 *
 * It sends to the address given and nowhere else. With no address it only
 * reports what is configured, so it is safe to run anywhere.
 */
import { env } from '../src/config/env'
import { sendMail, verifyMailTransport } from '../src/lib/mailer'

const to = process.argv[2]

const via = env.RESEND_API_KEY ? 'Resend (HTTPS)' : env.SMTP_HOST ? `SMTP (${env.SMTP_HOST}:${env.SMTP_PORT})` : 'nothing — written to the log'

console.log(`  sending by: ${via}`)
console.log(`  from:       ${env.MAIL_FROM ?? env.SMTP_USER ?? '(unset)'}`)

const ready = await verifyMailTransport()
console.log(`  transport:  ${ready}`)

if (!to) {
  console.log('\n  Pass an address to actually send one:')
  console.log('    npx tsx scripts/smoke-mail.mts you@example.com\n')
  process.exit(ready === 'ok' || ready === 'not-configured' ? 0 : 1)
}

/**
 * The logger `sendMail` writes to. Captured rather than printed straight,
 * because the whole point is to report a failure as a failure — it swallows
 * errors by design, so that a mail server being down cannot fail the purchase
 * it was telling somebody about.
 */
let failure: unknown = null
const log = {
  info: (o: Record<string, unknown>, msg: string) => console.log(`  ${msg}`, JSON.stringify(o)),
  warn: (o: Record<string, unknown>, msg: string) => console.log(`  ${msg}`, JSON.stringify(o)),
  error: (o: Record<string, unknown>, msg: string) => {
    failure = (o as { err?: unknown }).err ?? msg
    console.log(`  ${msg}`)
  },
}

const stamp = new Date().toISOString()
console.log(`\n  sending to ${to} ...`)

await sendMail(
  {
    to,
    subject: `Minna mail check — ${stamp}`,
    text: `This is a test from the Minna API.\n\nSent by: ${via}\nAt: ${stamp}\n`,
    html: `<p>This is a test from the Minna API.</p><p>Sent by: <b>${via}</b><br>At: ${stamp}</p>`,
  },
  log,
)

if (failure) {
  console.log(`\n  FAILED\n`)
  console.error(failure)

  // The two failures worth naming, because each reads like something else.
  // A blocked port looks like a wrong password, and a refused sender looks
  // like a bad key.
  const said = String((failure as { message?: string })?.message ?? failure)
  if (said.includes('ETIMEDOUT') || said.includes('Connection timeout')) {
    console.log(
      '\n  A timeout at CONN means the port is blocked, not that the password is wrong.\n' +
        '  DigitalOcean blocks outbound SMTP; set RESEND_API_KEY and send over HTTPS.\n',
    )
  } else if (said.includes('not verified')) {
    console.log(
      `\n  MAIL_FROM is ${env.MAIL_FROM}, and mail can only be sent from a domain\n` +
        '  you have verified at https://resend.com/domains. A free-provider address\n' +
        '  cannot be verified by anybody. Send from your own domain and set\n' +
        '  MAIL_REPLY_TO to the address you actually read.\n',
    )
  }
  process.exit(1)
}

if (!env.RESEND_API_KEY && !env.SMTP_HOST) {
  console.log('\n  Nothing was sent — there is no transport configured here.\n')
  process.exit(0)
}

console.log(`\n  sent. Look in ${to} — and in Resend's dashboard under Logs if it does not arrive.\n`)
process.exit(0)
