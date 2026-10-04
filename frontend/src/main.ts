import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { i18n } from './locales'

// Order matters: tokens define the custom properties every later file reads.
import './assets/css/tokens.css'
import './assets/css/base.css'
import './assets/css/components.css'
import './assets/css/home.css'
import './assets/css/discovery.css'

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
