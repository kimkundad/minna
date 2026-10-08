<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import FilterGroups, { type FilterGroup } from '@/components/discovery/FilterGroups.vue'
import SkeletonCards from '@/components/discovery/SkeletonCards.vue'
import { api } from '@/lib/api'
import type { CourseFacets, CourseQuery, CourseSort, PublicCategory, PublicCourse } from '@/lib/api'
import { categoryLabel, courseView } from '@/lib/course'
import { num } from '@/lib/format'
import AdsSlot from '@/components/ui/AdsSlot.vue'

/**
 * The course catalog: search, five facet groups with live counts, five sort
 * orders, a grid/list toggle, chips for whatever is on, and all of it in the
 * URL so a filtered view can be linked and reloaded.
 *
 * Filtering, sorting and the counts beside each option all come from one
 * request to `/courses`. That matters for the counts in particular: a facet's
 * count is "how many results if this were the only choice in its own group",
 * which is a question about the whole catalog, and the browser is only ever
 * sent one page of it. Computing them here from `data.length` would print the
 * size of a page and call it a total.
 *
 * The reference's brief skeleton is kept, but it is now the real wait rather
 * than a staged one — and it is held for a moment longer than the response so a
 * fast answer still reads as an answer rather than a flicker.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const CAT_VISIBLE = 8
/** The least time a skeleton stays up, so a 40ms response is not a flash. */
const MIN_SKELETON_MS = 250
const PER_PAGE = 24

/* ---------------- facet definitions ---------------- */

const categories = ref<PublicCategory[]>([])

/**
 * Categories that have courses come first, then the rest A–Z.
 *
 * `courseCount` is the whole catalog's count, not the filtered one, so the
 * order is fixed and does not reshuffle under you as you filter. A
 * sub-category carries its parent's name: four categories are called "สนทนา"
 * and the list would read as four identical checkboxes without it.
 */
const categoryOpts = computed<[string, string][]>(() =>
  categories.value
    .slice()
    .sort(
      (a, b) =>
        b.totalCourseCount - a.totalCourseCount || categoryLabel(a, categories.value).localeCompare(categoryLabel(b, categories.value)),
    )
    .map((c) => [String(c.id), categoryLabel(c, categories.value)] as [string, string]),
)

const groups = computed<FilterGroup[]>(() => [
  { key: 'category', label: t('catalog.groupCategory'), opts: categoryOpts.value },
  {
    key: 'level',
    label: t('catalog.groupLevel'),
    opts: [
      ['beginner', t('catalog.levelBeginner')],
      ['intermediate', t('catalog.levelIntermediate')],
      ['advanced', t('catalog.levelAdvanced')],
    ],
  },
  // What the teaching is delivered in. Minna teaches four languages and a
  // beginner wants the explanation in one they already have.
  {
    key: 'locale',
    label: t('catalog.groupSpoken'),
    opts: [
      ['th', t('spoken.th')],
      ['en', t('spoken.en')],
      ['jp', t('spoken.jp')],
      ['vn', t('spoken.vn')],
    ],
  },
  {
    key: 'duration',
    label: t('catalog.groupDuration'),
    opts: [
      ['le1', t('catalog.durLe1')],
      ['1-3', t('catalog.dur13')],
      ['3-6', t('catalog.dur36')],
      ['gt6', t('catalog.durGt6')],
    ],
  },
  {
    key: 'access',
    label: t('catalog.groupAccess'),
    opts: [
      ['free', t('catalog.accessFree')],
      ['course', t('catalog.accessCourse')],
      ['package', t('catalog.accessPackage')],
    ],
  },
  {
    key: 'price',
    label: t('catalog.groupPrice'),
    opts: [
      ['free', t('catalog.priceFree')],
      ['lt1000', t('catalog.priceLt1000')],
      ['1000-2000', t('catalog.price1000to2000')],
      ['gt2000', t('catalog.priceGt2000')],
    ],
  },
])

/**
 * No CE group. That is the reference project's professional-credit scheme —
 * continuing-education units a vet collects — and Minna awards none, so there
 * is nothing to filter on and no column to filter it by.
 */
const GROUP_KEYS = ['category', 'level', 'locale', 'duration', 'access', 'price'] as const
type GroupKey = (typeof GROUP_KEYS)[number]

