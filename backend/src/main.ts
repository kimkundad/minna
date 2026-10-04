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
import App from './App.vue'
import router from './router'
import VueApexCharts from 'vue3-apexcharts'
import FloatingVue from 'floating-vue'

const app = createApp(App)

app.use(router)
app.use(VueApexCharts)
app.use(FloatingVue, {
  themes: {
    popover: {
      $extend: 'dropdown',
    },
  },
})

app.mount('#app')
