
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import { clock } from '@/lib/format'
import { call } from './learning'
import type { Course, Lesson, LessonState } from './types'

/**
 * The lesson video.
 *
 * A real `<video>` under the design's own chrome: the element is the clock, so
 * the playhead cannot drift from the picture, and seeking is the browser's job
 * rather than an arithmetic one.
 *
 * Two positions matter, and conflating them is the bug this is written to
 * avoid. `pos` is where the playhead is, which scrubbing moves in both
 * directions. `max` is the furthest point ever reached, which only ever grows,
 * and it alone decides completion: dragging back to the start must not undo
 * having watched the lesson. Which fraction counts as finished is the server's
 * rule, not this component's — it reports, and is told.
 *
 * Reports are throttled to once every five seconds while playing, plus one on
 * pause, on seek-commit, and on unmount, because each is a request.
 */
const props = defineProps<{
  course: Course
  lesson: Lesson
  categoryIcon: string
  categoryPalette: number
  moduleLabel: string
  /** Signed in with access: only then is progress worth recording. */
  canTrack: boolean
  /** No access, watching the free sample. */
  preview: boolean
  /** Signed out, so the sample can offer registration at the end. */
  guest: boolean
  /** The signed media URL. Null while it is being fetched, or when the lesson
   *  has no file uploaded — the poster and its message stand in. */
  src: string | null
  /** Where the playhead starts, in seconds, as the server last recorded it. */
  startAt?: number
  /** How much has ever been watched, 0 to 1, for the seen-bar under the
   *  playhead. */
  watched?: number
}>()

const emit = defineEmits<{
  done: []
  tracked: [fraction: number]
  /** Where the lesson has got to, for the page to save. Seconds, because that
   *  is what the API stores; the fraction is this component's own arithmetic. */
  report: [seconds: number]
  /** Whole seconds only: the notes tab's timestamp button reads this, and it
   *  has no use for a position four times a second. */
  move: [seconds: number]
}>()

const { t } = useI18n()

/**
 * The lesson's length as the catalog recorded it, until the file itself says
 * otherwise. The file is the authority — a lesson whose stated minutes drifted
 * from the upload would otherwise finish early or never.
 */
const measured = ref(0)
const total = computed(() => measured.value || props.lesson.sec || 60)

const start = (() => {
  const at = props.startAt ?? 0
  // Not within three seconds of the end: offering to resume there is offering
  // to watch the credits.
  return at > 0 && at < (props.lesson.sec || Infinity) - 3 ? at : 0
})()

const root = ref<HTMLElement | null>(null)
const timeline = ref<HTMLElement | null>(null)
const media = ref<HTMLVideoElement | null>(null)

const pos = ref(start)
const max = ref(Math.max(start, (props.watched ?? 0) * (props.lesson.sec || 0)))
const state = ref<'paused' | 'playing' | 'ended'>('paused')
const idle = ref(false)
const scrubbing = ref(false)
const tipVisible = ref(false)
const tipPct = ref(0)
const tipText = ref('')
const fullscreen = ref(false)
/** The resume chip is a one-shot hint; the first play or seek retires it. */
const showResume = ref(start > 0)

let dead = false

let lastWrite = 0
let idleTimer = 0
let keyTimer = 0

const posPct = computed(() => `${((pos.value / total.value) * 100).toFixed(3)}%`)
const maxPct = computed(() => `${((max.value / total.value) * 100).toFixed(3)}%`)

let lastWholeSecond = -1

function setPos(v: number) {
  pos.value = Math.max(0, Math.min(total.value, v))
  if (pos.value > max.value) max.value = pos.value
  const whole = Math.floor(pos.value)
  if (whole !== lastWholeSecond) {
    lastWholeSecond = whole
    emit('move', whole)
  }
}

