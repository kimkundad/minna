/**
 * The learning room, in a real browser.
 *
 *   node scripts/flow-learn.mjs [baseUrl]
 *
 * A member takes a free course and opens it: the curriculum should be the real
 * one, the lesson list should be clickable, and watching should move the
 * progress ring — on this page and everywhere else that counts the same
 * lessons.
 *
 * Deletes its account at the end, pass or fail.
 */
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const SHOTS = process.env.SHOT_DIR ?? '.'


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const member = {
  email: `flow-learn-${Date.now()}@example.com`,
  password: 'Str0ng-Pass!2026',
  firstName: 'ทด',
  lastName: 'สอบ',
}
const register = await fetch(`${API}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    ...member,
    birthdate: '2000-01-15',
    acceptedTerms: true,
    locale: 'th',
    memberType: 'student',
  }),
})
if (!register.ok) {
  console.error('could not register:', register.status, await register.text())
  process.exit(1)
}
const { accessToken } = await register.json()
console.log(`  member: ${member.email}\n`)

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1100 })

const errors = []
/** Kept apart from the errors: an unimported component is only ever a warning,
 *  and that is exactly the failure that gets past a test watching for errors. */
const warnings = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
  if (m.type() === 'warning') warnings.push(m.text())
})

async function cleanUp() {
  await browser.close().catch(() => {})
  try {
    const { execFileSync } = await import('node:child_process')
    const out = execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', member.email], {
      cwd: '../api',
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log('\n  ' + out.trim().split('\n')[0])
  } catch {
    console.log(`\n  !! could not delete ${member.email} — remove it by hand`)
  }
}

async function signIn() {
  await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.hdr-auth button', { timeout: 10000 })
  await page.click('.hdr-auth button')
  await page.waitForSelector('input[type="password"]', { timeout: 10000 })
  await page.type('input[type="email"]', member.email, { delay: 8 })
  await page.type('input[type="password"]', member.password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), {
    timeout: 15000,
  })
}

try {
  const list = await (await fetch(`${API}/courses?perPage=50`)).json()
  const free = list.data.find((c) => c.price === 0 && c.lessonCount > 1)
  if (!free) throw new Error('no free course with lessons to study')

  /* ---------------- 1. the room is shut to a stranger ---------------- */

  await page.goto(`${BASE}/th/learn/${free.slug}`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 1200))
  check(
    'a signed-out visitor does not get the lessons',
    (await page.$('.lp-video')) === null,
    await page.$eval('body', (el) => el.innerText.slice(0, 60).replace(/\s+/g, ' ')),
  )

  /* ---------------- 2. nor to somebody who has not taken it ---------------- */

  await signIn()
  await page.goto(`${BASE}/th/learn/${free.slug}`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('.lp-root', { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 1200))
  check(
    'nor a member who has not taken the course',
    (await page.$('.lp-video')) === null,
    'locked',
  )

  /* ---------------- 3. taking it opens the room ---------------- */

  const placed = await fetch(`${API}/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ lines: [{ kind: 'course', id: free.id }], method: 'promptpay' }),
  })
  check('taking the free course works', placed.ok, String(placed.status))

  await page.goto(`${BASE}/th/learn/${free.slug}`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('#lp-side .lp-les, #lp-side [data-lesson]', { timeout: 12000 }).catch(() => {})

  const curriculum = await (
    await fetch(`${API}/me/courses/${free.slug}/curriculum`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).json()
  const apiLessons = [
    ...curriculum.data.modules.flatMap((m) => m.lessons),
    ...curriculum.data.loose,
  ]

  const rows = await page.$$eval('#lp-side button[id^="lp-s-"], #lp-side .lp-les', (els) => els.length)
  check(
    'the sidebar lists the real lessons',
    rows >= apiLessons.length,
    `${rows} rows for ${apiLessons.length} lessons`,
  )
  check(
    'and the room is titled with the real course',
    (await page.evaluate(() => document.body.innerText)).includes(free.title),
    free.title,
  )

  /**
   * Stuck on a lesson, with somewhere to go.
   *
   * It must be on screen beside the lesson rather than in a footer, and it
   * must go to the school: a learner has no direct line to a teacher, so a
   * link that went to one would be a hole in the arrangement rather than a
   * convenience.
   */
  const ask = await page.evaluate(() => {
    const el = document.querySelector('.lp-ask')
    if (!el) return null
    const box = el.getBoundingClientRect()
    return {
      href: el.getAttribute('href'),
      text: el.innerText.replace(/\s+/g, ' ').trim(),
      onScreen: box.width > 0 && box.top < window.innerHeight * 1.6,
      lines: Math.round(el.querySelector('b').getBoundingClientRect().height / 20),
    }
  })
  check('the lesson offers a way to ask about it', Boolean(ask), 'no .lp-ask')
  check('  in view beside the lesson, not buried', ask?.onScreen === true)
  check('  and saying who actually answers', ask?.text?.includes('ส่งต่อให้ผู้สอน') === true, ask?.text)

  /**
   * Pressing it opens the conversation over the lesson.
   *
   * Not a page of its own: asking a question must not cost somebody the lesson
   * they were in the middle of. So the video stays where it was, the panel
   * arrives in the corner, and the context is sent for them — being on the
   * lesson is already the answer to "what is this about".
   */
  const lessonTitle = apiLessons[0].title
  await page.click('.lp-ask')
  await page.waitForSelector('.chat-dock', { timeout: 15000 })
  await new Promise((r) => setTimeout(r, 3000))

  const docked = await page.evaluate(() => {
    const dock = document.querySelector('.chat-dock')
    const box = dock.getBoundingClientRect()
    const bubbles = [...dock.querySelectorAll('.chat-row.is-mine .chat-bubble')]
    return {
      path: location.pathname,
      last: bubbles[bubbles.length - 1]?.innerText.replace(/\s+/g, ' ').trim() ?? '',
      count: bubbles.length,
      draft: dock.querySelector('#chat-dock-draft')?.value ?? null,
      // Bottom right, within a hair of the viewport edge.
      corner: window.innerWidth - box.right < 40 && window.innerHeight - box.bottom < 40,
      stillPlaying: Boolean(document.querySelector('#lp-stage')),
    }
  })

  check('pressing it opens a panel without leaving the lesson', docked.stillPlaying, docked.path)
  check('  in the bottom right corner', docked.corner)
  check('  which sends the context by itself', docked.last.includes(lessonTitle), docked.last.slice(0, 90))
  check('    naming the course too', docked.last.includes(free.title), docked.last.slice(0, 90))
  check('  leaving the box empty for the question', docked.draft === '', JSON.stringify(docked.draft))

  // Pressing it again from the same lesson is not asking again.
  await page.click('.lp-ask')
  await new Promise((r) => setTimeout(r, 1500))
  const again = await page.evaluate(
    () => document.querySelectorAll('.chat-dock .chat-row.is-mine .chat-bubble').length,
  )
  check('  and pressing it twice does not say it twice', again === docked.count, `${again} messages`)

  // Rolled down to its title bar, then away entirely.
  await page.evaluate(() => {
    const bar = document.querySelector('.chat-dock .chat-dock-act')
    bar.click()
  })
  await new Promise((r) => setTimeout(r, 500))
  check(
    '  it rolls down to its own title bar',
    await page.evaluate(() => document.querySelector('.chat-dock')?.classList.contains('is-min')),
  )

  await page.evaluate(() => {
    const [, close] = document.querySelectorAll('.chat-dock .chat-dock-act')
    close.click()
  })
  await new Promise((r) => setTimeout(r, 500))
  check(
    '  and closes',
    await page.evaluate(() => !document.querySelector('.chat-dock')),
  )

  /** What was said in the panel is on the page, because it is one conversation. */
  await page.goto(`${BASE}/th/account/messages`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 2500))
  const onPage = await page.evaluate(() => document.body.innerText)
  check('the full page shows the same conversation', onPage.includes(lessonTitle), onPage.slice(0, 80))

  // Back to the lesson for the rest of the run.
  await page.goto(`${BASE}/th/learn/${free.slug}`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 1500))

  // Arriving without a lesson named — which is what "เรียนต่อ" does on a course
  // nobody has started — opens the first one in teaching order and says so in
  // the address, so a refresh lands in the same place and the link can be sent
  // to somebody.
  check(
    'a bare course link opens the first lesson, and names it',
    page.url().includes(`lesson=${apiLessons[0].id}`),
    page.url().replace(BASE, ''),
  )

  /* ---------------- 3b. the curriculum on a phone ---------------- */

  /**
   * There is no sidebar under 960px: the lesson list is behind a button, and
   * the button sits below the video and the lesson title. Both halves are
   * checked here — the header shortcut that scrolls down to it, and the drawer
   * it opens — because the drawer had been dead for as long as it had existed
   * and nothing noticed. `LearningSheet` was used in the template and never
   * imported, so Vue rendered nothing and logged a warning no test read.
   *
   * On a tab of its own, with the phone emulation set before anything loads.
   * Turning `isMobile` on part-way through drops the page's cookies and signs
   * the member out, which looks exactly like a broken room — so the main tab
   * is left alone and this one is thrown away afterwards. Cookies are shared
   * across the browser, so it opens already signed in.
   */
  const phone = await browser.newPage()
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await phone.goto(`${BASE}/th/learn/${free.slug}`, { waitUntil: 'networkidle2' })
  await phone.waitForSelector('.lp-root', { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 1800))

  const jumpShown = await phone.evaluate(() => {
    const b = document.querySelector('.lp-jump-btn')
    return b ? getComputedStyle(b).display !== 'none' : false
  })
  check('a phone gets the shortcut to the curriculum in the header', jumpShown)

  await phone.evaluate(() => document.querySelector('.lp-jump-btn')?.click())
  await new Promise((r) => setTimeout(r, 1100))
  const landed = await phone.evaluate(() => {
    const btn = document.querySelector('[data-lp-curr]')
    if (!btn) return null
    const r = btn.getBoundingClientRect()
    const mid = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    const hit = document.elementFromPoint(mid.x, mid.y)
    return {
      scrolled: window.scrollY,
      inView: r.top >= 0 && r.bottom <= window.innerHeight,
      reachable: hit ? btn.contains(hit) || hit === btn : false,
      mid,
    }
  })
  check('  pressing it scrolls down', (landed?.scrolled ?? 0) > 0, `scrollY ${landed?.scrolled}`)
  check('  and leaves the curriculum button fully on screen', landed?.inView === true)
  check('  with nothing covering it', landed?.reachable === true)

  if (landed) {
    await phone.mouse.click(landed.mid.x, landed.mid.y)
    await new Promise((r) => setTimeout(r, 900))
    const sheet = await phone.evaluate(() => {
      const el = document.querySelector('.lp-drawer')
      return {
        open: Boolean(el),
        rows: el?.querySelectorAll('[data-lesson-id], .cur-row, li').length ?? 0,
      }
    })
    check('tapping the curriculum button opens the drawer', sheet.open)
    check('  with the lessons in it', sheet.rows > 0, `${sheet.rows} rows`)
    await phone.screenshot({ path: `${SHOTS}/learn-drawer.png` })
  }
  await phone.close()

  // Above 960px the list is a sidebar, so the shortcut would scroll to
  // something already on screen. It should not be offered at all. The sidebar
  // is checked with it: without that, "no shortcut" would also be true of a
  // page that failed to load, and this would pass for the wrong reason.
  const onDesktop = await page.evaluate(() => {
    const b = document.querySelector('.lp-jump-btn')
    return {
      shortcut: b ? getComputedStyle(b).display !== 'none' : false,
      side: Boolean(document.querySelector('.lp-side')),
    }
  })
  check('the desktop room still has its sidebar', onDesktop.side)
  check('  and no shortcut, having nothing to scroll to', onDesktop.shortcut === false)

  /* ---------------- 4. the player has a real file ---------------- */

  await page.waitForSelector('.lp-video, [data-lp-nofile]', { timeout: 12000 }).catch(() => {})
  const hasVideo = (await page.$('.lp-video')) !== null
  const videoSrc = hasVideo ? await page.$eval('.lp-video', (el) => el.getAttribute('src')) : ''
  check(
    'the stage holds a real video, or says nothing is uploaded',
    hasVideo || (await page.$('[data-lp-nofile]')) !== null,
    hasVideo ? 'video element present' : 'said plainly: no file for this lesson',
  )
  if (hasVideo) {
    check(
      '  played from a signed, expiring link',
      /[?&](X-Amz-|token=|exp=)/i.test(videoSrc ?? ''),
      (videoSrc ?? '').slice(0, 60),
    )
  }
  await page.screenshot({ path: `${SHOTS}/learn.png` })

  /* ---------------- 4b. and it keeps playing ---------------- */

  // Saving progress patches the curriculum, and the page used to treat that as
  // a new course: it re-picked the lesson and re-fetched the file, which pulled
  // the <video> out of the page a second into playing. Pressing play has to
  // survive the first save.
  if (hasVideo) {
    await page.click('.lp-bigplay')
    await new Promise((r) => setTimeout(r, 3500))
    const playing = await page.evaluate(() => {
      const v = document.querySelector('.lp-video')
      return { gone: !v, t: v?.currentTime ?? 0, paused: v?.paused }
    })
    check(
      'pressing play keeps playing',
      !playing.gone && playing.t > 1,
      `t=${Math.round(playing.t * 10) / 10}s, paused=${playing.paused}`,
    )
  }

  /* ---------------- 5. progress is recorded ---------------- */

  // Driven through the element rather than by clicking play: a headless browser
  // will not fetch the media, and what is being tested is that the page reports
  // the position, not that Chromium can decode video.
  const timedLessonId = apiLessons[0]?.id
  if (hasVideo) {
    await page.evaluate(() => {
      const v = document.querySelector('.lp-video')
      if (!v) return
      Object.defineProperty(v, 'duration', { value: 600, configurable: true })
      Object.defineProperty(v, 'currentTime', { value: 570, writable: true, configurable: true })
      v.dispatchEvent(new Event('loadedmetadata'))
      v.dispatchEvent(new Event('timeupdate'))
      v.dispatchEvent(new Event('pause'))
    })
    await new Promise((r) => setTimeout(r, 1500))

    const saved = await (
      await fetch(`${API}/me/courses/${free.slug}/curriculum`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    ).json()
    check(
      'watching a lesson is recorded on the server',
      saved.data.progress.done >= 1 || saved.data.modules.some((m) =>
        m.lessons.some((l) => l.progress.maxPositionSeconds > 0),
      ),
      JSON.stringify(saved.data.progress),
    )
  }

  /* ---------------- 5a. a refetch does not stop it ---------------- */

  // The curriculum is fetched again whenever the session is touched, and
  // renewing the access token did exactly that every few minutes. It used to
  // blank the stage for a spinner, which took the <video> out of the page
  // mid-lesson. On its own page, so nothing above it has left the element in a
  // state of its own.
  if (hasVideo) {
    await page.goto(`${BASE}/th/learn/${free.slug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.lp-video', { timeout: 12000 })
    await page.waitForFunction(() => (document.querySelector('.lp-video')?.duration ?? 0) > 1, {
      timeout: 8000,
    }).catch(() => {})
    await page.evaluate(async () => {
      const v = document.querySelector('.lp-video')
      if (!v) return
      v.currentTime = 1
      await v.play().catch(() => {})
    })
    await new Promise((r) => setTimeout(r, 1500))

    const playing = await page.evaluate(() => !document.querySelector('.lp-video')?.paused)

    // What a token renewal does: the curriculum is asked for again while the
    // lesson is on screen.
    await page.evaluate(async () => {
      const res = await fetch(location.pathname.replace('/th/learn/', '/api/v1/me/courses/') + '/curriculum')
      return res.status
    })
    await new Promise((r) => setTimeout(r, 2000))

    const after = await page.evaluate(() => {
      const v = document.querySelector('.lp-video')
      return { there: !!v, paused: v?.paused, t: v?.currentTime ?? 0 }
    })
    check(
      'the player survives the curriculum being fetched again',
      playing && after.there && after.paused === false,
      `present=${after.there} paused=${after.paused} t=${Math.round(after.t * 10) / 10}s`,
    )
    await page.evaluate(() => document.querySelector('.lp-video')?.pause())
  }

  /* ---------------- 5b. and it is still there tomorrow ---------------- */

  // Watch a little, leave, come back: the player should pick up where it was
  // rather than at the beginning. A full reload, which is as close to "closed
  // the laptop" as a test gets.
  //
  // On a second lesson and a fresh page, because the step above faked the first
  // one's duration to drive the completion rule — that override would still be
  // on the element here and would make "half way" a position the file does not
  // have.
  const resumeLesson = apiLessons.find((l) => l.id !== timedLessonId && l.type === 'video')
  if (hasVideo && resumeLesson) {
    await page.goto(`${BASE}/th/learn/${free.slug}?lesson=${resumeLesson.id}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('.lp-video', { timeout: 12000 })
    await page.waitForFunction(
      () => (document.querySelector('.lp-video')?.duration ?? 0) > 1,
      { timeout: 8000 },
    ).catch(() => {})

    const left = await page.evaluate(() => {
      const v = document.querySelector('.lp-video')
      if (!v) return 0
      // A third of the way in: far enough from the start to be a real resume,
      // far enough from the end that the player still offers to carry on.
      v.currentTime = Math.max(1, (v.duration || 7) / 3)
      return v.currentTime
    })
    await new Promise((r) => setTimeout(r, 2000))
    // Hiding the page flushes the position, which is what a closing lid does.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await new Promise((r) => setTimeout(r, 1500))

    await page.goto(`${BASE}/th/learn/${free.slug}?lesson=${resumeLesson.id}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('.lp-video', { timeout: 12000 })
    await new Promise((r) => setTimeout(r, 2500))
    const back = await page.evaluate(() => document.querySelector('.lp-video')?.currentTime ?? 0)

    check(
      'coming back puts the playhead where it was left',
      Math.abs(back - left) < 1.5 && back > 0.5,
      `left at ${Math.round(left * 10) / 10}s, came back to ${Math.round(back * 10) / 10}s`,
    )
  }

  /* ---------------- 6. moving between lessons ---------------- */

  const second = apiLessons[1]
  if (second) {
    await page.goto(`${BASE}/th/learn/${free.slug}?lesson=${second.id}`, {
      waitUntil: 'networkidle2',
    })
    await new Promise((r) => setTimeout(r, 1500))
    check(
      'a lesson can be opened by link',
      (await page.evaluate(() => document.body.innerText)).includes(second.title),
      second.title,
    )
  }

  /* ---------------- 7. the document lesson ---------------- */

  const doc = apiLessons.find((l) => l.type === 'document')
  if (doc) {
    await page.goto(`${BASE}/th/learn/${free.slug}?lesson=${doc.id}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('#lp-doc', { timeout: 12000 })
    check('a document lesson opens the reader', true)

    await page.click('[data-lp-doc="open"]')
    await page.waitForSelector('.lp-doc-file', { timeout: 8000 }).catch(() => {})
    const pdfSrc = await page
      .$eval('.lp-doc-file', (el) => el.getAttribute('src'))
      .catch(() => null)
    check(
      'showing the real PDF, signed',
      /.pdf/i.test(pdfSrc ?? '') && /[?&](X-Amz-|token=|exp=)/i.test(pdfSrc ?? ''),
      (pdfSrc ?? '(none)').slice(0, 70),
    )

    // Reading it is what finishes a lesson with no running time.
    await new Promise((r) => setTimeout(r, 4000))
    const afterRead = await (
      await fetch(`${API}/me/courses/${free.slug}/curriculum`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    ).json()
    const row = [
      ...afterRead.data.modules.flatMap((m) => m.lessons),
      ...afterRead.data.loose,
    ].find((l) => l.id === doc.id)
    check(
      'and having it open counts as read',
      row?.progress.completedAt !== null,
      String(row?.progress.completedAt),
    )
    await page.screenshot({ path: `${SHOTS}/learn-doc.png` })
  }

  /* ---------------- 7b. downloading a handout ---------------- */

  // The button used to be an anchor pointing at "#download", which is where the
  // prototype left it: a button that looked like it worked and did nothing.
  await page.goto(`${BASE}/th/learn/${free.slug}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#lp-tab-doc', { timeout: 12000 })
  await page.click('#lp-tab-doc')
  await page.waitForSelector('[data-download]', { timeout: 8000 }).catch(() => {})

  const docCount = await page.evaluate(() => document.querySelectorAll('[data-download]').length)
  check('the documents tab lists the course handouts', docCount >= 1, `${docCount} rows`)

  if (docCount) {
    // Watch the request the button makes. Following the opened tab instead
    // would be testing the browser's popup handling, not ours.
    const linkCall = new Promise((resolve) => {
      const onResponse = (res) => {
        if (!res.url().includes('/documents/') || !res.url().endsWith('/link')) return
        page.off('response', onResponse)
        resolve(res.status())
      }
      page.on('response', onResponse)
      setTimeout(() => resolve(0), 8000)
    })
    // The tab it would open downloads nine megabytes of PDF, which blocks the
    // debugger long enough to break every step after this one. What is being
    // tested is the link, and the link is the response below.
    await page.evaluate(() => {
      window.open = () => null
    })
    await page.click('[data-download]')
    const status = await linkCall
    check('and the button asks for a link to it', status === 200, `status ${status}`)

  }

  /* ---------------- 8. asking a question ---------------- */

  await page.goto(`${BASE}/th/learn/${free.slug}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#lp-tab-qa', { timeout: 12000 })
  check('the room has a questions tab again', true)

  await page.click('#lp-tab-qa')
  await page.waitForSelector('#lp-qa-text', { timeout: 6000 })

  // With a real site key the checkbox is live, and a script cannot tick it —
  // that is the point of it. So the form is checked for the box, the question
  // is posted the way the page posts it, and the thread is read back.
  const boxed = await page
    .waitForSelector('.captcha-widget iframe', { timeout: 8000 })
    .then(() => true)
    .catch(() => false)

  if (boxed) {
    check('the form carries a reCAPTCHA checkbox', true)

    await page.type('#lp-qa-text', 'ถามโดยไม่ติ๊กกล่อง', { delay: 5 })
    await page.click('#lp-pan-qa button[type="submit"]')
    await new Promise((r) => setTimeout(r, 800))
    const refused = await page.$eval('[data-qa-error]', (el) => el.textContent.trim()).catch(() => '')
    check(
      '  and sending without ticking it is refused',
      /ไม่ใช่โปรแกรม|robot/i.test(refused),
      refused || '(no message)',
    )

    // Posted through the API, which is the same route the form takes once the
    // box is ticked — this covers everything after that point.
    const asked = await fetch(`${API}/me/lessons/${apiLessons[0].id}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ body: 'ตรงนาทีแรกครูออกเสียงว่าอะไรครับ' }),
    })
    check('a question posts', asked.ok, String(asked.status))

    await page.goto(`${BASE}/th/learn/${free.slug}?lesson=${apiLessons[0].id}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('#lp-tab-qa', { timeout: 12000 })
    await page.click('#lp-tab-qa')
    await page.waitForSelector('[data-qa]', { timeout: 8000 }).catch(() => {})
  } else {
    check('the form carries a reCAPTCHA checkbox', false, 'no site key configured')
    check('  and sending without ticking it is refused', true, 'skipped: captcha off')

    await page.type('#lp-qa-text', 'ตรงนาทีแรกครูออกเสียงว่าอะไรครับ', { delay: 5 })
    await page.click('#lp-pan-qa button[type="submit"]')
    await page.waitForSelector('[data-qa]', { timeout: 10000 }).catch(() => {})
    check('a question posts', true)
  }

  const threadCount = await page.evaluate(() => document.querySelectorAll('[data-qa]').length)
  check('and the thread shows it', threadCount >= 1, `${threadCount} threads`)
  check(
    'marked as still waiting for an answer',
    (await page.$('[data-qa] .badge--pending')) !== null,
  )
  const tabCount = await page
    .waitForFunction(
      () => Number(document.querySelector('[data-count="qa"]')?.textContent?.trim() || 0) >= 1,
      { timeout: 6000 },
    )
    .then(() => true)
    .catch(() => false)
  check('and the tab counts it', tabCount)

  // Editing one's own question, and the button staying usable after a refused
  // attempt. The captcha boxes live inside a v-for, where a template ref
  // collects every instance into an array; calling reset() on that threw inside
  // a finally and left "sending" stuck on, which disabled the save button for
  // good.
  const edited = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-qa] .lp-qa-own .lp-qa-link')].find((b) =>
      b.textContent.includes('แก้ไข'),
    )
    btn?.click()
    return Boolean(btn)
  })
  check('a question of your own can be edited', edited)

  if (edited) {
    await page.waitForSelector('.lp-qa-editform', { timeout: 6000 })
    await page.click('.lp-qa-editform button[type="submit"]')
    await new Promise((r) => setTimeout(r, 900))
    const state = await page.evaluate(() => {
      const form = document.querySelector('.lp-qa-editform')
      const save = form?.querySelector('button[type="submit"]')
      return { disabled: save?.disabled, error: form?.querySelector('.field-error')?.textContent?.trim() ?? '' }
    })
    check(
      '  and the save button survives a refused attempt',
      state.disabled === false,
      `disabled=${state.disabled}`,
    )
    check(
      '  which says what is missing',
      /ไม่ใช่โปรแกรม|robot|กรอก/i.test(state.error),
      state.error || '(no message)',
    )
  }

  await page.screenshot({ path: `${SHOTS}/learn-qa.png` })

  /* ---------------- 9. the room's advertising slot ---------------- */

  await page.goto(`${BASE}/th/learn/${free.slug}`, { waitUntil: 'domcontentloaded' })
  const ad = await page.waitForSelector('.ads-slot img, [data-ad] img', { timeout: 10000 }).catch(() => null)
  check('the room carries its advertisement', ad !== null)
  if (ad) {
    const loaded = await page.evaluate(() => {
      const img = document.querySelector('.ads-slot img, [data-ad] img')
      return { src: img?.currentSrc || img?.getAttribute('src') || '', w: img?.naturalWidth ?? 0 }
    })
    check('  with artwork that actually loads', loaded.w > 0, `${loaded.w}px wide`)
  }
  const real = errors.filter(
    (e) =>
      !/favicon|Vue Devtools|Failed to load resource|401 \(Unauthorized\)|403 \(Forbidden\)|media|video|frame-ancestors|recaptcha/i.test(
        e,
      ),
  )
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))

  /**
   * Vue reports an unimported component as a warning, not an error, so the
   * check above would never have seen the one that broke this drawer.
   */
  const unresolved = warnings.filter((w) => /Failed to resolve component/i.test(w))
  check(
    'no component in a template went unimported',
    unresolved.length === 0,
    unresolved.slice(0, 3).join(' | '),
  )
} finally {
  await cleanUp()
}

console.log(failures ? `\n${failures} failing` : '\nall good')
process.exit(failures ? 1 : 0)
