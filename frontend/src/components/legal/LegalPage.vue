<script setup lang="ts">
import { onBeforeUnmount, onMounted, nextTick, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import type { LegalMeta, LegalSection } from './types'

/**
 * The shell the three legal pages share: hero with breadcrumb and meta line, a
 * sticky table of contents, and the numbered sections.
 *
 * Each page passes its sections in and fills one slot per section id, so the
 * prose stays in the page and the chrome stays here. Numbers come from the
 * position in `sections`, which is why dropping one renumbers the rest without
 * anything else to edit.
 *
 * The table of contents follows the reading position. The reference had no such
 * behaviour — these documents run long enough that a static list leaves you with
 * no idea where you are — so the highlight is styled in brand.css rather than in
 * the ported legal.css.
 */
const props = defineProps<{
  /** Id of the <h1>, referenced by the hero's aria-labelledby. */
  headingId: string
  title: string
  /** The last breadcrumb, which is usually the title but may be shorter. */
  crumb: string
  lead: string
  meta: LegalMeta[]
  introTitle: string
  introText: string
  sections: LegalSection[]
}>()

const route = useRoute()
const { t } = useI18n()
const locale = String(route.params.locale ?? 'th')

const activeId = ref(props.sections[0]?.id ?? '')

/** The sticky header covers the top of the viewport, so "in view" starts below
 *  it. Read from the token rather than hardcoded, because it shrinks on phones. */
function headerOffset(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--header-h')
  return (parseFloat(raw) || 88) + 32
}

let frame = 0

function recompute() {
  frame = 0
  const limit = headerOffset()
  let current = props.sections[0]?.id ?? ''
  for (const s of props.sections) {
    const el = document.getElementById(s.id)
    if (el && el.getBoundingClientRect().top <= limit) current = s.id
  }
  // The last section is usually too short to ever reach the line above, so the
  // bottom of the page counts as having arrived at it — but only on a page that
  // scrolls at all, or a very tall window would start on the final entry.
  const doc = document.documentElement
  const scrolls = doc.scrollHeight > window.innerHeight + 4
  if (scrolls && window.scrollY + window.innerHeight >= doc.scrollHeight - 4) {
    current = props.sections[props.sections.length - 1]?.id ?? current
  }
  activeId.value = current
}

function onScroll() {
  if (!frame) frame = requestAnimationFrame(recompute)
}

/** Scrolls without touching the URL. A bare `href="#id"` would be a fragment
 *  navigation, which the router answers by running scrollBehavior — and that
 *  sends the page back to the top. `scroll-margin-top` on `.lg-sec` keeps the
 *  heading clear of the header. */
function goTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}

onMounted(async () => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  await nextTick()

  // Arriving from elsewhere with a hash — the checkout links straight to the
  // refund section. The router's own scrollBehavior sends a new page to the top
  // and runs after this component mounts, so scrolling here would simply be
  // undone; two frames later it has finished and the position sticks.
  const wanted = route.hash.slice(1)
  if (wanted && props.sections.some((s) => s.id === wanted)) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        goTo(wanted)
        recompute()
      }),
    )
  }
  recompute()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <section class="page-hero" :aria-labelledby="headingId">
    <div class="container">
      <ol class="crumbs" :aria-label="t('common.breadcrumb')">
        <li><RouterLink :to="`/${locale}`">{{ t('common.home') }}</RouterLink></li>
        <li aria-hidden="true">›</li>
        <li aria-current="page">{{ crumb }}</li>
      </ol>
      <h1 :id="headingId">{{ title }}</h1>
      <p>{{ lead }}</p>
      <p class="lg-meta">
        <span v-for="m in meta" :key="m.text"><AppIcon :name="m.icon" />{{ m.text }}</span>
      </p>
    </div>
  </section>

  <div class="container lg-layout">
    <nav class="lg-toc" :aria-label="t('legal.toc')">
      <p class="lg-toc-title">{{ t('legal.toc') }}</p>
      <ol>
        <li v-for="s in sections" :key="s.id">
          <a
            :href="`#${s.id}`"
            :aria-current="activeId === s.id ? 'location' : undefined"
            @click.prevent="goTo(s.id)"
            >{{ s.toc }}</a
          >
        </li>
      </ol>
    </nav>

    <div class="lg-content">
      <p class="notice notice--proto lg-intro" role="status">
        <AppIcon name="info" /><span class="notice-body"
          ><b>{{ introTitle }}</b>{{ introText }}</span
        >
      </p>

      <section
        v-for="(s, i) in sections"
        :key="s.id"
        class="lg-sec"
        :id="s.id"
        :aria-labelledby="`h-${s.id}`"
      >
        <h2 :id="`h-${s.id}`">{{ i + 1 }}. {{ s.heading }}</h2>
        <slot :name="s.id" />
      </section>
    </div>
  </div>
</template>
