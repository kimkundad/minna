<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import ArticleCard from '@/components/blog/ArticleCard.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import AdsSlot from '@/components/ui/AdsSlot.vue'
import { ApiError, api } from '@/lib/api'
import type { ContentLocale, PublicCategory, PublicPostDetail } from '@/lib/api'
import { articleView, readingMinutes, withHeadings, type Heading } from '@/lib/article'
import { date } from '@/lib/format'

/**
 * One article.
 *
 * Laid out like the legal pages — long prose beside a sticky contents list —
 * because that is the shape this site already has for something you read
 * rather than scan. The contents come from the article's own `h2`s, which is
 * what the editor produces, so nothing has to be maintained alongside the
 * writing.
 *
 * The body is markup written in the admin's editor: the school's own, the same
 * trust as the rest of the site.
 */
const route = useRoute()
const { t, locale: uiLocale } = useI18n()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const slug = computed(() => String(route.params.slug ?? '').trim().slice(0, 255))

const post = ref<PublicPostDetail | null>(null)
const categories = ref<PublicCategory[]>([])
const more = ref<PublicPostDetail[]>([])
const loading = ref(true)
const missing = ref(false)
const failed = ref(false)

let seq = 0

async function load(): Promise<void> {
  const mine = ++seq
  loading.value = true
  missing.value = false
  failed.value = false

  try {
    const [detail, cats] = await Promise.all([
      api.post(slug.value),
      categories.value.length ? Promise.resolve({ data: categories.value }) : api.categories(),
    ])
    if (mine !== seq) return
    post.value = detail.data
    categories.value = cats.data

    // Articles near this one: the same category first, then simply the newest.
    // Not worth failing the page over — an article with no rail is still an
    // article.
    const near = await api
      .posts({
        perPage: 3,
        locale: String(uiLocale.value) as ContentLocale,
        categoryId: detail.data.categoryId ?? undefined,
        excludeId: detail.data.id,
      })
      .catch(() => null)

    let found = (near?.data ?? []) as PublicPostDetail[]
    if (found.length < 3) {
      const rest = await api
        .posts({ perPage: 6, locale: String(uiLocale.value) as ContentLocale, excludeId: detail.data.id })
        .catch(() => null)
      const seen = new Set(found.map((p) => p.id))
      found = [...found, ...((rest?.data ?? []) as PublicPostDetail[]).filter((p) => !seen.has(p.id))]
    }
    if (mine !== seq) return
    more.value = found.slice(0, 3)
  } catch (err) {
    if (mine !== seq) return
    post.value = null
    if (err instanceof ApiError && err.status === 404) missing.value = true
    else failed.value = true
  } finally {
    if (mine === seq) loading.value = false
  }
}

watch(slug, () => {
  void load()
  window.scrollTo({ top: 0 })
})

const view = computed(() =>
  post.value
    ? articleView(post.value, {
        locale: locale.value,
        categories: categories.value,
        formatDate: date,
      })
    : null,
)

/** The body with an id on every `h2`, and the list of them. */
const prepared = computed(() => withHeadings(post.value?.contentHtml))
const headings = computed<Heading[]>(() => prepared.value.headings)

const minutes = computed(() => readingMinutes(post.value?.contentHtml))

const moreCards = computed(() =>
  more.value.map((p) =>
    articleView(p, { locale: locale.value, categories: categories.value, formatDate: date }),
  ),
)

/* ---------------- the contents list follows the reading ---------------- */

const currentHeading = ref('')
let spy: IntersectionObserver | undefined

/**
 * Marks the heading you are reading under.
 *
 * The top band only: a heading is "current" from when it reaches the top of
 * the viewport until the next one does, which is what a reader means by where
 * they are. Watching the whole viewport would mark whichever heading happened
 * to be largest on screen.
 */
function watchHeadings(): void {
  spy?.disconnect()
  if (!('IntersectionObserver' in window)) return
  const targets = headings.value
    .map((h) => document.getElementById(h.id))
    .filter((el): el is HTMLElement => el !== null)
  if (!targets.length) return

  spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) currentHeading.value = entry.target.id
      }
    },
    { rootMargin: '-80px 0px -75% 0px' },
  )
  for (const el of targets) spy.observe(el)
}