/** The sort names the URL uses, and what each one means to the API. */
const SORTS = {
  recommended: 'recommended',
  new: 'newest',
  popular: 'popularity',
  'price-asc': 'price',
  'price-desc': 'price-desc',
} as const
type SortKey = keyof typeof SORTS

const SORT_LABEL: Record<SortKey, string> = {
  recommended: 'catalog.sortRecommended',
  new: 'catalog.sortNew',
  popular: 'catalog.sortPopular',
  'price-asc': 'catalog.sortPriceAsc',
  'price-desc': 'catalog.sortPriceDesc',
}

/* ---------------- state, read from the URL ---------------- */

function emptyFilters(): Record<GroupKey, string[]> {
  return { category: [], level: [], locale: [], duration: [], access: [], price: [] }
}

const VIEW_KEY = 'rv:v1:ui:catalogView'

function storedView(): 'grid' | 'list' | null {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'list' || v === 'grid' ? v : null
  } catch {
    // Private windows throw here; the default view is a fine answer.
    return null
  }
}

const query = ref('')
const filters = ref<Record<GroupKey, string[]>>(emptyFilters())
const sort = ref<SortKey>('recommended')
const view = ref<'grid' | 'list'>('grid')
const loading = ref(true)
const failed = ref(false)
const catOpen = ref(false)
const pinned = ref<Record<string, boolean>>({})

const results = ref<PublicCourse[]>([])
const total = ref(0)
const loadedPages = ref(1)
const facets = ref<CourseFacets | null>(null)

/** Accepts a category by id or by slug, because the home page links in by id
 *  and a hand-written link is likelier to say `?category=japanese-n5`. */
function readUrl(): void {
  const q = route.query
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]) as string | undefined

  query.value = (one('q') ?? '').trim().slice(0, 80)

  const alias: Record<string, string> = {}
  for (const c of categories.value) {
    alias[String(c.id)] = String(c.id)
    alias[c.slug.toLowerCase()] = String(c.id)
  }

  const next = emptyFilters()
  for (const g of groups.value) {
    const raw = one(g.key)
    if (!raw) continue
    const valid = g.opts.map((o) => o[0])
    for (const part of raw.split(',')) {
      let v = part.trim()
      if (g.key === 'category') v = alias[v.toLowerCase()] ?? v
      const key = g.key as GroupKey
      // A category id is only checked against the options once they have
      // loaded; before that it is kept, and the first load validates it.
      const ok = g.key === 'category' ? (categories.value.length ? valid.includes(v) : /^\d+$/.test(v)) : valid.includes(v)
      if (ok && !next[key].includes(v)) next[key].push(v)
    }
  }
  filters.value = next

  const sk = one('sort') as SortKey | undefined
  sort.value = sk && sk in SORTS ? sk : 'recommended'

  const v = one('view')
  view.value = v === 'list' || v === 'grid' ? v : (storedView() ?? 'grid')

  // A linked-to category filter must be visible, even when it sits past the
  // eighth option.
  pinned.value = {}
  for (const id of filters.value.category) pinned.value[id] = true
}

function writeUrl(): void {
  const q: Record<string, string> = {}
  if (query.value) q.q = query.value
  for (const key of GROUP_KEYS) if (filters.value[key].length) q[key] = filters.value[key].join(',')
  if (sort.value !== 'recommended') q.sort = sort.value
  if (view.value === 'list') q.view = 'list'
  void router.replace({ query: q })
}

/* ---------------- loading ---------------- */

/** The URL's filters, as the API's query parameters. */
function params(page = 1): CourseQuery {
  const f = filters.value
  return {
    page,
    perPage: PER_PAGE,
    q: query.value || undefined,
    categoryIds: f.category.map(Number).filter(Number.isFinite),
    levels: f.level as CourseQuery['levels'],
    locales: f.locale as CourseQuery['locales'],
    durations: f.duration as CourseQuery['durations'],
    prices: f.price as CourseQuery['prices'],
    access: f.access as CourseQuery['access'],
    sort: SORTS[sort.value] as CourseSort,
    facets: true,
  }
}

/** Only the newest request may write to the page; an earlier answer arriving
 *  late would otherwise overwrite a later one. */
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

/** The live region stays quiet on arrival — the heading already says how many
 *  courses there are, and announcing it again would interrupt a screen reader
 *  the moment the page opens. It speaks once you change something. */
const announce = ref(false)

