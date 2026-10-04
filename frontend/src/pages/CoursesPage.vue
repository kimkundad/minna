<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import FilterGroups, { type FilterGroup } from '@/components/discovery/FilterGroups.vue'
import SkeletonCards from '@/components/discovery/SkeletonCards.vue'
import AdsLink from '@/components/discovery/AdsLink.vue'
import { data, store } from '@/vendor'
import { num } from '@/lib/format'

/**
 * The course catalog: search, six facet groups with live counts, six sort
 * orders, a grid/list toggle, chips for whatever is on, and all of it in the
 * URL so a filtered view can be linked and reloaded.
 *
 * Filtering and sorting are `store.filterCourses` / `store.sortCourses`
 * unchanged — the facet rules (what "1–3 ชม." means, which courses count as
 * "รายคอร์ส") are business rules, not display, and the only way for the counts
 * beside each option to agree with the results is for both to come out of the
 * same function.
 *
 * The brief delay before results appear is the reference's, not an accident: a
 * skeleton appearing for a moment is what tells you the list is answering you.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const s = store as unknown as Record<string, (...args: any[]) => any>

const CAT_VISIBLE = 8
const LOAD_MS = 350

type Course = { id: string; category: string; [key: string]: unknown }

/* ---------------- facet definitions ---------------- */

/** Categories that have courses come first, then the rest A–Z. The order is
 *  fixed once, from the full catalog, so it does not reshuffle under you as you
 *  filter. */
const categoryOpts = computed<[string, string][]>(() => {
  const counts: Record<string, number> = {}
  for (const c of s.catalog() as Course[]) counts[c.category] = (counts[c.category] ?? 0) + 1
  return data.categories
    .slice()
    .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.name.localeCompare(b.name))
    .map((c) => [c.id, c.name] as [string, string])
})

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
  {
    key: 'ce',
    label: t('catalog.groupCe'),
    opts: [
      ['none', t('catalog.ceNone')],
      ['1-3', t('catalog.ce13')],
      ['4-6', t('catalog.ce46')],
      ['gt6', t('catalog.ceGt6')],
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

const GROUP_KEYS = ['category', 'level', 'ce', 'duration', 'access', 'price'] as const
type GroupKey = (typeof GROUP_KEYS)[number]

const SORTS = [
  'recommended',
  'new',
  'popular',
  'price-asc',
  'price-desc',
  'ce-desc',
] as const
type SortKey = (typeof SORTS)[number]

const SORT_LABEL: Record<SortKey, string> = {
  recommended: 'catalog.sortRecommended',
  new: 'catalog.sortNew',
  popular: 'catalog.sortPopular',
  'price-asc': 'catalog.sortPriceAsc',
  'price-desc': 'catalog.sortPriceDesc',
  'ce-desc': 'catalog.sortCeDesc',
}

/* ---------------- state, read from the URL ---------------- */

function emptyFilters(): Record<GroupKey, string[]> {
  return { category: [], level: [], ce: [], duration: [], access: [], price: [] }
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
const catOpen = ref(false)
const pinned = ref<Record<string, boolean>>({})
/** Bumped after an action so the vendor store's new answer is re-read. */
const tick = ref(0)

/** Accepts a category by id or by English name, because the home page links in
 *  by id and people paste either. */
function readUrl(): void {
  const q = route.query
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]) as string | undefined

  query.value = (one('q') ?? '').trim().slice(0, 80)

  const alias: Record<string, string> = {}
  for (const c of data.categories) {
    alias[c.id] = c.id
    alias[c.name.toLowerCase()] = c.id
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
      if (valid.includes(v) && !next[key].includes(v)) next[key].push(v)
    }
  }
  filters.value = next

  const sk = one('sort') as SortKey | undefined
  sort.value = sk && SORTS.includes(sk) ? sk : 'recommended'

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

/* ---------------- results ---------------- */

interface FilterOpts extends Record<string, unknown> {
  q: string
}

function opts(f: Record<GroupKey, string[]>): FilterOpts {
  const o: FilterOpts = { q: query.value }
  for (const key of GROUP_KEYS) o[key] = f[key]
  return o
}

const results = computed<Course[]>(() => {
  void tick.value
  return s.sortCourses(s.filterCourses(opts(filters.value)), sort.value) as Course[]
})

/** A facet's count is the result count with that one option standing alone in
 *  its own group, every other group left as it is — so ticking it tells you
 *  exactly how many you will get. */
function countOf(key: string, value: string): number {
  void tick.value
  const o = opts(filters.value)
  o[key] = [value]
  return (s.filterCourses(o) as Course[]).length
}

const filterCount = computed(() =>
  GROUP_KEYS.reduce((n, key) => n + filters.value[key].length, 0),
)

const simulateError = computed(() => {
  void tick.value
  return Boolean(s.simulateError())
})

/** Everything the catalog shows is public; the grid never waits on a session. */
const sortNote = computed(() => t(SORT_LABEL[sort.value]))

/* ---------------- the delay before results swap ---------------- */

let timer: ReturnType<typeof setTimeout> | undefined

/** The live region stays quiet on arrival — the heading already says how many
 *  courses there are, and announcing it again would interrupt a screen reader
 *  the moment the page opens. It speaks once you change something. */
const announce = ref(false)

function load(ms = LOAD_MS): void {
  loading.value = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    loading.value = false
  }, ms)
}