/**
 * Tells the page where the lesson has got to.
 *
 * The playhead, not the furthest point: this is where somebody comes back to,
 * and a student who watched to the end, scrubbed back to re-hear a phrase and
 * then closed the tab wants to land on the phrase.
 *
 * The furthest point is the server's to keep — it only ever grows there, and it
 * is what decides whether the lesson is finished. Sending the playhead and
 * letting the server hold both is what keeps "where I was" and "how much I have
 * seen" from being the same number.
 */
function track() {
  if (!props.canTrack || dead) return
  lastWrite = performance.now()
  emit('tracked', max.value / total.value)
  emit('report', Math.round(pos.value))
}

function wake() {
  idle.value = false
  idleSoon()
}

function idleSoon() {
  clearTimeout(idleTimer)
  if (state.value !== 'playing') return
  idleTimer = window.setTimeout(() => {
    let keyboard = false
    try {
      keyboard = !!root.value?.querySelector(':focus-visible')
    } catch {
      keyboard = false
    }
    if (state.value === 'playing' && !scrubbing.value && !keyboard) idle.value = true
  }, 2800)
}

function play() {
  if (dead || !media.value) return
  if (pos.value >= total.value - 0.25) seek(0, false)
  showResume.value = false
  idleSoon()
  // Autoplay rules and a missing file both land here; neither is worth an
  // error box, because the big play button is still there to press.
  void media.value.play().catch(() => {})
}

function pause() {
  media.value?.pause()
}

function toggle() {
  if (state.value === 'playing') pause()
  else play()
}

function seek(v: number, commit: boolean) {
  showResume.value = false
  const to = Math.max(0, Math.min(total.value, v))
  if (media.value) media.value.currentTime = to
  setPos(to)
  if (state.value === 'ended' && pos.value < total.value) state.value = 'paused'
  if (commit) track()
}

/* ---------------- what the element tells us ---------------- */

function onLoaded() {
  const el = media.value
  if (!el) return
  if (Number.isFinite(el.duration) && el.duration > 0) measured.value = el.duration
  // Picking up where they left it. Done once the file knows its own length, or
  // the browser refuses the seek.
  if (start > 0 && el.currentTime < 0.5) el.currentTime = Math.min(start, total.value - 1)
}

function onTimeUpdate() {
  const el = media.value
  if (!el || dead) return
  setPos(el.currentTime)
  if (state.value === 'playing' && performance.now() - lastWrite >= 5000) track()
}

function onPlaying() {
  state.value = 'playing'
  showResume.value = false
  idleSoon()
  track()
}

function onPause() {
  if (state.value === 'ended') return
  state.value = 'paused'
  wake()
  track()
}

function onEnded() {
  state.value = 'ended'
  setPos(total.value)
  wake()
  track()
}

/** The signed link has expired, the network went, or the file is not there. */
const failed = ref(false)
function onError() {
  failed.value = true
  state.value = 'paused'
  wake()
}

function keySeek(v: number) {
  seek(v, false)
  clearTimeout(keyTimer)
  keyTimer = window.setTimeout(track, 350)
  wake()
}

/* ---------------- fullscreen ---------------- */
function fsElement(): Element | null {
  return document.fullscreenElement ?? null
}

function toggleFullscreen() {
  if (fsElement()) {
    document.exitFullscreen?.()
    return
  }
  root.value?.requestFullscreen?.().catch(() => {
    /* a browser that refuses leaves the player as it was */
  })
}

function onFullscreenChange() {
  fullscreen.value = fsElement() === root.value
  wake()
}

/* ---------------- timeline: click, drag, keyboard ---------------- */
function xFraction(e: PointerEvent): number {
  const r = timeline.value?.getBoundingClientRect()
  if (!r) return 0
  return Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1)))
}

