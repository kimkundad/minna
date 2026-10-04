/**
 * The shapes the vendored store hands back, written down only as far as the
 * three learning pages actually read them.
 *
 * They are deliberately partial: `src/vendor/store.js` is the specification,
 * and copying all of it into TypeScript would create a second one to keep in
 * step.
 */

export type LessonType = 'video' | 'pdf' | 'quiz'

export interface Lesson {
  id: string
  moduleId: string
  title: string
  subtitle: string | null
  type: LessonType
  /** "MM:SS" as the data writes it, or null for a document or the quiz. */
  duration: string | null
  sec: number
  preview: boolean
  hasPdf: boolean
}

export interface CourseModule {
  id: string
  title: string
  lessons: Lesson[]
}

export interface QuizQuestion {
  id: string
  type: 'single' | 'multiple' | 'essay'
  text: string
  choices?: string[]
  correctAnswer?: number[]
}

export interface Quiz {
  id: string
  title: string
  passPct: number
  timerMin: number | null
  questions: QuizQuestion[]
}

export interface CourseResource {
  name: string
  size: string
}

export interface Course {
  id: string
  title: string
  category: string
  shortDesc: string
  durationLabel: string
  languageLabel: string
  levelLabel: string
  ce: number
  isFree?: boolean
  status: string
  image?: Record<string, unknown>
  instructors: { id: string; role: string }[]
  outcomes: string[]
  resources: CourseResource[]
  modules: CourseModule[]
  quiz: Quiz
}

export interface Access {
  has: boolean
  reason: 'ok' | 'none' | 'missing' | 'guest' | 'ended' | 'expired' | 'pkg-expired' | 'free-available'
  source: string | null
  expiredType: 'A' | 'B' | null
}

export interface Progress {
  pct: number
  done: number
  total: number
  started: boolean
  lessonsDone: boolean
  lastLesson: Lesson | null
  resume: Lesson | null
  activityAt: string | null
  map: Record<string, { f: number; done: boolean; pos: number }>
}

export interface LessonState {
  f: number
  done: boolean
  pos: number
}

export type EssayStatus = 'none' | 'pending' | 'resubmitted' | 'revision' | 'passed'

export interface AttachedFile {
  name: string
  size: number
  type: string
}

export interface EssayVersion {
  v: number
  at: string
  text: string
  file: AttachedFile | null
}

export interface EssayReview {
  v: number
  at: string
  by: string
  result: 'pass' | 'revision'
  comment: string
  file: AttachedFile | null
}

export interface Essay {
  attemptId: string
  status: Exclude<EssayStatus, 'none'>
  versions: EssayVersion[]
  reviews: EssayReview[]
}

export interface ChoiceAttempt {
  id: string
  at: string
  correct: number
  total: number
  passed: boolean
}

export interface QuizStatus {
  attempts: number
  latest: ChoiceAttempt | null
  choicePassed: boolean
  essayStatus: EssayStatus
  essay: Essay | null
  completed: boolean
}

export interface QuizDraft {
  answers: Record<string, number[]>
  essayText: string
  essayFile: AttachedFile | null
  current: number
  deadline: number | null
  startedAt: string | null
  savedAt: string
}

export interface EssayDraft {
  text: string
  file: AttachedFile | null
  savedAt: string
}

export interface Note {
  lid: string
  text: string
  at: string
}

export interface Question {
  lid: string
  text: string
  at: string
  by: string
}

export interface Person {
  id: string
  name: string
  short: string
  initials: string
  color: number
  photo?: string | null
}
