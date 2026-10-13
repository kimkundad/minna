<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNotice from '@/components/ui/AppNotice.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CommerceConfirm from '@/components/commerce/CommerceConfirm.vue'
import CompactHeader from '@/components/learning/CompactHeader.vue'
import FileAttach from '@/components/learning/FileAttach.vue'
import FileChip from '@/components/learning/FileChip.vue'
import LearningSheet from '@/components/learning/LearningSheet.vue'
import QuizNavigator from '@/components/learning/QuizNavigator.vue'
import { confirm, hm, toast, useBodyClass } from '@/components/learning/learning'
import { ApiError, api, type QuizPaper, type QuizResult } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { clock, dateTime, num, relative } from '@/lib/format'
import { courseView, store, type CourseView } from '@/vendor'
import type {
  Access,
  AttachedFile,
  Course,
  EssayDraft,
  Person,
  QuizDraft,
  QuizQuestion,
  QuizStatus,
} from '@/components/learning/types'

/**
 * The end-of-course test: an intro, then one question at a time, then away to
 * the result page.
 *
 * It never shows an answer key, a per-question result or a best score. The
 * choice questions are marked by `store.submitQuiz`, which records an attempt
 * and returns nothing but whether the essay went with it; the essay goes to the
 * instructor. That split is the whole design, and it is why this page has a
 * second mode — `?mode=essay`, reached when a review came back asking for a
 * revision, which edits the essay alone and leaves the choice score alone.
 *
 * Answers are saved as a draft on every change, so closing the tab mid-test
 * loses nothing. The option order is shuffled per question but deterministically
 * from the question's id, so the same person sees the same order on a reload
 * while two people do not see the same one.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
const id = computed(() => String(route.params.id ?? ''))
const essayMode = computed(() => route.query.mode === 'essay')

const auth = useAuthStore()
const loggedIn = computed(() => auth.isLoggedIn)

/* ---------------- the paper, from the API ---------------- */

const paper = ref<QuizPaper | null>(null)
const status = ref<QuizResult | null>(null)
const loading = ref(true)
/** Why the test is shut, when it is. */
const denied = ref<'none' | 'missing' | null>(null)

/**
 * Choice ids, by question, in the order the page shows them.
 *
 * The page works in positions — "the second option" — because that is what its
 * markup and its keyboard handling were written against. The API works in
 * choice ids, because a position means nothing to a server marking a paper.
 * This is the one place the two meet.
 */
const choiceIds = ref<Record<string, number[]>>({})

async function load(): Promise<void> {
  if (!id.value || !loggedIn.value) {
    loading.value = false
    return
  }
  loading.value = paper.value === null
  denied.value = null
  try {
    const [got, res] = await Promise.all([
      api.quizPaper(id.value),
      api.quizResult(id.value).catch(() => null),
    ])
    paper.value = got.data
    status.value = res?.data ?? null
    choiceIds.value = Object.fromEntries(
      got.data.questions.map((q) => [String(q.id), q.choices.map((c) => c.id)]),
    )
  } catch (err) {
    paper.value = null
    denied.value = err instanceof ApiError && err.status === 404 ? 'missing' : 'none'
  } finally {
    loading.value = false
  }
}

watch(id, () => void load(), { immediate: true })
// As soon as the paper is there, find out whether a half-finished attempt is
// waiting — that is what the intro screen's "carry on" offer is built from.
watch(paper, (got) => {
  if (got) void openAttempt()
})
watch(loggedIn, (now, before) => {
  if (now !== before) void load()
})

/**
 * The shapes the screen was written against, built from the API's.
 *
 * Deliberately a translation rather than a rewrite of the screen: the running
 * test, its keyboard handling and its timer are good and were not what changed.
 */
const course = computed(() =>
  paper.value
    ? { id: id.value, title: paper.value.quiz.title, quiz: quizShape.value }
    : null,
)

const quizShape = computed(() =>
  paper.value
    ? {
        id: String(paper.value.quiz.id),
        title: paper.value.quiz.title,
        passPct: paper.value.quiz.passPct,
        timerMin: paper.value.quiz.timerMinutes,
        questions: paper.value.questions.map((q) => ({
          id: String(q.id),
          type: q.type,
          text: q.text,
          choices: q.choices.map((c) => c.text),
        })),
      }
    : null,
)

const quiz = computed(() => quizShape.value)

const access = computed<Access>(() =>
  paper.value
    ? { has: true, reason: 'ok', source: null, expiredType: null }
    : { has: false, reason: denied.value ?? 'missing', source: null, expiredType: null },
)

const view = computed<CourseView | null>(() => null)

const questions = computed<QuizQuestion[]>(() => quiz.value?.questions ?? [])
const choiceQuestions = computed(() => questions.value.filter((q) => q.type !== 'essay'))
const essayQuestion = computed(() => questions.value.find((q) => q.type === 'essay') ?? null)
const essayIndex = computed(() => questions.value.findIndex((q) => q.type === 'essay'))

const MAX_ESSAY = 1000

const learnPath = computed(() => path(`/learn/${id.value}`))
const resultPath = computed(() => path(`/result/${id.value}`))

/* ---------------- which screen ---------------- */

type View = 'missing' | 'gate' | 'lock' | 'intro' | 'run' | 'essay'

/** Set once the run starts, so a store change (a cart add in another tab) does
 *  not throw away a half-finished attempt. */
const running = ref(false)

const screen = computed<View>(() => {
  if (!course.value || !quiz.value) return 'missing'
  if (!loggedIn.value) return 'gate'
  if (!access.value.has) return 'lock'
  if (essayMode.value) return 'essay'
  return running.value ? 'run' : 'intro'
})

/* ---------------- essay already submitted? ---------------- */

const essayAnswer = computed(() => status.value?.essays[0] ?? null)
const essaySubmitted = computed(() => essayAnswer.value !== null)
const essayNeeded = computed(() => !!essayQuestion.value && !essaySubmitted.value)

/* ---------------- draft / answers ---------------- */

const answers = ref<Record<string, number[]>>({})
const essayText = ref('')
const essayFile = ref<AttachedFile | null>(null)
const index = ref(0)
const deadline = ref<number | null>(null)
const startedAt = ref<string | null>(null)
const savedAt = ref<string | null>(null)
const savingDraft = ref(false)
const submitting = ref(false)
const essayError = ref('')

