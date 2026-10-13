
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import type { Course, Lesson } from './types'

/**
 * The document lesson: a cover that opens into a four-page mock reader.
 *
 * Opening it starts a three-second timer, and the lesson is recorded as
 * finished when that elapses — the rule the prototype uses for a PDF, where
 * there is no playhead to measure 90% of. Closing the reader cancels it, so
 * flicking the cover open and shut does not count as having read anything.
 */
const props = defineProps<{
  course: Course
  lesson: Lesson
  /** Signed in with access: only then is progress worth recording. */
  canTrack: boolean
  /** The signed PDF, or null while it is being fetched. Without one the reader
   *  draws the design's own blank sheets, which is all the prototype ever had. */
  src: string | null
  /** Whether the server already counts this lesson as read. */
  read?: boolean
}>()

const emit = defineEmits<{
  done: []
  /** Opened for long enough to count. The page tells the API; this component
   *  does not decide what finished means. */
  read: []
}>()

const { t } = useI18n()

const PAGES = 4
/** The widths the prototype draws its placeholder lines at, so a page of mock
 *  text keeps a ragged right edge rather than a suspiciously even one. */
const LINE_WIDTHS = [96, 88, 92, 74, 90, 83, 95, 66, 89, 93, 71, 86, 94, 62]

const root = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const openButton = ref<HTMLElement | null>(null)

const open = ref(false)
const page = ref(1)
const fullscreen = ref(false)
const done = ref(props.read ?? false)
/** '' · 'saving' · 'done' · 'preview' — the little status in the reader bar. */
const status = ref<'' | 'saving' | 'done' | 'preview'>('')

let timer = 0

function lines(count: number, from: number): number[] {
  return Array.from({ length: count }, (_, i) => LINE_WIDTHS[(from + i) % LINE_WIDTHS.length]!)
}

const pages = computed(() =>
  Array.from({ length: PAGES }, (_, i) => {
    const n = i + 1
    return n === 1
      ? { n, first: true as const, lead: lines(4, 0), tail: lines(3, 5) }
      : {
          n,
          first: false as const,
          heading:
            n === 2
              ? t('learning.doc.pageKeyPoints')
              : n === 3
                ? t('learning.doc.pageExamples')
                : t('learning.doc.pageSummary'),
          lead: lines(6, n * 2),
          box: lines(2, n),
          tail: lines(5, n * 3),
        }
  }),
)

function openDoc() {
  open.value = true
  requestAnimationFrame(() => scroller.value?.focus({ preventScroll: true }))
  if (!props.canTrack) {
    status.value = 'preview'
    return
  }
  if (done.value) {
    status.value = 'done'
    return
  }
  status.value = 'saving'
  clearTimeout(timer)
  // Three seconds of having it open. A document has no running time, so there
  // is nothing to measure — this is the smallest gesture that is not an
  // accidental click.
  timer = window.setTimeout(() => {
    done.value = true
    status.value = 'done'
    emit('read')
    emit('done')
  }, 3000)
}

function closeDoc() {
  clearTimeout(timer)
  if (document.fullscreenElement === root.value) document.exitFullscreen?.()
  open.value = false
  status.value = ''
  requestAnimationFrame(() => openButton.value?.focus({ preventScroll: true }))
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.()
    return
  }
  root.value?.requestFullscreen?.().catch(() => {
    /* a browser that refuses leaves the reader inline */
  })
}

function onFullscreenChange() {
  fullscreen.value = document.fullscreenElement === root.value
}

/** The page counter follows the scroll rather than a pager, because the reader
 *  is one continuous column of sheets. */
function onScroll() {
  const el = scroller.value
  const sheet = el?.querySelector<HTMLElement>('.lp-sheet')
  if (!el || !sheet) return
  const h = sheet.offsetHeight + 20
  page.value = Math.min(PAGES, Math.floor((el.scrollTop + h * 0.45) / h) + 1)
}

onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<template>
  <div ref="root" class="lp-frame lp-doc" id="lp-doc" :data-open="String(open)">
    <div class="lp-doc-cover" :hidden="open">
      <div class="lp-doc-stack" aria-hidden="true">
        <span v-for="i in 3" :key="i" class="lp-mini">
          <i v-for="j in 5" :key="j" />
        </span>
      </div>
      <div class="lp-doc-copy">
        <p class="lp-doc-eyebrow"><AppIcon name="file-text" />{{ t('learning.doc.eyebrow') }}</p>
        <h2 class="lp-doc-title">{{ props.lesson.title }}</h2>
        <p class="lp-doc-meta">{{ t('learning.doc.meta', { pages: PAGES }) }}</p>
        <div class="lp-doc-actions">
          <button
            ref="openButton"
            type="button"
            class="btn btn--primary"
            data-lp-doc="open"
            data-cta-primary
            @click="openDoc"
          >
            <AppIcon name="book-open" />{{ t('learning.doc.open') }}
          </button>
          <a
            v-if="props.src"
            class="btn btn--outline-light"
            :href="props.src"
            target="_blank"
            rel="noopener"
            download
          >
            <AppIcon name="download" />{{ t('learning.doc.download') }}
          </a>
        </div>
        <p class="lp-doc-hint" data-lp-dochint>
          <template v-if="done">
            <AppIcon name="check-circle" />{{ t('learning.doc.hintDone') }}
          </template>
          <template v-else-if="props.canTrack">
            <AppIcon name="info" />{{ t('learning.doc.hintTrack') }}
          </template>
          <template v-else> <AppIcon name="info" />{{ t('learning.doc.hintPreview') }} </template>
        </p>
      </div>
    </div>

    <div class="lp-doc-reader" :hidden="!open">
      <div class="lp-doc-bar">
        <b class="lp-doc-bar-title">{{ props.lesson.title }}</b>
        <span v-if="!props.src" class="lp-doc-page" data-lp-page>
          {{ t('learning.doc.pageOf', { n: page, total: PAGES }) }}
        </span>
        <span class="lp-doc-state" data-lp-docstate role="status">
          <template v-if="status === 'saving'">
            <span class="lp-dot" />{{ t('learning.doc.saving') }}
          </template>
          <template v-else-if="status === 'done'">
            <AppIcon name="check-circle" />{{ t('learning.doc.saved') }}
          </template>
          <template v-else-if="status === 'preview'">
            <AppIcon name="eye" />{{ t('learning.doc.previewMode') }}
          </template>
        </span>
        <a
          class="lp-cbtn"
          href="#download-lesson-pdf"
          data-proto-link
          :aria-label="t('learning.doc.downloadDoc')"
        >
          <AppIcon name="download" />
        </a>
        <button
          type="button"
          class="lp-cbtn"
          data-lp-doc="fs"
          :aria-label="fullscreen ? t('learning.player.exitFullscreen') : t('learning.player.fullscreen')"
          @click="toggleFullscreen"
        >
          <AppIcon :name="fullscreen ? 'minimize' : 'maximize'" />
        </button>
        <button
          type="button"
          class="lp-cbtn"
          data-lp-doc="close"
          :aria-label="t('learning.doc.close')"
          @click="closeDoc"
        >
          <AppIcon name="x" />
        </button>
      </div>

      <!-- The file itself, read in the browser's own PDF viewer. The chrome
           around it stays: the bar, the close button and the full-screen
           toggle are this design's, and the viewer only has to show pages. -->
      <iframe
        v-if="props.src"
        class="lp-doc-file"
        :src="`${props.src}#toolbar=0&navpanes=0`"
        :title="t('learning.doc.content', { title: props.lesson.title })"
      />

      <div
        v-else
        ref="scroller"
        class="lp-doc-scroll"
        tabindex="0"
        role="document"
        :aria-label="t('learning.doc.content', { title: props.lesson.title })"
        @scroll.passive="onScroll"
      >
        <article
          v-for="p in pages"
          :key="p.n"
          class="lp-sheet"
          :aria-label="t('learning.doc.page', { n: p.n })"
        >
          <div class="lp-sheet-head">
            <BrandLogo class="lp-sheet-logo" />
            <span class="lp-sheet-pg">{{ t('learning.doc.pageOf', { n: p.n, total: PAGES }) }}</span>
          </div>

          <template v-if="p.first">
            <p class="lp-sheet-kicker">{{ props.course.title }}</p>
            <h3 class="lp-sheet-title">{{ props.lesson.title }}</h3>
            <span v-for="(w, i) in p.lead" :key="`a${i}`" class="lp-line" :style="`width:${w}%`" />
            <div class="lp-sheet-table" aria-hidden="true">
              <span v-for="i in 15" :key="i" />
            </div>
            <span v-for="(w, i) in p.tail" :key="`b${i}`" class="lp-line" :style="`width:${w}%`" />
          </template>

          <template v-else>
            <p class="lp-sheet-h">{{ p.heading }}</p>
            <span v-for="(w, i) in p.lead" :key="`c${i}`" class="lp-line" :style="`width:${w}%`" />
            <div class="lp-sheet-box">
              <span v-for="(w, i) in p.box" :key="`d${i}`" class="lp-line" :style="`width:${w}%`" />
            </div>
            <span v-for="(w, i) in p.tail" :key="`e${i}`" class="lp-line" :style="`width:${w}%`" />
          </template>

          <p class="lp-sheet-foot">{{ t('learning.doc.foot') }}</p>
        </article>
      </div>
    </div>
  </div>
</template>
