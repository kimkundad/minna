import { useI18n } from 'vue-i18n'

/**
 * Lists read out of the locale files.
 *
 * Long documents are mostly lists — bullets, table rows, FAQ entries — and
 * keeping each one as a single array in the locale file lets a translator see
 * the whole list at once instead of hunting for `item7`.
 *
 * `tm()` hands back the raw message, which for a runtime-loaded JSON file is a
 * plain string until something compiles it and a message function afterwards.
 * `rt()` resolves either, so every value goes through it.
 */
export function useLegalText() {
  const { t, tm, rt } = useI18n()

  const resolve = (v: unknown): string => rt(v as never)

  /** An array of plain strings. */
  function strings(key: string): string[] {
    const raw = tm(key) as unknown
    return Array.isArray(raw) ? raw.map(resolve) : []
  }

  /** An array of objects whose every value is a string. */
  function rows<T extends Record<string, string | undefined>>(key: string): T[] {
    const raw = tm(key) as unknown
    if (!Array.isArray(raw)) return []
    return raw.map(
      (entry) =>
        Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).map(([k, v]) => [k, resolve(v)]),
        ) as T,
    )
  }

  /** An array of arrays of strings — one table body row per entry. */
  function grid(key: string): string[][] {
    const raw = tm(key) as unknown
    if (!Array.isArray(raw)) return []
    return raw.map((row) => (Array.isArray(row) ? row.map(resolve) : []))
  }

  return { t, strings, rows, grid }
}

/**
 * A bullet that opens with a bold run, which is most of them.
 *
 * The index signature is what lets `rows<LeadItem>()` accept it: the helper is
 * constrained to objects of strings, and an interface without one does not
 * satisfy that even when every declared field is a string.
 */
export interface LeadItem {
  [key: string]: string | undefined
  /** Bold lead-in. */
  b: string
  /** The rest of the sentence, including its own leading separator. */
  t: string
}
