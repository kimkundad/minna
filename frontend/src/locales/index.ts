import { createI18n } from 'vue-i18n'
import th from './th.json'
import en from './en.json'
import jp from './jp.json'
import vn from './vn.json'
import id from './id.json'
import zh from './zh.json'
import ko from './ko.json'
import tw from './tw.json'

export const LOCALES = ['th', 'en', 'jp', 'vn', 'id', 'zh', 'ko', 'tw'] as const
export type AppLocale = (typeof LOCALES)[number]

/** Shown on the first-visit picker. English names under each flag, as agreed. */
export const LOCALE_META: Record<AppLocale, { name: string; native: string; flag: string }> = {
  th: { name: 'Thai', native: 'ไทย', flag: '🇹🇭' },
  en: { name: 'English', native: 'English', flag: '🇬🇧' },
  jp: { name: 'Japanese', native: '日本語', flag: '🇯🇵' },
  vn: { name: 'Vietnamese', native: 'Tiếng Việt', flag: '🇻🇳' },
  id: { name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩' },
  zh: { name: 'Chinese (Simp.)', native: '简体中文', flag: '🇨🇳' },
  ko: { name: 'Korean', native: '한국어', flag: '🇰🇷' },
  // The two Chinese entries are named by their script rather than by a place,
  // as the customer asked: "Chinese" and "Taiwan" side by side read as a
  // language next to a country, which says nothing about which of them is
  // written in which script.
  tw: { name: 'Chinese (Trad.)', native: '繁體中文', flag: '🇹🇼' },
}

const STORAGE_KEY = 'minna:locale'

export function storedLocale(): AppLocale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return LOCALES.includes(value as AppLocale) ? (value as AppLocale) : null
  } catch {
    // Private windows and blocked site data both throw here. The picker simply
    // appears again, which is the right fallback.
    return null
  }
}

export function storeLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* nothing to do: the choice still applies for this visit */
  }
}

export const i18n = createI18n({
  legacy: false,
  // English until somebody says otherwise. The gate asks on a first visit and
  // remembers the answer, so this is what the page behind the gate is in — and
  // what a visitor sees if their choice cannot be stored at all.
  locale: storedLocale() ?? 'en',
  fallbackLocale: 'en',
  messages: { th, en, jp, vn, id, zh, ko, tw },
})

/**
 * Whether the visitor arrived with a language in the address.
 *
 * Read once at module load, which is before the router has run: `/` redirects
 * to a locale, so by the time anything mounts every URL has one and how it got
 * there can no longer be asked.
 */
export const arrivedWithLocale = new RegExp(`^/(${LOCALES.join('|')})(/|$)`).test(
  typeof window === 'undefined' ? '' : window.location.pathname,
)

/**
 * Nothing stored, and nothing in the address they typed: the gate is about to
 * ask which language.
 *
 * Until it is answered, nothing may be written down on the visitor's behalf.
 * Navigation used to store whatever locale was in the path, which meant the
 * redirect that puts somebody on `/en` before the gate opens counted as them
 * choosing English — so closing the tab without answering left them in a
 * language they never picked, with the gate never asking again.
 */
export const awaitingChoice = !storedLocale() && !arrivedWithLocale
