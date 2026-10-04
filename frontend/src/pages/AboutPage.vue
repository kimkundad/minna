<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import { useLegalText } from '@/components/legal/text'

/**
 * About Minna, in the order the design sets out: hero, who we are, the three
 * beliefs on the dark panel, practice-oriented learning, the path from a lesson
 * to real use, the community cards, and the closing call to action.
 *
 * The reference's photography was veterinary; these are language-school photos
 * addressed the same way, so the crops and aspect ratios are unchanged.
 */
const route = useRoute()
const { t, rows, strings } = useLegalText()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

interface Titled extends Record<string, string> {
  title: string
  text: string
}

const beliefs = computed(() => rows<Titled>('about.beliefs.items'))
const checks = computed(() => strings('about.practice.checks'))
const steps = computed(() => rows<Record<string, string>>('about.platform.steps'))
const cards = computed(() => rows<Titled>('about.community.cards'))

const BELIEF_ICONS = ['book-open', 'message-square', 'route']
const STEP_ICONS = ['newspaper', 'play-circle', 'clipboard-check', 'activity']
const CARD_ICONS = ['message-square', 'users', 'globe']
const CARD_TONES = ['', 'ab-cm-ico--violet', 'ab-cm-ico--peach']

const IMAGES = {
  hero: { id: 'photo-1543269865-cbf427effbad' },
  who: { id: 'photo-1434030216411-0b793f4b4173' },
  practice: { id: 'photo-1456513080510-7bf3a84b82f8' },
  platform: { id: 'photo-1522202176988-66273c2fd55f' },
}
</script>

