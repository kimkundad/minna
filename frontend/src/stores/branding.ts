import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { branding, mediaUrl } from '@/lib/api'
import { applyFavicon } from '@/lib/favicon'
import bundledLogo from '@/assets/img/logo.png'

/**
 * The school's logo, as the admin set it.
 *
 * One store, read by every place the logo appears — the header, the drawer, the
 * footer, the lesson header, the printed sheet. Each of them importing the
 * bundled file is how a school that has changed its logo still sees the old one
 * at the bottom of the page.
 *
 * The bundled picture is the fallback, not a placeholder: a site whose settings
 * have never been touched is the ordinary case, and so is an unreachable API.
 * Either way a logo appears.
 */
export const useBrandingStore = defineStore('branding', () => {
  const path = ref<string | null>(null)
  const faviconPath = ref<string | null>(null)
  const loaded = ref(false)

  const logo = computed(() => (path.value ? mediaUrl(path.value) : bundledLogo))
  /** Null until one is uploaded, which leaves the bundled tab icon alone. */
  const favicon = computed(() => (faviconPath.value ? mediaUrl(faviconPath.value) : null))

  async function load(): Promise<void> {
    if (loaded.value) return
    try {
      const data = (await branding()).data
      path.value = data.logoPath
      faviconPath.value = data.faviconPath
      applyFavicon(favicon.value)
    } catch {
      // The bundled logo stands in. Nothing about a page needs this to work.
    } finally {
      loaded.value = true
    }
  }

  return { path, faviconPath, loaded, logo, favicon, load }
})
