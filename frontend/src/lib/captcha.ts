/**
 * reCAPTCHA v2, the checkbox.
 *
 * Chosen over the invisible v3 on purpose: a student can see what is guarding
 * the form, and so can whoever is reviewing the site. v3 scores the session
 * silently and shows nothing but a corner badge, which is pleasant until
 * somebody asks where the protection is and the honest answer is "you cannot
 * see it".
 *
 * The script is loaded the first time a box is actually rendered rather than on
 * every page: it is a third-party script that watches the page, and loading it
 * where nobody is going to post is both slower and more than a reader agreed
 * to.
 *
 * With no site key this does nothing and `isCaptchaEnabled()` is false, so the
 * form renders without a box. The API side is what actually enforces it — see
 * `api/src/lib/captcha.ts` — and production refuses to start without the
 * secret, so the two cannot quietly drift apart.
 */

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined

interface Grecaptcha {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback?: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'light' | 'dark'
      hl?: string
    },
  ) => number
  getResponse: (widgetId?: number) => string
  reset: (widgetId?: number) => void
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha
    /** The script calls this when it is ready to render widgets. */
    __minnaRecaptchaReady?: () => void
  }
}

let loading: Promise<Grecaptcha> | null = null

export function isCaptchaEnabled(): boolean {
  return Boolean(SITE_KEY)
}

export function captchaSiteKey(): string | undefined {
  return SITE_KEY
}

/**
 * Loads the script once and resolves when widgets can be rendered.
 *
 * `render=explicit` so nothing is drawn automatically: the box belongs inside
 * one form, in a place this app chooses, not wherever the script finds a
 * matching class.
 */
export function loadRecaptcha(locale = 'th'): Promise<Grecaptcha> {
  if (!SITE_KEY) return Promise.reject(new Error('no site key'))
  if (loading) return loading

  loading = new Promise<Grecaptcha>((resolve, reject) => {
    window.__minnaRecaptchaReady = () => {
      if (window.grecaptcha) resolve(window.grecaptcha)
      else reject(new Error('recaptcha loaded without an api'))
    }
    const el = document.createElement('script')
    // Thai is `th`; the site's other languages map to codes Google knows.
    const hl = { th: 'th', en: 'en', jp: 'ja', vn: 'vi' }[locale] ?? 'en'
    el.src = `https://www.google.com/recaptcha/api.js?onload=__minnaRecaptchaReady&render=explicit&hl=${hl}`
    el.async = true
    el.defer = true
    el.onerror = () => reject(new Error('recaptcha failed to load'))
    document.head.appendChild(el)
  })
  return loading
}
