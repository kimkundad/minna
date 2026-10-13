/**
 * Starting a browser these scripts can actually drive.
 *
 * Every flow test used to pick one with `BROWSERS.find(existsSync)` — the
 * first that was installed. That is not the same question as the first that
 * works: Edge stopped launching on this machine one afternoon, with the
 * executable still sitting where it always had, and every test in both
 * projects failed at once on a browser nobody had chosen.
 *
 * So each candidate is started rather than merely looked for, and the first
 * one that comes up is the one returned. There is no separate probe: probing
 * meant launching twice per run, and the profile the probe needed became a
 * thing for concurrent runs to fight over.
 *
 *   import { launchBrowser } from './browser.mjs'
 *   const browser = await launchBrowser({ args: ['--autoplay-policy=no-user-gesture-required'] })
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

/** Edge first because it is on every Windows machine; Chrome is the fallback. */
const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

/**
 * Remembered for the rest of the process, so a script opening a second window
 * does not work through the list again.
 */
let chosen = null

/**
 * When a browser fails to start, puppeteer deletes the temporary profile it
 * made for it — and on Windows that races with the half-started process still
 * holding the files. The delete fails with EBUSY, and because it happens
 * after the launch has already been rejected and caught, it arrives as an
 * unhandled rejection and takes the whole script down. Trying the next
 * browser in the list is no use if the attempt that failed kills the process.
 *
 * So exactly that is ignored: a file error, on a path puppeteer owns. Any
 * other unhandled rejection is left to crash as it should.
 */
let guarded = false
function ignoreProfileCleanupErrors() {
  if (guarded) return
  guarded = true
  process.on('unhandledRejection', (err) => {
    const e = /** @type {{ code?: string, path?: string }} */ (err)
    const tidying =
      (e?.code === 'EBUSY' || e?.code === 'EPERM' || e?.code === 'ENOTEMPTY') &&
      String(e?.path ?? '').includes('puppeteer_dev_chrome_profile')
    if (tidying) return
    throw err
  })
}

/**
 * Launches a browser, trying each candidate until one starts.
 *
 * Takes the same options as `puppeteer.launch`; `headless` and the usual args
 * are defaulted and can be overridden. `executablePath` is not accepted —
 * `BROWSER_PATH` is how a particular browser is asked for, and it is tried
 * first and on its own, because somebody who names one wants a failure to say
 * so rather than quietly become a different browser.
 */
export async function launchBrowser(options = {}) {
  ignoreProfileCleanupErrors()

  const base = {
    headless: true,
    ...options,
    args: ['--no-sandbox', '--disable-gpu', ...(options.args ?? [])],
  }

  if (chosen) return puppeteer.launch({ ...base, executablePath: chosen })

  const tried = []
  for (const path of CANDIDATES) {
    if (!existsSync(path)) continue
    try {
      const browser = await puppeteer.launch({ ...base, executablePath: path })
      chosen = path
      return browser
    } catch (err) {
      tried.push(`${path}: ${String(err).split('\n')[0]}`)
      if (process.env.BROWSER_PATH === path) break
    }
  }

  throw new Error(
    `No browser would start. Tried:\n  ${tried.join('\n  ') || '(none installed)'}\n` +
      `Set BROWSER_PATH to point at one.`,
  )
}
