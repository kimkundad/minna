/**
 * Category names in four languages: who may set them, and what the site reads.
 *
 *   npx tsx scripts/smoke-category-names.mts
 *
 * The thing worth proving is the fallback. A category with no Vietnamese name
 * has to read as its Thai one, not as a blank or a slug — that is what lets a
 * translation be added one category at a time instead of all at once, and it is
 * the behaviour every name on the public site now depends on.
 *
 * The other half is that Thai cannot be set here. It lives on the category
 * itself, and a row in the translation table claiming to be Thai would be a
 * second place to edit one name with no way to tell which the site is showing.
 *
 * Makes its own category and deletes it again, so it can run against a real
 * database without touching the catalog.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { categories, categoryTranslations, users } from '../src/db/schema/index'

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

/** A throwaway account, so the allowed and refused halves are both proven
 *  without anybody's real password. */
async function account(role: 'admin' | null) {
  const email = `smoke-catname-${role ?? 'student'}-${Date.now()}@example.com`
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
      INSERT INTO user_roles (user_id, role_id)
      SELECT ${id}, id FROM roles WHERE name = ${role}
    `)
  }
  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return { id, token: login.body.accessToken as string }
}

const admin = await account('admin')
const student = await account(null)
const slug = `smoke-catname-${Date.now()}`
let categoryId = 0

/** This category as the public list reports it. */
async function fromPublicList(): Promise<{ name: string; names: Record<string, string> } | null> {
  const res = await call('/categories?all=1')
  const rows = res.body.data as { id: number; name: string; names: Record<string, string> }[]
  return rows.find((c) => c.id === categoryId) ?? null
}

try {
  /* ---------------- creating one with translations ---------------- */

  const made = await call(
    '/categories',
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'ภาษาทดสอบ',
        slug,
        sortOrder: 900,
        names: { en: 'Test language', jp: 'テスト語' },
      }),
    },
    admin.token,
  )
  check('an administrator can create a category with translations', made.status === 201, String(made.status))
  categoryId = made.body?.data?.id ?? 0
  check('  and it comes back with them', made.body?.data?.names?.en === 'Test language', JSON.stringify(made.body?.data?.names))

  /* ---------------- what the site reads ---------------- */

  const listed = await fromPublicList()
  check('the public list carries the category', listed !== null)
  check(
    '  with the English name as given',
    listed?.names.en === 'Test language',
    listed?.names.en,
  )
  check('  and the Japanese one', listed?.names.jp === 'テスト語', listed?.names.jp)
  check(
    '  and Thai, which lives on the category itself',
    listed?.names.th === 'ภาษาทดสอบ',
    listed?.names.th,
  )
  check(
    '  Vietnamese was never set, so there is no name to read',
    listed !== null && !('vn' in listed.names),
    JSON.stringify(listed?.names),
  )
  check(
    '  which is what makes the site fall back to Thai',
    (listed?.names.vn ?? listed?.name) === 'ภาษาทดสอบ',
  )

  /* ---------------- Thai cannot be set here ---------------- */

  const sneaky = await call(
    `/categories/${categoryId}`,
    { method: 'PATCH', body: JSON.stringify({ names: { th: 'ชื่ออื่น' } }) },
    admin.token,
  )
  check('a translation claiming to be Thai is refused', sneaky.status === 422, String(sneaky.status))
  check(
    '  so the canonical name is untouched',
    (await fromPublicList())?.names.th === 'ภาษาทดสอบ',
  )

  /* ---------------- editing and clearing ---------------- */

  const edited = await call(
    `/categories/${categoryId}`,
    { method: 'PATCH', body: JSON.stringify({ names: { en: 'Renamed', vn: 'Ngôn ngữ thử' } }) },
    admin.token,
  )
  check('an existing translation can be changed', edited.status === 200, String(edited.status))
  const afterEdit = await fromPublicList()
  check('  the new English name is live', afterEdit?.names.en === 'Renamed', afterEdit?.names.en)
  check('  Vietnamese was added', afterEdit?.names.vn === 'Ngôn ngữ thử', afterEdit?.names.vn)
  check(
    '  and Japanese, which was not sent, is left alone',
    afterEdit?.names.jp === 'テスト語',
    afterEdit?.names.jp,
  )

  await call(
    `/categories/${categoryId}`,
    { method: 'PATCH', body: JSON.stringify({ names: { en: '  ' } }) },
    admin.token,
  )
  const cleared = await fromPublicList()
  check(
    'a blank name removes the translation rather than storing a blank',
    cleared !== null && !('en' in cleared.names),
    JSON.stringify(cleared?.names),
  )

  /* ---------------- who may ---------------- */

  const asStudent = await call(
    `/categories/${categoryId}`,
    { method: 'PATCH', body: JSON.stringify({ names: { en: 'Mine now' } }) },
    student.token,
  )
  check('a student cannot rename a category', asStudent.status === 403, String(asStudent.status))

  const asNobody = await call(`/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ names: { en: 'Mine now' } }),
  })
  check('nor a stranger', asNobody.status === 401, String(asNobody.status))

  /* ---------------- searching finds any language ---------------- */

  const byJapanese = await call(
    `/categories?q=${encodeURIComponent('テスト語')}`,
    {},
    admin.token,
  )
  check(
    'the admin search finds a category by its Japanese name',
    (byJapanese.body?.data ?? []).some((c: { id: number }) => c.id === categoryId),
    String(byJapanese.status),
  )

  /* ---------------- deleting takes the translations with it ---------------- */

  const gone = await call(`/categories/${categoryId}`, { method: 'DELETE' }, admin.token)
  check('the category can be deleted', gone.status === 200 || gone.status === 204, String(gone.status))
  const orphans = await db
    .select({ locale: categoryTranslations.locale })
    .from(categoryTranslations)
    .where(eq(categoryTranslations.categoryId, categoryId))
  check('and leaves no translations behind', orphans.length === 0, `${orphans.length} left`)
  categoryId = 0
} finally {
  if (categoryId) {
    // The delete above did not run, or did not take. Either way this test does
    // not get to leave a category in somebody's catalog.
    await db.delete(categories).where(eq(categories.id, categoryId))
  }
  await db.delete(users).where(eq(users.id, admin.id))
  await db.delete(users).where(eq(users.id, student.id))
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
