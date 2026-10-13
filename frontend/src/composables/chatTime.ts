import type { ChatMessage } from '@/lib/api'
import { intlTag } from '@/lib/format'

/**
 * Times and day headings in the chat, read on the school's clock.
 *
 * Every timestamp the API sends is an instant with its offset on it, so a
 * browser could render it anywhere. These render it in Bangkok: the people in
 * a conversation are talking about one school's day, and a learner abroad
 * should see the same "09:14" the office sees.
 */
const SCHOOL_TZ = 'Asia/Bangkok'

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: SCHOOL_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * The day heading, in the reader's language.
 *
 * Built per language and kept, rather than once against `th-TH`: a Korean
 * reader was getting Thai month names above their own messages. The clock and
 * the `ymd` key above stay fixed on purpose — one is 24-hour everywhere and
 * the other is a comparison key, not something anybody reads.
 */
const dayCache: Record<string, Intl.DateTimeFormat> = {}
function dayNice(): Intl.DateTimeFormat {
  const tag = intlTag()
  return (dayCache[tag] ??= new Intl.DateTimeFormat(tag, {
    timeZone: SCHOOL_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }))
}

export const timeOf = (iso: string) => clock.format(new Date(iso))

export type Translate = (key: string, named?: Record<string, unknown>) => string

export function dayLabel(iso: string, t: Translate): string {
  const key = ymd.format(new Date(iso))
  const now = new Date()
  if (key === ymd.format(now)) return t('messages.today')
  if (key === ymd.format(new Date(now.getTime() - 86_400_000))) return t('messages.yesterday')
  return dayNice().format(new Date(iso))
}

export interface TimelineEntry {
  message: ChatMessage
  /** The day heading this sits under, on the first message of each day. */
  heading: string | null
}

/** Each message with the day heading above it, worked out once. */
export function timelineOf(messages: ChatMessage[], t: Translate): TimelineEntry[] {
  let previous = ''
  return messages.map((m) => {
    const key = ymd.format(new Date(m.createdAt))
    const heading = key === previous ? null : dayLabel(m.createdAt, t)
    previous = key
    return { message: m, heading }
  })
}

export function sizeOf(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
