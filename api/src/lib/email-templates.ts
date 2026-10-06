import type { Mail } from './mailer'

/**
 * The transactional messages Minna sends.
 *
 * Written as inline-styled tables, which is not how anyone would build a web
 * page and is exactly how mail still has to be built: Outlook ignores most of a
 * stylesheet, and Gmail strips <style> from forwarded copies. Every message
 * carries a plain-text part as well — some clients show only that, and it is
 * what a screen reader reaches first.
 *
 * Copy is Thai, which is the language of the only locale these are sent in so
 * far. When the other three need their own, this is where they branch, keyed on
 * the recipient's `locale`.
 */

const BRAND = '#00C2D6'
const INK = '#18272A'
const MUTED = '#465255'

function layout(opts: { heading: string; body: string; cta?: { label: string; href: string } }) {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escape(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f7;font-family:'Noto Sans Thai',Tahoma,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
  <tr><td style="padding:28px 32px 8px">
    <span style="font-size:20px;font-weight:800;color:${BRAND};letter-spacing:-0.2px">Minna No Nihongo</span>
  </td></tr>
  <tr><td style="padding:8px 32px 0">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.5;font-weight:700;color:${INK}">${escape(opts.heading)}</h1>
  </td></tr>
  <tr><td style="padding:0 32px;font-size:16px;line-height:1.7;color:${MUTED}">${opts.body}</td></tr>
  ${
    opts.cta
      ? `<tr><td style="padding:24px 32px 8px">
    <a href="${escape(opts.cta.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px">${escape(opts.cta.label)}</a>
  </td></tr>
  <tr><td style="padding:12px 32px 0;font-size:13px;line-height:1.7;color:${MUTED}">
    หากปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์<br>
    <span style="word-break:break-all;color:${BRAND}">${escape(opts.cta.href)}</span>
  </td></tr>`
      : ''
  }
  <tr><td style="padding:28px 32px 32px">
    <hr style="border:0;border-top:1px solid #e4e7e9;margin:0 0 16px">
    <p style="margin:0;font-size:13px;line-height:1.7;color:${MUTED}">
      อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ<br>
      Minna No Nihongo · โรงเรียนสอนภาษาออนไลน์
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

function escape(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

export function verifyEmailMail(name: string, url: string): Mail {
  const heading = 'ยืนยันอีเมลของคุณ'
  return {
    to: '',
    subject: `${heading} — Minna No Nihongo`,
    html: layout({
      heading,
      body: `<p style="margin:0 0 12px">สวัสดี ${escape(name)}</p>
<p style="margin:0 0 12px">กดปุ่มด้านล่างเพื่อยืนยันว่าอีเมลนี้เป็นของคุณ เราจะใช้อีเมลนี้ส่งใบเสร็จและลิงก์ตั้งรหัสผ่านใหม่</p>
<p style="margin:0">ลิงก์ใช้ได้ภายใน 24 ชั่วโมง</p>`,
      cta: { label: 'ยืนยันอีเมล', href: url },
    }),
    text: `สวัสดี ${name}

กดลิงก์นี้เพื่อยืนยันว่าอีเมลนี้เป็นของคุณ เราจะใช้ส่งใบเสร็จและลิงก์ตั้งรหัสผ่านใหม่

${url}

ลิงก์ใช้ได้ภายใน 24 ชั่วโมง

Minna No Nihongo`,
  }
}

export function passwordResetMail(name: string, url: string): Mail {
  const heading = 'ตั้งรหัสผ่านใหม่'
  return {
    to: '',
    subject: `${heading} — Minna No Nihongo`,
    html: layout({
      heading,
      body: `<p style="margin:0 0 12px">สวัสดี ${escape(name)}</p>
<p style="margin:0 0 12px">มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่าน</p>
<p style="margin:0 0 12px">ลิงก์ใช้ได้ภายใน 1 ชั่วโมง และใช้ได้ครั้งเดียว</p>
<p style="margin:0"><b>ถ้าคุณไม่ได้เป็นคนขอ</b> ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ</p>`,
      cta: { label: 'ตั้งรหัสผ่านใหม่', href: url },
    }),
    text: `สวัสดี ${name}

มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ เปิดลิงก์นี้เพื่อตั้งรหัสผ่าน

${url}

ลิงก์ใช้ได้ภายใน 1 ชั่วโมง และใช้ได้ครั้งเดียว
ถ้าคุณไม่ได้เป็นคนขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ

Minna No Nihongo`,
  }
}

export function emailVerifiedMail(name: string): Mail {
  const heading = 'ยืนยันอีเมลเรียบร้อย'
  return {
    to: '',
    subject: `${heading} — Minna No Nihongo`,
    html: layout({
      heading,
      body: `<p style="margin:0 0 12px">สวัสดี ${escape(name)}</p>
<p style="margin:0">อีเมลนี้ได้รับการยืนยันแล้ว ตอนนี้คุณสั่งซื้อคอร์สและรับใบเสร็จทางอีเมลได้</p>`,
    }),
    text: `สวัสดี ${name}

อีเมลนี้ได้รับการยืนยันแล้ว ตอนนี้คุณสั่งซื้อคอร์สและรับใบเสร็จทางอีเมลได้

Minna No Nihongo`,
  }
}