async function load(): Promise<void> {
  const mine = ++seq
  loading.value = true
  failed.value = false
  clearTimeout(timer)

  const started = Date.now()
  try {
    const res = await api.courses(params(1))
    if (mine !== seq) return
    results.value = res.data
    total.value = res.meta.total
    facets.value = res.facets ?? null
    loadedPages.value = 1
  } catch {
    if (mine !== seq) return
    failed.value = true
    results.value = []
    total.value = 0
  }

  const left = Math.max(0, MIN_SKELETON_MS - (Date.now() - started))
  timer = setTimeout(() => {
    if (mine === seq) loading.value = false
  }, left)
}

const loadingMore = ref(false)
const hasMore = computed(() => results.value.length < total.value)

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return
  const mine = seq
  loadingMore.value = true
  try {
    const res = await api.courses(params(loadedPages.value + 1))
    if (mine !== seq) return
    results.value = [...results.value, ...res.data]
    total.value = res.meta.total
    loadedPages.value += 1
  } catch {
    // The courses already on screen stay; the button can be pressed again.
  } finally {
    if (mine === seq) loadingMore.value = false
  }
}

function refresh(): void {
  announce.value = true
  writeUrl()
}

onMounted(async () => {
  // Categories first: the URL's `?category=` is read against them, and the
  // filter panel cannot be drawn without them.
  try {
    categories.value = (await api.categories()).data.filter(
      (c) => c.totalCourseCount > 0 || !c.parentId,
    )
  } catch {
    // The rest of the catalog still works; only the category group is empty.
  }
  readUrl()
  await load()
})
onBeforeUnmount(() => clearTimeout(timer))

/**
 * The URL is what the page reads from, not just what it writes to — so a link
 * into a filtered catalog, a reload and a route change all land on the same
 * state.
 *
 * Changing a filter `replace`s the entry rather than pushing one: ticking five
 * boxes should not mean pressing back five times to leave the catalog. The
 * cost is that back does not step through filter states, which is the right
 * trade for a panel somebody clicks through quickly.
 */
watch(
  () => route.fullPath,
  () => {
    if (route.name !== 'courses') return
    readUrl()
    void load()
  },
)

/* ---------------- facet counts ---------------- */

/**
 * How many courses this option would give.
 *
 * Straight from the response: the API counts each option with that one choice
 * standing alone in its own group and every other group left as it is, which
 * is what makes the number a promise about what clicking it does.
 *
 * While a request is in flight the previous answer is left on screen rather
 * than zeroed, so the panel does not blink to nothing between keystrokes.
 */
function countOf(key: string, value: string): number {
  const f = facets.value
  if (!f) return 0
  const group = f[key as keyof CourseFacets]
  if (typeof group !== 'object') return 0
  return (group as Record<string, number>)[value] ?? 0
}

const filterCount = computed(() =>
  GROUP_KEYS.reduce((n, key) => n + filters.value[key].length, 0),
)

const sortNote = computed(() => t(SORT_LABEL[sort.value]))

/* ---------------- interactions ---------------- */

function onFilterChange(key: string, value: string, checked: boolean): void {
  const arr = filters.value[key as GroupKey]
  const i = arr.indexOf(value)
  if (checked && i < 0) arr.push(value)
  if (!checked && i >= 0) arr.splice(i, 1)
  if (key === 'category' && checked) pinned.value[value] = true
  refresh()
}

/** Collapsing the category list keeps whatever is ticked on screen; anything
 *  else goes back behind the button. */
function toggleCategoryList(): void {
  catOpen.value = !catOpen.value
  if (!catOpen.value) {
    pinned.value = {}
    for (const id of filters.value.category) pinned.value[id] = true
  }
}

function clearFilters(): void {
  filters.value = emptyFilters()
  pinned.value = {}
  refresh()
}

function clearQuery(): void {
  query.value = ''
  refresh()
}

function clearEverything(): void {
  query.value = ''
  filters.value = emptyFilters()
  pinned.value = {}
  refresh()
}

function showAll(): void {
  sort.value = 'recommended'
  clearEverything()
}

function removeChip(key: string, value: string): void {
  if (key === 'q') {
    clearQuery()
    return
  }
  const k = key as GroupKey
  filters.value[k] = filters.value[k].filter((v) => v !== value)
  refresh()
}

/** Typing filters as you go, but not on every keystroke. */
let typingTimer: ReturnType<typeof setTimeout> | undefined
function onQueryInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    const next = value.trim().slice(0, 80)
    if (next === query.value) return
    query.value = next
    refresh()
  }, 320)
}

