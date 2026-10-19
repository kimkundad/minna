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
      <template v-else-if="locale === 'vn'">
        <rect width="32" height="32" fill="#DA251D" />
        <path
          d="M16 6.6 18.75 15.05 27.63 15.05 20.44 20.27 23.19 28.72 16 23.5 8.81 28.72 11.56 20.27 4.37 15.05 13.25 15.05Z"
          fill="#FFFF00"
        />
      </template>

      <!-- Indonesia: red over white, halves. -->
      <template v-else-if="locale === 'id'">
        <rect width="32" height="32" fill="#CE1126" />
        <rect y="16" width="32" height="16" fill="#FFF" />
      </template>

      <!-- China: the large star, and four small ones turned towards it. -->
      <template v-else-if="locale === 'zh'">
        <rect width="32" height="32" fill="#DE2910" />
        <path
          d="M8 5.2 9.37 9.42 13.8 9.42 10.22 12.03 11.58 16.25 8 13.64 4.42 16.25 5.78 12.03 2.2 9.42 6.63 9.42Z"
          fill="#FFDE00"
        />
        <path d="M16.4 4.2 17 6.05 18.95 6.05 17.37 7.19 17.98 9.04 16.4 7.9 14.82 9.04 15.43 7.19 13.85 6.05 15.8 6.05Z" fill="#FFDE00" />
        <path d="M19.6 8.1 20.2 9.95 22.15 9.95 20.57 11.09 21.18 12.94 19.6 11.8 18.02 12.94 18.63 11.09 17.05 9.95 19 9.95Z" fill="#FFDE00" />
        <path d="M19.6 13.4 20.2 15.25 22.15 15.25 20.57 16.39 21.18 18.24 19.6 17.1 18.02 18.24 18.63 16.39 17.05 15.25 19 15.25Z" fill="#FFDE00" />
        <path d="M16.4 17.2 17 19.05 18.95 19.05 17.37 20.19 17.98 22.04 16.4 20.9 14.82 22.04 15.43 20.19 13.85 19.05 15.8 19.05Z" fill="#FFDE00" />
      </template>

      <!--
        South Korea: the taegeuk, and the four trigrams around it.

        The two halves are drawn over the same S-curve, each naming the three
        arcs in the same direction, so they meet exactly. Drawn as two
        independent swirls they did not: the small arcs curved the wrong way
        against each other, which left a white lens uncovered in the middle of
        the circle and had the red and blue overlap either side of it.

        Rotated 33.69°, the angle of the flag's own diagonal, because that is
        what the dividing line is parallel to. Red sits above it, so the red
        head falls under the upper-left trigram — heaven, three unbroken
        lines, beside the full yang.
      -->
      <template v-else-if="locale === 'ko'">
        <rect width="32" height="32" fill="#FFF" />
        <g transform="rotate(-33.69 16 16)">
          <path
            d="M9.2 16A6.8 6.8 0 0 1 22.8 16A3.4 3.4 0 0 0 16 16A3.4 3.4 0 0 1 9.2 16Z"
            fill="#CD2E3A"
          />
          <path
            d="M9.2 16A6.8 6.8 0 0 0 22.8 16A3.4 3.4 0 0 0 16 16A3.4 3.4 0 0 1 9.2 16Z"
            fill="#0047A0"
          />
        </g>
        <!--
          The four trigrams, each drawn on the right and turned to its corner.
          All four patterns read the same upside down, so turning one past the
          vertical cannot put its lines in the wrong order.
        -->
        <g fill="#000">
          <!-- ☰ geon, heaven: upper left. -->
          <g transform="rotate(-146.31 16 16)">
            <rect x="23.3" y="13.65" width="5.6" height="1.2" />
            <rect x="23.3" y="15.4" width="5.6" height="1.2" />
            <rect x="23.3" y="17.15" width="5.6" height="1.2" />
          </g>
          <!-- ☵ gam, water: upper right. -->
          <g transform="rotate(-33.69 16 16)">
            <rect x="23.3" y="13.65" width="2.4" height="1.2" />
            <rect x="26.5" y="13.65" width="2.4" height="1.2" />
            <rect x="23.3" y="15.4" width="5.6" height="1.2" />
            <rect x="23.3" y="17.15" width="2.4" height="1.2" />
            <rect x="26.5" y="17.15" width="2.4" height="1.2" />
          </g>
          <!-- ☲ ri, fire: lower left. -->
          <g transform="rotate(146.31 16 16)">
            <rect x="23.3" y="13.65" width="5.6" height="1.2" />
            <rect x="23.3" y="15.4" width="2.4" height="1.2" />
            <rect x="26.5" y="15.4" width="2.4" height="1.2" />
            <rect x="23.3" y="17.15" width="5.6" height="1.2" />
          </g>
          <!-- ☷ gon, earth: lower right. -->
          <g transform="rotate(33.69 16 16)">
            <rect x="23.3" y="13.65" width="2.4" height="1.2" />
            <rect x="26.5" y="13.65" width="2.4" height="1.2" />
            <rect x="23.3" y="15.4" width="2.4" height="1.2" />
            <rect x="26.5" y="15.4" width="2.4" height="1.2" />
            <rect x="23.3" y="17.15" width="2.4" height="1.2" />
            <rect x="26.5" y="17.15" width="2.4" height="1.2" />
          </g>
        </g>
      </template>

      <!-- Taiwan: the white sun on blue, in the canton. -->
      <template v-else>
        <rect width="32" height="32" fill="#FE0000" />
        <rect width="18" height="12" fill="#000095" />
        <g fill="#FFF" transform="translate(9 6)">
          <path d="M0 -5.4 1.4 -1.4 5.4 0 1.4 1.4 0 5.4 -1.4 1.4 -5.4 0 -1.4 -1.4Z" />
          <path d="M0 -5.4 1.4 -1.4 5.4 0 1.4 1.4 0 5.4 -1.4 1.4 -5.4 0 -1.4 -1.4Z" transform="rotate(45)" />
          <circle r="2.2" />
        </g>
        <circle cx="9" cy="6" r="1.6" fill="#000095" />
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
