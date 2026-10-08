<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import ArticleCard from '@/components/blog/ArticleCard.vue'
import SkeletonCards from '@/components/discovery/SkeletonCards.vue'
import { api } from '@/lib/api'
import type { ContentLocale, PublicCategory, PublicPost } from '@/lib/api'
import { articleView } from '@/lib/article'
import { categoryLabel } from '@/lib/course'
import { date, num } from '@/lib/format'
import AdsSlot from '@/components/ui/AdsSlot.vue'

/**
 * Every published article, newest first.
 *
 * Built the same way the catalog is — search and filters in the URL, a grid,
 * and a "ดูเพิ่ม" button rather than numbered pages — because the two browsing
 * pages of this site should not behave differently from one another.
 *
 * The filter here is one row of category chips rather than the catalog's panel
 * of checkboxes: an article has one category and no price, level or length to
 * narrow by, so a sidebar would be a sidebar with a single group in it.
 */
const route = useRoute()
const router = useRouter()
const { t, locale: uiLocale } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const PER_PAGE = 9
const MIN_SKELETON_MS = 250

const query = ref('')
const category = ref<number | null>(null)
const posts = ref<PublicPost[]>([])
const total = ref(0)
const page = ref(1)
const categories = ref<PublicCategory[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const failed = ref(false)

/** Only the categories that actually have articles, in the order the most
 *  written-about comes first. Built from what came back, so a category nobody
 *  has written about never appears as a chip that returns nothing. */
const chipCategories = ref<{ id: number; label: string; count: number }[]>([])

function readUrl(): void {
  const one = (k: string) => {
    const v = route.query[k]
    return (Array.isArray(v) ? v[0] : v) as string | undefined
  }
  query.value = (one('q') ?? '').trim().slice(0, 80)
  const cat = Number(one('category'))
  category.value = Number.isInteger(cat) && cat > 0 ? cat : null
}

function writeUrl(): void {
  const q: Record<string, string> = {}
  if (query.value) q.q = query.value
  if (category.value) q.category = String(category.value)
  void router.replace({ query: q })
}

let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

function params(p: number) {
  return {
    page: p,
    perPage: PER_PAGE,
    // The site's own language, not the article's: a reader of the English site
    // is shown the English articles and the ones marked for every language.
    locale: String(uiLocale.value) as ContentLocale,
    q: query.value || undefined,
    categoryId: category.value ?? undefined,
  }
}

async function load(): Promise<void> {
  const mine = ++seq
  loading.value = true
  failed.value = false
  clearTimeout(timer)
  const started = Date.now()

  try {
    const res = await api.posts(params(1))
    if (mine !== seq) return
    posts.value = res.data
    total.value = res.meta.total
    page.value = 1
  } catch {
    if (mine !== seq) return
    failed.value = true
    posts.value = []
    total.value = 0
  }

  const left = Math.max(0, MIN_SKELETON_MS - (Date.now() - started))
  timer = setTimeout(() => {
    if (mine === seq) loading.value = false
  }, left)
}

const hasMore = computed(() => posts.value.length < total.value)

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return
  const mine = seq
  loadingMore.value = true
  try {
    const res = await api.posts(params(page.value + 1))
    if (mine !== seq) return
    posts.value = [...posts.value, ...res.data]
    total.value = res.meta.total
    page.value += 1
  } catch {
    // What is on screen stays; the button can be pressed again.
  } finally {
    if (mine === seq) loadingMore.value = false
  }
}

/**
 * The chips are built once, from every article there is rather than from the
 * filtered page — so choosing one does not make the others disappear and leave
 * you with no way back.
 */
async function loadChips(): Promise<void> {
  try {
    const [cats, all] = await Promise.all([
      api.categories(),
      api.posts({ perPage: 50, locale: String(uiLocale.value) as ContentLocale }),
    ])
    categories.value = cats.data

    const counted = new Map<number, number>()
    for (const p of all.data) {
      if (p.categoryId) counted.set(p.categoryId, (counted.get(p.categoryId) ?? 0) + 1)
    }
    chipCategories.value = [...counted.entries()]
      .map(([id, count]) => ({
        id,
        label: (() => {
          const c = cats.data.find((x) => x.id === id)
          return c ? categoryLabel(c, cats.data) : ''
        })(),
        count,
      }))
      .filter((c) => c.label)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  } catch {
    // The list still works without chips.
  }
}

onMounted(async () => {
  readUrl()
  await Promise.all([load(), loadChips()])
})

watch(
  () => route.fullPath,
  () => {
    if (route.name !== 'blog') return
    readUrl()
    void load()
  },
)

/* ---------------- interactions ---------------- */

function pickCategory(id: number | null): void {
  category.value = category.value === id ? null : id
  writeUrl()
}

let typingTimer: ReturnType<typeof setTimeout> | undefined
function onQueryInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    const next = value.trim().slice(0, 80)
    if (next === query.value) return
    query.value = next
    writeUrl()
  }, 320)
}

