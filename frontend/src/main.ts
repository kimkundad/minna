import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './locales'
import { useAuthStore } from './stores/auth'
import { useBrandingStore } from './stores/branding'
import { useCartStore } from './stores/cart'
import { useLearningStore } from './stores/learning'

// Order matters: tokens define the custom properties every later file reads.
import './assets/css/tokens.css'
import './assets/css/base.css'
import './assets/css/components.css'
import './assets/css/home.css'
import './assets/css/discovery.css'
import './assets/css/commerce.css'
import './assets/css/account.css'
import './assets/css/learning.css'
import './assets/css/legal.css'
import './assets/css/blog.css'

// The country picker's own stylesheet, including the flag sprite. It sits
// before brand.css so the overrides that make it match our inputs still win.
import 'intl-tel-input/styles'

// Loaded last so Minna's own decisions win over the ported design.
import './assets/css/brand.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia).use(router).use(i18n)

/**
 * Restore the session before the first paint. The access token lives in memory
 * only, so a reload starts with none and has to trade the refresh cookie for a
 * new one; mounting first would show the header's signed-out state to someone
 * who is signed in, then swap it a moment later.
 *
 * A failure here is the normal case for a visitor with no session, so the app
 * mounts either way.
 */
useAuthStore(pinia)
  .bootstrap()
  .finally(() => {
    app.mount('#app')
    // After mounting, not before: the basket is a badge in the corner, and
    // nobody should wait on a page for it. It fills itself in a moment later.
    void useCartStore(pinia).load()
    // Which courses are already theirs, for the cards' buttons and the home
    // page's own rail. Also after mounting: a guest's is empty and a member's
    // arrives in a moment.
    void useLearningStore(pinia).load()
    // Same reasoning, and the bundled logo is showing in the meantime, so
    // there is nothing to wait for.
    void useBrandingStore(pinia).load()
  })
