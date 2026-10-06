import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '../config/env'

/**
 * Outgoing mail, over SMTP.
 *
 * SMTP rather than one provider's SDK: Resend, Postmark, SES and a plain Gmail
 * account all speak it, so moving between them is a change to .env and not to
 * this file.
 *
 * With no host configured — a fresh checkout, or a developer who has not asked
 * for credentials — nothing is sent and the message is written to the log
 * instead, subject, recipient and links included. The flows that depend on mail
 * stay walkable without an account anywhere, and `npm run dev` does not fail
 * on a missing secret.
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
  const smtp = transport()

  if (!smtp) {
    if (!warned) {
      log.warn({}, 'SMTP_HOST is not set: mail is being logged instead of sent')
      warned = true
    }
    log.info({ to: mail.to, subject: mail.subject, body: mail.text }, 'mail (not sent)')
    return
  }

  try {
    await smtp.sendMail({
      from: env.MAIL_FROM ?? env.SMTP_USER ?? 'no-reply@localhost',
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })
    log.info({ to: mail.to, subject: mail.subject }, 'mail sent')
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
  const smtp = transport()
  if (!smtp) return 'not-configured'
  try {
    await smtp.verify()
    return 'ok'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
