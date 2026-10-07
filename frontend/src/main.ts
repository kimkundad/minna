import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './locales'
import { useAuthStore } from './stores/auth'

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
  .finally(() => app.mount('#app'))
