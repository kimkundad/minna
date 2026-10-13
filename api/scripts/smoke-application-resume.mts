/**
 * The CV that comes with an application to teach.
 *
 *   npx tsx scripts/smoke-application-resume.mts
 *
 * The column for it existed from the start and nothing ever wrote to it: the
 * form had no field, the API took no such thing, and the review screen showed
 * nothing. An administrator decided who could teach from typed paragraphs
 * alone.
 *
 * The awkward part is who is allowed to send it. Applying does not grant the
 * teacher role — that is the whole point of the queue — so at the moment the
 * file goes up the applicant is an ordinary member, one second old. What this
 * proves is that the narrow door that opens for them is only as wide as it
 * needs to be:
 *
 *   - an applicant can send their own CV, into their own folder, outside the
 *     folder that is served without a signature
 *   - they cannot point their application at somebody else's file
 *   - a member with no application waiting cannot use the route at all
 *   - a decided application will not take one
 *   - the reviewer gets a link that expires, not a path anybody can keep
 *
 * Makes its own accounts and removes them again.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { teacherApplications, users } from '../src/db/schema/index'
import { storageRoot, uploadFile, listFiles } from '../src/lib/storage'

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

/** Registers the way the public form does, applying to teach. */
async function applicant(kind: string) {
  const email = `smoke-cv-${kind}-${stamp}@example.com`
  const made = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      firstName: 'ผู้',
      lastName: 'สมัคร',
      birthdate: '1990-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'teacher',
      phoneCountryCode: '+66',
      phoneNational: '811234567',
      teacher: { subject: 'ภาษาเยอรมัน', experience: 'สอนมา 5 ปี' },
    }),
  })
  return {
    id: made.body?.user?.id as number,
    email,
    token: made.body?.accessToken as string,
    status: made.status,
  }
}

const one = await applicant('one')
const two = await applicant('two')

// A plain member, who never applied.
const plainEmail = `smoke-cv-plain-${stamp}@example.com`
const plain = await call('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email: plainEmail,
    password,
    firstName: 'ทด',
    lastName: 'สอบ',
    birthdate: '1990-01-15',
    acceptedTerms: true,
    locale: 'th',
    memberType: 'student',
  }),
})

const admin = await (async () => {
  const email = `smoke-cv-admin-${stamp}@example.com`
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
  await db.execute(sql`
    INSERT INTO user_roles (user_id, role_id) SELECT ${id}, id FROM roles WHERE name = 'admin'
  `)
  const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  return { id, email, token: login.body.accessToken as string }
})()

