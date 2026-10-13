/**
 * Times as the school reads them.
 *
 * Every timestamp the API sends is an instant with its offset on it, so a
 * browser can render it anywhere. This admin renders it in Bangkok and not in
 * whatever the laptop is set to, which is deliberate: the people in here are
 * looking at one school's day. A teacher travelling, or an admin on a machine
 * still set to UTC, should see the same "09:14" the office sees, because that
 * is the time the message will be talked about by.
 */
export const SCHOOL_TZ = 'Asia/Bangkok'

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: SCHOOL_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const day = new Intl.DateTimeFormat('en-GB', {
  timeZone: SCHOOL_TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dayNoYear = new Intl.DateTimeFormat('en-GB', {
  timeZone: SCHOOL_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 09:14, in Bangkok. */
export function timeOf(iso: string): string {
  return clock.format(new Date(iso))
}

/** The calendar day in Bangkok, for grouping. Never shown. */
export function dayKey(iso: string): string {
  return ymd.format(new Date(iso))
}

/** The heading over a day's messages: Today, Yesterday, or the date. */
export function dayLabel(iso: string): string {
  const key = dayKey(iso)
  const now = new Date()
  if (key === ymd.format(now)) return 'Today'
  if (key === ymd.format(new Date(now.getTime() - 86_400_000))) return 'Yesterday'
  // Within the same year the year is noise; across it, it is the point.
  return key.slice(0, 4) === ymd.format(now).slice(0, 4)
    ? dayNoYear.format(new Date(iso))
    : day.format(new Date(iso))
}

/** "just now", then minutes, then hours, then the date. For list rows. */
export function ago(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  if (seconds < 86_400) return timeOf(iso)
  if (seconds < 7 * 86_400) return dayNoYear.format(new Date(iso))
  return day.format(new Date(iso))
}
