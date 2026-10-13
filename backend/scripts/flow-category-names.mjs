/**
 * Typing a category's other-language names, from the admin.
 *
 *   node scripts/flow-category-names.mjs
 *
 * The API rules are covered by `api/scripts/smoke-category-names.mts` and what
 * a reader ends up seeing by `frontend/scripts/flow-category-names.mjs`. What
 * is checked here is the part a person touches: that the three boxes are there
 * and start with what is already stored, that saving keeps them, that clearing
 * one puts the category back to showing its Thai name, and that the table says
 * which languages are still missing — because without that last one, finding
 * the untranslated category means opening every row.
 *
 * Makes its own category and deletes it again, so it can run against a real
 * database without touching the catalog.
 */
import { execFileSync } from 'node:child_process'
import { launchBrowser } from './browser.mjs'

const BASE = process.env.ADMIN_URL ?? 'http://localhost:5173'
const API = process.env.API ?? 'http://127.0.0.1:3000/api/v1'
const API_DIR = new URL('../../api/', import.meta.url).pathname.replace(/^\//, '')


let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((go) => setTimeout(go, ms))

const stamp = Date.now()
const password = 'Str0ng-Pass!2026'
const admin = `smoke-catname-a${stamp}@example.com`

async function account(email, role) {
  const made = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email,
      password,
      firstName: 'ทด',
      lastName: 'สอบ',
      birthdate: '1990-01-01',
      acceptedTerms: true,
      locale: 'th',
      memberType: 'student',
    }),
  })
  const body = await made.json()
  if (!role) return { id: body.user.id, token: body.accessToken }

  execFileSync('npx', ['tsx', 'scripts/grant-role.mts', email, role], {
    cwd: API_DIR,
    shell: true,
    stdio: 'ignore',
  })
  // Signing in again, because the token from registering was minted before the
  // role existed and carries none — which looks exactly like a permissions bug
  // when the first admin call comes back 403.
  const again = await (
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ email, password }),
    })
  ).json()
  return { id: body.user.id, token: again.accessToken }
}

const A = await account(admin, 'admin')

/** A category of this test's own, sorted last so it lands on a known page. */
const thai = `ทดสอบภาษา ${stamp}`
const slug = `smoke-catname-${stamp}`
const made = await (
  await fetch(`${API}/categories`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${A.token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ name: thai, slug, sortOrder: 990, names: { en: 'Test language' } }),
  })
).json()
const categoryId = made?.data?.id

/** This category as the API reports it now. */
async function stored() {
  const all = await (await fetch(`${API}/categories?all=1`)).json()
  return all.data.find((c) => c.id === categoryId) ?? null
}

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

/** The row for this category, and the Edit button in it. */
const openRow = (page) =>
  page.evaluate((name) => {
    const row = [...document.querySelectorAll('tbody tr')].find((tr) =>
      tr.innerText.includes(name),
    )
    if (!row) return null
    const edit = [...row.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Edit')
    if (!edit) return null
    const text = row.innerText.replace(/\s+/g, ' ').trim()
    edit.click()
    return text
  }, thai)

/** The three translation boxes, keyed by the label above each. */
const nameFields = (page) =>
  page.evaluate(() => {
    const out = {}
    for (const label of document.querySelectorAll('form label')) {
      const field = label.parentElement?.querySelector('input')
      if (field) out[label.innerText.trim()] = field.value
    }
    return out
  })

/** Types into the box under one label, the way a person would. */
async function typeUnder(page, label, text) {
  const found = await page.evaluate((l) => {
    const match = [...document.querySelectorAll('form label')].find(
      (x) => x.innerText.trim() === l,
    )
    const field = match?.parentElement?.querySelector('input')
    if (!field) return false
    field.focus()
    field.value = ''
    field.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }, label)
  if (!found) return false
  if (text) await page.keyboard.type(text, { delay: 8 })
  return true
}

const save = (page) =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('form button[type="submit"]')][0]
    if (!b) return false
    b.click()
    return true
  })

