<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import HeroCarousel from '@/components/home/HeroCarousel.vue'
import ArticleCard from '@/components/blog/ArticleCard.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import CourseRail from '@/components/course/CourseRail.vue'
import AdsSlot from '@/components/ui/AdsSlot.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import { api, journey as fetchJourney } from '@/lib/api'
import type {
  ContentLocale,
  JourneyBand,
  PublicCategory,
  PublicCourse,
  PublicPost,
} from '@/lib/api'
import { articleView } from '@/lib/article'
import { categoryLabel, categoryNameIn, courseView } from '@/lib/course'
import { useLearningStore } from '@/stores/learning'
import { date } from '@/lib/format'

/**
 * The home page, in the order the design sets out: hero, the course rails,
 * categories, how learning works here, the package band, articles, with
 * advertising slots between them.
 *
 * The two course rails are the catalog, sorted two ways — newest, and the
 * school's own "recommended", which is its featured flag first and then how
 * popular a course is. Both come from the same endpoint the catalog uses, so a
 * card here and the same card there cannot disagree.
 *
 * There is no "คอร์สของฉัน" rail. The prototype had one, filled from its
 * localStorage fixtures; a real one needs entitlements and lesson progress from
 * a student API that does not exist yet, and a rail showing courses nobody
 * bought is worse than no rail.
 */
const route = useRoute()
const { t, locale: uiLocale } = useI18n()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const newCourses = ref<PublicCourse[]>([])
const featured = ref<PublicCourse[]>([])
const allCategories = ref<PublicCategory[]>([])
const articles = ref<PublicPost[]>([])

const RAIL = 8

/**
 * Everything on this page that the language decides.
 *
 * Which is now most of it: the catalogue answers in the reader's language, the
 * category counts count that language's courses, the articles are that
 * language's articles, and the two bands at the foot are written per language.
 *
 * A rail stays out of the page until it has something in it, rather than
 * drawing a heading over an empty track while the request is in flight.
 */
async function load() {
  const [cats, fresh, best, latest, band, closingBand] = await Promise.all([
    api.categories().catch(() => null),
    api.courses({ sort: 'newest', perPage: RAIL }).catch(() => null),
    // Asked for wide, shown narrow: the newest courses are often also the
    // featured ones, and two rails showing the same four cards is one rail's
    // worth of information taking up two rails of the page.
    api.courses({ sort: 'recommended', perPage: RAIL * 3 }).catch(() => null),
    // Three, because the band is a row of three. The site's own language, so a
    // reader of the English site is not shown a row of Thai articles.
    api.posts({ perPage: 3, locale: String(uiLocale.value) as ContentLocale }).catch(() => null),
    // The band the school writes. Its own request rather than part of a page
    // payload, so a language with nothing written costs one empty answer and
    // not a broken home page.
    fetchJourney(String(uiLocale.value)).catch(() => null),
    // And the closing one, written the same way in the same place.
    fetchJourney(String(uiLocale.value), 'cta').catch(() => null),
  ])
  allCategories.value = cats?.data ?? []
  newCourses.value = fresh?.data ?? []
  articles.value = latest?.data ?? []
  journey.value = band?.data ?? null
  closing.value = closingBand?.data ?? null

  const alreadyShown = new Set(newCourses.value.map((c) => c.id))
  const rest = (best?.data ?? []).filter((c) => !alreadyShown.has(c.id))
  // Unless taking the overlap out would leave the rail nearly empty, in which
  // case a repeated card beats a missing section.
  featured.value = (rest.length >= 4 ? rest : (best?.data ?? [])).slice(0, RAIL)
}

onMounted(load)

/**
 * Fetch it all again when the language changes.
 *
 * Switching language is a route change — `/th` to `/ko` — and Vue answers it
 * by keeping the component it already has, so `onMounted` does not run again.
 * The translated labels changed on their own and everything that had come from
 * the API did not: the journey band and the closing band kept the old
 * language's sentences until somebody reloaded the page by hand.
 */
watch(uiLocale, load)

