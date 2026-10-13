<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import FlagIcon from '@/components/ui/FlagIcon.vue'
import { awaitingChoice, LOCALES, LOCALE_META, storeLocale, type AppLocale } from '@/locales'
import { useBrandingStore } from '@/stores/branding'

/**
 * The first thing a visitor sees, once.
 *
 * Which language the site is in is not a setting to go and find — it decides
 * whether the next page can be read at all. So it is asked before anything
 * else, in a layer with no way past it: no close button, no Escape, no click
 * outside. There is nothing behind it worth reaching until the question is
 * answered.
 *
 * Asked once. The answer is kept, and every later visit goes straight in; the
 * flag in the header is where somebody changes their mind.
 *
 * Arriving on `/th/courses` is itself an answer — the link said which language
 * it was for — so the gate stays shut and does not interrupt a shared link.
 *
 * Nothing here is translated. A visitor who has not chosen yet is being shown
 * a language they may not read, which is the one screen on the site where the
 * labels have to stand on their own: a flag, a name in English, and the name
 * as that language writes it.
 */
const router = useRouter()
const route = useRoute()
const { locale: current } = useI18n()
const branding = useBrandingStore()

/**
 * Shut when a choice has been made, or when the address already carries one.
 *
 * Read once at mount rather than watched: this closes when somebody picks, and
 * re-evaluating it on every navigation would reopen it for anybody whose
 * browser refuses to store the choice.
 */
const open = ref(false)

const tiles = computed(() =>
  LOCALES.map((code) => ({ code, ...LOCALE_META[code] })),
)

function choose(code: AppLocale): void {
  storeLocale(code)
  current.value = code
  document.documentElement.setAttribute(
    'lang',
    code === 'jp' ? 'ja' : code === 'vn' ? 'vi' : code,
  )
  open.value = false
  document.body.classList.remove('is-locked')

  // Into that language's copy of wherever they were headed. The path under the
  // locale is kept, so a link somebody was sent still lands where it meant to.
  // Built from the list rather than written out, so adding a language does not
  // leave one place still believing there are four.
  const rest = String(route.path).replace(new RegExp(`^/(${LOCALES.join('|')})(?=/|$)`), '')
  void router.replace({ path: `/${code}${rest}`, query: route.query, hash: route.hash })
}

/** Nothing gets past it: no Escape, and the page behind cannot be tabbed into. */
function trap(event: KeyboardEvent): void {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    return
  }
  if (event.key !== 'Tab') return

  const buttons = [...document.querySelectorAll<HTMLElement>('.lg-tile')]
  if (!buttons.length) return
  const first = buttons[0]
  const last = buttons[buttons.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  // Worked out at module load, before the router rewrote the address: `/`
  // redirects to a locale, so judging by the route here would mean the gate
  // never opened on the home page at all.
  if (!awaitingChoice) return

  open.value = true
  document.body.classList.add('is-locked')
  document.addEventListener('keydown', trap)
  void branding.load()
  requestAnimationFrame(() => document.querySelector<HTMLElement>('.lg-tile')?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', trap)
  document.body.classList.remove('is-locked')
})
</script>

<template>
  <div v-if="open" class="lg-gate" role="dialog" aria-modal="true" aria-labelledby="lg-title">
    <!-- The soft arc behind everything. Drawn rather than photographed: it is
         two shapes and a gradient, and a picture of that is a download. -->
    <svg class="lg-sky" viewBox="0 0 1440 520" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="lg-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand-primary-soft)" />
          <stop offset="100%" stop-color="var(--surface-base)" />
        </linearGradient>
      </defs>
      <rect width="1440" height="520" fill="url(#lg-grad)" />
      <path d="M0 300 Q 360 160 760 250 T 1440 190 L1440 520 L0 520 Z" fill="var(--surface-base)" opacity=".55" />
      <path d="M0 380 Q 420 250 820 330 T 1440 280 L1440 520 L0 520 Z" fill="var(--surface-base)" opacity=".8" />
    </svg>

    <div class="lg-inner">
      <h1 id="lg-title" class="lg-title">Choose your language</h1>
      <p class="lg-sub">Pick the language you would like to read the school in.</p>

      <ul class="lg-grid" role="list">
        <li v-for="tile in tiles" :key="tile.code">
          <button type="button" class="lg-tile" @click="choose(tile.code)">
            <span class="lg-ring"><FlagIcon :locale="tile.code" :size="96" /></span>
            <b>{{ tile.name }}</b>
            <!-- The name as that language writes it, under the English one: a
                 visitor scanning for their own language finds it fastest in
                 the script they read. -->
            <small v-if="tile.native !== tile.name">{{ tile.native }}</small>
          </button>
        </li>
      </ul>

      <img v-if="branding.logo" :src="branding.logo" alt="" class="lg-logo" />
      <p class="lg-note">You can change this any time from the flag in the header.</p>
    </div>
  </div>
</template>

<style scoped>
.lg-gate {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  overflow-y: auto;
  padding: 40px 20px;
  background: var(--surface-base);
}
.lg-sky {
  position: absolute;
  inset: 0 0 auto;
  width: 100%;
  height: clamp(320px, 55vh, 520px);
  pointer-events: none;
}
.lg-inner {
  position: relative;
  width: 100%;
  max-width: 980px;
  text-align: center;
}
.lg-title {
  margin: 0 0 10px;
  font-size: clamp(26px, 4.4vw, 40px);
  font-weight: 800;
  color: var(--ink-primary);
}
.lg-sub {
  margin: 0 0 40px;
  font-size: clamp(14px, 1.6vw, 17px);
  color: var(--ink-secondary);
}

.lg-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 28px 40px;
  margin: 0 0 44px;
  padding: 0;
  list-style: none;
}
.lg-tile {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 8px;
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--ink-primary);
}
.lg-tile b { font-size: 16px; font-weight: 700; }
.lg-tile small { font-size: 13.5px; color: var(--ink-secondary); }

/* The white collar around each flag, which is what makes a row of them read
   as a set of buttons rather than as a strip of colour. */
.lg-ring {
  display: grid;
  place-items: center;
  width: 108px;
  height: 108px;
  border-radius: 50%;
  background: var(--surface-base);
  box-shadow: 0 4px 16px rgba(0, 0, 0, .12);
  transition: transform .18s ease, box-shadow .18s ease;
}
.lg-tile:hover .lg-ring,
.lg-tile:focus-visible .lg-ring {
  transform: translateY(-4px);
  box-shadow: 0 10px 26px rgba(0, 0, 0, .18);
}
.lg-tile:focus-visible { outline: none; }
.lg-tile:focus-visible .lg-ring { outline: var(--focus-ring); outline-offset: 4px; }

.lg-logo { display: block; max-width: 220px; margin: 0 auto 18px; }
.lg-note { margin: 0; font-size: 13px; color: var(--ink-muted); }

@media (max-width: 520px) {
  .lg-grid { gap: 22px 28px; }
  .lg-ring { width: 84px; height: 84px; }
  .lg-ring svg { width: 74px; height: 74px; }
}
</style>
