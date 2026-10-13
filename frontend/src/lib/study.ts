import { mediaUrl } from '@/lib/api'
import type { StudyCurriculum, StudyLesson } from '@/lib/api'
import type { Course, CourseModule, Lesson, Progress } from '@/components/learning/types'

/**
 * The API's curriculum, in the shapes the learning room already speaks.
 *
 * The player, the curriculum panel and the title block were written against
 * the prototype's store and are good components; rewriting all three to a new
 * vocabulary would risk their behaviour for no gain. So the data is translated
 * once, here, and they carry on unchanged.
 *
 * Ids become strings because that is what those components compare and use as
 * element ids. The number is still the truth — `lessonNumber` turns one back
 * when the API has to be called.
 */

/** "MM:SS", which is how the lesson row and the player's clock read it. */
function clockOf(seconds: number): string | null {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** The API's `document` is the prototype's `pdf`; `video` and `quiz` match. */
function typeOf(type: StudyLesson['type']): Lesson['type'] {
  return type === 'document' ? 'pdf' : type
}

export function lessonNumber(id: string): number {
  return Number(id)
}

function toLesson(l: StudyLesson): Lesson {
  return {
    id: String(l.id),
    moduleId: String(l.moduleId ?? ''),
    title: l.title,
    subtitle: l.subtitle,
    type: typeOf(l.type),
    duration: clockOf(l.durationSeconds),
    sec: l.durationSeconds,
    preview: l.isPreview,
    hasPdf: l.hasDocument,
  }
}

export function toModules(data: StudyCurriculum): CourseModule[] {
  const mods = data.modules.map((m) => ({
    id: String(m.id),
    title: m.title,
    lessons: m.lessons.map(toLesson),
  }))
  // Lessons that belong to no module still have to be reachable, so they are
  // given one of their own rather than quietly dropped.
  if (data.loose.length) {
    mods.push({ id: 'loose', title: '', lessons: data.loose.map(toLesson) })
  }
  return mods
}

export function flatLessons(data: StudyCurriculum): StudyLesson[] {
  return [...data.modules.flatMap((m) => m.lessons), ...data.loose]
}

export interface StudyContext {
  /** For the labels the prototype's course object carries. */
  t: (key: string, named?: Record<string, unknown>) => string
  durationLabel: string
  levelLabel: string
  languageLabel: string
}

/**
 * The course object the room's components expect.
 *
 * Several of its fields exist only because the prototype's data had them — CE
 * credit, a quiz definition, marketing copy. They are filled with what is true
 * here (no CE, no quiz yet) rather than left undefined, so nothing downstream
 * has to guard against a missing key.
 */
export function toCourse(data: StudyCurriculum, ctx: StudyContext): Course {
  return {
    id: data.course.slug,
    title: data.course.title,
    category: '',
    shortDesc: data.course.shortDesc ?? '',
    durationLabel: ctx.durationLabel,
    languageLabel: ctx.languageLabel,
    levelLabel: ctx.levelLabel,
    // Minna awards no CE credit. The field stays because the components read
    // it; the number is the honest one.
    ce: 0,
    status: 'approved',
    image: data.course.thumbnailPath
      ? { src: mediaUrl(data.course.thumbnailPath), alt: data.course.title }
      : undefined,
    instructors: [],
    outcomes: [],
    resources: data.documents.map((d) => ({
      name: d.fileName,
      size: d.sizeBytes ? `${Math.round(d.sizeBytes / 1024 / 1024 * 10) / 10} MB` : '',
    })),
    modules: toModules(data),
    // No quiz API yet. An empty one is what the components check for, and it
    // keeps the quiz card out of the room rather than showing a test nobody
    // can take.
    quiz: { id: '', title: '', passPct: 0, timerMin: null, questions: [] },
  }
}

/**
 * Progress, as the room reads it.
 *
 * `f` is the fraction watched, which the player uses to draw the "watched N%"
 * line. It is derived from the furthest point reached rather than the last
 * position, for the same reason the server records both.
 */
export function toProgress(data: StudyCurriculum): Progress {
  const all = flatLessons(data)
  const map: Progress['map'] = {}
  for (const l of all) {
    const furthest = l.progress.maxPositionSeconds
    map[String(l.id)] = {
      done: l.progress.completedAt !== null,
      f: l.durationSeconds ? Math.min(furthest / l.durationSeconds, 1) : 0,
      // Where the playhead goes back to, which is the last position rather than
      // the furthest: picking up a lesson means picking it up where you left it.
      pos: l.progress.lastPositionSeconds,
    }
  }

  const byId = new Map(all.map((l) => [l.id, l]))
  const resume = data.resumeLessonId ? byId.get(data.resumeLessonId) : undefined

  // The one touched most recently, which is what "carry on" means on a course
  // somebody has already dipped into out of order.
  const touched = all
    .filter((l) => l.progress.lastWatchedAt !== null)
    .sort((a, b) =>
      String(b.progress.lastWatchedAt).localeCompare(String(a.progress.lastWatchedAt)),
    )[0]

  return {
    pct: data.progress.pct,
    done: data.progress.done,
    total: data.progress.total,
    started: touched !== undefined,
    lessonsDone: data.progress.total > 0 && data.progress.done === data.progress.total,
    lastLesson: touched ? toLesson(touched) : null,
    activityAt: touched?.progress.lastWatchedAt ?? null,
    map,
    resume: resume ? toLesson(resume) : null,
  }
}
