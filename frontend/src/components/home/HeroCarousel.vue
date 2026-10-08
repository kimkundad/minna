<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import { heroSlides, mediaUrl, type PublicHeroSlide } from '@/lib/api'

/**
 * The home carousel.
 *
 * Autoplay is paused whenever someone is looking at it closely — pointer over
 * the hero, keyboard focus inside it, or the tab in the background — so the
 * slide never changes out from under a reader. It does not start at all when
 * the visitor has asked for reduced motion.
 *
 * Only the active slide is reachable: the rest carry `inert` and `aria-hidden`,
 * so tabbing does not wander into copy nobody can see.
 */
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))

const slides = ref<PublicHeroSlide[]>([])
/**
 * Until the first answer comes back there is nothing to show and no way to know
 * whether there will be. The section renders nothing at all rather than a
 * placeholder that collapses a moment later and shoves the page down.
 */
const loaded = ref(false)

async function load() {
  try {
    slides.value = (await heroSlides(locale.value)).data
  } catch {
    // A home page with no carousel is a home page. One stuck on a spinner, or
    // showing an error where the welcome should be, is not.
    slides.value = []
  } finally {
    loaded.value = true
    index.value = 0
    restart()
  }
}

/** The picture, or nothing — a slide may be words alone. */
function imageOf(s: PublicHeroSlide) {
  return s.imagePath ? { src: mediaUrl(s.imagePath), alt: s.imageAlt ?? '' } : null
}

/** Links inside the site go through the router, so a click does not reload the
 *  whole application. Anything else is left to the browser. */
function isInternal(href: string | null): boolean {
  return Boolean(href && href.startsWith('/'))
}

const index = ref(0)
const playing = ref(true)
const hovering = ref(false)
const focused = ref(false)
const dragging = ref(false)
const dragOffset = ref(0)

let timer: ReturnType<typeof setInterval> | null = null
const INTERVAL = 6500

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const trackStyle = computed(() => ({
  transform: dragging.value
    ? `translateX(calc(${-100 * index.value}% + ${dragOffset.value}px))`
    : `translateX(${-100 * index.value}%)`,
}))

function go(next: number, byUser = false) {
  const n = slides.value.length
  if (!n) return
  index.value = (next + n) % n
  if (byUser) restart()
}

function restart() {
  if (timer) clearInterval(timer)
  timer = null
  if (!playing.value) return
  timer = setInterval(() => {
    if (hovering.value || focused.value || document.hidden) return
    go(index.value + 1)
  }, INTERVAL)
}

function togglePlaying() {
  playing.value = !playing.value
  restart()
}

function onKeydown(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.closest('input,textarea')) return
  if (e.key === 'ArrowRight') go(index.value + 1, true)
  if (e.key === 'ArrowLeft') go(index.value - 1, true)
}

/* Swipe, for touch and pen only — a mouse has the arrows. */
let pointerId: number | null = null
let startX = 0
let startY = 0

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse') return
  pointerId = e.pointerId
  startX = e.clientX
  startY = e.clientY
  dragOffset.value = 0
  dragging.value = false
}

function onPointerMove(e: PointerEvent) {
  if (pointerId !== e.pointerId) return
  const dx = e.clientX - startX
  // Only take over once the gesture is clearly horizontal, so a vertical
  // scroll through the page is never hijacked.
  if (!dragging.value && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(e.clientY - startY)) {
    dragging.value = true
  }
  if (dragging.value) dragOffset.value = dx
}

function onPointerUp(e: PointerEvent) {
  if (pointerId !== e.pointerId) return
  pointerId = null
  const dx = dragOffset.value
  const wasDragging = dragging.value
  dragging.value = false
  dragOffset.value = 0
  if (wasDragging && Math.abs(dx) > 50) go(index.value + (dx < 0 ? 1 : -1), true)
}

watch(locale, load)

