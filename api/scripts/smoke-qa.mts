/**
 * The questions under a lesson: who may read them, who may write, how often.
 *
 *   npx tsx scripts/smoke-qa.mts
 *
 * Two students on one course and one who is not, because the interesting
 * questions are all about who sees what: a thread everybody on the course can
 * read, nobody outside it can, and nobody can post into faster than the
 * cooldown allows.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import { courses, entitlements, lessonQuestions, lessons, users } from '../src/db/schema/index'

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
async function member(tag: string) {
  const email = `smoke-qa-${tag}-${Date.now()}@example.com`
  const made = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      firstName: tag === 'a' ? 'มานี' : tag === 'b' ? 'ปิติ' : 'คนนอก',
      lastName: 'ทดสอบ',
      birthdate: '2000-01-15',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  return { email, id: made.body.user.id as number, token: made.body.accessToken as string }
}

const mana = await member('a')
const piti = await member('b')
const outsider = await member('c')
console.log(`  classmates: ${mana.email}, ${piti.email}\n`)

try {
  const [course] = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      n: sql<number>`(SELECT COUNT(*) FROM lessons l WHERE l.course_id = courses.id)`,
    })
    .from(courses)
    .where(eq(courses.status, 'approved'))
    .limit(30)
    .then((rows) => rows.filter((r) => Number(r.n) >= 2))
  if (!course) throw new Error('need a course with lessons')

  const [lesson, otherLesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.courseId, course.id))
    .limit(2)

  for (const who of [mana, piti]) {
    await db.insert(entitlements).values({
      userId: who.id,
      courseId: course.id,
      source: 'purchase',
      status: 'active',
    })
  }

  /* ---------------- who may read ---------------- */

  check(
    'a stranger with no session cannot read the thread',
    (await call(`/me/courses/${course.slug}/questions`)).status === 401,
  )
  const asOutsider = await call(`/me/courses/${course.slug}/questions`, {}, outsider.token)
  check('nor can a member who is not on the course', asOutsider.status === 403, String(asOutsider.status))

  const empty = await call(`/me/courses/${course.slug}/questions`, {}, mana.token)
  check('a course member reads it, and it starts empty', empty.status === 200 && empty.body.data.length === 0)

  /* ---------------- asking ---------------- */

  const asked = await call(
    `/me/lessons/${lesson!.id}/questions`,
    { method: 'POST', body: JSON.stringify({ body: 'ตรงนาทีที่ 3 ครูออกเสียงว่าอะไรคะ' }) },
    mana.token,
  )
  check('a member can ask', asked.status === 201, String(asked.status))

  const short = await call(
    `/me/lessons/${lesson!.id}/questions`,
    { method: 'POST', body: JSON.stringify({ body: '?' }) },
    piti.token,
  )
  check('an empty question is refused', short.status === 422, String(short.status))

  const fromOutside = await call(
    `/me/lessons/${lesson!.id}/questions`,
    { method: 'POST', body: JSON.stringify({ body: 'ขายของครับ' }) },
    outsider.token,
  )
  check('somebody not on the course cannot post', fromOutside.status === 403, String(fromOutside.status))

  /* ---------------- the cooldown ---------------- */

  const again = await call(
    `/me/lessons/${otherLesson!.id}/questions`,
    { method: 'POST', body: JSON.stringify({ body: 'อีกคำถามหนึ่งทันที' }) },
    mana.token,
  )
  check('a second question straight away is refused', again.status === 422, String(again.status))
  // Its own code and the number of minutes, so the page can say it in the
  // reader's language rather than relaying the API's English.
  check(
    '  with a code the page can translate',
    again.body?.error?.code === 'qa_cooldown',
    String(again.body?.error?.code),
  )
  check(
    '  and how many seconds are left',
    Number(again.body?.error?.fields?.body) > 0 && Number(again.body?.error?.fields?.body) <= 20,
    String(again.body?.error?.fields?.body),
  )

  /* ---------------- classmates see it, and can answer ---------------- */

  const seen = await call(`/me/courses/${course.slug}/questions`, {}, piti.token)
  check('a classmate sees the question', seen.body.data.length === 1, String(seen.body.data.length))
  check(
    '  with the asker named',
    seen.body.data[0].author.name.includes('มานี'),
    seen.body.data[0].author.name,
  )
  check('  and knows it is not theirs', seen.body.data[0].mine === false)
  check('  so cannot delete it', seen.body.data[0].canDelete === false)

  const questionId = seen.body.data[0].id as number

  const answered = await call(
    `/me/questions/${questionId}/replies`,
    { method: 'POST', body: JSON.stringify({ body: 'เขาว่า ohayou กลืนเสียง u ครับ' }) },
    piti.token,
  )
  check('a classmate can answer', answered.status === 201, String(answered.status))
  check(
    "  but a classmate's answer does not close the question",
    answered.body.data.answered === false,
    String(answered.body.data.answered),
  )

  const [row] = await db
    .select({ answeredAt: lessonQuestions.answeredAt })
    .from(lessonQuestions)
    .where(eq(lessonQuestions.id, questionId))
  check(
    '  so the school still owes an answer',
    row?.answeredAt === null,
    String(row?.answeredAt),
  )

  const withReply = await call(`/me/courses/${course.slug}/questions`, {}, mana.token)
  check('the thread carries the reply', withReply.body.data[0].replies.length === 1)
  check(
    'the asker keeps control of their own question',
    withReply.body.data[0].canDelete === true,
    String(withReply.body.data[0].canDelete),
  )
  check(
    '  and is told how many answers go with it',
    withReply.body.data[0].replyCount === 1,
    String(withReply.body.data[0].replyCount),
  )

  // Their own words stay theirs to fix, answered or not: an earlier rule froze
  // a question the moment anybody replied, typo and all.
  const reword = await call(
    `/me/questions/${questionId}`,
    { method: 'PATCH', body: JSON.stringify({ body: 'ขอถามใหม่ให้ชัดกว่าเดิม' }) },
    mana.token,
  )
  check('an answered question can still be reworded by its asker', reword.status === 200, String(reword.status))

  const notTheirs = await call(
    `/me/questions/${withReply.body.data[0].replies[0].id}`,
    { method: 'PATCH', body: JSON.stringify({ body: 'แก้คำตอบคนอื่น' }) },
    mana.token,
  )
  check("nor can anybody edit somebody else's post", notTheirs.status === 403, String(notTheirs.status))

  const ownReply = await call(
    `/me/questions/${withReply.body.data[0].replies[0].id}`,
    { method: 'PATCH', body: JSON.stringify({ body: 'ขอแก้คำตอบของตัวเอง' }) },
    piti.token,
  )
  check('but the author can fix their own reply', ownReply.status === 200, String(ownReply.status))
  check(
    '  and the new wording is what the thread shows',
    (await call(`/me/courses/${course.slug}/questions`, {}, mana.token)).body.data[0].replies[0]
      .body === 'ขอแก้คำตอบของตัวเอง',
  )



  const notMine = await call(
    `/me/questions/${withReply.body.data[0].replies[0].id}`,
    { method: 'DELETE' },
    mana.token,
  )
  check("and nobody deletes somebody else's post", notMine.status === 403, String(notMine.status))

  /* ---------------- the count the tab shows ---------------- */

  const all = await call(`/me/courses/${course.slug}/questions`, {}, mana.token)
  check('the course lists its one question', all.body.data.length === 1, String(all.body.data.length))
  check(
    '  labelled with the lesson it was asked from',
    Boolean(all.body.data[0].lesson?.title),
    JSON.stringify(all.body.data[0].lesson),
  )

  /* ---------------- withdrawing one nobody answered ---------------- */

  const lone = await call(
    `/me/lessons/${lesson!.id}/questions`,
    { method: 'POST', body: JSON.stringify({ body: 'คำถามที่จะถอนทีหลัง' }) },
    piti.token,
  )
  if (lone.status !== 201) await new Promise((r) => setTimeout(r, 21_000))
  const retry =
    lone.status === 201
      ? lone
      : await call(
          `/me/lessons/${lesson!.id}/questions`,
          { method: 'POST', body: JSON.stringify({ body: 'คำถามที่จะถอนทีหลัง' }) },
          piti.token,
        )
  if (retry.status === 201) {
    const mineNow = await call(`/me/courses/${course.slug}/questions`, {}, piti.token)
    const own = mineNow.body.data.find((q: { mine: boolean }) => q.mine)
    check('an unanswered question of your own can be withdrawn', own?.canDelete === true)
    check(
      '  and withdrawing it works',
      (await call(`/me/questions/${own.id}`, { method: 'DELETE' }, piti.token)).status === 204,
    )
  } else {
    check('an unanswered question of your own can be withdrawn', false, String(retry.status))
    check('  and withdrawing it works', false, 'never posted')
  }
} finally {
  for (const who of [mana, piti, outsider]) {
    await db.delete(lessonQuestions).where(eq(lessonQuestions.userId, who.id))
    await db.delete(entitlements).where(eq(entitlements.userId, who.id))
    await db.delete(users).where(eq(users.id, who.id))
  }
  console.log('\n  cleaned up')
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
