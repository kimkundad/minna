/**
 * Applying to teach, with the two files the application must carry.
 *
 *   node scripts/flow-apply-dropzone.mjs [baseUrl]
 *
 * Both fields were a bare `<input type="file">`: on a phone that is a short
 * grey button with the browser's own label, and a hundred-megabyte video is
 * exactly the thing somebody wants to see they have actually attached. They
 * are dropzones now, and what matters is that the change did not break the
 * part underneath — the files still have to reach the application, because an
 * applicant who was told both were required and ends up in the queue without
 * them is reviewed on an empty record.
 *
 * The upload cannot start until the account exists, since it needs a token and
 * registering is what returns one, so this walks the whole path: fill the
 * form, pick both files, submit, and then ask the API what the application
 * ended up holding.
 *
 * Registers a throwaway account and deletes it again.
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { launchBrowser } from './browser.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const API_DIR = new URL('../../api/', import.meta.url).pathname.replace(/^\//, '')

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const stamp = Date.now()
const email = `flow-apply-${stamp}@example.com`
const password = 'Str0ng-Pass!2026'

/** A real PDF and a real MP4 header, so the type checks have something honest
 *  to look at rather than two renamed text files. */
const cvPath = join(tmpdir(), `flow-apply-cv-${stamp}.pdf`)
const clipPath = join(tmpdir(), `flow-apply-clip-${stamp}.mp4`)
writeFileSync(cvPath, '%PDF-1.4\n% a one-page CV\n%%EOF\n')
writeFileSync(
  clipPath,
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]),
    Buffer.alloc(4096, 9),
  ]),
)

const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('minna:locale', 'th')
    } catch {
      /* a private window still renders */
    }
  })
  await page.goto(`${BASE}/th`, { waitUntil: 'networkidle2', timeout: 45000 })
  await wait(900)

  // The header's own sign-up button, by its text rather than a test hook.
  for (const b of await page.$$('header button')) {
    const label = await b.evaluate((e) => e.textContent.trim())
    if (/สมัคร/.test(label)) {
      await b.click()
      break
    }
  }
  await page.waitForSelector('input[type="email"]', { timeout: 8000 })
  await wait(400)

  const teacher = await page.$('input[type="radio"][value="teacher"]')
  check('the dialog offers applying as a teacher', Boolean(teacher))
  await teacher.click()
  await wait(500)

  /* ---------------- 1. two dropzones, not two file buttons ---------------- */

  const zones = await page.$$eval('.dz', (els) =>
    els.map((d) => d.innerText.replace(/\n+/g, ' / ')),
  )
  check('both files are asked for with a dropzone', zones.length === 2, zones.join(' | '))
  check(
    'and each says what to do before anything is picked',
    zones.every((z) => z.length > 10),
    zones.join(' | '),
  )

  /* ---------------- 2. picking a file shows what was picked ---------------- */

  await (await page.$('#auth-teach-cv')).uploadFile(cvPath)
  await (await page.$('#auth-teach-clip')).uploadFile(clipPath)
  await wait(400)

  const picked = await page.$$eval('.dz', (els) =>
    els.map((d) => d.innerText.replace(/\n+/g, ' / ')),
  )
  check(
    'the chosen files are named back',
    picked[0].includes('.pdf') && picked[1].includes('.mp4'),
    picked.join(' | '),
  )
  check(
    'with their size, so a large clip is obvious before sending',
    picked.every((p) => /KB|MB/.test(p)),
    picked.join(' | '),
  )
  check('and a way to take each one off', (await page.$$('.dz-x')).length === 2)

  /* ---------------- 3. a file of the wrong kind is refused ---------------- */

  await (await page.$('#auth-teach-cv')).uploadFile(clipPath)
  await wait(400)
  const refusal = await page.evaluate(
    () => document.querySelector('.field.has-error .field-error')?.innerText?.trim() ?? '',
  )
  check('a video dropped on the CV box is refused', refusal.length > 0, refusal)
  check('and the refusal names the file it is about', refusal.includes('.mp4'), refusal)

  const kept = await page.$eval('.dz', (d) => d.innerText.replace(/\n+/g, ' / '))
  check('while the CV already chosen is kept', kept.includes('.pdf'), kept)

  /* ---------------- 4. and the whole thing still reaches the API ---------- */

  const fill = async (selector, value) => {
    const el = await page.$(selector)
    if (el) await el.type(value, { delay: 4 })
  }
  await fill('#auth-first', 'ทดสอบ')
  await fill('#auth-last', 'ดรอปโซน')
  await fill('#auth-email', email)
  await fill('#auth-password', password)
  await fill('#auth-phone', '0812345678')
  // The teaching questions, which the API refuses an application without.
  await fill('#auth-teach-cat', 'ภาษาญี่ปุ่น N5')
  await fill('#auth-teach-exp', 'สอนภาษาญี่ปุ่นมา 5 ปี')

  // Whatever else the form asks for, filled generically: this test is about
  // the files, and a missing required field would stop the submit before them.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[role=dialog] input[required], [role=dialog] textarea[required]')) {
      if (el.type === 'checkbox') el.checked = true
      else if (!el.value) {
        el.value = 'ทดสอบ'
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    for (const s of document.querySelectorAll('[role=dialog] select')) {
      if (!s.value && s.options.length > 1) {
        s.value = s.options[1].value
        s.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
    for (const c of document.querySelectorAll('[role=dialog] input[type="checkbox"]')) {
      if (!c.checked) {
        c.checked = true
        c.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  })
  await wait(300)

  // Put the CV back, since the refused drop left the box holding the good one
  // but the input cleared.
  await (await page.$('#auth-teach-cv')).uploadFile(cvPath)
  await wait(300)

  await page.click('[role=dialog] form button[type="submit"]')
  await page.waitForFunction(() => !document.querySelector('.dz'), { timeout: 60000 }).catch(() => {})
  await wait(1500)

  // What the dialog is saying, when it is still open: a failed submit leaves
  // the reason on screen, and without it this test can only report that
  // nothing happened.
  const stillOpen = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]')
    if (!d) return null
    return {
      errors: [...d.querySelectorAll('.field-error, [role=alert]')].map((e) => e.innerText.trim()),
      button: d.querySelector('form button[type=submit]')?.innerText?.trim(),
    }
  })
  if (stillOpen) console.log('   dialog still open:', JSON.stringify(stillOpen))

  const login = await (
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ email, password }),
    })
  ).json()
  check('the account was created', Boolean(login.accessToken), login.error?.message ?? '')

  // Straight from the table: the application is the admin's record, not
  // something the applicant's own /me returns, and what matters is what a
  // reviewer will open.
  const stored = JSON.parse(
    execFileSync('npx', ['tsx', 'scripts/application-files.mts', email], {
      cwd: API_DIR,
      shell: true,
      encoding: 'utf8',
    }).trim(),
  )
  check(
    'and the application carries both files',
    Boolean(stored.resumePath) && Boolean(stored.sampleVideoPath),
    `cv ${stored.resumePath ?? 'none'}, clip ${stored.sampleVideoPath ?? 'none'}`,
  )
  check('nothing threw', errors.length === 0, errors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
  execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', email], {
    cwd: API_DIR,
    shell: true,
    stdio: 'ignore',
  })
  console.log(`\n  removed ${email}`)
}

console.log(failures ? `\n${failures} failed` : '\n  all good')
process.exit(failures ? 1 : 0)
