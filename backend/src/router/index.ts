import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * Only the screens this project actually has.
 *
 * TailAdmin ships about seventy routes, most of them demos — AI generators,
 * stock tickers, logistics boards, a chat client, a UI-element showcase. They
 * are gone from here, so what is left is the real surface of the admin and a
 * missing screen is obvious.
 *
 * The demo *views* stay on disk on purpose: building the real screens means
 * lifting markup out of the tables, forms and modal demos, and that is much
 * easier with the originals to hand than with a template download. Nothing
 * routes to them, so nothing ships them.
 *
 * `meta.roles` lists who may open a route. Leaving it off means "any signed-in
 * user of this app", which the guard already limits to admins and teachers.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { left: 0, top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'Dashboard',
      component: () => import('@/views/Dashboard.vue'),
      meta: { title: 'Dashboard' },
    },
    {
      path: '/courses',
      name: 'Courses',
      component: () => import('@/views/Catalog/Courses.vue'),
      meta: { title: 'Courses', roles: ['admin', 'teacher'] },
    },
    {
      // 'new' and an id share one form; the view decides from the param.
      path: '/courses/:id',
      name: 'Course',
      component: () => import('@/views/Catalog/CourseForm.vue'),
      meta: { title: 'Course', roles: ['admin', 'teacher'] },
    },
    {
      path: '/courses/:id/curriculum',
      name: 'CourseCurriculum',
      component: () => import('@/views/Catalog/CourseCurriculum.vue'),
      meta: { title: 'Curriculum', roles: ['admin', 'teacher'] },
    },
    {
      path: '/categories',
      name: 'Categories',
      component: () => import('@/views/Catalog/Categories.vue'),
      meta: { title: 'Categories', roles: ['admin'] },
    },

    {
      path: '/profile',
      name: 'Profile',
      component: () => import('@/views/Others/UserProfile.vue'),
      meta: { title: 'My profile' },
    },

    {
      path: '/signin',
      name: 'Signin',
      component: () => import('@/views/Auth/Signin.vue'),
      meta: { title: 'Sign in', public: true },
    },

    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('@/views/Errors/FourZeroFour.vue'),
      meta: { title: 'Page not found', public: true },
    },
  ],
})

router.beforeEach(async (to) => {
  document.title = `${to.meta.title ?? 'Admin'} · Minna`

  const auth = useAuthStore()
  // main.ts bootstraps before mounting, so this is already settled on a normal
  // load. It matters when the router is driven before that, as in a test.
  if (!auth.ready) await auth.bootstrap()

  if (to.meta.public) {
    // Nobody signed in needs the sign-in page.
    if (to.name === 'Signin' && auth.canUseAdmin) return { path: '/' }
    return true
  }

  if (!auth.isLoggedIn) {
    // Remember where they were going, so signing in finishes the journey
    // instead of dumping everyone on the dashboard.
    return { name: 'Signin', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
  }

  // A student account can sign in against the same API but has nothing to do
  // here. Sending them to the sign-in page would loop, so say so plainly.
  if (!auth.canUseAdmin) return { name: 'Signin', query: { denied: '1' } }

  const allowed = to.meta.roles as string[] | undefined
  if (allowed && !allowed.some((role) => auth.roles.includes(role as never))) {
    return { path: '/' }
  }

  return true
})

export default router
