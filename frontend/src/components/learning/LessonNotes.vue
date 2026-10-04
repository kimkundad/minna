
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { clock, num, relative } from '@/lib/format'
import { call, hm, LESSON_ICON, toSec } from './learning'
import LessonGate from './LessonGate.vue'
import type { Course, Lesson, Note } from './types'

/**
 * Notes, kept per lesson and saved as you type.
 *
 * Two things make this more than a textarea. Saving is debounced to 700ms and
 * flushed on unmount, on a lesson change and when the tab is hidden, so a note
 * typed and immediately navigated away from is not lost. And a note can hold
 * `[MM:SS]` timestamps — the button under the field inserts the playhead's
 * current time — which the list below renders as buttons that seek the video
 * back to that moment.
 */
const props = defineProps<{
  course: Course
  lesson: Lesson
  loggedIn: boolean
  /** The playhead, when the current lesson is a video being played. */
  playerPosition: number | null
}>()

const emit = defineEmits<{ changed: []; seek: [lessonId: string, seconds: number] }>()

const { t } = useI18n()

const MAX = 2000

const textarea = ref<HTMLTextAreaElement | null>(null)
const text = ref('')
const savedAt = ref<string | null>(null)
const saving = ref(false)
const notes = ref<Note[]>([])

let timer = 0
/** The lesson the pending save belongs to, which is not always the lesson on
 *  screen by the time the timer fires. */
let pendingLesson: string | null = null

function load() {
  const stored = call<{ text?: string; at?: string } | null>(
    'note',
    props.course.id,
    props.lesson.id,
  )
  text.value = stored?.text ?? ''
  savedAt.value = stored?.at ?? null
  saving.value = false
  refreshList()
}

/** Lessons in curriculum order, so the list reads top to bottom like the
 *  course rather than by whenever each note happened to be edited. */
function refreshList() {
  const order = new Map<string, number>()
  call<Lesson[]>('lessons', props.course).forEach((l, i) => order.set(l.id, i))
  notes.value = props.loggedIn
    ? call<Note[]>('allNotes', props.course.id)
        .filter((n) => String(n.text ?? '').trim().length > 0)
        .sort((a, b) => (order.get(a.lid) ?? 0) - (order.get(b.lid) ?? 0))
    : []
}

function flush() {
  if (!pendingLesson) return
  clearTimeout(timer)
  const lid = pendingLesson
  pendingLesson = null
  const at = call<string | null>('saveNote', props.course.id, lid, text.value)
  if (!at) return
  if (lid === props.lesson.id) {
    savedAt.value = at
    saving.value = false
  }
  refreshList()
  emit('changed')
}

function onInput() {
  saving.value = true
  pendingLesson = props.lesson.id
  clearTimeout(timer)
  timer = window.setTimeout(flush, 700)
}

function insertStamp() {
  const el = textarea.value
  if (!el || props.playerPosition == null) return
  const tag = `[${clock(props.playerPosition)}] `
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const before = el.value.slice(0, start)
  const after = el.value.slice(end)
  const lead = before && !/\s$/.test(before) ? '\n' : ''
  if ((before + lead + tag + after).length > MAX) return
  text.value = before + lead + tag + after
  const caret = (before + lead + tag).length
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(caret, caret)
  })
  onInput()
}

/** Splits a note into plain text and `[MM:SS]` stamps, so the stamps can be
 *  real buttons instead of markup pushed through innerHTML. */
function segments(note: Note): { stamp?: string; text?: string }[] {
  const out: { stamp?: string; text?: string }[] = []
  const re = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(note.text))) {
    if (m.index > last) out.push({ text: note.text.slice(last, m.index) })
    out.push({ stamp: m[1] })
    last = m.index + m[0].length
  }
  if (last < note.text.length) out.push({ text: note.text.slice(last) })
  return out
}

function lessonOf(lid: string): Lesson | null {
  return call<Lesson | null>('lesson', props.course, lid)
}

watch(
  () => `${props.lesson.id}|${props.loggedIn}`,
  () => {
    flush()
    load()
  },
  { immediate: true },
)

function onHide() {
  if (document.hidden) flush()
}
document.addEventListener('visibilitychange', onHide)
window.addEventListener('pagehide', flush)

onBeforeUnmount(() => {
  flush()
  document.removeEventListener('visibilitychange', onHide)
  window.removeEventListener('pagehide', flush)
})
</script>

<template>
  <LessonGate
    v-if="!props.loggedIn"
    :title="t('learning.notes.gateTitle')"
    :text="t('learning.notes.gateText')"
  />

  <div v-else class="lp-notes">
    <div class="field lp-note-field">
      <div class="field-row">
        <label class="label" for="lp-note">
          {{ t('learning.notes.label', { title: props.lesson.title }) }}
        </label>
        <span
          class="lp-note-status"
          :class="{ 'is-saved': !saving && !!savedAt }"
          id="lp-note-status"
          role="status"
        >
          <template v-if="saving"> <span class="lp-dot" />{{ t('learning.notes.saving') }} </template>
          <template v-else-if="savedAt">
            <AppIcon name="check" />{{ t('learning.notes.saved', { time: hm(savedAt) }) }}
          </template>
        </span>
      </div>
      <textarea
        ref="textarea"
        v-model="text"
        class="textarea lp-note-ta"
        id="lp-note"
        rows="5"
        :maxlength="MAX"
        aria-describedby="lp-note-help"
        :placeholder="t('learning.notes.placeholder')"
        @input="onInput"
      />
      <div class="field-row lp-note-tools">
        <button
          v-if="props.playerPosition != null"
          type="button"
          class="btn btn--secondary btn--sm"
          data-lp-stamp
          @click="insertStamp"
        >
          <AppIcon name="clock" />
          <span>{{ t('learning.notes.insertTime', { time: clock(props.playerPosition) }) }}</span>
        </button>
        <span v-else />
        <span class="field-help" id="lp-note-help">
          <span class="counter" id="lp-note-count">{{ num(text.length) }} / {{ num(MAX) }}</span>
        </span>
      </div>
    </div>

    <div class="lp-note-all">
      <h2 class="lp-pan-h">{{ t('learning.notes.allTitle') }}</h2>
      <div id="lp-note-list">
        <p v-if="!notes.length" class="lp-empty">
          <AppIcon name="note" />{{ t('learning.notes.empty') }}
        </p>
        <ul v-else class="lp-notelist" role="list">
          <li
            v-for="n in notes"
            :key="n.lid"
            class="lp-noteitem"
            :class="{ 'is-current': n.lid === props.lesson.id }"
          >
            <div class="lp-noteitem-head">
              <button type="button" class="lp-notelink" @click="emit('seek', n.lid, 0)">
                <AppIcon :name="LESSON_ICON[lessonOf(n.lid)?.type ?? 'video'] ?? 'note'" />{{
                  lessonOf(n.lid)?.title ?? n.lid
                }}
              </button>
              <span class="lp-note-time">
                {{ n.lid === props.lesson.id ? t('learning.notes.thisLesson') : ''
                }}{{ relative(n.at) }}
              </span>
            </div>
            <p class="lp-note-text">
              <template v-for="(seg, i) in segments(n)" :key="i">
                <button
                  v-if="seg.stamp"
                  type="button"
                  class="lp-stamp"
                  :aria-label="t('learning.notes.seekTo', { time: seg.stamp })"
                  @click="emit('seek', n.lid, toSec(seg.stamp))"
                >
                  <AppIcon name="play" />{{ seg.stamp }}
                </button>
                <template v-else>{{ seg.text }}</template>
              </template>
            </p>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