/**
 * The attempt in progress, with whatever was last autosaved.
 *
 * One attempt is open at a time: starting the test twice carries on with the
 * same paper rather than beginning a second, which is what makes closing the
 * tab halfway harmless.
 */
const attemptId = ref<number | null>(null)
const draft = ref<QuizDraft | null>(null)

/** Positions, as the screen thinks; ids, as the API does. */
function toChoiceIds(byIndex: Record<string, number[]>): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const [questionId, positions] of Object.entries(byIndex)) {
    const ids = choiceIds.value[questionId] ?? []
    out[questionId] = positions.map((i) => ids[i]).filter((v): v is number => v !== undefined)
  }
  return out
}

function toPositions(byId: Record<string, number[]>): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const [questionId, picked] of Object.entries(byId)) {
    const ids = choiceIds.value[questionId] ?? []
    out[questionId] = picked.map((id) => ids.indexOf(id)).filter((i) => i >= 0)
  }
  return out
}

/** One request at a time: the paper arriving and the reader pressing start
 *  both ask, and two at once used to be a server error. */
let opening: Promise<void> | null = null

async function openAttempt(): Promise<void> {
  if (!id.value) return
  if (opening) return opening
  opening = doOpenAttempt().finally(() => {
    opening = null
  })
  return opening
}

async function doOpenAttempt(): Promise<void> {
  try {
    const started = (await api.startAttempt(id.value)).data
    attemptId.value = started.attemptId
    draft.value = {
      answers: toPositions(started.draft),
      essayText: '',
      essayFile: null,
      current: 0,
      deadline: null,
      startedAt: started.startedAt,
      savedAt: started.startedAt,
    }
  } catch {
    attemptId.value = null
    draft.value = null
  }
}

function loadDraft(d: QuizDraft | null) {
  answers.value = d?.answers ? JSON.parse(JSON.stringify(d.answers)) : {}
  essayText.value = d?.essayText ?? ''
  essayFile.value = d?.essayFile ?? null
  index.value = Math.max(0, Math.min(questions.value.length - 1, d?.current ?? 0))
  deadline.value = d?.deadline ?? null
  startedAt.value = d?.startedAt ?? isoNow()
}

let saveTimer = 0

function saveDraft(immediate: boolean) {
  clearTimeout(saveTimer)
  savingDraft.value = true
  const run = () => {
    if (!running.value || submitting.value || attemptId.value === null) return
    // Only the ticked choices go up. Where the reader is on the paper and how
    // long is left are this screen's business, not the server's.
    void api
      .saveQuizDraft(attemptId.value, toChoiceIds(answers.value))
      .then(() => {
        savedAt.value = isoNow()
        savingDraft.value = false
      })
      .catch(() => {
        // The next change tries again, and the answers are still on screen.
        savingDraft.value = false
      })
  }
  if (immediate) run()
  else saveTimer = window.setTimeout(run, 500)
}

/**
 * Opens the attempt, then starts the run.
 *
 * An attempt has to exist before an answer can be saved against it, and the
 * intro screen is where somebody decides to begin — so this is the moment to
 * ask for one, not page load.
 */
async function beginRun(fromDraft: boolean): Promise<void> {
  if (attemptId.value === null) await openAttempt()
  startRun(fromDraft)
}

function startRun(fromDraft: boolean) {
  essayError.value = ''
  submitting.value = false
  if (fromDraft) loadDraft(draft.value)
  else {
    loadDraft(null)
    startedAt.value = isoNow()
    deadline.value = quiz.value?.timerMin ? Date.now() + quiz.value.timerMin * 60000 : null
  }
  if (quiz.value?.timerMin && !deadline.value) {
    deadline.value = Date.now() + quiz.value.timerMin * 60000
  }
  running.value = true
  saveDraft(true)
  startTimer()
  void nextTick(() => {
    questionHeading.value?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  })
}

function isoNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

async function restart() {
  const ok = await confirm({
    title: t('learning.quiz.restartTitle'),
    message: quiz.value?.timerMin
      ? t('learning.quiz.restartMessageTimed')
      : t('learning.quiz.restartMessage'),
    confirmLabel: t('learning.quiz.restartConfirm'),
    cancelLabel: t('common.cancel'),
  })
  if (!ok) return
  // A restart is a new attempt, not a wiped draft: every attempt is kept, and
  // the result page shows them all.
  attemptId.value = null
  await openAttempt()
  startRun(false)
}

/* ---------------- deterministic option order ---------------- */

/**
 * The same question always shuffles the same way, because the seed is its id.
 * A random order per render would move an option out from under the pointer on
 * every re-render; a fixed order would make the answer key guessable from the
 * markup.
 */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function order(q: QuizQuestion): number[] {
  const idx = (q.choices ?? []).map((_, i) => i)
  let seed = hash(q.id)
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j]!, idx[i]!]
  }
  return idx
}

/**
 * What marks each option: 1, 2, 3, 4.
 *
 * These were Thai consonants — ก ข ค ง — which read as a label to a Thai
 * student and as decoration to everybody else. The quiz is taken in four
 * languages, and a Japanese learner was being shown a letter from an alphabet
 * the course never taught them, sitting beside the answer it was meant to
 * identify.
 *
 * Numbers are the one marker every reader of this site already has, and they
 * also match how a teacher says it out loud: "the second one".
 *
 * Derived rather than listed, so a question with more options than anybody
 * planned for still numbers them all instead of running out of letters.
 */
const optionKey = (index: number) => String(index + 1)

/* ---------------- progress ---------------- */

function isAnswered(q: QuizQuestion): boolean {
  if (q.type === 'essay') return !essayNeeded.value || essayText.value.trim().length > 0
  return (answers.value[q.id]?.length ?? 0) > 0
}

const answeredFlags = computed(() => questions.value.map(isAnswered))
const answeredCount = computed(() => answeredFlags.value.filter(Boolean).length)

const current = computed(() => questions.value[index.value] ?? null)
const isLast = computed(() => index.value === questions.value.length - 1)

const questionHeading = ref<HTMLElement | null>(null)
const card = ref<HTMLElement | null>(null)

function goTo(i: number) {
  const next = Math.max(0, Math.min(questions.value.length - 1, i))
  if (next === index.value) return
  index.value = next
  saveDraft(false)
  void nextTick(() => {
    questionHeading.value?.focus({ preventScroll: true })
    if (card.value && card.value.getBoundingClientRect().top < 0) {
      card.value.scrollIntoView({ block: 'start' })
    }
  })
}