onMounted(() => {
  if (prefersReducedMotion) playing.value = false
  void load()
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section
    v-if="loaded && slides.length"
    class="hero"
    :class="{ 'is-dragging': dragging }"
    id="hero"
    aria-roledescription="carousel"
    aria-label="ไฮไลต์ Minna"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
    @focusin="focused = true"
    @focusout="(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) focused = false }"
    @keydown="onKeydown"
  >
    <div
      class="hero-viewport"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div
        class="hero-track"
        id="hero-track"
        :style="trackStyle"
        :aria-live="playing ? 'off' : 'polite'"
      >
        <div
          v-for="(s, i) in slides"
          :key="s.id"
          class="hero-slide"
          :class="{ 'is-active': i === index }"
          role="group"
          aria-roledescription="slide"
          :aria-label="`${i + 1} จาก ${slides.length}: ${s.titleA} ${s.titleB ?? ''}`"
          :id="`hero-slide-${s.id}`"
          :aria-hidden="i === index ? undefined : 'true'"
          :inert="i === index ? undefined : true"
        >
          <div class="hero-media">
            <CourseImage
              :image="imageOf(s)"
              :focal="{ x: s.focalX, y: s.focalY }"
              :width="1600"
              :height="1000"
              art-icon="book-open"
              :art-palette="i"
              eager
              :priority="i === 0"
            />
          </div>
          <div class="container hero-inner">
            <div class="hero-copy">
              <p v-if="s.eyebrow" class="eyebrow">{{ s.eyebrow }}</p>
              <component :is="i === 0 ? 'h1' : 'h2'" :class="i === 0 ? undefined : 'h1'">
                {{ s.titleA }}
                <span v-if="s.titleB" class="accent-grad">{{ s.titleB }}</span>
              </component>
              <p v-if="s.subtitle">{{ s.subtitle }}</p>
              <div v-if="s.ctaLabel || s.cta2Label" class="hero-ctas">
                <!-- A button with no link is not rendered at all. The prototype
                     drew one that did nothing when clicked. -->
                <RouterLink
                  v-if="s.ctaLabel && isInternal(s.ctaHref)"
                  class="btn btn--lg btn--primary"
                  :to="s.ctaHref!"
                >
                  {{ s.ctaLabel }}<AppIcon name="arrow-right" />
                </RouterLink>
                <a
                  v-else-if="s.ctaLabel && s.ctaHref"
                  class="btn btn--lg btn--primary"
                  :href="s.ctaHref"
                >
                  {{ s.ctaLabel }}<AppIcon name="arrow-right" />
                </a>

                <RouterLink
                  v-if="s.cta2Label && isInternal(s.cta2Href)"
                  class="btn btn--lg btn--secondary"
                  :to="s.cta2Href!"
                >
                  {{ s.cta2Label }}
                </RouterLink>
                <a
                  v-else-if="s.cta2Label && s.cta2Href"
                  class="btn btn--lg btn--secondary"
                  :href="s.cta2Href"
                >
                  {{ s.cta2Label }}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="hero-controls">
      <div class="container">
        <div class="hero-dots" role="group" aria-label="เลือกสไลด์">
          <button
            v-for="(s, i) in slides"
            :key="s.id"
            type="button"
            class="hero-dot"
            :aria-label="`ไปที่สไลด์ ${i + 1}: ${s.titleA} ${s.titleB ?? ''}`"
            :aria-current="i === index ? 'true' : undefined"
            @click="go(i, true)"
          />
        </div>

        <button
          type="button"
          class="icon-btn icon-btn--sm hero-pause"
          :aria-label="playing ? 'หยุดการเลื่อนอัตโนมัติ' : 'เล่นการเลื่อนอัตโนมัติ'"
          @click="togglePlaying"
        >
          <AppIcon :name="playing ? 'pause' : 'play'" />
        </button>

        <div class="hero-arrows">
          <button
            type="button"
            class="icon-btn"
            aria-label="สไลด์ก่อนหน้า"
            @click="go(index - 1, true)"
          >
            <AppIcon name="chevron-left" />
          </button>
          <button
            type="button"
            class="icon-btn"
            aria-label="สไลด์ถัดไป"
            @click="go(index + 1, true)"
          >
            <AppIcon name="chevron-right" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
