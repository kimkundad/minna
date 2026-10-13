/**
 * Who an article is credited to.
 *
 *   npx tsx scripts/smoke-post-author.mts
 *
 * The author used to be whoever pressed Create, with nothing able to change
 * it afterwards. That is wrong for how these are actually written: a teacher
 * writes the article and an administrator files it, and the card at the end
 * of the page then showed the administrator — a name with no headline and no
 * biography, because those live on a teacher's profile.
 *
 * So the field is now chosen, and this checks the three things that matters
 * for: that it can be set, that it can be changed, and that it cannot be
 * pointed at somebody who did not agree to have their name on a public page.
 *
 * Makes its own accounts and article, and removes them again.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { posts, teacherProfiles, users } from '../src/db/schema/index'

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

async function account(kind: string, role: 'admin' | 'teacher' | null) {
  const email = `smoke-author-${kind}-${stamp}@example.com`
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
  if (role) {
    await db.execute(sql`
      INSERT INTO user_roles (user_id, role_id) SELECT ${id}, id FROM roles WHERE name = ${role}
    `)
  }
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return { id, email, token: login.body.accessToken as string }
}

const admin = await account('admin', 'admin')
const teacher = await account('teacher', 'teacher')
const student = await account('student', null)

// The teacher needs the public page the card reads from.
await db.execute(sql`
  INSERT INTO teacher_profiles (user_id, slug, display_name, short_name, headline, bio, listed)
  VALUES (${teacher.id}, ${`smoke-author-${stamp}`}, 'Smoke Sensei', 'Smoke',
          'Teaches German', '<p>Nine years of it.</p>', 1)
`)

const slug = `smoke-author-${stamp}`
let postId = 0

try {
  /* ---------------- created without one: the creator ---------------- */

  const mine = await call(
    '/posts',
    {
      method: 'POST',
      body: JSON.stringify({ title: 'Smoke article', slug, status: 'draft', contentLocale: 'th' }),
    },
    admin.token,
  )
  check('an article can be created without naming an author', mine.status === 201, String(mine.status))
  postId = mine.body?.data?.id ?? 0
  check('  and is credited to whoever created it', mine.body?.data?.authorId === admin.id, String(mine.body?.data?.authorId))

  /* ---------------- moved to the teacher ---------------- */

  const moved = await call(
    `/posts/${postId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Smoke article',
        slug,
        status: 'draft',
        contentLocale: 'th',
        authorId: teacher.id,
      }),
    },
    admin.token,
  )
  check('the author can be changed afterwards', moved.status === 200, String(moved.status))
  check('  to the teacher who wrote it', moved.body?.data?.authorId === teacher.id, String(moved.body?.data?.authorId))

  /* ---------------- which is what the reader sees ---------------- */

  await call(
    `/posts/${postId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Smoke article',
        slug,
        status: 'published',
        contentLocale: 'th',
        authorId: teacher.id,
      }),
    },
    admin.token,
  )
  const seen = await call(`/posts/public/${slug}`)
  const data = seen.body?.data
  check('the public page carries the teacher', data?.authorName === 'Smoke Sensei', data?.authorName)
  check('  with their headline', data?.authorHeadline === 'Teaches German', data?.authorHeadline)
  check('  and their biography', String(data?.authorBio ?? '').includes('Nine years'), data?.authorBio)

  /* ---------------- leaving it out keeps it ---------------- */

  const quiet = await call(
    `/posts/${postId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Smoke article, edited',
        slug,
        status: 'published',
        contentLocale: 'th',
      }),
    },
    admin.token,
  )
  check('an edit that does not mention the author leaves it alone', quiet.body?.data?.authorId === teacher.id, String(quiet.body?.data?.authorId))

  /* ---------------- a student cannot be credited ---------------- */

  const wrong = await call(
    `/posts/${postId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Smoke article',
        slug,
        status: 'published',
        contentLocale: 'th',
        authorId: student.id,
      }),
    },
    admin.token,
  )
  check('a student cannot be made the author', wrong.status === 409, String(wrong.status))
  check('  and the real author is untouched', (await call(`/posts/public/${slug}`)).body?.data?.authorName === 'Smoke Sensei')

  /* ---------------- nor can a teacher do any of this ---------------- */

  const asTeacher = await call(
    `/posts/${postId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ title: 'Mine now', slug, status: 'published', contentLocale: 'th' }),
    },
    teacher.token,
  )
  check('a teacher cannot edit articles at all', asTeacher.status === 403, String(asTeacher.status))
} finally {
  if (postId) await db.delete(posts).where(eq(posts.id, postId))
  await db.delete(teacherProfiles).where(eq(teacherProfiles.userId, teacher.id))
  for (const u of [admin, teacher, student]) await db.delete(users).where(eq(users.id, u.id))
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
