<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPrice from '@/components/ui/AppPrice.vue'
import AppProgress from '@/components/ui/AppProgress.vue'
import CtaButton from '@/components/ui/CtaButton.vue'
import CourseImage from './CourseImage.vue'
import InstructorLine from './InstructorLine.vue'
import { openAuth } from '@/components/auth/authChannel'
import { useCartStore } from '@/stores/cart'
import { useLearningStore } from '@/stores/learning'
import type { CourseView } from '@/lib/course'

/**
 * One course, in the three shapes the design uses:
 *
 *   grid      the default tile in a rail or results grid
 *   list      wider row with a description, level and language
 *   continue  adds which lesson you stopped on and when
 *
 * Everything it draws arrives in one `view` object, so a card can never
 * disagree with the course page it links to: both are built by `courseView`.
 *
 * The learner's own state — progress, a lock, a note — is optional on that
 * object and simply absent on the public catalog, which has no session behind
 * it. The card shows the price instead, which is what a visitor needs.
 */
const props = withDefaults(
  defineProps<{ view: CourseView; variant?: 'grid' | 'list' | 'continue'; reason?: string }>(),
  { variant: 'grid' },
)

const emit = defineEmits<{
  run: [action: string, courseId?: string]
  instructors: [courseId: string]
}>()

const { t } = useI18n()
const router = useRouter()

const cid = computed(() => String(props.view.slug || props.view.id))

/**
 * The card acts on its own button rather than emitting and hoping.
 *
 * It used to leave that to whichever page drew it, and the home page's two
 * rails did not listen — so "ซื้อคอร์สนี้" there did nothing at all. A card
 * that only works on the pages that remembered to wire it up is a card that
 * will break again the next time one is added.
 *
 * Buying, adding to the cart and taking a free course all go the one way that
 * works today: to checkout with this course. The event is still emitted, for a
 * page that wants to say something about it.
 */
const cart = useCartStore()
const { t: translate } = useI18n()

/** Already in the basket, so the button says so instead of adding it twice. */
const inCart = computed(() => cart.has(props.view.id))

/** Already theirs. Nothing on a card should offer to sell it again. */
const learning = useLearningStore()
const owned = computed(() => learning.has(props.view.id))

/**
 * The card's one button is the basket, not the till.
 *
 * A card is a glance: the price, the teacher, how long it is. Buying outright
 * from there asks somebody to commit before they have seen the lessons, the
 * access period or the refund terms — all of which are on the course's own
 * page, which is where "ซื้อคอร์สนี้" belongs. From a card the honest offer is
 * the one that is easy to undo.
 *
 * `courseView` already works out the pair; this takes the second of them and
 * promotes it, so a free course still says "เรียนฟรี" and one that is not on
 * sale still says "ดูรายละเอียดคอร์ส".
 *
 * Not on a card that is showing somebody's own progress — that course is
 * already theirs, and the basket is the wrong thing to offer.
 */
const cta = computed(() => {
  // Theirs already — bought, taken free, or opened by the school. The only
  // thing to offer is the way in, and it outranks everything below: a course
  // somebody owns is never for sale again on a card.
  if (owned.value) {
    // Into the room, not onto the sales page: they have already read that one.
    const locale = props.view.href.split('/')[1] || 'th'
    const started = (props.view.progressPct ?? 0) > 0
    return {
      label: started ? t('cta.continue') : t('cta.start'),
      href: `/${locale}/learn/${props.view.slug || props.view.id}`,
      variant: 'primary' as const,
      icon: 'play',
    }
  }
  if (props.view.showProgress) return props.view.primary
  if (props.view.secondary?.action !== 'add-cart') return props.view.primary
  return inCart.value
    ? { label: t('cta.inCart'), action: 'add-cart', variant: 'secondary' as const, icon: 'check' }
    : { ...props.view.secondary, variant: 'primary' as const }
})

