<script setup lang="ts">
import { ref } from 'vue'
import { RV } from '@/vendor'

/**
 * A course thumbnail that degrades to generated art rather than a broken image.
 *
 * When the file fails to load, the category's own colours and glyph are drawn
 * into an inline SVG data URI, so a missing photo still reads as that category
 * instead of leaving a hole in the grid. The prototype does this with an inline
 * `onerror`; here it is a Vue `@error` handler doing the same work.
 */
const props = withDefaults(
  defineProps<{
    src?: string | null
    alt?: string
    width?: number
    height?: number
    /** Lucide glyph drawn into the fallback art. */
    artIcon?: string
    /** Palette index 0-5 used by the fallback gradient. */
    artPalette?: number
    /** Skip lazy loading for images above the fold. */
    eager?: boolean
    priority?: boolean
  }>(),
  { alt: '', width: 640, height: 360, artIcon: 'paw', artPalette: 0 },
)

const PALETTES = [
  ['#006E7A', '#00C2D6'],
  ['#5B3CC4', '#7C62D9'],
  ['#B4441B', '#E07B3C'],
  ['#17754A', '#008A99'],
  ['#18272A', '#005560'],
  ['#9D174D', '#D44C8C'],
]

const failed = ref(false)
const currentSrc = ref(props.src ?? '')

function buildArt(): string {
  const [from, to] = PALETTES[props.artPalette] ?? PALETTES[0]!
  const w = props.width
  const h = props.height
  const scale = (Math.min(w, h) / 24) * 0.42
  const cx = w / 2 - 12 * scale
  const cy = h / 2 - 12 * scale
  const paths =
    (RV as unknown as { iconPaths: Record<string, string> }).iconPaths[props.artIcon] ??
    (RV as unknown as { iconPaths: Record<string, string> }).iconPaths.paw

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<circle cx="${w * 0.88}" cy="${h * 0.1}" r="${h * 0.45}" fill="#fff" fill-opacity=".08"/>` +
    `<circle cx="${w * 0.1}" cy="${h * 0.95}" r="${h * 0.34}" fill="#fff" fill-opacity=".07"/>` +
    `<g color="#fff" transform="translate(${cx} ${cy}) scale(${scale})" fill="none" stroke="#fff" ` +
    `stroke-opacity=".92" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function onError() {
  if (failed.value) return
  failed.value = true
  currentSrc.value = buildArt()
}
</script>

<template>
  <img
    :src="currentSrc"
    :width="width"
    :height="height"
    :alt="alt"
    :class="{ 'is-fallback': failed }"
    :loading="eager ? undefined : 'lazy'"
    :fetchpriority="eager && priority ? 'high' : undefined"
    decoding="async"
    :data-art-icon="artIcon"
    :data-art-pal="artPalette"
    @error="onError"
  />
</template>