function onQuerySubmit(event: Event): void {
  event.preventDefault()
  clearTimeout(typingTimer)
  const input = (event.target as HTMLFormElement).querySelector<HTMLInputElement>('#bl-q')
  query.value = (input?.value ?? '').trim().slice(0, 80)
  writeUrl()
}

function clearAll(): void {
  query.value = ''
  category.value = null
  writeUrl()
}

const cards = computed(() =>
  posts.value.map((p) =>
    articleView(p, { locale: locale.value, categories: categories.value, formatDate: date }),
  ),
)
</script>

<template>
  <!-- Page hero: breadcrumb · H1 · description · search -->
  <section class="page-hero cat-hero" aria-labelledby="bl-title">
    <div class="container">
      <nav :aria-label="t('common.breadcrumb')">
        <ol class="crumbs dc-crumbs">
          <li>
            <RouterLink :to="path('')">{{ t('common.home') }}</RouterLink>
          </li>
          <li>
            <AppIcon name="chevron-right" />
            <span aria-current="page">{{ t('blog.title') }}</span>
          </li>
        </ol>
      </nav>
      <h1 id="bl-title">{{ t('blog.title') }}</h1>
      <p>{{ t('blog.lead') }}</p>
      <form class="cat-search" role="search" autocomplete="off" @submit="onQuerySubmit">
        <div class="search-field">
          <span class="cat-search-ico"><AppIcon name="search" /></span>
          <label class="sr-only" for="bl-q">{{ t('blog.searchLabel') }}</label>
          <input
            id="bl-q"
            name="q"
            type="search"
            enterkeyhint="search"
            :placeholder="t('blog.searchPlaceholder')"
            :value="query"
            @input="onQueryInput"
          />
          <button
            type="button"
            class="icon-btn icon-btn--ghost icon-btn--sm cat-q-clear"
            :aria-label="t('catalog.clearQuery')"
            :hidden="!query"
            @click="clearAll"
          >
            <AppIcon name="x" />
          </button>
        </div>
      </form>
    </div>
  </section>

  <section class="cat-main" aria-labelledby="bl-count">
    <div class="container">
      <!-- Category chips, instead of the catalog's filter panel -->
      <div v-if="chipCategories.length" class="cat-active bl-filter">
        <ul class="cat-chips" role="list" :aria-label="t('blog.filterLabel')">
          <li>
            <button
              type="button"
              class="chip cat-chip"
              :class="{ 'is-on': category === null }"
              :aria-pressed="category === null ? 'true' : 'false'"
              @click="pickCategory(null)"
            >
              <span>{{ t('blog.allCategories') }}</span>
            </button>
          </li>
          <li v-for="c in chipCategories" :key="c.id">
            <button
              type="button"
              class="chip cat-chip"
              :class="{ 'is-on': category === c.id }"
              :aria-pressed="category === c.id ? 'true' : 'false'"
              @click="pickCategory(c.id)"
            >
              <span>{{ c.label }}</span>
              <span class="chip-n">{{ c.count }}</span>
            </button>
          </li>
        </ul>
      </div>

      <h2 class="cat-count" id="bl-count" tabindex="-1">
        <template v-if="failed">{{ t('blog.errorTitle') }}</template>
        <template v-else-if="loading">{{ t('catalog.countLoading') }}</template>
        <template v-else>{{ t('blog.countFound', { count: num(total) }) }}</template>
      </h2>

      <!-- Error -->
      <div v-if="failed" class="state-box state-box--error" role="alert">
        <div class="state-ico"><AppIcon name="wifi-off" /></div>
        <h3>{{ t('blog.errorTitle') }}</h3>
        <p>{{ t('blog.errorText') }}</p>
        <div class="state-actions">
          <button type="button" class="btn btn--primary" data-retry="blog" @click="load()">
            <AppIcon name="refresh" />{{ t('catalog.retry') }}
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="bl-grid" aria-hidden="true">
        <SkeletonCards :count="6" />
      </div>

      <!-- Nothing matched -->
      <div v-else-if="!cards.length" class="state-box">
        <div class="state-ico"><AppIcon name="search" /></div>
        <h3>{{ t('blog.emptyTitle') }}</h3>
        <p>{{ t('blog.emptyText') }}</p>
        <div class="state-actions">
          <button
            v-if="query || category"
            type="button"
            class="btn btn--primary"
            data-action="bl-clear"
            @click="clearAll"
          >
            <AppIcon name="rotate-ccw" />{{ t('blog.showAll') }}
          </button>
          <RouterLink class="btn btn--secondary" :to="path('/courses')">
            <AppIcon name="grid" />{{ t('course.viewAllCourses') }}
          </RouterLink>
        </div>
      </div>

      <!-- Results -->
      <template v-else>
        <ul class="bl-grid" role="list">
          <li v-for="(c, i) in cards" :key="c.id">
            <ArticleCard :article="c" :eager="i < 3" />
          </li>
        </ul>

        <div v-if="hasMore" class="bl-more">
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
                : t('blog.loadMore', { count: num(total - posts.length) })
            }}
          </button>
        </div>
      </template>
    </div>
  </section>

  <div class="container cat-ads-slot"><AdsSlot placement="blog" /></div>
</template>