const asCards = (list: PublicCourse[]) =>
  list.map((c) => courseView(c, { locale: locale.value, t, categories: allCategories.value }))

/**
 * The member's own courses, newest activity first.
 *
 * The store holds them sorted already — what they are working on, then what
 * they have not started, then what is finished — so this takes the front of
 * that rather than sorting again and risking a different answer from the
 * account page's.
 *
 * Lapsed access is left out here: this rail is for carrying on, and a locked
 * course on it is an invitation to a door that will not open. The account page
 * still shows those, with the reason.
 */
const learning = useLearningStore()

/** The member's courses that can be carried on, before the language rule. */
const mineOpen = computed(() => learning.items.filter((i) => i.blocked === null))

/**
 * And the ones taught in the language this page is written in.
 *
 * The rest of the home page follows the site's language, and this rail did
 * not: it is the only list on the page that comes from the member rather than
 * from the catalogue, and it arrived unfiltered. So signing in on the
 * Indonesian home page added a row of Thai courses to a page that had been
 * entirely Indonesian a moment before — the same courses a visitor is not
 * shown, appearing because somebody signed in.
 *
 * A course marked for every language belongs here as much as anywhere.
 */
const mineHere = computed(() =>
  mineOpen.value.filter(
    (i) => i.course.contentLocale === locale.value || i.course.contentLocale === 'all',
  ),
)

/**
 * How many of their courses this page is not showing.
 *
 * Said out loud rather than left to be noticed. Hiding somebody's own purchase
 * because they switched language would be the worse bug of the two, so the
 * count is shown with the way through to all of them.
 */
const mineElsewhere = computed(() => mineOpen.value.length - mineHere.value.length)

const mineCards = computed(() =>
  mineHere.value.slice(0, RAIL).map((i) => ({
    ...courseView(i.course, { locale: locale.value, t, categories: allCategories.value }),
    // What turns a catalog tile into a "carry on" one: the bar, how far along
    // it is, and the lesson it stopped at.
    showProgress: true,
    progressPct: i.progress.pct,
    resumeTitle: i.progress.resume?.title ?? '',
    showPrice: false,
  })),
)

const newCards = computed(() => asCards(newCourses.value))
const featuredCards = computed(() => asCards(featured.value))

/**
 * Filters as you type, over the name and the parent's — somebody looking for
 * "ญี่ปุ่น" should find "ภาษาญี่ปุ่น · คันจิ", whose own name does not contain
 * it.
 *
 * And over every language's name, not only the one on screen: "Japanese" and
 * "ภาษาญี่ปุ่น" are the same category, so a Thai page that cannot find it by
 * the English word is a search box that knows one word for a thing and not the
 * other.
 */
const categoryQuery = ref('')
const categories = computed(() => {
  const q = categoryQuery.value.toLowerCase().trim()
  return allCategories.value
    .map((c) => {
      const parent = c.parentId ? allCategories.value.find((p) => p.id === c.parentId) : null
      const everyName = [...Object.values(c.names ?? {}), ...Object.values(parent?.names ?? {})]
      return {
        id: c.id,
        /** Only for the filter; never shown. */
        haystack: [c.name, parent?.name ?? '', ...everyName].join(' ').toLowerCase(),
        name: categoryNameIn(c, locale.value),
        /** The card's second line. Empty on a top-level category, where it
         *  would only repeat the first. */
        parentName: parent ? categoryNameIn(parent, locale.value) : '',
        label: categoryLabel(c, allCategories.value, locale.value),
        icon: c.icon ?? parent?.icon ?? 'book-open',
        count: c.totalCourseCount,
      }
    })
    .filter((c) => !q || c.haystack.includes(q))
})

/**
 * The "how learning works here" band, as the school wrote it.
 *
 * Null until it loads, and null for good in a language nobody has written —
 * the section is left out rather than falling back to another language, which
 * would put one language's sentences under another's heading.
 */
const journey = ref<JourneyBand | null>(null)

/** The closing band, written the same way and in the same place. */
const closing = ref<JourneyBand | null>(null)
const articleCards = computed(() =>
  articles.value.map((p) =>
    articleView(p, { locale: locale.value, categories: allCategories.value, formatDate: date }),
  ),
)
</script>

