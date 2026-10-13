import { createRouter, createWebHistory, type RouteLocationGeneric } from 'vue-router'
import { awaitingChoice, i18n, storeLocale, storedLocale } from '@/locales'

/**
 * Locale lives in the path (/th, /en, /jp, /vn, /id, /zh, /ko, /tw). Anything
 * without one is sent to the stored choice, or to the picker when there is
 * none.
 */
export const LOCALES = ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw'] as const
export type AppLocale = (typeof LOCALES)[number]

/**
 * What goes in `<html lang>` — a BCP-47 tag, which is not always our own key.
 *
 * `jp` and `vn` are our shorthand for languages the standard calls `ja` and
 * `vi`. `tw` is not a language tag at all: the two Chinese entries differ by
 * script rather than by country, so they are `zh-Hans` and `zh-Hant`. Browsers
 * and screen readers pick fonts, hyphenation and a voice from this, and a tag
 * nobody recognises gets them all from the page's default instead.
 */
const HTML_LANG: Record<AppLocale, string> = {
  th: 'th',
  en: 'en',
  jp: 'ja',
  vn: 'vi',
  id: 'id',
  zh: 'zh-Hans',
  ko: 'ko',
  tw: 'zh-Hant',
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Whatever they chose last, or English. Thai used to be hard-coded here,
    // which sent a first-time visitor to a language they may not read before
    // the gate had a chance to ask.
    { path: '/', redirect: () => `/${storedLocale() ?? 'en'}` },
    {
      path: `/:locale(${LOCALES.join('|')})`,
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/pages/HomePage.vue'),
          // The hero runs under a transparent header, so the solid one would
          // cut a band across the top of the image.
          meta: { headerVariant: 'overlay', headerActive: 'home' },
        },
        {
          path: 'courses',
          name: 'courses',
          component: () => import('@/pages/CoursesPage.vue'),
          meta: { headerActive: 'courses' },
        },
        {
          path: 'courses/:id',
          name: 'course',
          component: () => import('@/pages/CoursePage.vue'),
          // The prototype keys the mobile purchase bar's spacing off
          // body.page-course; the page adds that one itself, since the rule
          // reaches for the body element rather than our root.
          meta: { headerActive: 'courses', bodyClass: 'page-course' },
        },

        // The blog. Two pages, the same shape as the catalog's: a list that
        // keeps its state in the URL, and a detail reached by slug.
        {
          path: 'blog',
          name: 'blog',
          component: () => import('@/pages/BlogPage.vue'),
          meta: { headerActive: 'blog' },
        },
        {
          path: 'blog/:slug',
          name: 'article',
          component: () => import('@/pages/ArticlePage.vue'),
          meta: { headerActive: 'blog' },
        },

        // The learning group. All three replace the site nav with a compact
        // bar, which SiteHeader does not implement yet — `headerVariant`
        // records the intent, and until then each page renders the bar itself
        // and brand.css hides the site header on these three body classes.
        {
          path: 'learn/:id',
          name: 'learn',
          component: () => import('@/pages/LearnPage.vue'),
          meta: { headerVariant: 'compact', bodyClass: 'page-learn' },
        },
        {
          path: 'quiz/:id',
          name: 'quiz',
          component: () => import('@/pages/QuizPage.vue'),
          meta: { headerVariant: 'compact', bodyClass: 'page-quiz' },
        },
        {
          path: 'result/:id',
          name: 'result',
          component: () => import('@/pages/ResultPage.vue'),
          meta: { headerVariant: 'compact', bodyClass: 'page-result' },
        },

        // The account section. All five share one shell, so they share a
        // parent path rather than each spelling the prefix out.
        {
          path: 'account',
          children: [
            {
              path: '',
              name: 'account',
              component: () => import('@/pages/account/AccountOverviewPage.vue'),
            },
            {
              path: 'learning',
              name: 'account-learning',
              component: () => import('@/pages/account/AccountLearningPage.vue'),
            },
            {
              path: 'messages',
              name: 'account-messages',
              component: () => import('@/pages/account/AccountMessagesPage.vue'),
            },
            {
              path: 'notifications',
              name: 'account-notifications',
              component: () => import('@/pages/account/AccountNotificationsPage.vue'),
            },
            {
              path: 'orders',
              name: 'account-orders',
              component: () => import('@/pages/account/AccountOrdersPage.vue'),
            },
            {
              // Outside the shell on purpose: it is a sheet for paper, and the
              // account navigation has no business on a printed receipt.
              path: 'orders/:orderNo/receipt',
              name: 'account-receipt',
              component: () => import('@/pages/account/AccountReceiptPage.vue'),
              meta: { bodyClass: 'page-receipt' },
            },
            {
              path: 'package',
              name: 'account-package',
              component: () => import('@/pages/account/AccountPackagePage.vue'),
            },
            {
              path: 'profile',
              name: 'account-profile',
              component: () => import('@/pages/account/AccountProfilePage.vue'),
            },
          ],
        },
        {
          path: 'cart',
          name: 'cart',
          component: () => import('@/pages/CartPage.vue'),
          // The prototype keys a few rules off body.page-cart; the mobile
          // sticky bar needs the same hook on our root element.
          meta: { bodyClass: 'page-cart' },
        },
        {
          path: 'checkout',
          name: 'checkout',
          component: () => import('@/pages/CheckoutPage.vue'),
          meta: { bodyClass: 'page-checkout' },
        },
        {
          path: 'checkout/success',
          name: 'checkout-success',
          component: () => import('@/pages/CheckoutSuccessPage.vue'),
          meta: { bodyClass: 'page-success' },
        },
        {
          path: 'about',
          name: 'about',
          component: () => import('@/pages/AboutPage.vue'),
          // Like the home page, the hero image runs to the top of the window,
          // so the header has to sit over it rather than above it.
          meta: {
            headerVariant: 'overlay',
            headerActive: 'about',
            bodyClass: 'page-about',
          },
        },

        // Where the emailed links land. Also reachable without a locale —
        // see the redirects below — because the mail does not know which one
        // the reader uses.
        {
          path: 'reset-password',
          name: 'reset-password',
          component: () => import('@/pages/auth/ResetPasswordPage.vue'),
          meta: { bodyClass: 'page-auth' },
        },
        {
          path: 'verify-email',
          name: 'verify-email',
          component: () => import('@/pages/auth/VerifyEmailPage.vue'),
          meta: { bodyClass: 'page-auth' },
        },

        // The three legal documents. They share a shell, not a parent route:
        // each is a separate top-level page with its own URL in the footer.
        {
          path: 'privacy',
          name: 'privacy',
          component: () => import('@/pages/legal/PrivacyPage.vue'),
          meta: { bodyClass: 'page-legal page-privacy' },
        },
        {
          path: 'terms',
          name: 'terms',
          component: () => import('@/pages/legal/TermsPage.vue'),
          meta: { bodyClass: 'page-legal page-terms' },
        },
        {
          path: 'purchase-terms',
          name: 'purchase-terms',
          component: () => import('@/pages/legal/PurchaseTermsPage.vue'),
          meta: { bodyClass: 'page-legal page-purchase-terms' },
        },
      ],
    },
    /**
     * Anything that arrived without a language in front of it.
     *
     * Links built elsewhere do not know which language the reader uses: a
     * password reset email, a verification link, and the address Stripe sends a
     * buyer back to are all made from APP_URL by a server that has never met
     * them. Sending every one of those to the home page loses the page they
     * were for and the token or order number with it — which is what a buyer
     * returning from a paid order was getting.
     *
     * So the stored language is put in front and the path tried again. If that
     * is a real page, they go to it with their query string intact; if it is
     * not, the home page is the right answer after all.
     */
    { path: '/:pathMatch(.*)*', redirect: withLocale },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    // A link into a section has to clear the sticky header, or the heading it
    // points at ends up underneath it. The legal pages' table of contents and
    // the checkout's link to the refund terms both depend on this.
    if (to.hash) return { el: to.hash, top: HEADER_OFFSET, behavior: 'smooth' }
    return { top: 0 }
  },
})

