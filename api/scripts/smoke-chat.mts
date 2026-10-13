/**
 * Staff chat: who may talk to whom, and what they may reach.
 *
 *   npx tsx scripts/smoke-chat.mts
 *
 * The rule under test is the shape of the thing: a teacher has one
 * conversation and cannot choose who it is with, an admin has one per teacher,
 * and neither can see the other teachers' threads. A learner has none at all.
 *
 * The attachment checks matter most. A chat file sits outside the public
 * folder, and the only way to it is through the thread — so a path from
 * somewhere else, and a thread somebody is not in, both have to be refused.
 */
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '../src/db/client'
import { chatMessages, chatParticipants, chatThreads, users } from '../src/db/schema/index'

const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const stamp = Date.now()
const password = 'Str0ng-Pass!2026'
const emails = {
  teacherA: `smoke-chat-ta${stamp}@example.com`,
  teacherB: `smoke-chat-tb${stamp}@example.com`,
  admin: `smoke-chat-ad${stamp}@example.com`,
  learner: `smoke-chat-ln${stamp}@example.com`,
}

async function account(email: string, role?: 'teacher' | 'admin', firstName = 'ทด') {
  const made = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName,
      lastName: 'สอบ',
      birthdate: '1990-01-01',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const body = await made.json()
  if (role) {
    const { execFileSync } = await import('node:child_process')
    execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, role], {
      shell: true,
      stdio: 'ignore',
    })
    const again = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ email, password }),
    })
    return { id: body.user.id as number, token: (await again.json()).accessToken as string }
  }
  return { id: body.user.id as number, token: body.accessToken as string }
}

const call = (path: string, token: string, init: RequestInit = {}) =>
  fetch(API + path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      Authorization: `Bearer ${token}`,
    },
  })

const A = await account(emails.teacherA, 'teacher')
const B = await account(emails.teacherB, 'teacher')
const ADMIN = await account(emails.admin, 'admin')
// A name of their own, so 'the teacher was not told who asked' is a real
// check and not four accounts that happen to share a fixture name.
const LEARNER_NAME = 'Pimchanok' + stamp
const LEARNER = await account(emails.learner, undefined, LEARNER_NAME)

