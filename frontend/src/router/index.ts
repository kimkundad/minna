import { createRouter, createWebHistory } from 'vue-router'

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
        { path: '', name: 'home', component: () => import('@/pages/HomePage.vue') },
        {
          path: 'courses/:id',
          name: 'course',
          component: () => import('@/pages/CoursePage.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/th' },
  ],
  scrollBehavior: (to, from, saved) => saved ?? { top: 0 },
})

export default router
