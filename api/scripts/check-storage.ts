/**
 * Proves the space-kim credentials actually work, end to end.
 *
 * It imports the real src/lib/storage.ts rather than re-implementing the
 * signing, so a passing run says something about the code the API will use and
 * not just about the key.
 *
 *   npm run check:storage
 *
 * The round trip is list -> upload -> sign -> fetch -> delete. Signing is the
 * step worth watching: the HMAC is computed here with no call to the service,
 * so a URL that 403s means the secret is wrong even though the upload worked.
 */
import { env } from '../src/config/env'
import {
  deleteFile,
  isStorageConfigured,
  listFiles,
  signedUrl,
  storageRoot,
  uploadFile,
} from '../src/lib/storage'

const pass = (m: string) => console.log(`  ok    ${m}`)
const fail = (m: string) => console.log(`  FAIL  ${m}`)

async function main(): Promise<number> {
  console.log(`\nspace-kim: ${env.SPACE_BASE_URL ?? '(unset)'}`)

  if (!isStorageConfigured()) {
    fail('SPACE_BASE_URL or SPACE_API_KEY is missing from api/.env')
    console.log('\n  The key is <keyId>.<secret>, shown once when it is created.')
    return 1
  }
  console.log(`key id:     ${env.SPACE_API_KEY!.split('.')[0]}`)
  console.log(`folder:     ${storageRoot()}/\n`)

  // Relative to the key's folder; storage.ts prefixes it. Every segment has to
  // start with a letter or digit, so no leading underscore.
  const folder = 'smoke-check'
  const name = `check-${Date.now()}.txt`
  const body = new TextEncoder().encode('space-kim reachable\n')
  let uploaded: string | null = null

  try {
    const before = await listFiles(storageRoot(), { limit: 1 })
    pass(`list — key accepted (${before.files.length} file(s) sampled)`)
  } catch (err) {
    fail(`list — ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  try {
    const file = await uploadFile({ folder, filename: name, body, contentType: 'text/plain' })
    uploaded = file.path
    pass(`upload — ${file.path} (${file.size} bytes)`)
  } catch (err) {
    fail(`upload — ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  let code = 0
  try {
    const url = signedUrl(uploaded, 120)
    const res = await fetch(url)
    const text = res.ok ? await res.text() : ''
    if (res.ok && text === new TextDecoder().decode(body)) {
      pass('signed URL — fetched, bytes match')
    } else {
      fail(`signed URL — HTTP ${res.status}; the secret half of the key looks wrong`)
      code = 1
    }

    const unsigned = await fetch(`${env.SPACE_BASE_URL}/${uploaded}`)
    if (unsigned.ok) {
      fail('the file is readable WITHOUT a signature — storage is not private')
      code = 1
    } else {
      pass(`unsigned read refused (HTTP ${unsigned.status})`)
    }
  } finally {
    // Leaving smoke files behind turns the bucket into a junk drawer.
    try {
      await deleteFile(uploaded)
      pass('delete — cleaned up')
    } catch (err) {
      fail(`delete — ${err instanceof Error ? err.message : String(err)}; remove ${uploaded} by hand`)
      code = 1
    }
  }

  console.log(code === 0 ? '\nStorage is wired up.\n' : '\nSomething is off — see above.\n')
  return code
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