function onChoice(q: QuizQuestion, value: number, checked: boolean) {
  const multi = q.type === 'multiple'
  const prev = answers.value[q.id] ?? []
  let next: number[]
  if (multi) next = checked ? [...prev, value].sort((a, b) => a - b) : prev.filter((v) => v !== value)
  else next = checked ? [value] : []
  if (next.length) answers.value = { ...answers.value, [q.id]: next }
  else {
    const copy = { ...answers.value }
    delete copy[q.id]
    answers.value = copy
  }
  saveDraft(true)
}

function onEssayInput() {
  if (essayError.value && essayText.value.trim()) essayError.value = ''
  if (screen.value === 'run') saveDraft(false)
  else saveEssayDraft()
}

/* ---------------- timer ---------------- */

const left = ref(0)
let timerId = 0

function startTimer() {
  stopTimer()
  if (!deadline.value) return
  tickTimer()
  timerId = window.setInterval(tickTimer, 1000)
}

function stopTimer() {
  clearInterval(timerId)
  timerId = 0
}

let warnedOneMinute = false

function tickTimer() {
  if (!deadline.value) return
  left.value = Math.max(0, Math.round((deadline.value - Date.now()) / 1000))
  if (left.value <= 60 && left.value > 0 && !warnedOneMinute) {
    warnedOneMinute = true
    toast(t('learning.quiz.oneMinuteLeft'), { type: 'error' })
  }
  if (left.value <= 0) {
    stopTimer()
    void doSubmit(true)
  }
}

/* ---------------- submit ---------------- */

const unansweredIndexes = computed(() =>
  answeredFlags.value.map((ok, i) => (ok ? -1 : i)).filter((i) => i >= 0),
)

async function requestSubmit() {
  if (essayNeeded.value && !essayText.value.trim()) {
    if (index.value !== essayIndex.value) index.value = essayIndex.value
    essayError.value = t('learning.quiz.essayRequired')
    toast(t('learning.quiz.essayRequired'), { type: 'error' })
    void nextTick(() => document.querySelector<HTMLElement>('#qz-essay')?.focus())
    return
  }
  const un = unansweredIndexes.value
  const ok = await confirm({
    title: t('learning.quiz.submitTitle'),
    message:
      (un.length
        ? t('learning.quiz.submitSomeMissing', {
            n: un.length,
            list: un.map((i) => i + 1).join(', '),
          })
        : t('learning.quiz.submitAllDone', { n: questions.value.length })) +
      ' ' +
      (essayNeeded.value
        ? t('learning.quiz.submitAfterWithEssay')
        : t('learning.quiz.submitAfter')),
    confirmLabel: t('learning.quiz.submit'),
    cancelLabel: un.length ? t('learning.quiz.backToAnswer') : t('learning.quiz.reviewAgain'),
  })
  if (ok) void doSubmit(false)
  else if (un.length) goTo(un[0]!)
}

async function doSubmit(auto: boolean) {
  if (submitting.value) return
  submitting.value = true
  stopTimer()
  clearTimeout(saveTimer)
  // The prototype pauses before committing so the button's loading state reads
  // as work rather than a flicker.
  await new Promise((r) => setTimeout(r, auto ? 1200 : 750))
  if (attemptId.value === null) {
    submitting.value = false
    toast(t('learning.quiz.submitFailed'), { type: 'error' })
    return
  }

  let essaySent = false
  try {
    await api.submitQuiz(attemptId.value, toChoiceIds(answers.value))

    // The written answer goes separately: a teacher reads it, so it is not part
    // of the score and does not fail the submission if it is refused.
    const written = essayQuestion.value
    if (written && essayNeeded.value && essayText.value.trim()) {
      try {
        await api.submitEssay(Number(written.id), { body: essayText.value.trim() })
        essaySent = true
      } catch {
        toast(t('learning.quiz.essaySaveFailed'), { type: 'error' })
      }
    }
  } catch (err) {
    submitting.value = false
    toast(
      err instanceof ApiError ? err.message : t('learning.quiz.submitFailed'),
      { type: 'error' },
    )
    return
  }

  attemptId.value = null
  running.value = false
  void router.replace({
    path: resultPath.value,
    query: { submitted: auto ? 'timeout' : essaySent ? 'all' : 'choice' },
  })
}

/** The saved draft, sent as it stands — offered when the clock ran out while
 *  the tab was closed. */
function submitSavedDraft() {
  loadDraft(draft.value)
  running.value = true
  void doSubmit(true)
}

/* ---------------- essay revision mode ---------------- */

/**
 * The written answer and what the teacher said about it.
 *
 * One written question per quiz in practice, so the first is the one.
 */
const essay = computed(() => essayAnswer.value)
const lastVersion = computed(() =>
  essay.value ? { text: essay.value.body, file: null, v: essay.value.version } : null,
)
const lastReview = computed(() => {
  const reviews = essay.value?.reviews ?? []
  return reviews.length ? reviews[reviews.length - 1]! : null
})

/** The teacher's name comes with the review itself, so there is nobody to look
 *  up — and nobody to get wrong. */
const reviewer = computed(() =>
  lastReview.value?.reviewer ? { name: lastReview.value.reviewer, initials: '', color: 0, photo: null } : null,
)

const originalFile = ref<AttachedFile | null>(null)
let essaySaveTimer = 0
const essayDraftSavedAt = ref<string | null>(null)
const essayDraftSaving = ref(false)

function loadEssayMode() {
  const e = essay.value
  if (!e || e.status !== 'revision') return
  // The last draft they sent, to edit rather than to retype. A local draft of
  // the revision has nowhere to live yet, so what is on screen is what was
  // submitted.
  essayText.value = lastVersion.value?.text ?? ''
  originalFile.value = null
  essayFile.value = null
  essayDraftSavedAt.value = null
}

/**
 * A revision has no draft of its own yet.
 *
 * The choice answers autosave because an attempt exists to hang them on; a
 * revision is one box of text with nothing opened for it until it is sent. The
 * indicator stays quiet rather than claiming a save that is not happening.
 */
function saveEssayDraft() {
  clearTimeout(essaySaveTimer)
  essayDraftSaving.value = false
}

