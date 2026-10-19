import type { UiLocale } from './api'

/**
 * The eight languages the site is written in, named once.
 *
 * Five pages in here kept a list of their own, and the words drifted: the
 * catalogue said "Chinese (Simplified)" and "Taiwan" while the content pages
 * said 简体中文 and 繁體中文, so the same two languages were a language and a
 * country on one screen and two scripts on the next.
 *
 * Both names are given on every row — the English one for whoever is filing
 * the work, the native one for whoever is writing it — because an admin
 * choosing where a slide appears cannot be assumed to read Korean, and a
 * translator working in Korean should not have to trust an English label.
 *
 * The two Chinese entries are told apart by script rather than by place. A
 * list reading "Chinese" and "Taiwan" says nothing about which writes which,
 * and the answer matters: the same sentence is spelled differently in each.
 */
export interface LocaleOption {
  value: UiLocale
  label: string
}

export const UI_LOCALES: LocaleOption[] = [
  { value: 'th', label: 'Thai · ไทย' },
  { value: 'en', label: 'English' },
  { value: 'jp', label: 'Japanese · 日本語' },
  { value: 'vn', label: 'Vietnamese · Tiếng Việt' },
  { value: 'id', label: 'Indonesian · Bahasa Indonesia' },
  { value: 'zh', label: 'Chinese (Simp.) · 简体中文' },
  { value: 'ko', label: 'Korean · 한국어' },
  { value: 'tw', label: 'Chinese (Trad.) · 繁體中文' },
]

/**
 * The same eight with an entry in front for "every language".
 *
 * The wording is the caller's, because it does not always mean the same
 * thing: on the slideshow it is a slide's own setting — where the slide
 * appears — and on the list above it, it is a view of everything there is.
 */
export function withEvery(label: string): { value: UiLocale | 'all'; label: string }[] {
  return [{ value: 'all' as const, label }, ...UI_LOCALES]
}

/** Thai is what the admin writes first, so a translation is one of the rest. */
export type TranslationLocale = Exclude<UiLocale, 'th'>

// The cast is what `filter` cannot say: it narrows no types, and the keys of a
// translation record are exactly these seven.
export const TRANSLATION_LOCALES = UI_LOCALES.filter((l) => l.value !== 'th') as {
  value: TranslationLocale
  label: string
}[]