watch(headings, () => {
  // After the body has been rendered, or the ids are not in the document yet.
  requestAnimationFrame(watchHeadings)
})

onMounted(async () => {
  await load()
  requestAnimationFrame(watchHeadings)
})
onBeforeUnmount(() => spy?.disconnect())

/* ---------------- sharing ---------------- */

const shareUrl = computed(() =>
  typeof window === 'undefined' ? '' : window.location.href,
)
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined

const shareLinks = computed(() => {
  const url = encodeURIComponent(shareUrl.value)
  const text = encodeURIComponent(post.value?.title ?? '')
  return [
    // LINE first: it is how most of this site's readers pass a link along.
    { key: 'line', label: 'LINE', icon: 'message', href: `https://social-plugins.line.me/lineit/share?url=${url}` },
    { key: 'facebook', label: 'Facebook', icon: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
    { key: 'x', label: 'X', icon: 'share', href: `https://x.com/intent/post?url=${url}&text=${text}` },
  ]
})

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Denied, or no clipboard at all. The address bar still has the link, and
    // saying "could not copy" helps nobody do anything about it.
  }
}

onBeforeUnmount(() => clearTimeout(copyTimer))
</script>

<template>
  <div class="bl-root">
    <!-- Loading -->
    <section v-if="loading" class="page-hero" aria-busy="true">
      <div class="container">
        <p class="cd-loading">{{ t('blog.loading') }}</p>
      </div>
    </section>

    <!-- No such article -->
    <section v-else-if="missing" class="page-hero" aria-labelledby="bl-nf-h">
      <div class="container">
        <nav :aria-label="t('common.breadcrumb')">
          <ol class="crumbs dc-crumbs">
            <li>
              <RouterLink :to="path('')">{{ t('common.home') }}</RouterLink>
            </li>
            <li>
              <AppIcon name="chevron-right" />
              <RouterLink :to="path('/blog')">{{ t('blog.title') }}</RouterLink>
            </li>
          </ol>
        </nav>
        <div class="state-box state-box--error" role="alert">
          <div class="state-ico"><AppIcon name="search" /></div>
          <h1 id="bl-nf-h">{{ t('blog.notFoundTitle') }}</h1>
          <p>{{ t('blog.notFoundText', { slug }) }}</p>
          <div class="state-actions">
            <RouterLink class="btn btn--primary" :to="path('/blog')">
              <AppIcon name="arrow-left" />{{ t('blog.backToBlog') }}
            </RouterLink>
            <RouterLink class="btn btn--secondary" :to="path('')">
              <AppIcon name="home" />{{ t('common.home') }}
            </RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- Could not load -->
    <section v-else-if="failed || !post || !view" class="page-hero" aria-labelledby="bl-err-h">
      <div class="container">
        <div class="state-box state-box--error" role="alert">
          <div class="state-ico"><AppIcon name="wifi-off" /></div>
          <h1 id="bl-err-h">{{ t('blog.errorTitle') }}</h1>
          <p>{{ t('blog.errorText') }}</p>
          <div class="state-actions">
            <button type="button" class="btn btn--primary" data-retry="article" @click="load()">
              <AppIcon name="refresh" />{{ t('catalog.retry') }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <template v-else>
      <section class="page-hero bl-hero" aria-labelledby="bl-h">
        <div class="container">
          <nav :aria-label="t('common.breadcrumb')">
            <ol class="crumbs dc-crumbs">
              <li>
                <RouterLink :to="path('')">{{ t('common.home') }}</RouterLink>
              </li>
              <li>
                <AppIcon name="chevron-right" />
                <RouterLink :to="path('/blog')">{{ t('blog.title') }}</RouterLink>
              </li>
              <li v-if="view.categoryName && view.categoryHref">
                <AppIcon name="chevron-right" />
                <RouterLink :to="view.categoryHref">{{ view.categoryName }}</RouterLink>
              </li>
            </ol>
          </nav>

          <RouterLink v-if="view.categoryHref" class="cd-cat" :to="view.categoryHref">
            <AppIcon :name="view.categoryIcon" />
            <span>{{ view.categoryName }}</span>
          </RouterLink>

          <h1 class="bl-title" id="bl-h">{{ post.title }}</h1>
          <p v-if="view.excerpt" class="bl-lead">{{ view.excerpt }}</p>

          <div class="bl-byline">
            <AppAvatar
              :name="view.authorName"
              :initials="view.authorInitials"
              :color="view.authorColor"
              :photo="view.authorAvatar"
              size="md"
            />
            <span class="bl-byline-text">
              <span class="bl-byline-name">{{ view.authorName }}</span>
              <span class="bl-byline-meta">
                <span>
                  <AppIcon name="calendar" />
                  <time :datetime="view.dateIso">{{ view.dateLabel }}</time>
                </span>
                <span><AppIcon name="clock" />{{ t('blog.readingTime', { minutes }) }}</span>
              </span>
            </span>
          </div>
        </div>
      </section>

      <div class="container">
        <div class="bl-layout">
          <div class="bl-content">
            <figure v-if="view.image" class="bl-cover">
              <CourseImage
                :image="view.image"
                :width="1280"
                :height="720"
                :art-icon="view.categoryIcon"
                :art-palette="view.categoryPalette"
                sizes="(max-width: 1099px) 92vw, 760px"
                eager
                priority
              />
            </figure>

            <!-- Written in the admin's own editor, so the markup is the
                 school's — the same trust as the rest of the site. -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="bl-prose" v-html="prepared.html" />

            <div class="bl-share">
              <span class="bl-share-label">{{ t('blog.share') }}</span>
              <ul class="bl-share-list" role="list">
                <li v-for="s in shareLinks" :key="s.key">
                  <a
                    class="bl-share-btn"
                    :href="s.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    :data-share="s.key"
                  >
                    <AppIcon :name="s.icon" />{{ s.label }}
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    class="bl-share-btn"
                    :class="{ 'is-done': copied }"
                    data-share="copy"
                    @click="copyLink"
                  >
                    <AppIcon :name="copied ? 'check' : 'link'" />{{
                      copied ? t('blog.copied') : t('blog.copyLink')
                    }}
                  </button>
                </li>
              </ul>
            </div>

            <div v-if="view.authorName" class="bl-author">
              <AppAvatar
                :name="view.authorName"
                :initials="view.authorInitials"
                :color="view.authorColor"
                :photo="view.authorAvatar"
                size="lg"
              />
              <div class="bl-author-body">
                <h2 class="bl-author-name">{{ view.authorName }}</h2>
                <span v-if="view.authorHeadline" class="badge badge--info">
                  <AppIcon name="briefcase" />{{ view.authorHeadline }}
                </span>
                <p v-if="view.authorBio">{{ view.authorBio }}</p>
              </div>
            </div>
          </div>

          <aside v-if="headings.length > 1" class="bl-toc" :aria-label="t('blog.contents')">
            <p class="bl-toc-title"><AppIcon name="list" />{{ t('blog.contents') }}</p>
            <ol>
              <li v-for="h in headings" :key="h.id">
                <a :href="`#${h.id}`" :class="{ 'is-current': currentHeading === h.id }">{{
                  h.text
                }}</a>
              </li>
            </ol>
          </aside>
        </div>
      </div>

      <section v-if="moreCards.length" class="container bl-more-sec" aria-labelledby="bl-more-h">
        <div class="section-head">
          <h2 id="bl-more-h">{{ t('blog.moreTitle') }}</h2>
        </div>
        <ul class="bl-grid" role="list">
          <li v-for="c in moreCards" :key="c.id">
            <ArticleCard :article="c" />
          </li>
        </ul>
      </section>

      <div class="container cat-ads-slot"><AdsSlot /></div>
    </template>
  </div>
</template>
