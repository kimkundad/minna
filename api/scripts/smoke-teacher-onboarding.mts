/**
 * What happens to somebody who applies to teach.
 *
 *   npx tsx scripts/smoke-teacher-onboarding.mts
 *
 * Two things are checked that nothing else covers.
 *
 * One: approval has to hand the applicant the admin's address. They have just
 * gained a role that unlocks a different app on a different port, and nothing
 * on the public site points at it — an approval nobody can act on is not one.
 *
 * Two: how wide a staff screen is. A teacher sees their own courses, an admin
 * sees the school's, and somebody holding both roles has to get the admin's
 * view — the dashboard decided on the teacher role alone, so a teaching admin
 * was shown two essays waiting when the school had forty.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { users } from '../src/db/schema/index'
import { env } from '../src/config/env'
import { teacherApprovedMail } from '../src/lib/email-templates'
import { teacherScope } from '../src/lib/scope'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const stamp = Date.now()
const email = `smoke-teach-${stamp}@example.com`

try {
  /* ---------------- the approval letter ---------------- */

  const mail = teacherApprovedMail('สมหญิง ใจดี', env.ADMIN_URL)
  check('the approval mail carries the admin address', mail.html.includes(env.ADMIN_URL), env.ADMIN_URL)
  check('  in the plain-text part too', mail.text.includes(env.ADMIN_URL))
  check('  with a button to press', mail.html.includes('Open the teaching admin'))
  check('  and it is not the public site', env.ADMIN_URL !== env.APP_URL, `${env.APP_URL} vs ${env.ADMIN_URL}`)
  check('  nor is it addressed to nobody', mail.text.includes('สมหญิง ใจดี'))

  /* ---------------- who sees how much ---------------- */

  check('a teacher is narrowed to their own courses', teacherScope({ roles: ['teacher'], sub: 7 }) === 7)
  check('an admin is not narrowed at all', teacherScope({ roles: ['admin'], sub: 7 }) === null)
  check('a superadmin neither', teacherScope({ roles: ['superadmin'], sub: 7 }) === null)
  check(
    'an admin who also teaches gets the wider view',
    teacherScope({ roles: ['admin', 'teacher'], sub: 7 }) === null,
    String(teacherScope({ roles: ['admin', 'teacher'], sub: 7 })),
  )
  check('and a student narrows to nothing rather than to themselves',
    teacherScope({ roles: ['student'], sub: 7 }) === null)

  /* ---------------- applying really does create an application ---------------- */

  const made = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password: 'Str0ng-Pass!2026',
      firstName: 'ผู้',
      lastName: 'สมัคร',
      birthdate: '1990-05-05',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'teacher',
      // Both required on a teaching application: the details say what they
      // would teach, and the phone is how they get contacted back.
      phoneCountryCode: '+66',
      phoneNational: '811234567',
      teacher: {
        subject: 'ภาษาญี่ปุ่นสำหรับผู้เริ่มต้น',
        experience: 'สอนมา 5 ปี N1',
      },
    }),
  })
  const body = await made.json()
  check('somebody applying to teach can register', made.status === 201 || made.status === 200, String(made.status))
  check(
    '  but does not get the role on the spot',
    !(body.user?.roles ?? []).includes('teacher'),
    JSON.stringify(body.user?.roles),
  )

  const theirs = await fetch(`${API}/me/teacher-profile`, {
    headers: { Authorization: `Bearer ${body.accessToken}` },
  })
  check('  and has no teacher profile until approved', (await theirs.json()).data === null, String(theirs.status))
} finally {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (row) await db.delete(users).where(eq(users.id, row.id))
  console.log(`\n  cleaned up ${email}`)
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