async function submitEssayRevision() {
  const text = essayText.value.trim()
  essayError.value = ''
  if (!text) {
    essayError.value = t('learning.quiz.essayRequiredShort')
    void nextTick(() => document.querySelector<HTMLElement>('#qz-essay')?.focus())
    return
  }
  const prev = lastVersion.value
  const same =
    !!prev &&
    prev.text.trim() === text &&
    JSON.stringify(prev.file ?? null) === JSON.stringify(essayFile.value ?? null)
  const ok = await confirm({
    title: t('learning.quiz.resubmitTitle'),
    message:
      (same ? `${t('learning.quiz.resubmitSame')} ` : '') + t('learning.quiz.resubmitMessage'),
    confirmLabel: t('learning.quiz.submit'),
    cancelLabel: t('learning.quiz.backToEdit'),
  })
  if (!ok) return
  const written = essayQuestion.value
  if (!written) return

  submitting.value = true
  try {
    await api.submitEssay(Number(written.id), { body: text })
  } catch (err) {
    submitting.value = false
    toast(
      err instanceof ApiError ? err.message : t('learning.quiz.resubmitFailed'),
      { type: 'error' },
    )
    return
  }
  submitting.value = false
  void router.replace({ path: resultPath.value, query: { submitted: 'essay' } })
}

watch(
  () => `${id.value}|${essayMode.value}|${screen.value}`,
  () => {
    if (screen.value === 'essay') loadEssayMode()
  },
  { immediate: true },
)

/* ---------------- intro copy ---------------- */

const rules = computed(() => {
  const list: [string, string][] = [
    ['refresh', t('learning.quiz.rule1')],
    ['check', t('learning.quiz.rule2')],
    ['pen', t('learning.quiz.rule3')],
    ['history', t('learning.quiz.rule4')],
    ['badge-check', t('learning.quiz.rule5')],
  ]
  if (quiz.value?.timerMin) {
    list.splice(3, 0, ['timer', t('learning.quiz.ruleTimer', { n: quiz.value.timerMin })])
  }
  return list
})

const draftCount = computed(() => {
  const d = draft.value
  if (!d) return 0
  const a = d.answers ?? {}
  let n = choiceQuestions.value.filter((q) => (a[q.id]?.length ?? 0) > 0).length
  if (essayQuestion.value && (essaySubmitted.value || String(d.essayText ?? '').trim())) n++
  return n
})

const draftExpired = computed(() => !!draft.value?.deadline && draft.value.deadline <= Date.now())

/** Choice passed and the essay is in the instructor's hands: there is nothing
 *  left to take, so the intro becomes a summary. */
const latest = computed(() => status.value?.latest ?? null)
const choicePassed = computed(() => Boolean(latest.value?.passed))
/** How many of the choice questions the last attempt got right. */
const lastScore = computed(() => {
  const l = latest.value
  const total = status.value?.quiz.choiceCount ?? 0
  if (!l || !total) return null
  return { correct: Math.round((l.scorePct / 100) * total), total, pct: l.scorePct }
})
const essayStatus = computed(() => essayAnswer.value?.status ?? 'none')

const showSummary = computed(() => choicePassed.value && essayStatus.value !== 'none')

const ESSAY_BADGE: Record<string, [string, string]> = {
  pending: ['pending', 'hourglass'],
  resubmitted: ['resubmitted', 'hourglass'],
  revision: ['revision', 'alert-circle'],
  passed: ['passed', 'check-circle'],
  none: ['info', 'pen'],
}

const essayBadge = computed(() => {
  const key = essayStatus.value
  const [kind, icon] = ESSAY_BADGE[key] ?? ESSAY_BADGE.none!
  return { kind, icon, text: t(`learning.quiz.essayBadge.${key}`) }
})

/**
 * How much of the course is done, for the line above the start button.
 *
 * Fetched rather than computed from the paper: the quiz knows nothing about
 * lessons, and the curriculum endpoint already counts them the same way the
 * room and the account page do.
 */
const progressDone = ref({ done: 0, total: 0 })

watch(
  [id, loggedIn],
  async () => {
    if (!id.value || !loggedIn.value) return
    try {
      const cur = (await api.studyCurriculum(id.value)).data
      progressDone.value = { done: cur.progress.done, total: cur.progress.total }
    } catch {
      progressDone.value = { done: 0, total: 0 }
    }
  },
  { immediate: true },
)

/* ---------------- chrome ---------------- */

const navSheetOpen = ref(false)

/** `body.has-bottom-bar` is what lifts the toasts clear of the quiz's mobile
 *  bar; the rule reaches for the body element, which a route's bodyClass does
 *  not. */
const syncBottomBar = useBodyClass('has-bottom-bar', () => screen.value === 'run')
watch(screen, () => syncBottomBar())

onMounted(() => {
  if (screen.value === 'run') startTimer()
})

onBeforeUnmount(() => {
  stopTimer()
  clearTimeout(saveTimer)
  clearTimeout(essaySaveTimer)
  if (running.value && !submitting.value) saveDraft(true)
})

/** Somebody without the course, offered the only thing that would get them in. */
function runAction(action: string, courseId?: string) {
  const cid = courseId ?? id.value
  if (action === 'buy' || action === 'enroll-free') {
    void router.push({ path: path('/checkout'), query: { items: cid } })
  } else {
    void router.push(path(`/courses/${cid}`))
  }
}

const lockActions = computed(() =>
  [view.value?.primary, view.value?.secondary].filter((a) => a && !a.disabled),
)
</script>

