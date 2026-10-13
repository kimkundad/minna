/**
 * A teacher's identity document and bank details, and who can reach them.
 *
 *   npx tsx scripts/smoke-payout-details.mts
 *
 * This is the most sensitive record in the system: a scan of somebody's
 * passport and the account their money goes to. The things worth proving are
 * all about reach, not about saving a form.
 *
 *   - the document lands outside `content/`, the one folder served unsigned
 *   - a teacher may sign their own document back, and nobody else's
 *   - a ticket cannot be aimed at another teacher's folder
 *   - the record cannot be pointed at a document its owner did not upload
 *   - none of it appears on the public teacher page
 *   - the audit row does not copy the account number into a second table
 *
 * Makes its own accounts and removes them again.
 */
import { and, eq, like, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { auditLogs, courses, teacherPayoutDetails, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

async function call(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

const password = 'Str0ng-Pass!2026'
const stamp = Date.now()

async function account(kind: string, ...roles: string[]) {
  const email = `smoke-payout-${kind}-${stamp}@example.com`
  const made = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '1990-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const id = made.body.user.id as number
  for (const role of roles) {
    await db.execute(sql`
      INSERT INTO user_roles (user_id, role_id) SELECT ${id}, id FROM roles WHERE name = ${role}
    `)
  }
  const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  return { id, email, token: login.body.accessToken as string }
}

const teacher = await account('teacher', 'teacher')
const other = await account('other', 'teacher')
const student = await account('student')

let courseId = 0
const ACCOUNT_NUMBER = '123-4-56789-0'

try {
  /* ---------------- the upload goes somewhere private ---------------- */

  const ticket = await call(
    '/uploads/ticket',
    { method: 'POST', body: JSON.stringify({ purpose: 'identity-document' }) },
    teacher.token,
  )
  check('a teacher can get a ticket for an identity document', ticket.status === 201, String(ticket.status))

  const folder = String(ticket.body?.data?.folder ?? '')
  check(`  into identity/${teacher.id}`, folder.endsWith(`/identity/${teacher.id}`), folder)
  check(
    '  which is NOT under content/, the folder served without a signature',
    !folder.includes('/content/'),
    folder,
  )

  // An admin may set somebody else's photo, so the route takes a userId. It
  // must not carry over to this: nobody uploads a passport for another person.
  const aimed = await call(
    '/uploads/ticket',
    { method: 'POST', body: JSON.stringify({ purpose: 'identity-document', userId: other.id }) },
    teacher.token,
  )
  check(
    'a ticket cannot be aimed at another teacher folder',
    String(aimed.body?.data?.folder ?? '').endsWith(`/identity/${teacher.id}`),
    String(aimed.body?.data?.folder),
  )

  const studentTicket = await call(
    '/uploads/ticket',
    { method: 'POST', body: JSON.stringify({ purpose: 'identity-document' }) },
    student.token,
  )
  check('a student cannot upload one at all', studentTicket.status === 403, String(studentTicket.status))

  /* ---------------- signing it back ---------------- */

  const myPath = `${folder}/passport.jpg`
  const mine = await call(
    '/uploads/sign',
    { method: 'POST', body: JSON.stringify({ path: myPath }) },
    teacher.token,
  )
  check('a teacher can sign their own document back', mine.status === 200, String(mine.status))

  const theirs = await call(
    '/uploads/sign',
    { method: 'POST', body: JSON.stringify({ path: myPath }) },
    other.token,
  )
  check("and cannot sign another teacher's", theirs.status === 403, String(theirs.status))

  // A prefix test would let teacher 1 reach identity/12. The folder has to
  // match as a whole segment.
  const lookalike = folder.replace(`/identity/${teacher.id}`, `/identity/${teacher.id}9`)
  const sneaky = await call(
    '/uploads/sign',
    { method: 'POST', body: JSON.stringify({ path: `${lookalike}/passport.jpg` }) },
    teacher.token,
  )
  check('  nor a folder whose id merely starts the same', sneaky.status === 403, String(sneaky.status))

  /* ---------------- the record ---------------- */

  const saved = await call(
    '/me/payout-details',
    {
      method: 'PUT',
      body: JSON.stringify({
        idDocumentPath: myPath,
        bankCountry: 'th',
        bankName: 'กสิกรไทย',
        swift: 'kasithbk',
        accountName: 'ธนา รักดี',
        accountNumber: ACCOUNT_NUMBER,
        payoutCurrency: 'jpy',
      }),
    },
    teacher.token,
  )
  check('the details save', saved.status === 200, String(saved.status))
  check('  with the currency normalised', saved.body?.data?.payoutCurrency === 'JPY', saved.body?.data?.payoutCurrency)
  check('  the country normalised', saved.body?.data?.bankCountry === 'TH', saved.body?.data?.bankCountry)
  check('  and the SWIFT code normalised', saved.body?.data?.swift === 'KASITHBK', saved.body?.data?.swift)
  check(
    '  and the account number kept exactly as typed',
    saved.body?.data?.accountNumber === ACCOUNT_NUMBER,
    saved.body?.data?.accountNumber,
  )

  const stolen = await call(
    '/me/payout-details',
    { method: 'PUT', body: JSON.stringify({ idDocumentPath: `${lookalike}/passport.jpg` }) },
    other.token,
  )
  check(
    "a teacher cannot claim somebody else's document as theirs",
    stolen.status === 403,
    String(stolen.status),
  )

  const badSwift = await call(
    '/me/payout-details',
    { method: 'PUT', body: JSON.stringify({ swift: 'NOT A CODE' }) },
    teacher.token,
  )
  check('a SWIFT code of the wrong shape is refused', badSwift.status === 422, String(badSwift.status))

  const badCountry = await call(
    '/me/payout-details',
    { method: 'PUT', body: JSON.stringify({ bankCountry: 'ZZ' }) },
    teacher.token,
  )
  check('a country we do not pay into is refused', badCountry.status === 422, String(badCountry.status))

  const madeUp = await call(
    '/me/payout-details',
    { method: 'PUT', body: JSON.stringify({ payoutCurrency: 'XXX' }) },
    teacher.token,
  )
  check('a currency we do not pay in is refused', madeUp.status === 422, String(madeUp.status))

  const asStudent = await call('/me/payout-details', {}, student.token)
  check('a student has no payout details route', asStudent.status === 403, String(asStudent.status))

  /* ---------------- the CV they can replace ---------------- */

  const cvPath = `${folder}/cv-updated.pdf`
  const newCv = await call(
    '/me/payout-details',
    { method: 'PUT', body: JSON.stringify({ resumePath: cvPath }) },
    teacher.token,
  )
  check('a teacher can replace their own CV', newCv.status === 200, String(newCv.status))
  check('  and it is the one now on file', newCv.body?.data?.resumeIsCurrent === true, String(newCv.body?.data?.resumeIsCurrent))
  check('  readable through a signed link', /sig=/.test(String(newCv.body?.data?.resumeUrl ?? '')), String(newCv.body?.data?.resumeUrl ?? '').slice(0, 50))

  const stolenCv = await call(
    '/me/payout-details',
    { method: 'PUT', body: JSON.stringify({ resumePath: `${folder}9/cv.pdf` }) },
    teacher.token,
  )
  check("and somebody else's file is refused", stolenCv.status === 403, String(stolenCv.status))

  /* ---------------- none of it is public ---------------- */

  // Through a real course page, where this teacher is named — the one place a
  // stranger meets them. `/teachers` is an admin list and asking it
  // unauthenticated proves nothing but that the door is shut.
  const course = await call(
    '/courses',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Smoke payout course',
        slug: `smoke-payout-${stamp}`,
        price: 100000,
      }),
    },
    teacher.token,
  )
  courseId = course.body?.data?.id ?? 0
  await db.update(courses).set({ status: 'approved' }).where(eq(courses.id, courseId))

  const publicPage = await call(`/courses/smoke-payout-${stamp}`)
  const asText = JSON.stringify(publicPage.body ?? {})
  check('the public course page names the teacher', publicPage.status === 200, String(publicPage.status))
  check(
    '  and carries none of their bank details',
    !asText.includes(ACCOUNT_NUMBER) &&
      !asText.includes('accountNumber') &&
      !asText.includes('idDocumentPath'),
    `${asText.length} bytes`,
  )

  /* ---------------- the administrator who has to make the transfer ---------------- */

  // Somebody has to read these to move the money. The rule is not that nobody
  // can, but that it is a deliberate act by somebody entitled, and that it
  // leaves a trace.
  const admin = await account('admin', 'admin')
  try {
    const asAdmin = await call(`/members/${teacher.id}/payout-details`, {}, admin.token)
    check('an administrator can read what they need to pay somebody', asAdmin.status === 200, String(asAdmin.status))
    check(
      '  including the account number, in full',
      asAdmin.body?.data?.accountNumber === ACCOUNT_NUMBER,
      String(asAdmin.body?.data?.accountNumber),
    )
    check(
      '  and a link to the identity document',
      /sig=/.test(String(asAdmin.body?.data?.idDocumentUrl ?? '')),
      String(asAdmin.body?.data?.idDocumentUrl ?? '').slice(0, 60),
    )
    check(
      '  which is signed rather than a plain address',
      !String(asAdmin.body?.data?.idDocumentUrl ?? '').includes('/content/'),
      'not under the unsigned folder',
    )

    /**
     * Every list the form builds a dropdown from.
     *
     * A select can only hold a value it was given an option for, so a missing
     * list is not an empty dropdown somebody reports — it is a field that
     * silently clears itself on the next save. `currencies` was left out of
     * this answer once and opening the form to fix a branch name wiped the
     * teacher's chosen payout currency.
     */
    check(
      '  and the CV they applied with',
      'resumeUrl' in (asAdmin.body?.data ?? {}),
      String(asAdmin.body?.data?.resumeUrl),
    )
    check(
      '  and the share agreed with them',
      'revenueSharePct' in (asAdmin.body?.data ?? {}) && typeof asAdmin.body?.data?.houseSharePct === 'number',
      `${asAdmin.body?.data?.revenueSharePct} of ${asAdmin.body?.data?.houseSharePct}`,
    )

    for (const list of ['currencies', 'countries', 'thaiBanks'] as const) {
      const got = asAdmin.body?.data?.[list]
      check(`  with the ${list} the form needs`, Array.isArray(got) && got.length > 0, `${got?.length ?? 0} items`)
    }

    const roundTrip = await call(
      `/members/${teacher.id}/payout-details`,
      {
        method: 'PUT',
        body: JSON.stringify({
          bankCountry: asAdmin.body?.data?.bankCountry,
          bankName: asAdmin.body?.data?.bankName,
          accountName: asAdmin.body?.data?.accountName,
          accountNumber: asAdmin.body?.data?.accountNumber,
          branch: 'Somewhere else',
          swift: asAdmin.body?.data?.swift,
          payoutCurrency: asAdmin.body?.data?.payoutCurrency,
        }),
      },
      admin.token,
    )
    check('an administrator can correct the bank details', roundTrip.status === 200, String(roundTrip.status))

    const corrected = await call(`/members/${teacher.id}/payout-details`, {}, admin.token)
    check('  the correction sticks', corrected.body?.data?.branch === 'Somewhere else', String(corrected.body?.data?.branch))
    check(
      '  and nothing else was lost on the way',
      corrected.body?.data?.payoutCurrency === 'JPY' &&
        corrected.body?.data?.accountNumber === ACCOUNT_NUMBER,
      `${corrected.body?.data?.payoutCurrency} / ${corrected.body?.data?.accountNumber}`,
    )
    check(
      '  and the document still reads as the teacher own',
      corrected.body?.data?.idDocumentByAdmin === false,
      String(corrected.body?.data?.idDocumentByAdmin),
    )

    const asOther = await call(`/members/${teacher.id}/payout-details`, {}, other.token)
    check("a teacher cannot read another teacher's", asOther.status === 403, String(asOther.status))

    const asSelfTeacher = await call(`/members/${teacher.id}/payout-details`, {}, teacher.token)
    check('  nor their own through the admin route', asSelfTeacher.status === 403, String(asSelfTeacher.status))

    await new Promise((r) => setTimeout(r, 800))
    const looks = await db
      .select({ action: auditLogs.action, actorId: auditLogs.actorId, changes: auditLogs.changes })
      .from(auditLogs)
      .where(and(eq(auditLogs.subjectId, teacher.id), eq(auditLogs.action, 'payout_details.viewed')))

    // One row per read this test made, not one in total: the point is that
    // every look leaves a trace, not that looking happens once.
    check('every read is recorded', looks.length === 2, `${looks.length} row(s)`)
    check('  against the administrator who made it', looks[0]?.actorId === admin.id, String(looks[0]?.actorId))
    check(
      '  without copying the account number into the log',
      !JSON.stringify(looks).includes(ACCOUNT_NUMBER),
      JSON.stringify(looks.map((l) => l.changes)),
    )

    // Somebody who has filled in nothing is not an error, just an empty answer.
    const empty = await call(`/members/${other.id}/payout-details`, {}, admin.token)
    check('a teacher who has filled in nothing reads as empty, not missing', empty.status === 200, String(empty.status))
    check('  with no account number', empty.body?.data?.accountNumber === null, String(empty.body?.data?.accountNumber))
  } finally {
    await db.delete(users).where(eq(users.id, admin.id))
  }

  /* ---------------- the audit trail keeps no copy ---------------- */

  // `audit()` is fire-and-forget on purpose — a log write must not fail a save
  // — so the row lands a moment after the response.
  await new Promise((r) => setTimeout(r, 800))

  const rows = await db
    .select({ action: auditLogs.action, changes: auditLogs.changes, summary: auditLogs.summary })
    .from(auditLogs)
    .where(and(eq(auditLogs.subjectId, teacher.id), like(auditLogs.action, 'payout_details%')))

  check('the change is recorded', rows.length > 0, rows.map((r) => r.action).join(', '))
  check(
    '  without copying the account number into the audit log',
    !JSON.stringify(rows).includes(ACCOUNT_NUMBER),
    JSON.stringify(rows.map((r) => r.summary)),
  )
} finally {
  if (courseId) {
    await db.update(courses).set({ status: 'draft', publishedAt: null }).where(eq(courses.id, courseId))
    await db.delete(courses).where(eq(courses.id, courseId))
  }
  for (const u of [teacher, other, student]) {
    await db.delete(teacherPayoutDetails).where(eq(teacherPayoutDetails.userId, u.id))
    await db.delete(users).where(eq(users.id, u.id))
  }
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