function showTip(e: PointerEvent) {
  const x = xFraction(e)
  tipText.value = clock(x * total.value)
  tipPct.value = x * 100
  tipVisible.value = true
}

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  scrubbing.value = true
  try {
    timeline.value?.setPointerCapture(e.pointerId)
  } catch {
    /* capture is a convenience, not a requirement */
  }
  showTip(e)
  seek(xFraction(e) * total.value, false)
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'mouse' || scrubbing.value) showTip(e)
  if (scrubbing.value) seek(xFraction(e) * total.value, false)
}

function onPointerUp() {
  if (!scrubbing.value) return
  scrubbing.value = false
  tipVisible.value = false
  track()
  idleSoon()
}

function onTimelineKey(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const step: Record<string, number> = {
    ArrowRight: 5,
    ArrowUp: 5,
    ArrowLeft: -5,
    ArrowDown: -5,
    PageUp: 30,
    PageDown: -30,
  }
  if (step[e.key] != null) {
    e.preventDefault()
    keySeek(pos.value + step[e.key]!)
    return
  }
  if (e.key === 'Home') {
    e.preventDefault()
    keySeek(0)
    return
  }
  if (e.key === 'End') {
    e.preventDefault()
    keySeek(total.value)
    return
  }
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    toggle()
  }
}

function onRootKey(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  if (e.target === timeline.value) return
  if (e.key === 'k' || e.key === 'K') {
    e.preventDefault()
    toggle()
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault()
    toggleFullscreen()
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    keySeek(pos.value + (e.key === 'ArrowRight' ? 5 : -5))
  }
}

function onMediaClick() {
  if (idle.value) wake()
  else toggle()
}

/**
 * Closing the laptop is not navigating away.
 *
 * The lid comes down, the tab is killed, the phone locks — none of those run
 * `onBeforeUnmount`, and without this the last five seconds of writes are the
 * last thing the server heard. Writing once on the way out costs nothing and is
 * the difference between coming back to 25:00 and to 24:55.
 */
function onHidden() {
  if (document.visibilityState === 'hidden') track()
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', track)
  emit('move', Math.floor(pos.value))
})

