<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import FlagIcon from '@/components/ui/FlagIcon.vue'
import { LOCALES, LOCALE_META, storeLocale, type AppLocale } from '@/locales'

/**
 * The language menu, top right, which is where `language.chooseSub` tells
 * people to look for it after the first-visit picker.
 *
 * Switching rewrites the locale segment of the current URL rather than sending
 * anyone home, so you stay on the page you were reading. The choice is stored
 * too, or the next visit would ask again.
 */
const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const current = computed<AppLocale>(() => {
  const value = String(route.params.locale ?? 'th')
  return (LOCALES as readonly string[]).includes(value) ? (value as AppLocale) : 'th'
})

const open = ref(false)

function choose(locale: AppLocale) {
  open.value = false
  if (locale === current.value) return
  storeLocale(locale)
  // Swap only the first segment; query and hash come along unchanged.
  const rest = route.path.replace(/^\/[^/]+/, '')
  router.push({ path: `/${locale}${rest}`, query: route.query, hash: route.hash })
}

function onDocumentClick(e: MouseEvent) {
  if (!open.value) return
  if ((e.target as HTMLElement | null)?.closest('.locale-anchor')) return
  open.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

watch(() => route.fullPath, () => (open.value = false))

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="menu-anchor locale-anchor">
    <button
      type="button"
      class="icon-btn locale-btn"
      aria-haspopup="true"
      :aria-expanded="open"
      :aria-label="t('language.switch', { name: LOCALE_META[current].name })"
      @click="open = !open"
    >
      <FlagIcon :locale="current" :size="40" />
    </button>

    <div v-if="open" class="menu menu--locale" role="menu">
      <button
        v-for="l in LOCALES"
        :key="l"
        type="button"
        class="menu-item"
        role="menuitemradio"
        :aria-checked="l === current"
        @click="choose(l)"
      >
        <FlagIcon :locale="l" :size="22" />
        {{ LOCALE_META[l].name }}
        <AppIcon v-if="l === current" name="check" :size="16" class="locale-check" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* The flag is the button. .icon-btn draws a white disc and caps every svg it
   holds at 20px, which leaves a flag unreadable, so both go.
   The button keeps its 48px so the row stays on one baseline, but the flag
   sits at 40px inside it: a disc of solid colour reads heavier than a white
   one with a hairline border, so matching them pixel for pixel makes the flag
   look like the tallest thing in the row. */
.locale-btn {
  background: none;
  border: none;
  padding: 0;
}

.locale-btn :deep(.flag-icon) {
  width: 40px;
  height: 40px;
}

.locale-btn:hover :deep(.flag-icon) {
  box-shadow: 0 0 0 2px var(--brand-primary);
}

/* .menu-item lays its icon out at 18px; a flag needs its own size, and the
   check mark has to sit at the far end rather than beside the label. */
.menu--locale {
  min-width: 190px;
}

.menu--locale .menu-item {
  gap: 10px;
}

.menu--locale .menu-item :deep(.flag-icon) {
  width: 22px;
  height: 22px;
}

.locale-check {
  margin-left: auto;
  color: var(--brand-primary-dark);
}
</style>
