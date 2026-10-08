import { createRouter, createWebHistory } from 'vue-router'
import { i18n, storeLocale, storedLocale } from '@/locales'

/**
 * Locale lives in the path (/th, /en, /jp, /vn). Anything without one is sent
 * to the stored choice, or to the picker when there is none.
 */
export const LOCALES = ['th', 'en', 'jp', 'vn'] as const
export type AppLocale = (typeof LOCALES)[number]

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/th' },
    {
      path: '/:locale(th|en|jp|vn)',
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
              path: 'orders',
              name: 'account-orders',
              component: () => import('@/pages/account/AccountOrdersPage.vue'),
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
    // The emailed links carry no locale: the API builds them from APP_URL and
    // has no idea which language the reader uses. Without these two the
    // catch-all below sends them to /th and drops the token on the way, which
    // is exactly what it was doing.
    {
      path: '/reset-password',
      redirect: (to) => ({ path: `/${storedLocale() ?? 'th'}/reset-password`, query: to.query }),
    },
    {
      path: '/verify-email',
      redirect: (to) => ({ path: `/${storedLocale() ?? 'th'}/verify-email`, query: to.query }),
    },

    { path: '/:pathMatch(.*)*', redirect: '/th' },
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
  if (i18n.global.locale.value === locale) return

  i18n.global.locale.value = locale as AppLocale
  storeLocale(locale as AppLocale)
  document.documentElement.setAttribute('lang', locale === 'jp' ? 'ja' : locale === 'vn' ? 'vi' : locale)
})

export default router