onBeforeUnmount(() => {
  if (dead) return
  media.value?.pause()
  track()
  dead = true
  clearTimeout(idleTimer)
  clearTimeout(keyTimer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('visibilitychange', onHidden)
  window.removeEventListener('pagehide', track)
  if (fsElement() === root.value) document.exitFullscreen?.()
})

/** The notes tab reads the playhead for its timestamp button, and a timestamp
 *  in a note seeks back to it. */
defineExpose({
  position: () => pos.value,
  total: () => total.value,
  seek: (v: number) => {
    seek(v, true)
    wake()
  },
  flush: () => track(),
  pause,
})
</script>

<template>
  <div
    ref="root"
    class="lp-frame lp-player"
    id="lp-player"
    :class="{ 'is-idle': idle, 'is-scrubbing': scrubbing }"
    :data-state="state"
    role="region"
    :aria-label="t('learning.player.region', { title: props.lesson.title })"
    @keydown="onRootKey"
    @pointermove="wake"
    @focusin="wake"
    @dblclick="toggleFullscreen"
  >
    <div class="lp-media" data-lp-media @click="onMediaClick">
      <!-- The cover stays underneath: it is what fills the frame before the
           first frame arrives, and all there is for a lesson with no file. -->
      <CourseImage
        class="lp-poster"
        :image="props.course.image"
        :width="1280"
        :height="720"
        :art-icon="props.categoryIcon"
        :art-palette="props.categoryPalette"
        alt=""
        eager
        priority
      />
      <!-- No native controls: the chrome around this is the control surface,
           and two sets would fight. `controlsList` and the blocked context
           menu do not stop a determined download — nothing in a browser can —
           but they stop the accidental one. -->
      <video
        v-if="props.src"
        ref="media"
        class="lp-video"
        :src="props.src"
        playsinline
        preload="metadata"
        controlslist="nodownload noplaybackrate"
        disablepictureinpicture
        @loadedmetadata="onLoaded"
        @timeupdate="onTimeUpdate"
        @playing="onPlaying"
        @pause="onPause"
        @ended="onEnded"
        @error="onError"
        @contextmenu.prevent
      />
      <div class="lp-scrim" />
    </div>
    <span v-if="props.preview" class="lp-tag lp-tag--right">
      <AppIcon name="eye" />{{ t('learning.player.sample') }}
    </span>

    <div class="lp-caption" aria-hidden="true">
      <span class="lp-cap-mod">{{ props.moduleLabel }}</span>
      <b>{{ props.lesson.title }}</b>
      <span v-if="showResume" class="lp-cap-resume">
        <AppIcon name="history" />{{ t('learning.player.resumeFrom', { time: clock(start) }) }}
      </span>
    </div>

    <button
      type="button"
      class="lp-bigplay"
      data-lp="toggle"
      data-cta-primary
      :aria-label="t('learning.player.play')"
      @click="toggle"
    >
      <AppIcon name="play" />
    </button>

    <div v-if="failed" class="lp-fail" role="alert">
      <AppIcon name="alert-circle" />{{ t('learning.player.loadFailed') }}
    </div>

    <div class="lp-end" :hidden="state !== 'ended'">
      <span class="lp-end-ico"><AppIcon name="check-circle" /></span>
      <b>{{ t('learning.player.endTitle') }}</b>
      <p>{{ props.preview ? t('learning.player.endPreview') : t('learning.player.endText') }}</p>
      <div class="lp-end-actions">
        <button
          type="button"
          class="btn btn--white btn--sm"
          data-lp="replay"
          @click="
            seek(0, false);
            play()
          "
        >
          <AppIcon name="rotate-ccw" />{{ t('learning.player.replay') }}
        </button>
        <!-- Signing in is not wired up yet, so this stays inert, as on the
             course page. -->
        <button v-if="props.preview && props.guest" type="button" class="btn btn--primary btn--sm">
          {{ t('common.register') }}
        </button>
      </div>
    </div>

    <div class="lp-controls">
      <div
        ref="timeline"
        class="lp-tl"
        :class="{ 'is-tip': tipVisible }"
        role="slider"
        tabindex="0"
        :aria-label="t('learning.player.timeline')"
        aria-valuemin="0"
        :aria-valuemax="total"
        :aria-valuenow="Math.floor(pos)"
        :aria-valuetext="
          t('learning.player.timeOf', { current: clock(pos), total: clock(total) })
        "
        :style="{ '--pos': posPct, '--max': maxPct, '--tip': `${tipPct}%` }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="scrubbing ? undefined : (tipVisible = false)"
        @keydown="onTimelineKey"
      >
        <div class="lp-tl-track">
          <div class="lp-tl-max" />
          <div class="lp-tl-fill" />
        </div>
        <div class="lp-tl-thumb" />
        <div class="lp-tl-tip" aria-hidden="true">{{ tipText }}</div>
      </div>

      <div class="lp-cbar">
        <button
          type="button"
          class="lp-cbtn"
          data-lp="toggle"
          :aria-label="
            state === 'playing'
              ? t('learning.player.pause')
              : state === 'ended'
                ? t('learning.player.replay')
                : t('learning.player.play')
          "
          @click="toggle"
        >
          <AppIcon :name="state === 'playing' ? 'pause' : 'play'" />
        </button>
        <span class="lp-time">
          <span data-lp-cur>{{ clock(pos) }}</span>
          <span class="lp-time-sep"> / </span>
          <span>{{ clock(total) }}</span>
        </span>
        <span class="lp-cspace" />
        <button
          type="button"
          class="lp-cbtn"
          data-lp="fs"
          :aria-label="fullscreen ? t('learning.player.exitFullscreen') : t('learning.player.fullscreen')"
          @click="toggleFullscreen"
        >
          <AppIcon :name="fullscreen ? 'minimize' : 'maximize'" />
        </button>
      </div>
    </div>
  </div>
</template>