<template>
  <!-- 1. Hero -->
  <section class="ab-hero" aria-labelledby="ab-h1">
    <div class="ab-hero-media" data-img="who">
      <CourseImage
        :image="IMAGES.hero"
        :alt="t('about.hero.imageAlt')"
        :width="1100"
        :height="820"
        sizes="(max-width: 767px) 92vw, 56vw"
        art-icon="globe"
        :art-palette="0"
        eager
        priority
      />
    </div>
    <div class="container ab-hero-inner">
      <div class="ab-hero-copy">
        <p class="eyebrow">{{ t('about.hero.eyebrow') }}</p>
        <h1 id="ab-h1">
          {{ t('about.hero.titleA') }}<span class="accent-grad">{{ t('about.hero.titleB') }}</span>
        </h1>
        <p class="ab-lead">{{ t('about.hero.lead') }}</p>
        <div class="ab-ctas">
          <RouterLink class="btn btn--primary btn--lg" :to="path('/courses')">
            {{ t('about.hero.ctaPrimary') }}<span data-icon="arrow-right"><AppIcon name="arrow-right" /></span>
          </RouterLink>
          <a class="btn btn--secondary btn--lg" href="#who">{{ t('about.hero.ctaSecondary') }}</a>
        </div>
      </div>
    </div>
  </section>

  <!-- 2. Who we are -->
  <section class="section ab-who" id="who" aria-labelledby="ab-who-h" tabindex="-1">
    <div class="container ab-who-grid">
      <div class="ab-who-media" data-img="intro">
        <CourseImage
          :image="IMAGES.who"
          :alt="t('about.who.imageAlt')"
          :width="640"
          :height="780"
          sizes="(max-width: 767px) 92vw, 34vw"
          art-icon="book-open"
          :art-palette="3"
        />
      </div>
      <div class="ab-who-copy">
        <p class="eyebrow">{{ t('about.who.eyebrow') }}</p>
        <h2 id="ab-who-h">{{ t('about.who.title') }}</h2>
        <span class="ab-quote" data-icon="quote" aria-hidden="true"><AppIcon name="quote" /></span>
        <p class="ab-who-quote">{{ t('about.who.quote') }}</p>
        <p class="ab-who-body">{{ t('about.who.body') }}</p>
        <p class="ab-sign">
          <span class="ab-sign-line" aria-hidden="true"></span><span>{{ t('about.who.sign') }}</span>
        </p>
      </div>
    </div>
  </section>

  <!-- 3. What we believe -->
  <section class="panel panel--dark section ab-beliefs" aria-labelledby="ab-bel-h">
    <div class="container">
      <div class="ab-bel-top">
        <div>
          <p class="eyebrow eyebrow--light">{{ t('about.beliefs.eyebrow') }}</p>
          <h2 id="ab-bel-h">{{ t('about.beliefs.title') }}</h2>
        </div>
        <p class="ab-bel-intro">{{ t('about.beliefs.intro') }}</p>
      </div>
      <ol class="ab-bel-list" role="list">
        <li v-for="(b, i) in beliefs" :key="b.title">
          <span class="ab-bel-num" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
          <h3>
            <span :data-icon="BELIEF_ICONS[i]"><AppIcon :name="BELIEF_ICONS[i] ?? 'book-open'" /></span
            >{{ b.title }}
          </h3>
          <p>{{ b.text }}</p>
        </li>
      </ol>
    </div>
  </section>

  <!-- 4. Practice-oriented -->
  <section class="section ab-practice" aria-labelledby="ab-pr-h">
    <div class="container ab-pr-grid">
      <div class="ab-pr-media" data-img="practice">
        <CourseImage
          :image="IMAGES.practice"
          :alt="t('about.practice.imageAlt')"
          :width="800"
          :height="680"
          sizes="(max-width: 767px) 92vw, 48vw"
          art-icon="book-open"
          :art-palette="4"
        />
      </div>
      <div class="ab-pr-panel">
        <span class="ab-pr-pin" data-icon="message-square" aria-hidden="true"><AppIcon name="message-square" /></span>
        <p class="eyebrow eyebrow--cyan">{{ t('about.practice.eyebrow') }}</p>
        <h2 id="ab-pr-h">{{ t('about.practice.title') }}</h2>
        <p class="ab-pr-text">{{ t('about.practice.text') }}</p>
        <ul class="ab-checks" role="list">
          <li v-for="c in checks" :key="c">
            <span data-icon="check-circle"><AppIcon name="check-circle" /></span>{{ c }}
          </li>
        </ul>
        <RouterLink class="link-arrow" :to="path('/courses')">
          {{ t('about.practice.link') }}<span data-icon="arrow-right"><AppIcon name="arrow-right" /></span>
        </RouterLink>
      </div>
    </div>
  </section>

  <!-- 5. From a lesson to real use -->
  <section class="section ab-platform" aria-labelledby="ab-pf-h">
    <div class="container ab-pf-grid">
      <div class="ab-pf-copy">
        <span class="ab-quote ab-quote--cyan" data-icon="layers" aria-hidden="true"><AppIcon name="layers" /></span>
        <p class="eyebrow">{{ t('about.platform.eyebrow') }}</p>
        <h2 id="ab-pf-h">{{ t('about.platform.title') }}</h2>
        <p class="ab-pf-lead">{{ t('about.platform.lead') }}</p>
        <ul class="ab-pf-steps" role="list">
          <li v-for="(s, i) in steps" :key="s.title">
            <span :data-icon="STEP_ICONS[i]"><AppIcon :name="STEP_ICONS[i] ?? 'play-circle'" /></span>{{ s.title }}
          </li>
        </ul>
      </div>
      <div class="ab-pf-media">
        <div class="ab-pf-img" data-img="platform">
          <CourseImage
            :image="IMAGES.platform"
            :alt="t('about.platform.imageAlt')"
            :width="960"
            :height="680"
            sizes="(max-width: 767px) 92vw, 56vw"
            art-icon="monitor"
            :art-palette="1"
          />
        </div>
        <div class="ab-float">
          <span class="ab-float-ico" data-icon="badge-check" aria-hidden="true"><AppIcon name="badge-check" /></span>
          <span class="ab-float-text">
            <b>{{ t('about.platform.floatTitle') }}</b><small>{{ t('about.platform.floatText') }}</small>
          </span>
        </div>
      </div>
    </div>
  </section>

  <!-- 6. Community -->
  <section class="panel panel--subtle section ab-community" aria-labelledby="ab-cm-h">
    <div class="container">
      <div class="section-head">
        <p class="eyebrow">{{ t('about.community.eyebrow') }}</p>
        <h2 id="ab-cm-h">{{ t('about.community.title') }}</h2>
        <p>{{ t('about.community.sub') }}</p>
      </div>
      <ul class="grid-3 ab-cm-grid" role="list">
        <li v-for="(c, i) in cards" :key="c.title" class="ab-cm-card">
          <span
            class="ab-cm-ico"
            :class="CARD_TONES[i]"
            :data-icon="CARD_ICONS[i]"
            aria-hidden="true"
          ><AppIcon :name="CARD_ICONS[i] ?? 'users'" /></span>
          <h3>{{ c.title }}</h3>
          <p>{{ c.text }}</p>
        </li>
      </ul>
    </div>
  </section>

  <!-- 7. Final CTA -->
  <section class="section ab-cta-wrap" aria-labelledby="ab-cta-h">
    <div class="container">
      <div class="ab-cta">
        <span class="ab-cta-ico" data-icon="compass" aria-hidden="true"><AppIcon name="compass" /></span>
        <h2 id="ab-cta-h" class="h3">{{ t('about.cta.title') }}</h2>
        <p>{{ t('about.cta.text') }}</p>
        <RouterLink class="btn btn--white btn--lg" :to="path('/courses')">
          {{ t('about.cta.button') }}<span data-icon="arrow-right"><AppIcon name="arrow-right" /></span>
        </RouterLink>
      </div>
    </div>
  </section>
</template>
