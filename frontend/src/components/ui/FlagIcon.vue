<script setup lang="ts">
import type { AppLocale } from '@/locales'

/**
 * A round flag, drawn inline.
 *
 * The emoji flags in LOCALE_META are no good here: Windows ships no flag glyphs,
 * so Chrome and Edge render 🇬🇧 as the letters "GB" on by far the most common
 * platform for this site. These are plain SVG and look the same everywhere.
 *
 * Each is drawn square and clipped to a circle, which is how round flag sets
 * are normally made — the centre of a flag is the part that identifies it.
 *
 * English uses the Union Jack, as agreed, rather than a flag of any one country
 * that speaks it.
 */
defineProps<{ locale: AppLocale; size?: number }>()
</script>

<template>
  <svg
    class="flag-icon"
    :width="size ?? 24"
    :height="size ?? 24"
    viewBox="0 0 32 32"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <clipPath :id="`flag-clip-${locale}`">
        <circle cx="16" cy="16" r="16" />
      </clipPath>
    </defs>
    <g :clip-path="`url(#flag-clip-${locale})`">
      <!-- Thailand: red, white, blue, white, red — the blue band double height. -->
      <template v-if="locale === 'th'">
        <rect width="32" height="32" fill="#A51931" />
        <rect y="5.33" width="32" height="21.34" fill="#F4F5F8" />
        <rect y="10.67" width="32" height="10.66" fill="#2D2A4A" />
      </template>

      <!-- English: the Union Jack. -->
      <template v-else-if="locale === 'en'">
        <rect width="32" height="32" fill="#012169" />
        <path d="M0 0 32 32 M32 0 0 32" stroke="#FFF" stroke-width="7" />
        <path d="M0 0 32 32 M32 0 0 32" stroke="#C8102E" stroke-width="2.6" />
        <path d="M16 0v32 M0 16h32" stroke="#FFF" stroke-width="10.6" />
        <path d="M16 0v32 M0 16h32" stroke="#C8102E" stroke-width="6.4" />
      </template>

      <!-- Japan. -->
      <template v-else-if="locale === 'jp'">
        <rect width="32" height="32" fill="#FFF" />
        <circle cx="16" cy="16" r="9.6" fill="#BC002D" />
      </template>

      <!-- Vietnam. -->
      <template v-else>
        <rect width="32" height="32" fill="#DA251D" />
        <path
          d="M16 6.6 18.75 15.05 27.63 15.05 20.44 20.27 23.19 28.72 16 23.5 8.81 28.72 11.56 20.27 4.37 15.05 13.25 15.05Z"
          fill="#FFFF00"
        />
      </template>
    </g>
    <!-- A hairline ring, so a white flag still has an edge on a white header. -->
    <circle cx="16" cy="16" r="15.5" fill="none" stroke="rgba(13,22,24,.18)" />
  </svg>
</template>

<style scoped>
.flag-icon {
  display: block;
  border-radius: 50%;
  flex: none;
}
</style>
