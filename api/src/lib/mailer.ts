import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '../config/env'

/**
 * Outgoing mail, over HTTPS or SMTP.
 *
 * SMTP was the only way out of here, on the reasoning that every provider
 * speaks it and switching would be a change to .env rather than to this file.
 * That reasoning was sound and the conclusion was wrong: DigitalOcean blocks
 * outbound SMTP on its droplets, so in production every connection timed out
 * at `CONN` and not one message — a receipt, a verification link, a password
 * reset — ever left the server. The failures were logged and nothing else
 * noticed, because mail is sent and not awaited.
 *
 * So there are two ways out, and the one that works everywhere is tried
 * first: an HTTP API on port 443, which nobody blocks. SMTP stays for a
 * machine that can reach a mail server and would rather use one.
 *
 *   RESEND_API_KEY  → Resend, over HTTPS
 *   SMTP_HOST       → SMTP, as before
 *   neither         → written to the log
 *
 * With neither — a fresh checkout, or a developer who has not asked for
 * credentials — the message is written to the log, subject, recipient and
 * links included. The flows that depend on mail stay walkable without an
 * account anywhere, and `npm run dev` does not fail on a missing secret.
 */

let transporter: Transporter | null = null
let warned = false

function transport(): Transporter | null {
  if (!env.SMTP_HOST) return null
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; everything else upgrades with STARTTLS.
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } } : {}),
  })
  return transporter
}

/**
 * Resend, over HTTPS.
 *
 * No SDK: it is one POST with a JSON body, and a dependency that wraps one
 * POST is a dependency to update, audit and explain. The shape is Resend's
 * documented one and the whole of it is here.
 *
 * Returns the id Resend gave the message, so it can go in the log and be
 * found again in their dashboard when somebody says they never received it.
 */
async function sendViaResend(mail: Mail, from: string): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}),
    }),
  })

  const body = (await res.json().catch(() => ({}))) as {
    id?: string
    message?: string
    name?: string
  }
  if (!res.ok) {
    // Resend says why in the body, and the reason is usually actionable —
    // an unverified domain, a `from` that is not on it. Carrying it into the
    // thrown error puts it in the log beside the recipient.
    throw new Error(`Resend refused (${res.status}): ${body.name ?? ''} ${body.message ?? ''}`.trim())
  }
  return body.id ?? '(no id)'
}

export interface Mail {
  to: string
  subject: string
  html: string
  /** Shown by clients that refuse HTML, and by every screen reader that meets
   *  a mail with no plain part. Never leave it out. */
  text: string
}

export interface MailLogger {
  info: (obj: Record<string, unknown>, msg: string) => void
  error: (obj: Record<string, unknown>, msg: string) => void
  warn: (obj: Record<string, unknown>, msg: string) => void
}

/**
 * Sends, or logs when there is nowhere to send to.
 *
 * Resolves either way. A password reset that fails to leave the building must
 * not turn into a 500 for the person who asked for it — they would learn
 * nothing useful, and the error belongs in our logs, not their screen.
 */
export async function sendMail(mail: Mail, log: MailLogger): Promise<void> {
  const from = env.MAIL_FROM ?? env.SMTP_USER ?? 'no-reply@localhost'
  const smtp = env.RESEND_API_KEY ? null : transport()

  if (!env.RESEND_API_KEY && !smtp) {
    if (!warned) {
      log.warn({}, 'no RESEND_API_KEY and no SMTP_HOST: mail is being logged instead of sent')
      warned = true
    }
    log.info({ to: mail.to, subject: mail.subject, body: mail.text }, 'mail (not sent)')
    return
  }

  try {
    if (env.RESEND_API_KEY) {
      const id = await sendViaResend(mail, from)
      log.info({ to: mail.to, subject: mail.subject, id, via: 'resend' }, 'mail sent')
      return
    }

    await smtp!.sendMail({
      from,
      ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })
    log.info({ to: mail.to, subject: mail.subject, via: 'smtp' }, 'mail sent')
  } catch (err) {
    log.error({ err, to: mail.to, subject: mail.subject }, 'mail failed')
    // Outside production, fall back to the log. A broken mail server should
    // not also mean the only copy of a verification link is gone — the flow
    // has to stay walkable while the credentials are being sorted out.
    if (env.NODE_ENV !== 'production') {
      log.info({ to: mail.to, subject: mail.subject, body: mail.text }, 'mail (send failed, logged)')
    }
  }
}

/** Confirms the transport actually works, for a startup check or a health route. */
export async function verifyMailTransport(): Promise<'ok' | 'not-configured' | string> {
  // Resend has nothing to connect to beforehand — the first send is the test.
  // Reporting it as working is honest about what can be known here.
  if (env.RESEND_API_KEY) return 'ok'
  const smtp = transport()
  if (!smtp) return 'not-configured'
  try {
    await smtp.verify()
    return 'ok'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
