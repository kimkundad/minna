
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import { clock } from '@/lib/format'
import { call } from './learning'
import type { Course, Lesson, LessonState } from './types'

/**
 * The simulated lesson video.
 *
 * There is no media file behind it: the clock is a real one — an interval plus
 * `performance.now()` deltas, so a second of playback is a second even in a
 * background tab — and everything else is the design's own chrome driven by it.
 *
 * Two positions matter, and conflating them is the bug this is written to
 * avoid. `pos` is where the playhead is, which scrubbing moves in both
 * directions. `max` is the furthest point ever reached, which only ever grows,
 * and it alone decides completion: dragging back to the start must not undo
 * having watched the lesson. The store records `max / total`, and
 * `store.trackLesson` marks the lesson done at 0.9 — the 90% rule lives there,
 * not here.
 *
 * Writes are throttled to once every two seconds while playing, plus one on
 * pause, on seek-commit, and on unmount, because every write is a localStorage
 * round trip.
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
}>()

const emit = defineEmits<{
  done: []
  tracked: [fraction: number]
  /** Whole seconds only: the notes tab's timestamp button reads this, and it
   *  has no use for a position four times a second. */
  move: [seconds: number]
}>()

const { t } = useI18n()

const total = computed(() => props.lesson.sec || 60)

const saved = call<LessonState>('lessonState', props.course.id, props.lesson.id)
const start = saved.pos && saved.pos < total.value - 3 ? saved.pos : 0

const root = ref<HTMLElement | null>(null)
const timeline = ref<HTMLElement | null>(null)

const pos = ref(start)
const max = ref(Math.min(total.value, Math.max((saved.f || 0) * total.value, saved.pos || 0)))
const state = ref<'paused' | 'playing' | 'ended'>('paused')
const idle = ref(false)
const scrubbing = ref(false)
const tipVisible = ref(false)
const tipPct = ref(0)
const tipText = ref('')
const fullscreen = ref(false)
/** The resume chip is a one-shot hint; the first play or seek retires it. */
const showResume = ref(start > 0)

/** The fraction the store held at our last write. A lower one later means the
 *  prototype's data was reset underneath this page, so stop writing. */
let savedFraction = saved.f || 0
let dead = false

let interval = 0
let lastTick = 0
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

function track() {
  if (!props.canTrack || dead) return
  const now = call<LessonState>('lessonState', props.course.id, props.lesson.id)
  if (now.f + 0.001 < savedFraction) {
    dead = true
    return
  }
  const r = call<{ justDone: boolean; rec?: { f: number } }>(
    'trackLesson',
    props.course.id,
    props.lesson.id,
    max.value / total.value,
    Math.round(pos.value),
  )
  if (r?.rec) savedFraction = r.rec.f
  emit('tracked', max.value / total.value)
  if (r?.justDone) emit('done')
}

function stopClock() {
  clearInterval(interval)
  interval = 0
}

function tick() {
  if (state.value !== 'playing' || dead) return
  const now = performance.now()
  setPos(pos.value + Math.min(2, Math.max(0, (now - lastTick) / 1000)))
  lastTick = now
  if (pos.value >= total.value) {
    finish()
    return
  }
  if (now - lastWrite >= 2000) {
    lastWrite = now
    track()
  }
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
  if (dead) return
  if (pos.value >= total.value - 0.25) setPos(0)
  showResume.value = false
  state.value = 'playing'
  lastTick = performance.now()
  lastWrite = lastTick
  stopClock()
  interval = window.setInterval(tick, 250)
  idleSoon()
  track()
}

function pause() {
  if (state.value !== 'playing') return
  tick()
  if (state.value !== 'playing') return
  state.value = 'paused'
  stopClock()
  wake()
  track()
}

function finish() {
  state.value = 'ended'
  stopClock()
  setPos(total.value)
  wake()
  track()
}

function toggle() {
  if (state.value === 'playing') pause()
  else play()
}

function seek(v: number, commit: boolean) {
  showResume.value = false
  setPos(v)
  if (state.value === 'ended' && pos.value < total.value) state.value = 'paused'
  if (commit) track()
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

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  emit('move', Math.floor(pos.value))
})

onBeforeUnmount(() => {
  if (dead) return
  if (state.value === 'playing') {
    tick()
    state.value = 'paused'
  }
  stopClock()
  track()
  dead = true
  clearTimeout(idleTimer)
  clearTimeout(keyTimer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
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
      <div class="lp-scrim" />
    </div>

    <span class="lp-tag"><AppIcon name="flask" />{{ t('learning.player.mock') }}</span>
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