async function onRun(action: string, courseId?: string): Promise<void> {
  emit('run', action, courseId)
  // The locale comes from the card's own link rather than from the route:
  // `courseView` already put it there, and a card knows where it points.
  const locale = props.view.href.split('/')[1] || 'th'

  if (action === 'add-cart') {
    if (inCart.value) {
      void router.push(`/${locale}/cart`)
      return
    }
    // The basket needs an account. Rather than refusing, ask — and put the
    // course in once they are back, so the click is not thrown away.
    const added = await cart.add(props.view.id)
    if (!added) {
      openAuth({
        step: 'login',
        reason: translate('auth.reasonCart'),
        onDone: () => void cart.add(props.view.id),
      })
    }
    return
  }

  if (action === 'buy' || action === 'enroll-free') {
    void router.push({ path: `/${locale}/checkout`, query: { items: courseId ?? cid.value } })
  }
}

/** A price unless something has said otherwise. */
const showPrice = computed(() => props.view.showPrice !== false)
</script>

<template>
  <article
    class="cc"
    :class="{ 'cc--list': variant === 'list', 'cc--expired': view.expired }"
    :data-cid="cid"
  >
    <RouterLink class="cc-media" :to="view.href" tabindex="-1" aria-hidden="true">
      <CourseImage
        :image="view.image"
        :width="640"
        :height="360"
        :art-icon="view.categoryIcon"
        :art-palette="view.categoryPalette"
      />
      <div class="cc-badges">
        <AppBadge v-for="(b, i) in view.badges" :key="i" :badge="b" on-media />
      </div>
      <span v-if="view.locked" class="cc-lock" aria-hidden="true"><AppIcon name="lock" /></span>
    </RouterLink>

    <div class="cc-body">
      <div v-if="reason" class="cc-reason"><AppIcon name="sparkles" />{{ reason }}</div>

      <div class="cc-cat">{{ view.categoryName }}</div>

      <h3 class="cc-title"><RouterLink :to="view.href">{{ view.title }}</RouterLink></h3>

      <p v-if="variant === 'list'" class="cc-desc clamp-2">{{ view.shortDesc }}</p>

      <InstructorLine
        :people="view.people"
        :course-id="cid"
        @open="emit('instructors', cid)"
      />

      <!-- No CE unit here: that is the reference project's professional-credit
           scheme, and Minna awards none. -->
      <div class="cc-meta">
        <span><AppIcon name="clock" />{{ view.durationLabel }}</span>
        <span
          ><AppIcon name="book-open" />{{ t('course.lessonCount', { count: view.lessonCount }) }}</span
        >
        <template v-if="variant === 'list'">
          <span v-if="view.levelLabel"><AppIcon name="signal" />{{ view.levelLabel }}</span>
          <span class="lang"><AppIcon name="mic" />{{ view.spokenLabel }}</span>
        </template>
      </div>

      <AppProgress
        v-if="view.showProgress"
        :value="view.progressPct ?? 0"
        :muted="view.expired"
        :label="t('course.progressAria', { title: view.title })"
      />

      <div v-if="variant === 'continue' && view.showProgress" class="cc-progress-info">
        <template v-if="view.resumeTitle && (view.progressPct ?? 0) < 100">
          {{ t('course.lastLesson') }}: <b>{{ view.resumeTitle }}</b><br />
        </template>
      </div>

      <p v-if="variant === 'list' && view.note" class="cc-note">
        <AppIcon name="info" />{{ view.note }}
      </p>

      <div class="cc-foot" :class="{ 'cc-foot--end': !showPrice }">
        <AppPrice
          v-if="showPrice"
          :price="view.price"
          :normal-price="view.normalPrice"
          :is-free="view.isFree"
          :currency="view.currency"
        />
        <CtaButton
          :action="cta"
          size="sm"
          :course-id="cid"
          @run="onRun"
        />
      </div>
    </div>
  </article>
</template>
