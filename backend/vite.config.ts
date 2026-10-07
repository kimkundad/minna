import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    // 5174 belongs to the public site, which usually runs alongside this.
    port: 5173,
    proxy: {
      // Same origin as the app, so the refresh cookie — httpOnly, SameSite=Lax
      // — is sent on every call without needing cross-site cookie rules.
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
})