function onQuerySubmit(event: Event): void {
  event.preventDefault()
  clearTimeout(typingTimer)
  const input = (event.target as HTMLFormElement).querySelector<HTMLInputElement>('#cat-q')
  query.value = (input?.value ?? '').trim().slice(0, 80)
  refresh()
}

function onSortChange(event: Event): void {
  sort.value = (event.target as HTMLSelectElement).value as SortKey
  refresh()
}

function setView(next: 'grid' | 'list'): void {
  if (next === view.value) return
  view.value = next
  try {
    localStorage.setItem(VIEW_KEY, next)
  } catch {
    /* the choice still applies for this visit */
  }
  writeUrl()
}

/**
 * The cart and free enrolment both need an account and an API that does not
 * exist yet, so the only action wired up is the one that does: going to
 * checkout with this course.
 */
function runAction(action: string, courseId?: string): void {
  if (!courseId) return
  if (action === 'buy' || action === 'add-cart') {
    void router.push({ path: path('/checkout'), query: { items: courseId } })
  }
}

/* ---------------- derived view data ---------------- */

const cards = computed(() =>
  results.value.map((c) => courseView(c, { locale: locale.value, t, categories: categories.value })),
)

const chips = computed(() => {
  const out: { key: string; value: string; label: string }[] = []
  if (query.value)
    out.push({ key: 'q', value: '', label: t('catalog.chipQuery', { q: query.value }) })
  for (const g of groups.value) {
    for (const v of filters.value[g.key as GroupKey]) {
      const label = g.opts.find((o) => o[0] === v)?.[1] ?? v
      out.push({
        key: g.key,
        value: v,
        label: t('catalog.chipGroup', { group: g.label, value: label }),
      })
    }
  }
  return out
})

/** A category can be real but empty — the home page lists those and links
 *  here, so that deserves its own answer rather than "no match". */
const onlyEmptyCategories = computed(() => {
  if (query.value || !filters.value.category.length) return false
  if (filterCount.value !== filters.value.category.length) return false
  return filters.value.category.every(
    (id) => (categories.value.find((c) => String(c.id) === id)?.totalCourseCount ?? 0) === 0,
  )
})

const emptyCategoryNames = computed(() =>
  filters.value.category
    .map((id) => categoryOpts.value.find((o) => o[0] === id)?.[1] ?? id)
    .join(', '),
)

const firstPage = computed(() => (cards.value.length > 6 ? cards.value.slice(0, 6) : cards.value))
const secondPage = computed(() => (cards.value.length > 6 ? cards.value.slice(6) : []))
const splitAds = computed(() => cards.value.length > 6)

/** The ads block lives between the two halves of a long grid, and below the
 *  results when there is only one half. */
const adsBelow = computed(() => failed.value || loading.value || !splitAds.value)

const cardVariant = computed(() => (view.value === 'list' ? 'list' : 'grid'))
</script>