<template>
  <CompactHeader
    height-var="--qz-hdr"
    :back-to="course ? learnPath : path('/courses')"
    :back-label="course ? t('learning.header.backToRoom') : t('course.viewAllCourses')"
    :title="quiz ? quiz.title : t('learning.quiz.title')"
    :sub="course ? course.title : ''"
  />

  <div class="qz-root">
    <div id="qz-app">
      <!-- No such quiz -->
      <div v-if="screen === 'missing'" class="container qz-wrap">
        <div class="state-box">
          <div class="state-ico"><AppIcon name="search" /></div>
          <h3>{{ t('learning.quiz.missingTitle') }}</h3>
          <p>{{ t('learning.quiz.missingText') }}</p>
          <div class="state-actions">
            <RouterLink class="btn btn--primary" :to="path('/courses')">
              <AppIcon name="search" />{{ t('course.viewAllCourses') }}
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Signed out -->
      <div v-else-if="screen === 'gate'" class="container qz-wrap">
        <div class="state-box state-box--plain" style="padding: 56px 24px">
          <div class="state-ico"><AppIcon name="lock" /></div>
          <h3>{{ t('learning.quiz.gateTitle') }}</h3>
          <p>{{ t('learning.quiz.gateText') }}</p>
          <!-- Signing in is not wired up yet, so these stay inert. -->
          <div class="state-actions">
            <button type="button" class="btn btn--primary">
              <AppIcon name="log-in" />{{ t('common.login') }}
            </button>
            <button type="button" class="btn btn--secondary">{{ t('common.register') }}</button>
          </div>
        </div>
      </div>

      <!-- No entitlement -->
      <div v-else-if="screen === 'lock'" class="container qz-wrap">
        <div class="state-box state-box--plain qz-lock">
          <div class="state-ico">
            <AppIcon
              :name="
                access.reason === 'ended'
                  ? 'ban'
                  : access.reason === 'expired' || access.reason === 'pkg-expired'
                    ? 'hourglass'
                    : 'lock'
              "
            />
          </div>
          <h1 class="qz-lock-h">{{ view?.lock?.title ?? t('learning.quiz.lockTitle') }}</h1>
          <p>{{ view?.lock?.text || t('learning.quiz.lockText') }}</p>
          <div class="state-actions" data-cta-primary>
            <CtaButton
              v-for="(a, i) in lockActions"
              :key="i"
              :action="a"
              :course-id="id"
              @run="runAction"
            />
            <RouterLink
              v-if="!lockActions.length"
              class="btn btn--secondary"
              :to="path(`/courses/${id}`)"
            >
              {{ t('learning.quiz.backToCourse') }}
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Intro -->
      <div v-else-if="screen === 'intro' && course && quiz" class="container qz-wrap">
        <section class="qz-intro-card" aria-labelledby="qz-h">
          <div class="qz-intro-main">
            <p class="eyebrow">{{ t('learning.quiz.eyebrow') }}</p>
            <h1 class="qz-h1" id="qz-h">{{ quiz.title }}</h1>
            <p class="qz-course"><AppIcon name="book-open" />{{ course.title }}</p>

            <div class="qz-stats">
              <div class="qz-stat">
                <span class="qz-stat-ico"><AppIcon name="list" /></span>
                <div>
                  <b>{{ t('learning.quiz.questionCount', { n: questions.length }) }}</b>
                  <small>
                    {{
                      t('learning.quiz.mix', {
                        choice: choiceQuestions.length,
                        essay: questions.length - choiceQuestions.length,
                      })
                    }}
                  </small>
                </div>
              </div>
              <div class="qz-stat">
                <span class="qz-stat-ico"><AppIcon name="target" /></span>
                <div>
                  <b>{{ t('learning.quiz.atLeastPct', { pct: quiz.passPct }) }}</b>
                  <small>{{ t('learning.quiz.passRule') }}</small>
                </div>
              </div>
              <div v-if="quiz.timerMin" class="qz-stat">
                <span class="qz-stat-ico"><AppIcon name="timer" /></span>
                <div>
                  <b>{{ t('learning.quiz.minutes', { n: quiz.timerMin }) }}</b>
                  <small>{{ t('learning.quiz.timeAllowed') }}</small>
                </div>
              </div>
            </div>

            <div
              v-if="showSummary || latest || draft || progressDone.done < progressDone.total"
              class="qz-notices"
            >
              <div v-if="showSummary" class="qz-summary">
                <div class="qz-summary-badges">
                  <span class="badge badge--lg badge--passed">
                    <AppIcon name="check-circle" />{{ t('learning.quiz.choicePassed') }}
                  </span>
                  <span class="badge badge--lg" :class="`badge--${essayBadge.kind}`">
                    <AppIcon :name="essayBadge.icon" />{{ essayBadge.text }}
                  </span>
                </div>
                <p>{{ t(`learning.quiz.summary.${essayStatus}`) }}</p>
              </div>

              <template v-else>
                <AppNotice
                  v-if="lastScore && !choicePassed"
                  tone="warning"
                  :title="t('learning.quiz.lastFailedTitle')"
                  :text="
                    t('learning.quiz.lastFailedText', {
                      correct: lastScore.correct,
                      total: lastScore.total,
                      pct: quiz.passPct,
                    })
                  "
                />
                <AppNotice
                  v-if="essay"
                  tone="info"
                  :title="t('learning.quiz.essaySentTitle', { status: essayBadge.text })"
                  :text="t('learning.quiz.essaySentText')"
                />
                <AppNotice
                  v-if="choicePassed && essayStatus === 'none'"
                  tone="info"
                  :title="t('learning.quiz.essayStillNeededTitle')"
                  :text="t('learning.quiz.essayStillNeededText')"
                />
                <AppNotice
                  v-if="draft && draftExpired"
                  tone="warning"
                  :title="t('learning.quiz.draftExpiredTitle')"
                  :text="t('learning.quiz.draftExpiredText')"
                />
                <AppNotice
                  v-else-if="draft"
                  tone="neutral"
                  icon="history"
                  :title="t('learning.quiz.draftTitle')"
                  :text="
                    t('learning.quiz.draftText', {
                      when: relative(draft!.savedAt),
                      done: draftCount,
                      total: questions.length,
                    })
                  "
                />
              </template>

              <AppNotice
                v-if="progressDone.done < progressDone.total"
                tone="info"
                icon="book-open"
                :title="
                  t('learning.quiz.lessonsLeftTitle', {
                    done: progressDone.done,
                    total: progressDone.total,
                  })
                "
                :text="t('learning.quiz.lessonsLeftText')"
              >
                <template #actions>
                  <RouterLink class="btn btn--secondary btn--sm" :to="learnPath">
                    <AppIcon name="play" />{{ t('learning.quiz.keepLearning') }}
                  </RouterLink>
                </template>
              </AppNotice>
            </div>

            <div class="qz-intro-actions">
              <template v-if="showSummary">
                <RouterLink
                  v-if="essayStatus === 'revision'"
                  class="btn btn--primary btn--lg"
                  :to="`${path(`/quiz/${id}`)}?mode=essay`"
                  data-cta-primary
                >
                  <AppIcon name="pen" />{{ t('learning.quiz.editEssay') }}
                </RouterLink>
                <RouterLink
                  class="btn btn--lg"
                  :class="essayStatus === 'revision' ? 'btn--secondary' : 'btn--primary'"
                  :to="resultPath"
                  :data-cta-primary="essayStatus === 'revision' ? undefined : ''"
                >
                  <AppIcon v-if="essayStatus !== 'revision'" name="badge-check" />{{
                    t('learning.quizCard.result')
                  }}
                </RouterLink>
              </template>

              <template v-else-if="draft && draftExpired">
                <button
                  type="button"
                  class="btn btn--primary btn--lg"
                  data-cta-primary
                  @click="submitSavedDraft"
                >
                  <AppIcon name="send" />{{ t('learning.quiz.submitSaved') }}
                </button>
                <button type="button" class="btn btn--secondary btn--lg" @click="restart">
                  <AppIcon name="rotate-ccw" />{{ t('learning.quiz.restartConfirm') }}
                </button>
              </template>

              <template v-else-if="draft">
                <button
                  type="button"
                  class="btn btn--primary btn--lg"
                  data-cta-primary
                  @click="beginRun(true)"
                >
                  <AppIcon name="play" />{{ t('learning.quiz.resume') }}
                </button>
                <button type="button" class="btn btn--secondary btn--lg" @click="restart">
                  <AppIcon name="rotate-ccw" />{{ t('learning.quiz.restartConfirm') }}
                </button>
              </template>

              <button
                v-else
                type="button"
                class="btn btn--primary btn--lg"
                data-q="start"
                data-cta-primary
                @click="beginRun(false)"
              >
                <AppIcon name="play" />{{ t('learning.quiz.start') }}
              </button>
            </div>
          </div>

          <aside class="qz-intro-side" :aria-label="t('learning.quiz.beforeYouStart')">
            <h2 class="qz-side-h">{{ t('learning.quiz.beforeYouStart') }}</h2>
            <ul class="qz-rules" role="list">
              <li v-for="(r, i) in rules" :key="i">
                <AppIcon :name="r[0]" /><span>{{ r[1] }}</span>
              </li>
            </ul>
          </aside>
        </section>
      </div>

      <!-- Taking it -->
      <template v-else-if="screen === 'run' && course && quiz && current">
        <div class="qz-bar">
          <div class="container qz-bar-in">
            <div class="qz-bar-prog">
              <span class="qz-bar-label" id="qz-prog-label">
                {{ t('learning.quiz.answeredPrefix') }} <b>{{ answeredCount }}</b
                >{{ t('learning.quiz.answeredBarSuffix', { total: questions.length }) }}
              </span>
              <div
                class="qz-bar-track"
                id="qz-prog"
                role="progressbar"
                aria-valuemin="0"
                :aria-valuemax="questions.length"
                aria-labelledby="qz-prog-label"
                :aria-valuenow="answeredCount"
                :aria-valuetext="
                  t('learning.quiz.answeredOf', {
                    done: answeredCount,
                    total: questions.length,
                  })
                "
              >
                <span :style="{ width: `${(answeredCount / questions.length) * 100}%` }" />
              </div>
            </div>
            <span
              class="qz-save"
              :class="{ 'is-saved': !savingDraft && !!savedAt }"
              id="qz-save"
              role="status"
            >
              <template v-if="savingDraft">
                <span class="qz-dot" />{{ t('learning.quiz.saving') }}
              </template>
              <template v-else-if="savedAt">
                <AppIcon name="check-circle" />
                <span>{{ t('learning.quiz.savedAt', { time: hm(savedAt) }) }}</span>
              </template>
            </span>
            <span
              v-if="quiz.timerMin"
              class="qz-timer"
              id="qz-timer"
              role="timer"
              :class="{ 'is-warn': left <= 300 && left > 60, 'is-danger': left <= 60 }"
            >
              <span class="qz-timer-ico"><AppIcon name="timer" /></span>
              <span class="sr-only">{{ t('learning.quiz.timeLeft') }} </span>
              <b>{{ clock(left) }}</b>
            </span>
          </div>
        </div>

        <div class="container qz-wrap qz-run">
          <div class="qz-grid">
            <article ref="card" class="qz-card" id="qz-card" aria-labelledby="qz-qtext">
              <div class="qz-qhead">
                <p class="qz-qnum">
                  {{ t('learning.quiz.questionOf', { n: index + 1, total: questions.length }) }}
                </p>
                <span v-if="current.type === 'essay'" class="badge badge--info">
                  <AppIcon name="pen" />Essay
                </span>
                <span v-else class="badge badge--ce">
                  <AppIcon name="list" />{{ t('learning.quiz.choiceLabel') }}
                </span>
              </div>

              <h2 ref="questionHeading" class="qz-qtext" id="qz-qtext" tabindex="-1">
                {{ current.text }}
              </h2>

              <p v-if="current.type !== 'essay'" class="qz-hint">
                <AppIcon :name="current.type === 'multiple' ? 'check-circle' : 'circle-dot'" />{{
                  current.type === 'multiple'
                    ? t('learning.quiz.hintMulti')
                    : t('learning.quiz.hintSingle')
                }}
              </p>

              <!-- Choice -->
              <fieldset v-if="current.type !== 'essay'" class="qz-choices">
                <legend class="sr-only">
                  {{
                    t('learning.quiz.optionsOf', {
                      n: index + 1,
                      hint:
                        current.type === 'multiple'
                          ? t('learning.quiz.hintMulti')
                          : t('learning.quiz.hintSingle'),
                    })
                  }}
                </legend>
                <label
                  v-for="(ci, k) in order(current)"
                  :key="ci"
                  class="opt-card qz-opt"
                  :for="`qz-${current.id}-${ci}`"
                >
                  <span :class="current.type === 'multiple' ? 'check' : 'radio'">
                    <input
                      :type="current.type === 'multiple' ? 'checkbox' : 'radio'"
                      :id="`qz-${current.id}-${ci}`"
                      :name="`qz-${current.id}`"
                      :value="ci"
                      :checked="(answers[current.id] ?? []).includes(ci)"
                      @change="
                        onChoice(current, ci, ($event.target as HTMLInputElement).checked)
                      "
                    />
                  </span>
                  <span class="oc-body qz-opt-body">
                    <span class="qz-opt-key" aria-hidden="true">{{ optionKey(k) }}</span>
                    <span class="qz-opt-text">{{ current.choices?.[ci] }}</span>
                  </span>
                </label>
              </fieldset>

              <!-- Essay, already submitted: read-only -->
              <div v-else-if="essay && lastVersion" class="qz-ro">
                <div class="qz-ro-head">
                  <span class="badge" :class="`badge--${essayBadge.kind}`">
                    <AppIcon :name="essayBadge.icon" />{{ essayBadge.text }}
                  </span>
                  <span class="qz-ro-time">
                    {{ t('learning.quiz.sentAt', { when: dateTime(essay.submittedAt) })
                    }}{{
                      essay.version > 1
                        ? ` · ${t('learning.quiz.version', { n: essay.version })}`
                        : ''
                    }}
                  </span>
                </div>
                <p class="qz-ro-note">
                  <AppIcon name="info" />
                  <span>
                    {{ t('learning.quiz.readOnlyNote')
                    }}{{ essay.status === 'revision' ? t('learning.quiz.readOnlyRevision') : '' }}
                  </span>
                </p>
                <blockquote class="qz-ro-text">{{ lastVersion.text }}</blockquote>
                <FileChip
                  v-if="lastVersion.file"
                  :file="lastVersion.file"
                  extra-class="qz-chip"
                  download
                />
                <RouterLink
                  v-if="essay.status === 'revision'"
                  class="btn btn--secondary btn--sm qz-ro-edit"
                  :to="`${path(`/quiz/${id}`)}?mode=essay`"
                >
                  <AppIcon name="pen" />{{ t('learning.quiz.editEssay') }}
                </RouterLink>
              </div>

              <!-- Essay, to write -->
              <template v-else>
                <div class="field qz-essay-field" :class="{ 'has-error': !!essayError }">
                  <label class="label" for="qz-essay">
                    {{ t('learning.quiz.yourAnswer') }}
                    <span class="req" aria-hidden="true">*</span>
                    <span class="sr-only">{{ t('learning.quiz.required') }}</span>
                  </label>
                  <textarea
                    v-model="essayText"
                    class="textarea qz-essay-ta"
                    id="qz-essay"
                    name="essay"
                    rows="9"
                    :maxlength="MAX_ESSAY"
                    aria-describedby="qz-essay-help qz-essay-count"
                    :aria-invalid="essayError ? 'true' : undefined"
                    :placeholder="t('learning.quiz.essayPlaceholder')"
                    @input="onEssayInput"
                  />
                  <div class="field-row">
                    <span class="field-help" id="qz-essay-help">{{
                      t('learning.quiz.essayHelp')
                    }}</span>
                    <span
                      class="counter"
                      :class="{
                        'is-over': essayText.length >= MAX_ESSAY,
                        'is-near':
                          essayText.length >= MAX_ESSAY * 0.9 && essayText.length < MAX_ESSAY,
                      }"
                      id="qz-essay-count"
                    >
                      {{ t('learning.quiz.charCount', { n: num(essayText.length), max: num(MAX_ESSAY) }) }}
                    </span>
                  </div>
                  <p v-if="essayError" class="field-error" id="qz-essay-err">
                    <AppIcon name="alert-circle" /><span>{{ essayError }}</span>
                  </p>
                </div>
                <FileAttach v-model="essayFile" id-prefix="qz" />
              </template>

              <div class="qz-qfoot">
                <button
                  v-if="index > 0"
                  type="button"
                  class="btn btn--secondary"
                  :data-go="index - 1"
                  data-k="prev"
                  @click="goTo(index - 1)"
                >
                  <AppIcon name="chevron-left" />{{ t('learning.quiz.previous') }}
                </button>
                <span v-else />
                <button
                  v-if="isLast"
                  type="button"
                  class="btn btn--primary"
                  :class="{ 'is-loading': submitting }"
                  data-submit
                  data-k="card-submit"
                  @click="requestSubmit"
                >
                  <AppIcon name="send" />{{
                    submitting ? t('learning.quiz.sending') : t('learning.quiz.submit')
                  }}
                </button>
                <button
                  v-else
                  type="button"
                  class="btn btn--primary"
                  :data-go="index + 1"
                  data-k="next"
                  @click="goTo(index + 1)"
                >
                  {{ t('learning.quiz.next') }}<AppIcon name="chevron-right" />
                </button>
              </div>
            </article>

            <aside class="qz-nav" aria-labelledby="qz-nav-h">
              <div class="qz-nav-card">
                <h2 class="qz-nav-h" id="qz-nav-h">{{ t('learning.quiz.allQuestions') }}</h2>
                <div id="qz-nav-body">
                  <QuizNavigator
                    :questions="questions"
                    :answered="answeredFlags"
                    :current-index="index"
                    prefix="side"
                    @go="goTo"
                    @submit="requestSubmit"
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>

        <div class="qz-mbar" id="qz-mbar">
          <button
            type="button"
            class="qz-mb-btn"
            :data-go="index - 1"
            data-k="mb-prev"
            :aria-label="t('learning.quiz.previous')"
            :disabled="index === 0"
            @click="goTo(index - 1)"
          >
            <AppIcon name="chevron-left" />
          </button>
          <button
            type="button"
            class="qz-mb-mid"
            data-q="nav-sheet"
            data-k="mb-nav"
            aria-haspopup="dialog"
            @click="navSheetOpen = true"
          >
            <span
              >{{ t('learning.quiz.questionShort') }} <b>{{ index + 1 }}</b>/{{ questions.length }}</span
            >
            <small>
              {{ t('learning.quiz.answeredShort', { n: answeredCount }) }} ·
              {{ t('learning.quiz.seeAll') }}
            </small>
          </button>
          <button
            v-if="isLast"
            type="button"
            class="qz-mb-btn qz-mb-btn--primary"
            data-submit
            data-k="mb-submit"
            :aria-label="t('learning.quiz.submit')"
            @click="requestSubmit"
          >
            <AppIcon name="send" />
          </button>
          <button
            v-else
            type="button"
            class="qz-mb-btn qz-mb-btn--primary"
            :data-go="index + 1"
            data-k="mb-next"
            :aria-label="t('learning.quiz.next')"
            @click="goTo(index + 1)"
          >
            <AppIcon name="chevron-right" />
          </button>
        </div>
      </template>

      <!-- Essay revision (?mode=essay) -->
      <template v-else-if="screen === 'essay' && course && quiz">
        <div
          v-if="!essay || essay.status !== 'revision'"
          class="container qz-wrap"
        >
          <div class="state-box">
            <div class="state-ico"><AppIcon name="pen" /></div>
            <h3>{{ t('learning.quiz.nothingToReviseTitle') }}</h3>
            <p>
              {{
                essay
                  ? t('learning.quiz.nothingToReviseStatus', { status: essayBadge.text })
                  : t('learning.quiz.nothingToReviseNone')
              }}
            </p>
            <div class="state-actions">
              <RouterLink class="btn btn--primary" :to="resultPath">
                <AppIcon name="badge-check" />{{ t('learning.quizCard.result') }}
              </RouterLink>
              <RouterLink class="btn btn--secondary" :to="learnPath">
                {{ t('learning.header.backToRoom') }}
              </RouterLink>
            </div>
          </div>
        </div>

        <div v-else class="container qz-wrap qz-edit">
          <div class="qz-edit-head">
            <p class="eyebrow">{{ t('learning.quiz.editEyebrow') }}</p>
            <h1 class="qz-h1" id="qz-h">{{ quiz.title }}</h1>
            <p class="qz-course"><AppIcon name="book-open" />{{ course.title }}</p>
          </div>

          <div class="qz-edit-grid">
            <section class="qz-feedback" aria-labelledby="qz-fb-h">
              <div class="qz-fb-top">
                <h2 class="qz-fb-h" id="qz-fb-h">
                  <AppIcon name="message-square" />{{ t('learning.result.instructorComment') }}
                </h2>
                <span class="badge badge--revision">
                  <AppIcon name="alert-circle" />{{ t('learning.quiz.essayBadge.revision') }}
                </span>
              </div>
              <div class="qz-fb-who">
                <AppAvatar
                  v-if="reviewer"
                  size="md"
                  :name="reviewer.name"
                  :initials="reviewer.initials"
                  :color="reviewer.color"
                  :photo="reviewer.photo"
                />
                <div>
                  <b>{{ lastReview?.reviewer ?? reviewer?.name }}</b>
                  <small>
                    {{ t('learning.result.reviewedAt', { when: dateTime(lastReview?.reviewedAt) }) }} ·
                    {{ t('learning.quiz.version', { n: lastReview?.version ?? essay.version }) }}
                  </small>
                </div>
              </div>
              <blockquote class="qz-fb-quote">
                {{ lastReview?.comment || t('learning.quiz.genericRevision') }}
              </blockquote>
              <div v-if="lastReview?.attachmentUrl" class="qz-fb-file">
                <span class="qz-fb-label">{{ t('learning.result.instructorFile') }}</span>
                <a class="qz-chip link" :href="lastReview.attachmentUrl" target="_blank" rel="noopener">
                  <AppIcon name="download" />{{ t('learning.result.instructorFile') }}
                </a>
              </div>
              <RouterLink class="link-arrow qz-fb-hist" :to="`${resultPath}#rs-history`">
                {{ t('learning.quiz.seeFullHistory') }}<AppIcon name="arrow-right" />
              </RouterLink>
            </section>

            <section class="qz-edit-card" aria-labelledby="qz-edit-h">
              <form data-essay-form novalidate @submit.prevent="submitEssayRevision">
                <p class="qz-qnum">{{ t('learning.quiz.essayQuestionLabel') }}</p>
                <h2 class="qz-qtext qz-qtext--edit" id="qz-edit-h">
                  {{ essayQuestion?.text }}
                </h2>
                <div class="field qz-essay-field" :class="{ 'has-error': !!essayError }">
                  <div class="field-row">
                    <label class="label" for="qz-essay">
                      {{ t('learning.quiz.revisedAnswer') }}
                      <span class="req" aria-hidden="true">*</span>
                      <span class="sr-only">{{ t('learning.quiz.required') }}</span>
                    </label>
                    <span
                      class="qz-save"
                      :class="{ 'is-saved': !essayDraftSaving && !!essayDraftSavedAt }"
                      id="qz-save"
                      role="status"
                    >
                      <template v-if="essayDraftSaving">
                        <span class="qz-dot" />{{ t('learning.quiz.savingDraft') }}
                      </template>
                      <template v-else-if="essayDraftSavedAt">
                        <AppIcon name="check-circle" />
                        <span>{{
                          t('learning.quiz.savedDraftAt', { time: hm(essayDraftSavedAt) })
                        }}</span>
                      </template>
                    </span>
                  </div>
                  <textarea
                    v-model="essayText"
                    class="textarea qz-essay-ta"
                    id="qz-essay"
                    name="essay"
                    rows="10"
                    :maxlength="MAX_ESSAY"
                    aria-describedby="qz-essay-help qz-essay-count"
                    :aria-invalid="essayError ? 'true' : undefined"
                    @input="onEssayInput"
                  />
                  <div class="field-row">
                    <span class="field-help" id="qz-essay-help">
                      {{ t('learning.quiz.editHelp', { n: essay.version }) }}
                    </span>
                    <span
                      class="counter"
                      :class="{
                        'is-over': essayText.length >= MAX_ESSAY,
                        'is-near':
                          essayText.length >= MAX_ESSAY * 0.9 && essayText.length < MAX_ESSAY,
                      }"
                      id="qz-essay-count"
                    >
                      {{ t('learning.quiz.charCount', { n: num(essayText.length), max: num(MAX_ESSAY) }) }}
                    </span>
                  </div>
                  <p v-if="essayError" class="field-error">
                    <AppIcon name="alert-circle" /><span>{{ essayError }}</span>
                  </p>
                </div>

                <FileAttach v-model="essayFile" id-prefix="qe" :original="originalFile" />

                <div class="qz-edit-actions">
                  <RouterLink class="btn btn--ghost" :to="resultPath">
                    {{ t('common.cancel') }}
                  </RouterLink>
                  <button
                    type="submit"
                    class="btn btn--primary"
                    :class="{ 'is-loading': submitting }"
                    data-cta-primary
                  >
                    <AppIcon name="send" />{{
                      submitting ? t('learning.quiz.sending') : t('learning.quiz.submit')
                    }}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      </template>
    </div>

    <div class="sr-only" id="qz-live" aria-live="assertive" aria-atomic="true" />
  </div>

  <LearningSheet
    v-if="navSheetOpen && quiz"
    :title="t('learning.quiz.allQuestions')"
    :sub="quiz.title"
    size="sm"
    initial-focus=".qz-nb.is-current"
    @close="navSheetOpen = false"
  >
    <div class="qz-sheet-body">
      <QuizNavigator
        :questions="questions"
        :answered="answeredFlags"
        :current-index="index"
        prefix="sheet"
        @go="
          (i) => {
            navSheetOpen = false
            goTo(i)
          }
        "
        @submit="
          () => {
            navSheetOpen = false
            requestSubmit()
          }
        "
      />
    </div>
  </LearningSheet>

  <CommerceConfirm />
</template>