/** Roughly the sticky header's height, with a little air above the heading. */
const HEADER_OFFSET = 96

/**
 * The locale in the path is the one that wins.
 *
 * Without this, /en/terms renders Thai: the path says English, the messages
 * come from whatever was last stored, and the two drift apart the moment
 * anyone shares a link. Storing it here also means the choice survives a
 * visitor who arrives on a deep link rather than through the picker.
 */
router.beforeEach((to) => {
  const locale = to.params.locale
  if (typeof locale !== 'string' || !LOCALES.includes(locale as AppLocale)) return

  // Always, even when the messages are already in this language: the attribute
  // starts at whatever index.html hard-codes, and a page that says it is Thai
  // while reading English is wrong for a screen reader and for Google alike.
  document.documentElement.setAttribute('lang', HTML_LANG[locale as AppLocale] ?? locale)
  if (i18n.global.locale.value === locale) return

  i18n.global.locale.value = locale as AppLocale
  // Not while the gate is still asking. The redirect that lands somebody on
  // /en before they have answered is not them choosing English.
  if (!awaitingChoice) storeLocale(locale as AppLocale)
})

/**
 * Hoisted so the catch-all above can name it: it runs long after `router` is
 * assigned, so reading it here is safe.
 */
function withLocale(to: RouteLocationGeneric) {
  // English when nothing has been chosen: the gate asks on a first visit,
  // and a link that arrives without a locale should not guess Thai at somebody.
  const locale = storedLocale() ?? 'en'

  // Already carries one, so adding another would only make a longer path that
  // matches nothing. `/jp/nope` used to become `/en/jp/nope`, then
  // `/en/en/jp/nope`, until the tab ran out of stack.
  if (LOCALES.some((l) => to.path === `/${l}` || to.path.startsWith(`/${l}/`))) {
    return `/${locale}`
  }

  const path = `/${locale}${to.path}`
  return resolvesToAPage(path) ? { path, query: to.query, hash: to.hash } : `/${locale}`
}

/**
 * Whether a path is a real page rather than the catch-all.
 *
 * `matched.length` is no use on its own: the catch-all matches everything, so
 * it is never zero and every unknown path looked like a page worth going to.
 */
function resolvesToAPage(path: string): boolean {
  const matched = router.resolve(path).matched
  return matched.length > 0 && !matched.some((r) => r.path.includes(':pathMatch'))
}

export default router
