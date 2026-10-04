import { createI18n } from 'vue-i18n'
import th from './th.json'
import en from './en.json'
import jp from './jp.json'
import vn from './vn.json'

export const LOCALES = ['th', 'en', 'jp', 'vn'] as const
export type AppLocale = (typeof LOCALES)[number]

/** Shown on the first-visit picker. English names under each flag, as agreed. */
export const LOCALE_META: Record<AppLocale, { name: string; flag: string }> = {
  th: { name: 'Thai', flag: '🇹🇭' },
  en: { name: 'English', flag: '🇬🇧' },
  jp: { name: 'Japanese', flag: '🇯🇵' },
  vn: { name: 'Vietnamese', flag: '🇻🇳' },
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
  locale: storedLocale() ?? 'th',
  fallbackLocale: 'th',
  messages: { th, en, jp, vn },
})
