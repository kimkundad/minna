<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import { data, store } from '@/vendor'

/**
 * The search overlay behind the magnifier in the header.
 *
 * Markup mirrors the prototype's `U.openSearch` — .search-layer >
 * .layer-backdrop + .search-box, with .search-field and .search-results —
 * because components.css already styles exactly those classes.
 *
 * Results are computed from `store.filterCourses`, the same function the
 * catalog page filters with, so a course found here and a course found there
 * are found by one set of rules rather than two that drift apart.
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = store as unknown as Record<string, (...args: any[]) => any>

interface Course {
  id: string
  title: string
  category: string
  instructors: { id: string }[]
  image?: unknown
  [key: string]: unknown
}

const q = ref('')
/** The query the results are built from. It trails `q` by a moment so typing a
 *  word does not rebuild the list once per keystroke. */
const applied = ref('')
let debounce: ReturnType<typeof setTimeout> | undefined

watch(q, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => (applied.value = value.trim()), 120)
})

/** Shown before anything is typed: somewhere to go rather than an empty box. */
const POPULAR = [
  'cardiology',
  'emergency-medicine',
  'feline-medicine',
  'dermatology',
  'imaging-diagnosis',
  'nutrition',
]

const popularCats = computed(() =>
  POPULAR.map((id) => s.category(id)).filter(Boolean) as { id: string; name: string; icon: string }[],
)

const newCourses = computed(() => (s.newCourses() as Course[]).slice(0, 3))

const matchedCourses = computed(() =>
  applied.value ? (s.filterCourses({ q: applied.value }) as Course[]).slice(0, 6) : [],
)

const matchedCats = computed(() => {
  if (!applied.value) return []
  const needle = applied.value.toLowerCase()
  return data.categories
    .filter((c) => `${c.name} ${c.th}`.toLowerCase().includes(needle))
    .slice(0, 4)
})

const noMatches = computed(
  () => Boolean(applied.value) && !matchedCourses.value.length && !matchedCats.value.length,
)

/** "Cardiology · Sarah Mitchell" under each result — one instructor, the same
 *  as the course cards show. */
function subtitle(c: Course): string {
  const cat = s.category(c.category) as { name: string } | undefined
  const lead = s.instructor(c.instructors[0]?.id) as { short: string } | undefined
  return [cat?.name, lead?.short].filter(Boolean).join(' · ')
}

function artFor(c: Course) {
  return s.category(c.category) as { icon?: string; palette?: number } | undefined
}

function submit() {
  const term = q.value.trim()
  emit('close')
  router.push(term ? `${path('/courses')}?q=${encodeURIComponent(term)}` : path('/courses'))
}

/* --- focus trap, Escape, and locking the page behind the overlay --- */
const box = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
let returnTo: HTMLElement | null = null

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || !box.value) return

  const items = Array.from(box.value.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (!items.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement

  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    document.body.classList.toggle('is-locked', isOpen)
    if (isOpen) {
      returnTo = document.activeElement as HTMLElement | null
      q.value = ''
      applied.value = ''
      nextTick(() => input.value?.focus())
    } else {
      returnTo?.focus?.()
      returnTo = null
    }
  },
)

watch(() => route.fullPath, () => emit('close'))

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  clearTimeout(debounce)
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('is-locked')
})
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="search-layer">
      <div class="layer-backdrop" @click="emit('close')" />
      <div
        ref="box"
        class="search-box"
        role="dialog"
        aria-modal="true"
        :aria-label="t('header.searchCourses')"
      >
        <form class="search-field" role="search" @submit.prevent="submit">
          <AppIcon name="search" />
          <label class="sr-only" for="gsearch">{{ t('search.label') }}</label>
          <input
            id="gsearch"
            ref="input"
            v-model="q"
            name="q"
            type="search"
            autocomplete="off"
            :placeholder="t('search.placeholder')"
          />
          <button
            type="button"
            class="icon-btn icon-btn--ghost icon-btn--sm"
            :aria-label="t('search.close')"
            @click="emit('close')"
          >
            <AppIcon name="x" />
          </button>
        </form>

        <div class="search-results" aria-live="polite">
          <!-- Nothing typed yet. -->
          <template v-if="!applied">
            <div class="sr-group">
              <h3>{{ t('search.popularCategories') }}</h3>
              <div class="pill-set" style="padding: 0 8px">
                <RouterLink
                  v-for="c in popularCats"
                  :key="c.id"
                  class="chip"
                  :to="`${path('/courses')}?category=${c.id}`"
                >
                  <AppIcon :name="c.icon" />{{ c.name }}
                </RouterLink>
              </div>
            </div>
            <div class="sr-group">
              <h3>{{ t('footer.newCourses') }}</h3>
              <RouterLink
                v-for="c in newCourses"
                :key="c.id"
                class="sr-item"
                :to="`${path('/courses')}/${c.id}`"
              >
                <CourseImage
                  :image="(c.image as never)"
                  :width="144"
                  :height="88"
                  :art-icon="artFor(c)?.icon"
                  :art-palette="artFor(c)?.palette ?? 0"
                />
                <span style="min-width: 0">
                  <b>{{ c.title }}</b>
                  <small>{{ subtitle(c) }}</small>
                </span>
              </RouterLink>
            </div>
          </template>

          <!-- Something typed. -->
          <template v-else>
            <div v-if="matchedCats.length" class="sr-group">
              <h3>{{ t('common.categories') }}</h3>
              <div class="pill-set" style="padding: 0 8px">
                <RouterLink
                  v-for="c in matchedCats"
                  :key="c.id"
                  class="chip"
                  :to="`${path('/courses')}?category=${c.id}`"
                >
                  <AppIcon :name="c.icon" />{{ c.name }}
                </RouterLink>
              </div>
            </div>

            <div v-if="matchedCourses.length" class="sr-group">
              <h3>{{ t('search.coursesCount', { count: matchedCourses.length }) }}</h3>
              <RouterLink
                v-for="c in matchedCourses"
                :key="c.id"
                class="sr-item"
                :to="`${path('/courses')}/${c.id}`"
              >
                <CourseImage
                  :image="(c.image as never)"
                  :width="144"
                  :height="88"
                  :art-icon="artFor(c)?.icon"
                  :art-palette="artFor(c)?.palette ?? 0"
                />
                <span style="min-width: 0">
                  <b>{{ c.title }}</b>
                  <small>{{ subtitle(c) }}</small>
                </span>
              </RouterLink>
            </div>

            <div v-if="noMatches" class="sr-empty">{{ t('search.empty', { q: applied }) }}</div>

            <div class="sr-group">
              <RouterLink
                class="sr-item"
                :to="`${path('/courses')}?q=${encodeURIComponent(applied)}`"
              >
                <span
                  class="state-ico"
                  style="
                    width: 44px;
                    height: 44px;
                    box-shadow: none;
                    background: var(--brand-primary-soft);
                  "
                >
                  <AppIcon name="search" />
                </span>
                <span>
                  <b>{{ t('search.seeAll', { q: applied }) }}</b>
                  <small>{{ t('search.seeAllHint') }}</small>
                </span>
              </RouterLink>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