try {
  check('the category was created to test with', Boolean(categoryId), String(categoryId))

  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('response', (r) => {
    if (r.status() === 401 && r.url().endsWith('/auth/refresh')) return
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
  })

  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' })
  await page.type('input[type="email"]', admin, { delay: 8 })
  await page.type('input[type="password"]', password, { delay: 8 })
  await page.click('form button[type="submit"]')
  await page.waitForFunction(() => !location.pathname.endsWith('/signin'), { timeout: 25000 })

  /* ---------------- the table says what is missing ---------------- */

  await page.goto(`${BASE}/categories?q=${encodeURIComponent(slug)}`, {
    waitUntil: 'networkidle2',
  })
  await wait(1800)

  const rowText = await openRow(page)
  check('the category is in the table', rowText !== null, rowText ?? 'not found')
  check(
    '  and the table names the two languages it has no name in',
    rowText?.includes('JP') && rowText?.includes('VN'),
    rowText,
  )
  check(
    '  but not the one it has',
    rowText !== null && !/\bEN\b/.test(rowText),
    rowText,
  )
  await wait(500)

  /* ---------------- the form starts with what is stored ---------------- */

  const opened = await nameFields(page)
  check(
    'the form has a box for each of the other three languages',
    'English' in opened && 'Japanese' in opened && 'Vietnamese' in opened,
    Object.keys(opened).join(', '),
  )
  check(
    '  the Thai name is its own field, separate from them',
    opened['Name (Thai)*'] === thai || opened['Name (Thai)'] === thai,
    JSON.stringify(Object.keys(opened)),
  )
  check(
    '  English starts with the name already stored',
    opened.English === 'Test language',
    opened.English,
  )
  check(
    '  and the two untranslated boxes start empty',
    opened.Japanese === '' && opened.Vietnamese === '',
    `jp "${opened.Japanese}" vn "${opened.Vietnamese}"`,
  )

  /* ---------------- typing two of them and saving ---------------- */

  check('the Japanese box takes typing', await typeUnder(page, 'Japanese', 'テスト語'))
  check('the Vietnamese box takes typing', await typeUnder(page, 'Vietnamese', 'Ngôn ngữ thử'))
  check('the form saves', await save(page))
  await wait(2200)

  const after = await stored()
  check('the Japanese name reached the API', after?.names?.jp === 'テスト語', after?.names?.jp)
  check(
    'and the Vietnamese one',
    after?.names?.vn === 'Ngôn ngữ thử',
    after?.names?.vn,
  )
  check(
    'and the English one it was created with is untouched',
    after?.names?.en === 'Test language',
    after?.names?.en,
  )
  check(
    'and the Thai name on the category itself is untouched',
    after?.names?.th === thai,
    after?.names?.th,
  )

  const nowRow = await page.evaluate((name) => {
    const row = [...document.querySelectorAll('tbody tr')].find((tr) =>
      tr.innerText.includes(name),
    )
    return row ? row.innerText.replace(/\s+/g, ' ').trim() : null
  }, thai)
  // Three filled in of seven, so the badge should now name the four that are
   // still missing and no longer mention the three that are not. The site reads
   // the Thai name for those four, which is a valid state rather than an error.
  check(
    'the table drops the languages that now have a name',
    nowRow !== null && !/EN/.test(nowRow) && !/JP/.test(nowRow) && !/VN/.test(nowRow),
    nowRow,
  )
  check(
    '  and still names the ones that do not',
    ['ID', 'ZH', 'KO', 'TW'].every((c) => nowRow?.includes(c)),
    nowRow,
  )

  /* ---------------- clearing one puts it back to Thai ---------------- */

  await openRow(page)
  await wait(500)
  check('a name can be cleared', await typeUnder(page, 'English', ''))
  check('  and saved', await save(page))
  await wait(2200)

  const cleared = await stored()
  check(
    'the cleared name is gone rather than stored blank',
    cleared !== null && !('en' in cleared.names),
    JSON.stringify(cleared?.names),
  )
  check(
    '  so an English reader sees the Thai name again',
    (cleared?.names?.en ?? cleared?.name) === thai,
    cleared?.name,
  )

  const backToMissing = await page.evaluate((name) => {
    const row = [...document.querySelectorAll('tbody tr')].find((tr) =>
      tr.innerText.includes(name),
    )
    return row ? row.innerText.replace(/\s+/g, ' ').trim() : null
  }, thai)
  check(
    'and the table lists EN as missing again',
    /\bEN\b/.test(backToMissing ?? ''),
    backToMissing,
  )

  check('nothing failed to load', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
  if (categoryId) {
    await fetch(`${API}/categories/${categoryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${A.token}` },
    })
  }
  execFileSync('npx', ['tsx', 'scripts/remove-test-user.mts', admin], {
    cwd: API_DIR,
    shell: true,
    stdio: 'ignore',
  })
}

console.log(failures ? `\n  ${failures} failing\n` : '\n  all good\n')
process.exit(failures ? 1 : 0)
