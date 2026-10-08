<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import HeroCarousel from '@/components/home/HeroCarousel.vue'
import ArticleCard from '@/components/home/ArticleCard.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import CourseRail from '@/components/course/CourseRail.vue'
import AdsSlot from '@/components/ui/AdsSlot.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import logoUrl from '@/assets/img/logo.png'
import { data, store } from '@/vendor'
import { date } from '@/lib/format'
import { vendorCourseView } from '@/lib/vendor-view'

/**
 * The home page, in the order the design sets out: hero, the three course
 * rails, categories, how learning works here, the package band, articles, with
 * advertising slots between them.
 *
 * "คอร์สของฉัน" is absent rather than empty for signed-out visitors — a rail
 * promising progress nobody has yet is noise on a first visit.
 */
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`
/** Until this page is served by our own API, its cards come from the
 *  prototype store. See `vendor-view.ts`. */
const vendorView = (id: string) => vendorCourseView(id, locale.value)

const s = store as unknown as Record<string, (...args: unknown[]) => any>

const isLoggedIn = computed(() => Boolean(s.isLoggedIn()))
const myCourses = computed(() => (isLoggedIn.value ? s.myCourses() : []))
const newCourses = computed(() => s.newCourses().slice(0, 8))
const recommended = computed(() => s.recommended().slice(0, 8))

/** Filters as you type. Matches both the English and Thai name, because people
 *  search for whichever one they happen to know. */
const categoryQuery = ref('')
const categories = computed(() => {
  const q = categoryQuery.value.toLowerCase().trim()
  const published = s.catalog() as { category: string }[]
  return data.categories
    .filter((c) => !q || `${c.name} ${c.th}`.toLowerCase().includes(q))
    .map((c) => ({ ...c, count: published.filter((x) => x.category === c.id).length }))
})

const journey = computed(
  () => (data.journey ?? []) as unknown as { icon: string; title: string; text: string }[],
)
const articles = computed(() => (data.articles ?? []) as unknown as any[])
</script>

<template>
  <!-- 1. Hero -->
  <HeroCarousel />

  <!-- 2. My courses — signed-in only -->
  <section v-if="isLoggedIn && myCourses.length" class="home-rail" id="my-courses">
    <div class="container">
      <CourseRail
        id="my"
        eyebrow="Continue Learning"
        title="คอร์สของฉัน"
        :sub="`เรียนต่อจากจุดล่าสุด · ${myCourses.length} คอร์ส`"
        :more-href="path('/account/learning')"
        more-label="ดูทั้งหมด"
        :count="myCourses.length"
      >
        <CourseCard
          v-for="c in myCourses"
          :key="c.id"
          :view="vendorView(c.id)"
          variant="continue"
        />
      </CourseRail>
    </div>
  </section>

  <!-- 3. New courses -->
  <section class="home-rail" id="new-courses">
    <div class="container">
      <CourseRail
        id="new"
        eyebrow="New Courses"
        title="คอร์สมาใหม่"
        sub="อัปเดตล่าสุดจากผู้สอนในแต่ละสาขา"
        :more-href="`${path('/courses')}?sort=new`"
        more-label="ดูคอร์สใหม่ทั้งหมด"
        :count="newCourses.length"
      >
        <CourseCard v-for="c in newCourses" :key="c.id" :view="vendorView(c.id)" />
      </CourseRail>
    </div>
  </section>

  <!-- 4. Recommended -->
  <section class="home-rail" id="rec-courses">
    <div class="container">
      <CourseRail
        id="rec"
        :eyebrow="isLoggedIn ? 'Recommended for you' : 'Featured'"
        title="คอร์สแนะนำ"
        :sub="
          isLoggedIn
            ? 'คัดจากความสนใจ ประวัติการเรียน และแพ็กเกจของคุณ'
            : 'คอร์สเด่นที่ผู้เรียนเลือกมากที่สุดและทีมงานแนะนำ'
        "
        :more-href="path('/courses')"
        more-label="ดูคอร์สทั้งหมด"
        :count="recommended.length"
      >
        <CourseCard
          v-for="r in recommended"
          :key="r.course.id"
          :view="vendorView(r.course.id)"
          :reason="isLoggedIn ? r.reason : undefined"
        />
      </CourseRail>
    </div>
  </section>

  <!-- 5. Ads -->
  <div class="container home-ads"><AdsSlot /></div>

  <!-- 6. Categories -->
  <section class="panel panel--subtle section home-cats" id="categories" aria-labelledby="cat-h">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">Course Categories</p>
        <h2 id="cat-h">หมวดหมู่คอร์ส</h2>
        <p>เลือกหมวดที่ตรงกับเป้าหมายของคุณ ครอบคลุม {{ data.categories.length }} หมวด</p>
      </div>

      <div class="cat-search">
        <div class="search-field">
          <AppIcon name="search" :size="22" />
          <label class="sr-only" for="cat-q">ค้นหาหมวดหมู่</label>
          <input
            id="cat-q"
            v-model="categoryQuery"
            type="search"
            placeholder="ค้นหาหมวดหมู่ เช่น สนทนา, JLPT, ไวยากรณ์"
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
          <span><b>{{ c.name }}</b><small>{{ c.th }}</small></span>
          <span class="cc-n">{{ c.count ? `${c.count} คอร์ส` : 'เร็ว ๆ นี้' }}</span>
        </RouterLink>
      </div>

      <p v-if="!categories.length" class="cat-empty">
        ไม่พบหมวดหมู่ที่ค้นหา ลองพิมพ์คำอื่น เช่น สนทนา หรือ เตรียมสอบ
      </p>
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
  <section class="section home-articles" id="articles" aria-labelledby="art-h">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">Knowledge</p>
        <h2 id="art-h">บทความและความรู้ล่าสุด</h2>
        <p>เคล็ดลับการเรียน ข่าวสาร และสรุปความรู้ที่นำไปใช้ได้ทันที</p>
      </div>
      <div class="grid-3" id="article-grid">
        <ArticleCard
          v-for="a in articles"
          :key="a.id"
          :article="{ ...a, date: date(a.date) }"
        />
      </div>
      <div class="text-center mt-32">
        <RouterLink class="btn btn--secondary" :to="path('/blog')">ดูบทความทั้งหมด</RouterLink>
      </div>
    </div>
  </section>

  <!-- 10. Ads -->
  <div class="container home-ads home-ads--last"><AdsSlot /></div>
</template>