try {
  check('registering as a teacher files an application', one.status === 201, String(one.status))
  check('  and signs them in, so a file can follow', Boolean(one.token))

  /* ---------------- the ticket ---------------- */

  const ticket = await call(
    '/uploads/ticket',
    { method: 'POST', body: JSON.stringify({ purpose: 'application-resume' }) },
    one.token,
  )
  check('an applicant can get a ticket for a CV', ticket.status === 201, String(ticket.status))

  const folder = String(ticket.body?.data?.folder ?? '')
  check(`  into applications/${one.id}`, folder.endsWith(`/applications/${one.id}`), folder)
  check(
    '  which is NOT the folder served without a signature',
    !folder.includes('/content/'),
    folder,
  )

  // An administrator may aim a ticket at somebody else for a photo. A member
  // asking for anybody but themselves is turned away before the purpose is
  // even considered — refused outright rather than quietly redirected to their
  // own folder, which is the stronger of the two answers.
  const aimed = await call(
    '/uploads/ticket',
    { method: 'POST', body: JSON.stringify({ purpose: 'application-resume', userId: two.id }) },
    one.token,
  )
  check('a ticket cannot be aimed at another applicant', aimed.status === 403, String(aimed.status))

  /* ---------------- attaching it ---------------- */

  const mine = `${folder}/cv.pdf`
  const attached = await call(
    '/me/application-files',
    { method: 'POST', body: JSON.stringify({ resumePath: mine }) },
    one.token,
  )
  check('the CV attaches to their application', attached.status === 200, String(attached.status))

  const theirs = `${folder.replace(`/applications/${one.id}`, `/applications/${two.id}`)}/cv.pdf`
  const stolen = await call(
    '/me/application-files',
    { method: 'POST', body: JSON.stringify({ resumePath: theirs }) },
    one.token,
  )
  check("and somebody else's file is refused", stolen.status === 403, String(stolen.status))

  const noApplication = await call(
    '/me/application-files',
    { method: 'POST', body: JSON.stringify({ resumePath: mine }) },
    plain.body?.accessToken,
  )
  check(
    'a member who never applied has nothing to attach to',
    noApplication.status === 404 || noApplication.status === 403,
    String(noApplication.status),
  )

  /* ---------------- what the reviewer sees ---------------- */

  const [row] = await db
    .select({ id: teacherApplications.id })
    .from(teacherApplications)
    .where(eq(teacherApplications.email, one.email))
    .limit(1)

  const detail = await call(`/teacher-applications/${row!.id}`, {}, admin.token)
  check('the reviewer can open the application', detail.status === 200, String(detail.status))
  check(
    '  and is given a link to the CV',
    /sig=/.test(String(detail.body?.data?.resumeUrl ?? '')),
    String(detail.body?.data?.resumeUrl ?? '').slice(0, 60),
  )
  check(
    '  along with when they agreed to the terms',
    Boolean(detail.body?.data?.agreedAt),
    String(detail.body?.data?.agreedAt),
  )
  check(
    '  and everything they typed',
    detail.body?.data?.subject === 'ภาษาเยอรมัน' &&
      detail.body?.data?.experience === 'สอนมา 5 ปี' &&
      detail.body?.data?.phone === '+66811234567',
    `${detail.body?.data?.subject} / ${detail.body?.data?.phone}`,
  )

  /* ---------------- the clip, and what a decision does to it ---------------- */

  // A real file, so the deletion can be checked against the store rather than
  // only against the column that pointed at it.
  const clipFolder = `${storageRoot()}/applications/${one.id}`
  const clip = await uploadFile({
    folder: clipFolder,
    filename: 'sample-lesson.txt',
    body: Buffer.from('pretend this is a hundred megabytes of teaching'),
    contentType: 'text/plain',
    keepName: true,
  })

  const withClip = await call(
    '/me/application-files',
    { method: 'POST', body: JSON.stringify({ sampleVideoPath: clip.path }) },
    one.token,
  )
  check('the sample lesson attaches too', withClip.status === 200, String(withClip.status))

  const beforeDecision = await call(`/teacher-applications/${row!.id}`, {}, admin.token)
  check(
    '  and the reviewer gets a link to watch it',
    /sig=/.test(String(beforeDecision.body?.data?.sampleVideoUrl ?? '')),
    String(beforeDecision.body?.data?.sampleVideoUrl ?? '').slice(0, 56),
  )
  check(
    '  while the CV is still there as well',
    /sig=/.test(String(beforeDecision.body?.data?.resumeUrl ?? '')),
    'both files',
  )

  const inStoreBefore = (await listFiles(clipFolder)).files
  check(
    '  and the file is really in the store',
    inStoreBefore.some((f) => f.path === clip.path),
    `${inStoreBefore.length} file(s)`,
  )

  // Deciding — either way — is what removes it.
  const decided = await call(
    `/teacher-applications/${row!.id}/decision`,
    { method: 'POST', body: JSON.stringify({ decision: 'rejected' }) },
    admin.token,
  )
  check('the application can be decided', decided.status === 200, String(decided.status))

  const afterDecision = await call(`/teacher-applications/${row!.id}`, {}, admin.token)
  check(
    '  the clip is gone from the record',
    afterDecision.body?.data?.sampleVideoUrl === null,
    String(afterDecision.body?.data?.sampleVideoUrl),
  )
  check(
    '  and gone from the store, not merely unlinked',
    !(await listFiles(clipFolder)).files.some((f) => f.path === clip.path),
    'deleted',
  )
  check(
    '  while the CV is kept',
    /sig=/.test(String(afterDecision.body?.data?.resumeUrl ?? '')),
    'resume still readable',
  )

  /* ---------------- after a decision ---------------- */

  const late = await call(
    '/me/application-files',
    { method: 'POST', body: JSON.stringify({ resumePath: mine }) },
    one.token,
  )
  check('a decided application will not take a CV', late.status === 409, String(late.status))
} finally {
  for (const email of [one.email, two.email, plainEmail, admin.email]) {
    await db.delete(teacherApplications).where(eq(teacherApplications.email, email))
    await db.delete(users).where(eq(users.email, email))
  }
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