function refresh(): void {
  announce.value = true
  writeUrl()
  load()
}

onMounted(() => {
  readUrl()
  load(450)
})
onBeforeUnmount(() => clearTimeout(timer))

/** Back and forward move through filter states, so the page follows the URL
 *  rather than owning it outright. */
watch(
  () => route.fullPath,
  () => {
    if (route.name !== 'courses') return
    readUrl()
    load()
  },
)

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

/** Card CTAs that change the store rather than navigate. Signing in is not
 *  wired up yet, so those buttons stay inert for now. */
function runAction(action: string, courseId?: string): void {
  if (!courseId) return
  if (action === 'add-cart') s.addToCart(courseId)
  else if (action === 'enroll-free') s.enrollFree(courseId)
  else if (action === 'buy') {
    void router.push({ path: path('/checkout'), query: { items: courseId } })
    return
  }
  tick.value++
}

/* ---------------- derived view data ---------------- */

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

/** Categories can be real but empty — the home page shows them as "เร็ว ๆ นี้"
 *  and links here, so that deserves its own answer rather than "no match". */
const onlyEmptyCategories = computed(() => {
  if (query.value || !filters.value.category.length) return false
  if (filterCount.value !== filters.value.category.length) return false
  const published = s.catalog() as Course[]
  return filters.value.category.every((id) => !published.some((c) => c.category === id))
})

const emptyCategoryNames = computed(() =>
  filters.value.category
    .map((id) => categoryOpts.value.find((o) => o[0] === id)?.[1] ?? id)
    .join(', '),
)

const firstPage = computed(() => (results.value.length > 6 ? results.value.slice(0, 6) : results.value))
const secondPage = computed(() => (results.value.length > 6 ? results.value.slice(6) : []))
const splitAds = computed(() => results.value.length > 6)

/** The ads block lives between the two halves of a long grid, and below the
 *  results when there is only one half. */
const adsBelow = computed(() => simulateError.value || loading.value || !splitAds.value)

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
      <p>{{ t('catalog.lead', { count: data.categories.length }) }}</p>
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
              <template v-if="simulateError">{{ t('catalog.countError') }}</template>
              <template v-else-if="loading">{{ t('catalog.countLoading') }}</template>
              <template v-else
                >{{ t('catalog.countFound', { count: num(results.length) })
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
                  <option v-for="k in SORTS" :key="k" :value="k">{{ t(SORT_LABEL[k]) }}</option>
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
          {{
            announce && !loading && !simulateError
              ? t('catalog.countFound', { count: results.length })
              : ''
          }}
        </p>

        <div class="cat-list" id="cat-list" :aria-busy="loading ? 'true' : 'false'">
          <!-- Error -->
          <div v-if="simulateError" class="state-box state-box--error" role="alert">
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
          <div v-else-if="!results.length" class="state-box">
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
                  : t('catalog.emptyText', { count: data.categories.length })
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
                <CourseCard :course-id="c.id" :variant="cardVariant" @run="runAction" />
              </li>
            </ul>
            <template v-if="splitAds">
              <div class="cat-ads-inline"><AdsLink href="#sponsor-catalog" /></div>
              <ul class="cat-grid" :class="{ 'is-list': view === 'list' }" role="list">
                <li v-for="c in secondPage" :key="c.id">
                  <CourseCard :course-id="c.id" :variant="cardVariant" @run="runAction" />
                </li>
              </ul>
            </template>
          </template>
        </div>
      </div>
    </div>
  </section>

  <!-- Ads (moves here when the catalog has 6 results or fewer) -->
  <div class="container cat-ads-slot" id="cat-ads-slot">
    <AdsLink v-if="adsBelow" href="#sponsor-catalog" />
  </div>
</template>