<template>
  <!-- Page hero: breadcrumb · H1 · description · search -->
  <section class="page-hero cat-hero" aria-labelledby="cat-title">
    <div class="container">
      <nav :aria-label="t('common.breadcrumb')" id="cat-crumbs">
        <ol class="crumbs dc-crumbs">
          <li>
            <RouterLink :to="path('')">{{ t('common.home') }}</RouterLink>
          </li>
          <li>
            <AppIcon name="chevron-right" />
            <span aria-current="page">{{ t('common.courses') }}</span>
          </li>
        </ol>
      </nav>
      <h1 id="cat-title">{{ t('catalog.title') }}</h1>
      <p>{{ t('catalog.lead', { count: categories.length }) }}</p>
      <form
        class="cat-search"
        id="cat-search"
        role="search"
        :action="path('/courses')"
        autocomplete="off"
        @submit="onQuerySubmit"
      >
        <div class="search-field">
          <span class="cat-search-ico" data-icon="search"><AppIcon name="search" /></span>
          <label class="sr-only" for="cat-q">{{ t('catalog.searchLabel') }}</label>
          <input
            id="cat-q"
            name="q"
            type="search"
            enterkeyhint="search"
            :placeholder="t('catalog.searchPlaceholder')"
            aria-describedby="cat-q-help"
            :value="query"
            @input="onQueryInput"
          />
          <button
            type="button"
            class="icon-btn icon-btn--ghost icon-btn--sm cat-q-clear"
            data-q-clear
            :aria-label="t('catalog.clearQuery')"
            :hidden="!query"
            @click="clearQuery"
          >
            <AppIcon name="x" />
          </button>
        </div>
        <p class="sr-only" id="cat-q-help">{{ t('catalog.searchHelp') }}</p>
      </form>
    </div>
  </section>

  <!-- Catalog: filter sidebar + results -->
  <section class="cat-main" aria-labelledby="cat-count">
    <div class="container cat-layout">
      <aside class="cat-side" aria-labelledby="cat-side-h">
        <div class="cat-side-inner">
          <div class="cat-side-head">
            <h2 class="cat-side-title" id="cat-side-h">{{ t('catalog.filtersTitle') }}</h2>
            <button
              type="button"
              class="cat-textbtn"
              data-clear-filters
              :hidden="!filterCount"
              @click="clearFilters"
            >
              {{ t('catalog.clearAllFilters') }}
            </button>
          </div>
          <div class="flt" id="cat-filters">
            <FilterGroups
              id-prefix="sf"
              :groups="groups"
              :selected="filters"
              :count-of="countOf"
              :cat-visible="CAT_VISIBLE"
              :cat-open="catOpen"
              :pinned="pinned"
              @change="onFilterChange"
              @more="toggleCategoryList"
            />
          </div>
        </div>
      </aside>

      <div class="cat-results">
        <div class="cat-bar">
          <div class="cat-bar-row">
            <div class="cat-mbtns">
              <button
                type="button"
                class="btn btn--secondary cat-fbtn"
                data-open-filters
                aria-haspopup="dialog"
                :aria-label="
                  filterCount
                    ? t('catalog.filtersBtnAriaN', { count: filterCount })
                    : t('catalog.filtersBtn')
                "
              >
                <AppIcon name="sliders" />
                <span>{{
                  filterCount
                    ? t('catalog.filtersBtnN', { count: filterCount })
                    : t('catalog.filtersBtn')
                }}</span>
              </button>
              <button
                type="button"
                class="btn btn--secondary cat-sbtn"
                data-open-sort
                aria-haspopup="dialog"
                :aria-label="t('catalog.sortBtnAria', { sort: sortNote })"
              >
                <AppIcon name="sort" />
                <span>{{ t('catalog.sortBtn') }}</span>
              </button>
            </div>

            <h2 class="cat-count" id="cat-count" tabindex="-1">
              <template v-if="failed">{{ t('catalog.countError') }}</template>
              <template v-else-if="loading">{{ t('catalog.countLoading') }}</template>
              <template v-else
                >{{ t('catalog.countFound', { count: num(total) })
                }}<small v-if="query">{{
                  ` ${t('catalog.countFor', { q: query })}`
                }}</small
                ><small class="cat-sortnote">{{
                  ` ${t('catalog.countSortNote', { sort: sortNote })}`
                }}</small></template
              >
            </h2>

            <div class="cat-tools">
              <div class="cat-sort">
                <label for="cat-sort">{{ t('catalog.sortBy') }}</label>
                <select
                  class="select cat-select"
                  id="cat-sort"
                  :value="sort"
                  @change="onSortChange"
                >
                  <option v-for="(_, k) in SORTS" :key="k" :value="k">
                    {{ t(SORT_LABEL[k]) }}
                  </option>
                </select>
              </div>
              <div class="cat-view" role="group" :aria-label="t('catalog.viewGroup')">
                <button
                  type="button"
                  class="cat-view-btn"
                  data-view="grid"
                  :aria-pressed="view === 'grid' ? 'true' : 'false'"
                  :aria-label="t('catalog.viewGrid')"
                  :title="t('catalog.viewGridTitle')"
                  @click="setView('grid')"
                >
                  <AppIcon name="grid" />
                </button>
                <button
                  type="button"
                  class="cat-view-btn"
                  data-view="list"
                  :aria-pressed="view === 'list' ? 'true' : 'false'"
                  :aria-label="t('catalog.viewList')"
                  :title="t('catalog.viewListTitle')"
                  @click="setView('list')"
                >
                  <AppIcon name="list" />
                </button>
              </div>
            </div>
          </div>

          <div class="cat-active" id="cat-active" :hidden="!chips.length">
            <template v-if="chips.length">
              <ul class="cat-chips" role="list" :aria-label="t('catalog.activeFilters')">
                <li v-for="c in chips" :key="`${c.key}:${c.value}`">
                  <button
                    type="button"
                    class="chip cat-chip"
                    :data-remove="c.key"
                    :data-value="c.value"
                    :aria-label="t('catalog.chipRemove', { label: c.label })"
                    @click="removeChip(c.key, c.value)"
                  >
                    <span>{{ c.label }}</span>
                    <span class="chip-x" aria-hidden="true"><AppIcon name="x" /></span>
                  </button>
                </li>
              </ul>
              <button type="button" class="cat-textbtn cat-clearall" data-clear-all @click="clearEverything">
                <AppIcon name="rotate-ccw" />{{ t('catalog.clearAllChips') }}
              </button>
            </template>
          </div>
        </div>

        <p class="sr-only" id="cat-status" aria-live="polite" aria-atomic="true">
          {{ announce && !loading && !failed ? t('catalog.countFound', { count: total }) : '' }}
        </p>

        <div class="cat-list" id="cat-list" :aria-busy="loading ? 'true' : 'false'">
          <!-- Error -->
          <div v-if="failed" class="state-box state-box--error" role="alert">
            <div class="state-ico"><AppIcon name="wifi-off" /></div>
            <h3>{{ t('catalog.errorTitle') }}</h3>
            <p>{{ t('catalog.errorText') }}</p>
            <div class="state-actions">
              <button type="button" class="btn btn--primary" data-retry="catalog" @click="load()">
                <AppIcon name="refresh" />{{ t('catalog.retry') }}
              </button>
            </div>
          </div>

          <!-- Loading -->
          <div
            v-else-if="loading"
            class="cat-grid"
            :class="{ 'is-list': view === 'list' }"
            aria-hidden="true"
          >
            <SkeletonCards :count="view === 'list' ? 3 : 6" />
          </div>

          <!-- No results -->
          <div v-else-if="!cards.length" class="state-box">
            <div class="state-ico">
              <AppIcon :name="onlyEmptyCategories ? 'hourglass' : 'search'" />
            </div>
            <h3>
              {{
                onlyEmptyCategories
                  ? t('catalog.emptyComingTitle', { names: emptyCategoryNames })
                  : t('catalog.emptyTitle')
              }}
            </h3>
            <p>
              {{
                onlyEmptyCategories
                  ? t('catalog.emptyComingText')
                  : t('catalog.emptyText', { count: categories.length })
              }}
            </p>
            <div class="state-actions">
              <button
                v-if="filterCount"
                type="button"
                class="btn btn--primary"
                data-action="cat-clear-filters"
                @click="clearFilters"
              >
                <AppIcon name="rotate-ccw" />{{ t('catalog.clearFiltersAction') }}
              </button>
              <button
                v-else-if="query"
                type="button"
                class="btn btn--primary"
                data-action="cat-clear-q"
                @click="clearQuery"
              >
                <AppIcon name="rotate-ccw" />{{ t('catalog.clearQueryAction') }}
              </button>
              <button
                type="button"
                class="btn btn--secondary"
                data-action="cat-show-all"
                @click="showAll"
              >
                <AppIcon name="grid" />{{ t('catalog.showAllAction') }}
              </button>
            </div>
          </div>

          <!-- Results -->
          <template v-else>
            <ul class="cat-grid" :class="{ 'is-list': view === 'list' }" role="list">
              <li v-for="c in firstPage" :key="c.id">
                <CourseCard :view="c" :variant="cardVariant" @run="runAction" />
              </li>
            </ul>
            <template v-if="splitAds">
              <div class="cat-ads-inline"><AdsSlot placement="catalog-inline" /></div>
              <ul class="cat-grid" :class="{ 'is-list': view === 'list' }" role="list">
                <li v-for="c in secondPage" :key="c.id">
                  <CourseCard :view="c" :variant="cardVariant" @run="runAction" />
                </li>
              </ul>
            </template>

            <div v-if="hasMore" class="cat-more">
              <button
                type="button"
                class="btn btn--secondary"
                data-load-more
                :disabled="loadingMore"
                @click="loadMore"
              >
                <AppIcon name="chevron-down" />{{
                  loadingMore
                    ? t('catalog.loadingMore')
                    : t('catalog.loadMore', { count: num(total - results.length) })
                }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>

  <!-- Ads (moves here when the catalog has 6 results or fewer) -->
  <div class="container cat-ads-slot" id="cat-ads-slot">
    <AdsSlot v-if="adsBelow" placement="catalog-bottom" />
  </div>
</template>
