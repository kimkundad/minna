<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RV } from '@/vendor'

/**
 * A course or article image that degrades to generated art rather than a
 * broken one.
 *
 * Two kinds of source appear in the data: a local file (`{ src }`) and a remote
 * photo addressed by id (`{ id, fp }`), which is resized by the CDN and can
 * carry a focal point so a crop keeps the subject in frame.
 *
 * When loading fails — offline, blocked, or a photo that has gone away — the
 * category's own colours and glyph are drawn into an inline SVG, so the slot
 * still reads as that category instead of leaving a hole in the layout.
 */
export interface ImageSource {
  src?: string
  id?: string
  alt?: string
  /** "x,y" focal point, 0-1, used when the CDN crops. */
  fp?: string
}

const props = withDefaults(
  defineProps<{
    image?: ImageSource | null
    /** Overrides image.alt. Empty string marks the image decorative. */
    alt?: string
    width?: number
    height?: number
    /** Lucide glyph drawn into the fallback art. */
    artIcon?: string
    /** Palette index 0-5 used by the fallback gradient. */
    artPalette?: number
    /** `sizes` attribute; when set, a width-descriptor srcset is emitted so
     *  phones can fetch a smaller file. */
    sizes?: string
    /** Skip lazy loading for images above the fold. */
    eager?: boolean
    priority?: boolean
  }>(),
  { width: 640, height: 360, artIcon: 'paw', artPalette: 0 },
)

const PALETTES = [
  ['#006E7A', '#00C2D6'],
  ['#5B3CC4', '#7C62D9'],
  ['#B4441B', '#E07B3C'],
  ['#17754A', '#008A99'],
  ['#18272A', '#005560'],
  ['#9D174D', '#D44C8C'],
]

/**
 * The fixture data stores local files as bare relative paths ("assets/img/x.png").
 * A browser resolves those against the current route, so the same card that
 * works at /th/courses asks for /th/account/assets/img/x.png one level deeper
 * and gets the SPA shell back. Anchor them at the root.
 */
function resolveLocal(src: string): string {
  return src.startsWith('assets/') ? `/${src}` : src
}

function photo(width: number, height: number): string {
  const img = props.image
  if (!img) return ''
  if (img.src) return resolveLocal(img.src)
  if (!img.id) return ''

  const crop = img.fp
    ? `&crop=focalpoint&fp-x=${img.fp.split(',')[0]}&fp-y=${img.fp.split(',')[1]}`
    : '&crop=entropy'
  return `https://images.unsplash.com/${img.id}?auto=format&fit=crop&w=${width}&h=${height}&q=70${crop}`
}

const failed = ref(false)
const baseSrc = computed(() => photo(props.width, props.height))

/** A local file exists at one size only, so claiming a srcset would just make
 *  the browser fetch the same bytes under a different name. */
const srcset = computed(() => {
  if (failed.value || props.image?.src || !props.image?.id) return undefined
  if (props.sizes) {
    return [0.5, 0.8, 1, 1.5]
      .map((k) => {
        const w = Math.round(props.width * k)
        return `${photo(w, Math.round(props.height * k))} ${w}w`
      })
      .join(', ')
  }
  return `${baseSrc.value} 1x, ${photo(Math.round(props.width * 1.8), Math.round(props.height * 1.8))} 2x`
})

function buildArt(): string {
  const [from, to] = PALETTES[props.artPalette] ?? PALETTES[0]!
  const w = props.width
  const h = props.height
  const scale = (Math.min(w, h) / 24) * 0.42
  const cx = w / 2 - 12 * scale
  const cy = h / 2 - 12 * scale
  const paths = (RV as unknown as { iconPaths: Record<string, string> }).iconPaths
  const glyph = paths[props.artIcon] ?? paths.paw

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<circle cx="${w * 0.88}" cy="${h * 0.1}" r="${h * 0.45}" fill="#fff" fill-opacity=".08"/>` +
    `<circle cx="${w * 0.1}" cy="${h * 0.95}" r="${h * 0.34}" fill="#fff" fill-opacity=".07"/>` +
    `<g color="#fff" transform="translate(${cx} ${cy}) scale(${scale})" fill="none" stroke="#fff" ` +
    `stroke-opacity=".92" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const currentSrc = ref(baseSrc.value)
watch(baseSrc, (next) => {
  failed.value = false
  currentSrc.value = next
})

function onError() {
  if (failed.value) return
  failed.value = true
  currentSrc.value = buildArt()
}

const altText = computed(() => props.alt ?? props.image?.alt ?? '')
</script>

<template>
  <img
    :src="currentSrc"
    :srcset="srcset"
    :sizes="srcset && sizes ? sizes : undefined"
    :width="width"
    :height="height"
    :alt="altText"
    :class="{ 'is-fallback': failed }"
    :loading="eager ? undefined : 'lazy'"
    :fetchpriority="eager && priority ? 'high' : undefined"
    decoding="async"
    :data-art-icon="artIcon"
    :data-art-pal="artPalette"
    @error="onError"
  />
</template>
