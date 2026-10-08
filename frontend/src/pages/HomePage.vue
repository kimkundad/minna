<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import HeroCarousel from '@/components/home/HeroCarousel.vue'
import ArticleCard from '@/components/blog/ArticleCard.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import CourseRail from '@/components/course/CourseRail.vue'
import AdsSlot from '@/components/ui/AdsSlot.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import logoUrl from '@/assets/img/logo.png'
import { api } from '@/lib/api'
import type { ContentLocale, PublicCategory, PublicCourse, PublicPost } from '@/lib/api'
import { articleView } from '@/lib/article'
import { categoryLabel, courseView } from '@/lib/course'
import { data } from '@/vendor'
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

/** A rail stays out of the page until it has something in it, rather than
 *  drawing a heading over an empty track while the request is in flight. */
onMounted(async () => {
  const [cats, fresh, best, latest] = await Promise.all([
    api.categories().catch(() => null),
    api.courses({ sort: 'newest', perPage: RAIL }).catch(() => null),
    // Asked for wide, shown narrow: the newest courses are often also the
    // featured ones, and two rails showing the same four cards is one rail's
    // worth of information taking up two rails of the page.
    api.courses({ sort: 'recommended', perPage: RAIL * 3 }).catch(() => null),
    // Three, because the band is a row of three. The site's own language, so a
    // reader of the English site is not shown a row of Thai articles.
    api.posts({ perPage: 3, locale: String(uiLocale.value) as ContentLocale }).catch(() => null),
  ])
  allCategories.value = cats?.data ?? []
  newCourses.value = fresh?.data ?? []
  articles.value = latest?.data ?? []

  const alreadyShown = new Set(newCourses.value.map((c) => c.id))
  const rest = (best?.data ?? []).filter((c) => !alreadyShown.has(c.id))
  // Unless taking the overlap out would leave the rail nearly empty, in which
  // case a repeated card beats a missing section.
  featured.value = (rest.length >= 4 ? rest : (best?.data ?? [])).slice(0, RAIL)
})

const asCards = (list: PublicCourse[]) =>
  list.map((c) => courseView(c, { locale: locale.value, t, categories: allCategories.value }))

const newCards = computed(() => asCards(newCourses.value))
const featuredCards = computed(() => asCards(featured.value))

/**
 * Filters as you type, over the name and the parent's — somebody looking for
 * "ญี่ปุ่น" should find "ภาษาญี่ปุ่น · คันจิ", whose own name does not contain
 * it.
 */
const categoryQuery = ref('')
const categories = computed(() => {
  const q = categoryQuery.value.toLowerCase().trim()
  return allCategories.value
    .map((c) => {
      const parent = c.parentId ? allCategories.value.find((p) => p.id === c.parentId) : null
      return {
        id: c.id,
        name: c.name,
        /** The card's second line. Empty on a top-level category, where it
         *  would only repeat the first. */
        parentName: parent?.name ?? '',
        label: categoryLabel(c, allCategories.value),
        icon: c.icon ?? parent?.icon ?? 'book-open',
        count: c.totalCourseCount,
      }
    })
    .filter((c) => !q || c.label.toLowerCase().includes(q))
})

const journey = computed(
  () => (data.journey ?? []) as unknown as { icon: string; title: string; text: string }[],
)
const articleCards = computed(() =>
  articles.value.map((p) =>
    articleView(p, { locale: locale.value, categories: allCategories.value, formatDate: date }),
  ),
)
</script>

<template>
  <!-- 1. Hero -->
  <HeroCarousel />

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

  <!-- 7. Learning journey -->
  <section class="panel section home-journey" id="journey" aria-labelledby="journey-h">
    <div class="container">
      <div class="journey-top">
        <div>
          <p class="eyebrow">Why Minna</p>
          <h2 id="journey-h">เส้นทางการเรียนที่ออกแบบให้ใช้ได้จริง</h2>
        </div>
        <div class="journey-intro">
          <p>
            ตั้งแต่เลือกคอร์สจนถึงทำแบบทดสอบ ทุกขั้นตอนอยู่ในระบบเดียว
            ติดตามความคืบหน้าได้ตลอดเวลาจากทุกอุปกรณ์
          </p>
          <RouterLink class="btn btn--primary" :to="path('/courses')">เริ่มต้นเลือกคอร์ส</RouterLink>
        </div>
      </div>
      <ol class="journey-steps" id="journey-steps" role="list">
        <li v-for="(j, i) in journey" :key="j.title">
          <span class="js-num" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
          <div>
            <h3><AppIcon :name="j.icon" />{{ j.title }}</h3>
            <p>{{ j.text }}</p>
          </div>
        </li>
      </ol>
    </div>
  </section>

  <!-- 8. Package -->
  <section class="section home-package" id="package-cta" aria-labelledby="pkg-h">
    <div class="container">
      <div class="pkg-cta">
        <img class="pc-logo" :src="logoUrl" width="85" height="35" alt="" decoding="async" />
        <p class="eyebrow eyebrow--light">Membership Package</p>
        <h2 id="pkg-h">แพ็กเกจสมาชิก เรียนได้ทุกคอร์สในแพ็กเกจ</h2>
        <p>เลือกแพ็กเกจรายปีที่เหมาะกับคุณ เรียนคอร์สที่รวมในแพ็กเกจได้ไม่จำกัดตลอดอายุสมาชิก</p>
        <div class="pc-benefits">
          <span><AppIcon name="book-open" />คอร์สที่รวมในแพ็กเกจ</span>
          <span><AppIcon name="file-text" />เอกสารประกอบครบทุกบท</span>
          <span><AppIcon name="message" />ถาม–ตอบกับผู้สอน</span>
        </div>
        <RouterLink class="btn btn--white btn--lg" :to="path('/packages')">
          ดูแพ็กเกจสมาชิก<AppIcon name="arrow-right" />
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
