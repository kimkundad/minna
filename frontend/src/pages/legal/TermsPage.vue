<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import LegalPage from '@/components/legal/LegalPage.vue'
import LegalRelated from '@/components/legal/LegalRelated.vue'
import { useLegalText, type LeadItem } from '@/components/legal/text'
import type { LegalMeta, LegalSection } from '@/components/legal/types'

/**
 * Minna's terms of use.
 *
 * The reference's section 6 was "Quizzes, certificates and CE units". Minna
 * awards neither certificates nor continuing-education credit, so the section
 * keeps its place but is now about quizzes and what a Minna level does and does
 * not mean — which is the clause people actually need. Section 9 loses the
 * veterinary practice disclaimer for the same reason.
 */
const route = useRoute()
const { t, strings, rows } = useLegalText()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const KEYS = [
  'accept',
  'eligibility',
  'account',
  'access',
  'ip',
  'quizzes',
  'prohibited',
  'suspend',
  'liability',
  'law',
] as const

/** Anchor ids stay as the reference had them, apart from the renamed section —
 *  other pages and old links point at these. */
const IDS: Record<(typeof KEYS)[number], string> = {
  accept: 'tm-accept',
  eligibility: 'tm-eligibility',
  account: 'tm-account',
  access: 'tm-access',
  ip: 'tm-ip',
  quizzes: 'tm-quizzes',
  prohibited: 'tm-prohibited',
  suspend: 'tm-suspend',
  liability: 'tm-liability',
  law: 'tm-law',
}

const sections = computed<LegalSection[]>(() =>
  KEYS.map((k) => ({
    id: IDS[k],
    toc: t(`legal.terms.s.${k}.toc`),
    heading: t(`legal.terms.s.${k}.heading`),
  })),
)

const meta = computed<LegalMeta[]>(() => [
  { icon: 'calendar', text: t('legal.metaEffective') },
  { icon: 'refresh', text: t('legal.metaUpdated') },
  { icon: 'file-text', text: t('legal.metaVersion') },
])

const related = computed(() => [
  { to: '/privacy', icon: 'shield', label: t('footer.privacy') },
  { to: '/purchase-terms', icon: 'credit-card', label: t('footer.purchaseTerms') },
])
</script>

