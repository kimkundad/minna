import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { mediaUrl, settings } from '@/lib/api'
import { applyFavicon } from '@/lib/favicon'

/**
 * The school's logo, as it was set on the settings screen.
 *
 * The same stored path the public site reads, so the two cannot show different
 * logos — that was the point of putting it in settings rather than in each
 * app's assets.
 *
 * The TailAdmin files stay as the fallback, and a light and a dark one are kept
 * for it because that theme ships both. An uploaded logo is used for both: a
 * school that wants a different mark on a dark background can say so when
 * anybody asks for it, and inventing the setting now would mean two upload
 * boxes nobody fills in.
 */
const BUNDLED = {
  light: '/images/logo/logo.svg',
  dark: '/images/logo/logo-dark.svg',
  icon: '/images/logo/logo-icon.svg',
} as const

export const useBrandingStore = defineStore('branding', () => {
  const logoPath = ref<string | null>(null)
  const iconPath = ref<string | null>(null)
  const faviconPath = ref<string | null>(null)
  const loaded = ref(false)

  /** True once a logo has been uploaded, which is what lets the chrome drop the
   *  light/dark pair for a single picture. */
  const custom = computed(() => logoPath.value !== null)

  const logo = computed(() => (logoPath.value ? mediaUrl(logoPath.value) : BUNDLED.light))
  const logoDark = computed(() => (logoPath.value ? mediaUrl(logoPath.value) : BUNDLED.dark))
  /** The square one, for the menu when it is collapsed. Falls back to the wide
   *  logo only if there is no bundled mark, which there always is. */
  const icon = computed(() => (iconPath.value ? mediaUrl(iconPath.value) : BUNDLED.icon))
  /** Null until one is uploaded, which leaves the bundled tab icon alone. */
  const favicon = computed(() => (faviconPath.value ? mediaUrl(faviconPath.value) : null))

  async function load(): Promise<void> {
    try {
      const data = (await settings.branding()).data
      logoPath.value = data.logoPath
      iconPath.value = data.logoIconPath
      faviconPath.value = data.faviconPath
      applyFavicon(favicon.value)
    } catch {
      // The bundled files stand in. No screen depends on this working.
    } finally {
      loaded.value = true
    }
  }

  /** Called by the settings screen after a save, so the menu changes without a
   *  reload — which is also how you check you uploaded the right file. */
  function set(data: {
    logoPath: string | null
    logoIconPath: string | null
    faviconPath: string | null
  }): void {
    logoPath.value = data.logoPath
    iconPath.value = data.logoIconPath
    faviconPath.value = data.faviconPath
    applyFavicon(favicon.value)
  }

  return { logoPath, iconPath, faviconPath, loaded, custom, logo, logoDark, icon, favicon, load, set }
})
