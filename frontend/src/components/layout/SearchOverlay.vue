<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import { api, mediaUrl, type PublicCourse } from '@/lib/api'
import { useCategoriesStore } from '@/stores/categories'

/**
 * The search overlay behind the magnifier in the header.
 *
 * Markup mirrors the prototype's `U.openSearch` — .search-layer >
 * .layer-backdrop + .search-box, with .search-field and .search-results —
 * because components.css already styles exactly those classes.
 *
 * The courses are searched by the API, not here: the catalog page asks the
 * same endpoint with the same `q`, so a course found in this box and a course
 * found on that page are found by one set of rules rather than two that drift
 * apart. Categories come from the shared store the header's own menu reads, so
 * renaming one cannot leave the old name behind in the search box.
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const categoryStore = useCategoriesStore()

const q = ref('')
/** The query the results are built from. It trails `q` by a moment so typing a
 *  word does not send a request per keystroke. */
const applied = ref('')
let debounce: ReturnType<typeof setTimeout> | undefined

watch(q, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => (applied.value = value.trim()), 200)
})

/**
 * Shown before anything is typed: somewhere to go rather than an empty box.
 *
 * The top level, and only the ones with a course in them — the store already
 * drops the empty ones, because a tile that opens an empty catalog is a dead
 * end. Six, which is what the box has room for.
 */
const popularCats = computed(() => categoryStore.roots.slice(0, 6))

const newCourses = ref<PublicCourse[]>([])
const matchedCourses = ref<PublicCourse[]>([])
const searching = ref(false)

const matchedCats = computed(() => categoryStore.search(applied.value, 4))

const noMatches = computed(
  () =>
    Boolean(applied.value) &&
    !searching.value &&
    !matchedCourses.value.length &&
    !matchedCats.value.length,
)

/**
 * Asking the API, with the answer to the newest question winning.
 *
 * Typing is faster than the network, so two requests can be in flight and come
 * back in the wrong order — which shows the results for a word that is no
 * longer in the box. The token is what makes a stale answer land nowhere.
 */
let token = 0
watch(applied, async (term) => {
  if (!term) {
    matchedCourses.value = []
    searching.value = false
    return
  }
  const mine = ++token
  searching.value = true
  try {
    const res = await api.courses({ q: term, perPage: 6, sort: 'recommended' })
    if (mine !== token) return
    matchedCourses.value = res.data
  } catch {
    if (mine === token) matchedCourses.value = []
  } finally {
    if (mine === token) searching.value = false
  }
})

/** The three most recently published, once per page load. */
async function loadNewest(): Promise<void> {
  if (newCourses.value.length) return
  try {
    newCourses.value = (await api.courses({ perPage: 3, sort: 'newest' })).data
  } catch {
    // The section simply does not appear. The search box still works, which is
    // what somebody opened it for.
  }
}

/** "ภาษาญี่ปุ่น · ครูสมชาย" under each result, as the course cards show. */
function subtitle(c: PublicCourse): string {
  // The short form where a teacher has set one, which is what the cards show.
  const lead = c.instructors[0]
  return [c.categoryName, lead?.short?.trim() || lead?.name].filter(Boolean).join(' · ')
}

/** A real thumbnail where there is one; the generated art where there is not. */
function imageOf(c: PublicCourse) {
  return c.thumbnailPath ? { src: mediaUrl(c.thumbnailPath), alt: c.title } : null
}

/** The glyph the generated art uses — the course's own category, so a card in
 *  here looks like the same course does in the catalog. */
function artFor(c: PublicCourse) {
  const cat = categoryStore.tiles.find((t) => t.id === c.categoryId)
  return { icon: cat?.icon ?? 'book-open', palette: c.categoryId ?? 0 }
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
      // Fetched on first open rather than on mount: this sits in the header of
      // every page, and most visits never open it.
      void categoryStore.load()
      void loadNewest()
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
                :to="`${path('/courses')}/${c.slug}`"
              >
                <CourseImage
                  :image="imageOf(c)"
                  :width="144"
                  :height="88"
                  :art-icon="artFor(c).icon"
                  :art-palette="artFor(c).palette"
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
                :to="`${path('/courses')}/${c.slug}`"
              >
                <CourseImage
                  :image="imageOf(c)"
                  :width="144"
                  :height="88"
                  :art-icon="artFor(c).icon"
                  :art-palette="artFor(c).palette"
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