<template>
  <LegalPage
    heading-id="tm-h"
    :title="t('legal.terms.title')"
    :crumb="t('legal.terms.crumb')"
    :lead="t('legal.terms.lead')"
    :meta="meta"
    :intro-title="t('legal.protoTitle')"
    :intro-text="t('legal.protoText')"
    :sections="sections"
  >
    <!-- 1. Acceptance and definitions -->
    <template #tm-accept>
      <div class="lg-prose">
        <p>
          {{ t('legal.terms.s.accept.p1a')
          }}<RouterLink :to="path('/privacy')">{{ t('footer.privacy') }}</RouterLink
          >{{ t('legal.terms.s.accept.p1b')
          }}<RouterLink :to="path('/purchase-terms')">{{ t('footer.purchaseTerms') }}</RouterLink
          >{{ t('legal.terms.s.accept.p1c') }}
        </p>
        <h3 class="lg-h3">{{ t('legal.terms.s.accept.h1') }}</h3>
        <ul>
          <li v-for="x in rows<LeadItem>('legal.terms.s.accept.terms')" :key="x.b">
            <b>{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
      </div>
    </template>

    <!-- 2. Who can use it -->
    <template #tm-eligibility>
      <div class="lg-prose">
        <p>{{ t('legal.terms.s.eligibility.p1') }}</p>
        <ul>
          <li v-for="x in rows<LeadItem>('legal.terms.s.eligibility.kinds')" :key="x.b">
            <b>{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
        <p>{{ t('legal.terms.s.eligibility.p2') }}</p>
        <p>{{ t('legal.terms.s.eligibility.p3') }}</p>
      </div>
    </template>

    <!-- 3. Your account -->
    <template #tm-account>
      <div class="lg-prose">
        <ul>
          <li>
            <b>{{ t('legal.terms.s.account.leadB') }}</b
            >{{ t('legal.terms.s.account.leadT') }}
          </li>
          <li v-for="x in strings('legal.terms.s.account.items')" :key="x">{{ x }}</li>
        </ul>
      </div>
    </template>

    <!-- 4. Access and duration -->
    <template #tm-access>
      <div class="lg-prose">
        <p>{{ t('legal.terms.s.access.p1') }}</p>
        <h3 class="lg-h3">{{ t('legal.terms.s.access.h1') }}</h3>
        <ul>
          <li v-for="x in rows<LeadItem>('legal.terms.s.access.kinds')" :key="x.b">
            <b>{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
        <h3 class="lg-h3">{{ t('legal.terms.s.access.h2') }}</h3>
        <ul>
          <li v-for="x in strings('legal.terms.s.access.expiry')" :key="x">{{ x }}</li>
        </ul>
        <p>{{ t('legal.terms.s.access.p2') }}</p>
      </div>
    </template>

    <!-- 5. Intellectual property -->
    <template #tm-ip>
      <div class="lg-prose">
        <p>{{ t('legal.terms.s.ip.p1') }}</p>
        <p>
          <b>{{ t('legal.terms.s.ip.banner') }}</b>
        </p>
        <ul>
          <li v-for="x in strings('legal.terms.s.ip.forbidden')" :key="x">{{ x }}</li>
        </ul>
        <p>{{ t('legal.terms.s.ip.p2') }}</p>
      </div>
    </template>

    <!-- 6. Quizzes and what a level means -->
    <template #tm-quizzes>
      <div class="lg-prose">
        <h3 class="lg-h3">{{ t('legal.terms.s.quizzes.h1') }}</h3>
        <ul>
          <li v-for="x in strings('legal.terms.s.quizzes.rules')" :key="x">{{ x }}</li>
        </ul>
        <h3 class="lg-h3">{{ t('legal.terms.s.quizzes.h2') }}</h3>
        <p>{{ t('legal.terms.s.quizzes.p1') }}</p>
        <h3 class="lg-h3">{{ t('legal.terms.s.quizzes.h3') }}</h3>
        <p class="notice notice--warning" role="status">
          <AppIcon name="alert-triangle" /><span class="notice-body"
            ><b>{{ t('legal.terms.s.quizzes.noticeTitle') }}</b
            >{{ t('legal.terms.s.quizzes.noticeText') }}</span
          >
        </p>
        <p>{{ t('legal.terms.s.quizzes.p2') }}</p>
      </div>
    </template>

    <!-- 7. What you must not do -->
    <template #tm-prohibited>
      <div class="lg-prose">
        <p>{{ t('legal.terms.s.prohibited.p1') }}</p>
        <ul>
          <li v-for="x in strings('legal.terms.s.prohibited.items')" :key="x">{{ x }}</li>
        </ul>
      </div>
    </template>

    <!-- 8. Suspending and closing an account -->
    <template #tm-suspend>
      <div class="lg-prose">
        <p>
          <b>{{ t('legal.terms.s.suspend.byYouB') }}</b
          >{{ t('legal.terms.s.suspend.byYouT')
          }}<RouterLink :to="path('/purchase-terms')">{{ t('footer.purchaseTerms') }}</RouterLink
          >{{ t('legal.terms.s.suspend.byYouEnd') }}
        </p>
        <p>
          <b>{{ t('legal.terms.s.suspend.byUsB') }}</b
          >{{ t('legal.terms.s.suspend.byUsT') }}
        </p>
        <ul>
          <li v-for="x in strings('legal.terms.s.suspend.reasons')" :key="x">{{ x }}</li>
        </ul>
        <p>{{ t('legal.terms.s.suspend.p1') }}</p>
      </div>
    </template>

    <!-- 9. Limitation of liability -->
    <template #tm-liability>
      <div class="lg-prose">
        <p class="notice notice--danger" role="alert">
          <AppIcon name="alert-triangle" /><span class="notice-body"
            ><b>{{ t('legal.terms.s.liability.noticeTitle') }}</b
            >{{ t('legal.terms.s.liability.noticeText') }}</span
          >
        </p>
        <ul>
          <li v-for="x in strings('legal.terms.s.liability.items')" :key="x">{{ x }}</li>
          <li>
            <b>{{ t('legal.terms.s.liability.capB') }}</b
            >{{ t('legal.terms.s.liability.capT') }}
          </li>
        </ul>
        <p>{{ t('legal.terms.s.liability.p1') }}</p>
      </div>
    </template>

    <!-- 10. Governing law and changes -->
    <template #tm-law>
      <div class="lg-prose">
        <p>{{ t('legal.terms.s.law.p1') }}</p>
        <p>{{ t('legal.terms.s.law.p2') }}</p>
        <p>{{ t('legal.terms.s.law.p3') }}</p>
        <LegalRelated :links="related" />
      </div>
    </template>
  </LegalPage>
</template>