<template>
  <!-- 1. Hero -->
  <HeroCarousel />

  <!-- 1b. The member's own courses in this language, when there are any -->
  <section v-if="mineCards.length" class="home-rail" id="my-courses">
    <div class="container">
      <CourseRail
        id="mine"
        eyebrow="Continue Learning"
        :title="t('home.mineTitle')"
        :sub="t('home.mineSub', { n: mineCards.length })"
        :more-href="path('/account/learning')"
        :more-label="t('home.mineMore')"
        :count="mineCards.length"
      >
        <CourseCard v-for="c in mineCards" :key="c.id" :view="c" variant="continue" />
      </CourseRail>
      <!-- What this page is not showing them, and the way to it. -->
      <p v-if="mineElsewhere" class="home-mine-elsewhere">
        {{ t('home.mineElsewhere', { n: mineElsewhere }) }}
        <RouterLink :to="path('/account/learning')">{{ t('home.mineMore') }}</RouterLink>
      </p>
    </div>
  </section>

  <!--
    Or none in this language at all, while they do have courses: a line rather
    than nothing, so somebody who signed in to carry on is not left looking at
    a page that behaves as though they had not.
  -->
  <section v-else-if="mineElsewhere" class="home-rail" id="my-courses">
    <div class="container">
      <p class="home-mine-elsewhere">
        {{ t('home.mineNoneHere', { n: mineElsewhere }) }}
        <RouterLink :to="path('/account/learning')">{{ t('home.mineMore') }}</RouterLink>
      </p>
    </div>
  </section>

  <!-- 2. New courses -->
  <section v-if="newCards.length" class="home-rail" id="new-courses">
    <div class="container">
      <CourseRail
        id="new"
        eyebrow="New Courses"
        :title="t('home.newTitle')"
        :sub="t('home.newSub')"
        :more-href="`${path('/courses')}?sort=new`"
        :more-label="t('home.newMore')"
        :count="newCards.length"
      >
        <CourseCard v-for="c in newCards" :key="c.id" :view="c" />
      </CourseRail>
    </div>
  </section>

  <!-- 3. Recommended -->
  <section v-if="featuredCards.length" class="home-rail" id="rec-courses">
    <div class="container">
      <CourseRail
        id="rec"
        eyebrow="Featured"
        :title="t('home.featuredTitle')"
        :sub="t('home.featuredSub')"
        :more-href="path('/courses')"
        :more-label="t('home.featuredMore')"
        :count="featuredCards.length"
      >
        <CourseCard v-for="c in featuredCards" :key="c.id" :view="c" />
      </CourseRail>
    </div>
  </section>

  <!-- 5. Ads -->
  <div class="container home-ads"><AdsSlot placement="home-top" /></div>

  <!-- 6. Categories -->
  <section class="panel panel--subtle section home-cats" id="categories" aria-labelledby="cat-h">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">Course Categories</p>
        <h2 id="cat-h">{{ t('home.catsTitle') }}</h2>
        <p>{{ t('home.catsSub', { count: allCategories.length }) }}</p>
      </div>

      <div class="cat-search">
        <div class="search-field">
          <AppIcon name="search" :size="22" />
          <label class="sr-only" for="cat-q">{{ t('home.catsSearchLabel') }}</label>
          <input
            id="cat-q"
            v-model="categoryQuery"
            type="search"
            :placeholder="t('home.catsSearchPlaceholder')"
            autocomplete="off"
          />
        </div>
      </div>

      <div class="cat-grid" id="cat-grid" role="list">
        <RouterLink
          v-for="c in categories"
          :key="c.id"
          class="cat-card"
          role="listitem"
          :to="`${path('/courses')}?category=${c.id}`"
        >
          <span class="ci"><AppIcon :name="c.icon" /></span>
          <span><b>{{ c.name }}</b><small v-if="c.parentName">{{ c.parentName }}</small></span>
          <span class="cc-n">{{
            c.count ? t('home.catsCount', { count: c.count }) : t('home.catsSoon')
          }}</span>
        </RouterLink>
      </div>

      <p v-if="!categories.length" class="cat-empty">{{ t('home.catsEmpty') }}</p>
    </div>
  </section>

  <!--
    7. Learning journey.

    Written by the school, per language, from the admin. It used to be four
    steps and a heading typed into this file in Thai — which every other
    language also read in Thai, and which still described the reference
    project's veterinary scheme: filtering by CE points, collecting a
    certificate. Minna awards neither.

    The whole band is left out when the language has nothing written yet. A
    heading with no steps under it, or a fallback into another language, both
    read as a fault; an absent section reads as a page that is simply shorter.
  -->
  <section
    v-if="journey"
    class="panel section home-journey"
    id="journey"
    aria-labelledby="journey-h"
  >
    <div class="container">
      <div class="journey-top">
        <div>
          <p v-if="journey.eyebrow" class="eyebrow">{{ journey.eyebrow }}</p>
          <h2 id="journey-h">{{ journey.heading }}</h2>
        </div>
        <div class="journey-intro">
          <p v-if="journey.intro">{{ journey.intro }}</p>
          <RouterLink
            v-if="journey.ctaLabel"
            class="btn btn--primary"
            :to="journey.ctaHref || path('/courses')"
          >
            {{ journey.ctaLabel }}
          </RouterLink>
        </div>
      </div>
      <ol class="journey-steps" id="journey-steps" role="list">
        <li v-for="(j, i) in journey.steps" :key="j.id">
          <span class="js-num" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
          <div>
            <h3><AppIcon :name="j.icon" />{{ j.title }}</h3>
            <p v-if="j.text">{{ j.text }}</p>
          </div>
        </li>
      </ol>
    </div>
  </section>

  <!--
    8. The closing call to action.

    It used to sell a membership package. Packages are not on sale — the API
    refuses to put one in a basket — so it now says what the school actually
    does: courses are bought one at a time, and everything that comes with one
    is included rather than sold again on top.

    No photograph: every picture bundled with this project is from the
    veterinary prototype, and a stock clinic behind "เรียนภาษาญี่ปุ่น" says
    something untrue. The brand gradient carries it on its own.
  -->
  <section
    v-if="closing"
    class="section home-package"
    id="start-cta"
    aria-labelledby="cta-h"
  >
    <div class="container">
      <div class="pkg-cta">
        <BrandLogo class="pc-logo" />
        <p v-if="closing.eyebrow" class="eyebrow eyebrow--light">{{ closing.eyebrow }}</p>
        <h2 id="cta-h">{{ closing.heading }}</h2>
        <p v-if="closing.intro">{{ closing.intro }}</p>
        <div v-if="closing.steps.length" class="pc-benefits">
          <span v-for="chip in closing.steps" :key="chip.id">
            <AppIcon :name="chip.icon" />{{ chip.title }}
          </span>
        </div>
        <RouterLink
          v-if="closing.ctaLabel"
          class="btn btn--white btn--lg"
          :to="closing.ctaHref || path('/courses')"
        >
          {{ closing.ctaLabel }}<AppIcon name="arrow-right" />
        </RouterLink>
      </div>
    </div>
  </section>

  <!-- 9. Articles -->
  <section
    v-if="articleCards.length"
    class="section home-articles"
    id="articles"
    aria-labelledby="art-h"
  >
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">Knowledge</p>
        <h2 id="art-h">{{ t('blog.homeTitle') }}</h2>
        <p>{{ t('blog.homeSub') }}</p>
      </div>
      <ul class="bl-grid" id="article-grid" role="list">
        <li v-for="a in articleCards" :key="a.id">
          <ArticleCard :article="a" />
        </li>
      </ul>
      <div class="text-center mt-32">
        <RouterLink class="btn btn--secondary" :to="path('/blog')">{{
          t('blog.homeMore')
        }}</RouterLink>
      </div>
    </div>
  </section>

  <!-- 10. Ads -->
  <div class="container home-ads home-ads--last"><AdsSlot placement="home-bottom" /></div>
</template>
