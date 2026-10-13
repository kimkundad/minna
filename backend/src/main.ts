import './assets/main.css'
// Import Swiper styles
//@ts-ignore
import 'swiper/css'
//@ts-ignore
import 'swiper/css/navigation'
//@ts-ignore
import 'swiper/css/pagination'
import 'jsvectormap/dist/jsvectormap.css'
import 'flatpickr/dist/flatpickr.css'
import 'simplebar-vue/dist/simplebar.min.css'
import 'floating-vue/dist/style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import VueApexCharts from 'vue3-apexcharts'
import FloatingVue from 'floating-vue'
import { useAuthStore } from '@/stores/auth'
import { useBrandingStore } from '@/stores/branding'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(VueApexCharts)
app.use(FloatingVue, {
  themes: {
    popover: {
      $extend: 'dropdown',
    },
  },
})

// Trade the refresh cookie for a token before the first navigation, so the
// route guard sees the session that already exists rather than bouncing an
// admin to sign-in on every reload.
useAuthStore(pinia)
  .bootstrap()
  .finally(() => {
    app.mount('#app')
    // After mounting: the bundled logo is already on screen, so nobody waits
    // for this, and it needs no session — the sign-in page shows it too.
    void useBrandingStore(pinia).load()
  })