try {
  /* ---------------- who has a conversation at all ---------------- */

  const learnerList = await (await call('/me/chats', LEARNER.token)).json()
  check('a learner has exactly one too', learnerList.data.length === 1, String(learnerList.data.length))
  check('  and it is with the school, not a teacher', learnerList.data[0].withUserId === null)
  check('  marked as a learner thread', learnerList.data[0].kind === 'student', learnerList.data[0].kind)
  const threadL = learnerList.data[0].id as number

  const mine = await (await call('/me/chats', A.token)).json()
  check('a teacher has exactly one', mine.data.length === 1, String(mine.data.length))
  check('  and it is with the school, not a person', mine.data[0].withUserId === null)
  check('  marked as a teacher thread', mine.data[0].kind === 'teacher', mine.data[0].kind)
  const threadA = mine.data[0].id as number

  const again = await (await call('/me/chats', A.token)).json()
  check('  asking twice does not make a second', again.data[0].id === threadA)

  /* ---------------- a teacher cannot choose who to write to ---------------- */

  const chosen = await call('/me/chats', A.token, {
    method: 'POST',
    body: JSON.stringify({ teacherId: B.id }),
  })
  const got = (await chosen.json()).data
  check(
    'a teacher naming somebody else still gets their own thread',
    got.id === threadA,
    `${got.id} vs ${threadA}`,
  )

  /* ---------------- an admin has one per teacher ---------------- */

  const staffList = await (await call('/me/chats', ADMIN.token)).json()
  const ids = staffList.data.map((t: { withUserId: number }) => t.withUserId)
  check('an admin sees both teachers', ids.includes(A.id) && ids.includes(B.id), String(ids.length))
  check(
    '  including one who has never written',
    staffList.data.some((t: { withUserId: number; id: number }) => t.withUserId === B.id),
  )

  /* ---------------- and no teacher sees another's ---------------- */

  const threadB = ((await (await call('/me/chats', ADMIN.token, {
    method: 'POST',
    body: JSON.stringify({ teacherId: B.id }),
  })).json()).data as { id: number }).id

  check(
    "a teacher cannot read another teacher's thread",
    (await call(`/me/chats/${threadB}/messages`, A.token)).status === 403,
  )
  check(
    '  nor write to it',
    (await call(`/me/chats/${threadB}/messages`, A.token, {
      method: 'POST',
      body: JSON.stringify({ body: 'hello' }),
    })).status === 403,
  )

  /* ---------------- saying something ---------------- */

  const first = await call(`/me/chats/${threadA}/messages`, A.token, {
    method: 'POST',
    body: JSON.stringify({ body: 'สวัสดีครับ มีเรื่องอยากสอบถาม' }),
  })
  check('a teacher can write', first.status === 201, String(first.status))
  const firstId = (await first.json()).data.id as number

  const emptyOne = await call(`/me/chats/${threadA}/messages`, A.token, {
    method: 'POST',
    body: JSON.stringify({ body: '   ' }),
  })
  check('  but not nothing at all', emptyOne.status >= 400, String(emptyOne.status))

  const reply = await call(`/me/chats/${threadA}/messages`, ADMIN.token, {
    method: 'POST',
    body: JSON.stringify({ body: 'ได้ครับ เรื่องอะไรครับ' }),
  })
  check('an admin can answer', reply.status === 201, String(reply.status))

  const transcript = await (await call(`/me/chats/${threadA}/messages`, A.token)).json()
  check('the transcript holds both, oldest first', transcript.data.length === 2)
  check('  and says which are the reader\'s own', transcript.data[0].mine === true && transcript.data[1].mine === false)

  const asAdmin = await (await call(`/me/chats/${threadA}/messages`, ADMIN.token)).json()
  check('  with "mine" meaning whoever is asking', asAdmin.data[0].mine === false && asAdmin.data[1].mine === true)

  /* ---------------- unread ---------------- */

  const admin2 = await (await call('/me/chats', ADMIN.token)).json()
  const rowA = admin2.data.find((t: { withUserId: number }) => t.withUserId === A.id)
  check("sending marks the sender's own as read", rowA.unread === 0, String(rowA.unread))

  const teacherView = await (await call('/me/chats', A.token)).json()
  check("the answer is unread for the teacher", teacherView.data[0].unread === 1, String(teacherView.data[0].unread))
  check('  and the last line is shown in the list', teacherView.data[0].lastMessage?.includes('เรื่องอะไร'))

  await call(`/me/chats/${threadA}/read`, A.token, { method: 'POST' })
  const afterRead = await (await call('/me/chats', A.token)).json()
  check('reading clears it', afterRead.data[0].unread === 0, String(afterRead.data[0].unread))

  const badge = await (await call('/me/chats/unread-count', ADMIN.token)).json()
  check('the badge counts across every thread', typeof badge.data.unread === 'number', String(badge.data.unread))

  /* ---------------- attachments cannot be smuggled ---------------- */

  const elsewhere = await call(`/me/chats/${threadA}/messages`, A.token, {
    method: 'POST',
    body: JSON.stringify({
      body: 'look',
      attachmentPath: 'courses/38/video/secret.mp4',
      attachmentName: 'secret.mp4',
      attachmentKind: 'file',
    }),
  })
  check('a path from outside the conversation is refused', elsewhere.status === 403, String(elsewhere.status))

  const otherThread = await call(`/me/chats/${threadA}/messages`, A.token, {
    method: 'POST',
    body: JSON.stringify({
      body: 'look',
      attachmentPath: `chat/${threadB}/sneaky.png`,
      attachmentName: 'sneaky.png',
      attachmentKind: 'image',
    }),
  })
  check("  and so is another thread's folder", otherThread.status === 403, String(otherThread.status))

  const ticket = await call('/uploads/ticket', A.token, {
    method: 'POST',
    body: JSON.stringify({ purpose: 'chat-file', threadId: threadB }),
  })
  check('a ticket for a thread you are not in is refused', ticket.status === 403, String(ticket.status))

  const ownTicket = await call('/uploads/ticket', A.token, {
    method: 'POST',
    body: JSON.stringify({ purpose: 'chat-file', threadId: threadA }),
  })
  check(
    '  but your own is allowed',
    [201, 503].includes(ownTicket.status),
    String(ownTicket.status),
  )
  if (ownTicket.status === 201) {
    const folder = String((await ownTicket.json()).data.folder)
    check('    into the conversation\'s own folder', folder.includes(`chat/${threadA}`), folder)
    check('    which is not the public one', !folder.includes('/content/'), folder)
  }

  /**
   * A learner sending a picture of the question they are asking about.
   *
   * The blanket rule used to be "nobody but staff uploads anything but an
   * avatar", written when only staff had conversations. Being in the thread is
   * what grants the folder, so the thread is what has to be asked.
   */
  const learnerTicket = await call('/uploads/ticket', LEARNER.token, {
    method: 'POST',
    body: JSON.stringify({ purpose: 'chat-file', threadId: threadL }),
  })
  check(
    'a learner may send a file into their own conversation',
    [201, 503].includes(learnerTicket.status),
    String(learnerTicket.status),
  )
  check(
    "  but not into a teacher's",
    (await call('/uploads/ticket', LEARNER.token, {
      method: 'POST',
      body: JSON.stringify({ purpose: 'chat-file', threadId: threadA }),
    })).status === 403,
  )
  check(
    '  and still nothing else at all',
    (await call('/uploads/ticket', LEARNER.token, {
      method: 'POST',
      body: JSON.stringify({ purpose: 'course-video', courseId: 1 }),
    })).status === 403,
  )

  const noFile = await call(`/me/chats/${threadA}/messages/${firstId}/file`, A.token)
  check('a message with no attachment has no file', noFile.status === 404, String(noFile.status))

  /* ---------------- the live stream ---------------- */

  /**
   * The whole realtime claim rests on this, so it is tested rather than
   * assumed: open the stream as the teacher, have the admin say something, and
   * see whether it arrives without anybody asking again.
   */
  const streamed = await (async () => {
    const stop = new AbortController()
    const res = await fetch(`${API}/me/chats/${threadA}/stream?after=0`, {
      headers: { Authorization: `Bearer ${A.token}`, Accept: 'text/event-stream' },
      signal: stop.signal,
    })
    if (!res.ok || !res.body) return { status: res.status, got: null as string | null }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let seen = ''

    // Give the stream a moment to be listening, then say something into it.
    const said = (async () => {
      await new Promise((go) => setTimeout(go, 300))
      await call(`/me/chats/${threadA}/messages`, ADMIN.token, {
        method: 'POST',
        body: JSON.stringify({ body: 'ส่งผ่าน stream' }),
      })
    })()

    // Long enough for two poll windows, so a slow one is not read as a broken
    // one; the stream is closed either way.
    const deadline = setTimeout(() => stop.abort(), 8000)
    try {
      while (!seen.includes('ส่งผ่าน stream')) {
        const { done, value } = await reader.read()
        if (done) break
        seen += decoder.decode(value, { stream: true })
      }
    } catch {
      /* aborted at the deadline */
    } finally {
      clearTimeout(deadline)
      stop.abort()
      await said.catch(() => {})
    }
    return { status: res.status, got: seen }
  })()

  check('the stream opens', streamed.status === 200, String(streamed.status))
  check(
    '  and pushes what the other side says',
    Boolean(streamed.got?.includes('ส่งผ่าน stream')),
  )
  check(
    '  saying where it started, so a reconnect can catch up',
    Boolean(streamed.got?.includes('event: open')),
  )

  const unreadAfterStream = await (await call('/me/chats', A.token)).json()
  check(
    '  and reading the stream is not reading the message',
    unreadAfterStream.data[0].unread === 1,
    String(unreadAfterStream.data[0].unread),
  )


  /* ---------------- the wall between learners and teachers ---------------- */

  /**
   * The rule the whole arrangement exists for: a learner and a teacher have no
   * way to reach each other. Everything a learner says goes to the school, and
   * only an admin can decide any of it should travel further.
   */
  check(
    "a learner cannot read a teacher's thread",
    (await call(`/me/chats/${threadA}/messages`, LEARNER.token)).status === 403,
  )
  check(
    '  nor write to it',
    (await call(`/me/chats/${threadA}/messages`, LEARNER.token, {
      method: 'POST',
      body: JSON.stringify({ body: 'อาจารย์ครับ' }),
    })).status === 403,
  )
  check(
    "  and a teacher cannot read a learner's",
    (await call(`/me/chats/${threadL}/messages`, A.token)).status === 403,
  )
  check(
    '  a learner naming a teacher still gets their own thread',
    ((await (await call('/me/chats', LEARNER.token, {
      method: 'POST',
      body: JSON.stringify({ teacherId: A.id }),
    })).json()).data as { id: number }).id === threadL,
  )

  /* ---------------- passing a question on ---------------- */

  const asked = await call(`/me/chats/${threadL}/messages`, LEARNER.token, {
    method: 'POST',
    body: JSON.stringify({ body: 'ข้อ 3 ทำไมตอบแบบนี้ครับ' }),
  })
  check('a learner can write to the school', asked.status === 201, String(asked.status))
  const askedId = (await asked.json()).data.id as number

  /**
   * Where each side is sent, which is not a property of the thread.
   *
   * Staff read in the admin whoever wrote; a learner reads on the site. One
   * link derived from the thread sent admins to the learner's page, which in
   * the admin is a 404 — and the check that should have caught it was
   * filtering notices by the very field that was wrong.
   */
  const staffNotice = (
    await (await call('/me/notifications?surface=admin&limit=50', ADMIN.token)).json()
  ).data.find((n: { title: string }) => n.title.includes('ผู้เรียนถามเข้ามา'))
  check('the staff are told a learner has asked', Boolean(staffNotice), staffNotice?.title)
  check(
    '  and sent to the admin, not to the learner’s own page',
    staffNotice?.link === `/chat?thread=${threadL}`,
    String(staffNotice?.link),
  )

  check(
    'a learner cannot pass their own question to a teacher',
    (await call('/me/chats/forward', LEARNER.token, {
      method: 'POST',
      body: JSON.stringify({ messageId: askedId, teacherId: A.id }),
    })).status === 403,
  )
  check(
    '  nor can a teacher pull it across',
    (await call('/me/chats/forward', A.token, {
      method: 'POST',
      body: JSON.stringify({ messageId: askedId, teacherId: A.id }),
    })).status === 403,
  )

  const relayed = await call('/me/chats/forward', ADMIN.token, {
    method: 'POST',
    body: JSON.stringify({ messageId: askedId, teacherId: A.id, note: 'ช่วยดูให้หน่อย' }),
  })
  check('an admin can pass it on', relayed.status === 201, String(relayed.status))

  const asTeacher = await (await call(`/me/chats/${threadA}/messages`, A.token)).json()
  const landed = asTeacher.data[asTeacher.data.length - 1]
  check('  it lands in the teacher\'s own thread', landed?.body?.includes('ข้อ 3 ทำไมตอบแบบนี้'))
  check('    carrying the admin\'s note', landed?.body?.includes('ช่วยดูให้หน่อย'))
  check('    and marked as relayed', landed?.forwarded === true)

  // The one that matters. Everything else here is convenience; this is why
  // learners and teachers are kept apart in the first place.
  const learnerName = LEARNER_NAME
  check(
    '    but naming nobody',
    !landed?.body?.includes(learnerName) && landed?.name !== learnerName,
    `${landed?.name} — ${landed?.body}`,
  )
  check(
    '    and not even by id',
    landed?.forwardedFromId === undefined,
    String(landed?.forwardedFromId),
  )
  check(
    '  while an admin can see both halves',
    ((await (await call(`/me/chats/${threadA}/messages`, ADMIN.token)).json()).data.at(-1)
      ?.forwardedFromId ?? null) === askedId,
  )

  check(
    'a teacher\'s message cannot be relayed onwards',
    (await call('/me/chats/forward', ADMIN.token, {
      method: 'POST',
      body: JSON.stringify({ messageId: firstId, teacherId: B.id }),
    })).status === 409,
  )
  check(
    '  nor can a question go to somebody who does not teach',
    (await call('/me/chats/forward', ADMIN.token, {
      method: 'POST',
      body: JSON.stringify({ messageId: askedId, teacherId: LEARNER.id }),
    })).status === 404,
  )
  /* ---------------- the bell ---------------- */

  /**
   * One notice per conversation, taken back once it has been read.
   *
   * The rule being tested is the debounce: five lines in a row is one errand,
   * not five. It works because `subject` is a unique key, so reading the
   * thread has to delete the row rather than mark it read — otherwise the next
   * conversation could never announce itself.
   */
  const notices = async (token: string) =>
    (
      (await (await call('/me/notifications?surface=admin&limit=50', token)).json()).data as {
        type: string
        title: string
        body: string
        link: string | null
      }[]
    ).filter((n) => n.type === 'chat.message')

  /** Just this conversation: the staff now hear about learners as well. */
  const noticesFor = async (token: string, threadId: number) =>
    (await notices(token)).filter((n) => n.link === '/chat?thread=' + threadId)

  // Start clean: everything so far has been read by both sides.
  await call(`/me/chats/${threadA}/read`, A.token, { method: 'POST' })
  await call(`/me/chats/${threadA}/read`, ADMIN.token, { method: 'POST' })
  check('reading leaves no notice behind', (await noticesFor(ADMIN.token, threadA)).length === 0)

  await call(`/me/chats/${threadA}/messages`, A.token, {
    method: 'POST',
    body: JSON.stringify({ body: 'อาจารย์ครับ มีเรื่องรบกวน' }),
  })
  const firstNotice = await noticesFor(ADMIN.token, threadA)
  check('a teacher writing tells the staff', firstNotice.length === 1, String(firstNotice.length))
  check('  naming who it is from', firstNotice[0]?.title.includes('มีข้อความใหม่จาก'), firstNotice[0]?.title)
  check('  and pointing at the conversation', firstNotice[0]?.link === `/chat?thread=${threadA}`, String(firstNotice[0]?.link))

  for (const line of ['อีกเรื่องหนึ่ง', 'แล้วก็เรื่องนี้', 'ขอบคุณครับ']) {
    await call(`/me/chats/${threadA}/messages`, A.token, {
      method: 'POST',
      body: JSON.stringify({ body: line }),
    })
  }
  check(
    '  three more lines are still one errand',
    (await noticesFor(ADMIN.token, threadA)).length === 1,
    String((await noticesFor(ADMIN.token, threadA)).length),
  )

  // An admin answering is the errand being done — for every admin, not only
  // the one who picked it up.
  await call(`/me/chats/${threadA}/messages`, ADMIN.token, {
    method: 'POST',
    body: JSON.stringify({ body: 'รับทราบครับ' }),
  })
  check('answering clears it for the staff', (await noticesFor(ADMIN.token, threadA)).length === 0)

  const teacherNotices = await notices(A.token)
  check('  and tells the teacher instead', teacherNotices.length === 1, String(teacherNotices.length))
  check(
    '    from the school, not from a name',
    teacherNotices[0]?.title === 'มีข้อความใหม่จากทีมงาน',
    teacherNotices[0]?.title,
  )

  await call(`/me/chats/${threadA}/read`, A.token, { method: 'POST' })
  check('reading the thread takes the notice back', (await notices(A.token)).length === 0)

  // And because it was taken back rather than marked read, the next one can
  // be announced at all.
  await call(`/me/chats/${threadA}/messages`, ADMIN.token, {
    method: 'POST',
    body: JSON.stringify({ body: 'ลืมบอกอีกเรื่อง' }),
  })
  check('  so the next conversation can announce itself', (await notices(A.token)).length === 1)

  const learnerNotices = await (
    await call('/me/notifications?surface=admin&limit=50', LEARNER.token)
  ).json()
  check(
    'nobody outside the conversation is told',
    !learnerNotices.data.some((n: { type: string }) => n.type === 'chat.message'),
  )
} finally {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `smoke-chat-%${stamp}@example.com`))
  const ids = rows.map((r) => r.id)
  if (ids.length) {
    const threads = await db
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .where(inArray(chatThreads.ownerId, ids))
    const threadIds = threads.map((t) => t.id)
    if (threadIds.length) {
      await db.delete(chatMessages).where(inArray(chatMessages.threadId, threadIds))
      await db.delete(chatParticipants).where(inArray(chatParticipants.threadId, threadIds))
      await db.delete(chatThreads).where(inArray(chatThreads.id, threadIds))
    }
    await db.delete(users).where(inArray(users.id, ids))
  }
  console.log('\n  cleaned up the four accounts and their conversations')
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
