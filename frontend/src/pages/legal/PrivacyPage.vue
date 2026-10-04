<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import LegalPage from '@/components/legal/LegalPage.vue'
import LegalRelated from '@/components/legal/LegalRelated.vue'
import { useLegalText, type LeadItem } from '@/components/legal/text'
import type { LegalMeta, LegalSection } from '@/components/legal/types'

/** Minna's privacy policy. The shell draws the hero, the table of contents and
 *  the numbered headings; this file is the prose. */
const route = useRoute()
const { t, strings, rows, grid } = useLegalText()
const locale = computed(() => String(route.params.locale ?? 'th'))

/** A right, with an optional in-sentence link to the page that exercises it. */
interface RightItem extends LeadItem {
  href?: string
  link?: string
  after?: string
}

const KEYS = [
  'controller',
  'collect',
  'purpose',
  'cookies',
  'share',
  'retention',
  'rights',
  'security',
  'minors',
  'changes',
] as const

const sections = computed<LegalSection[]>(() =>
  KEYS.map((k) => ({
    id: `pv-${k}`,
    toc: t(`legal.privacy.s.${k}.toc`),
    heading: t(`legal.privacy.s.${k}.heading`),
  })),
)

const meta = computed<LegalMeta[]>(() => [
  { icon: 'calendar', text: t('legal.metaEffective') },
  { icon: 'refresh', text: t('legal.metaUpdated') },
  { icon: 'file-text', text: t('legal.metaVersion') },
])

const related = computed(() => [
  { to: '/terms', icon: 'file-text', label: t('footer.terms') },
  { to: '/purchase-terms', icon: 'credit-card', label: t('footer.purchaseTerms') },
])
</script>

<template>
  <LegalPage
    heading-id="pv-h"
    :title="t('legal.privacy.title')"
    :crumb="t('legal.privacy.crumb')"
    :lead="t('legal.privacy.lead')"
    :meta="meta"
    :intro-title="t('legal.protoTitle')"
    :intro-text="t('legal.protoText')"
    :sections="sections"
  >
    <!-- 1. Controller and contact -->
    <template #pv-controller>
      <div class="lg-prose">
        <p>
          {{ t('legal.privacy.s.controller.p1a')
          }}<b>{{ t('legal.privacy.s.controller.p1b') }}</b
          >{{ t('legal.privacy.s.controller.p1c') }}
        </p>
        <p>{{ t('legal.privacy.s.controller.p2') }}</p>
        <dl class="lg-dl">
          <template v-for="r in rows<LeadItem>('legal.privacy.s.controller.contact')" :key="r.b">
            <dt>{{ r.b }}</dt>
            <dd>{{ r.t }}</dd>
          </template>
        </dl>
      </div>
    </template>

    <!-- 2. What we collect -->
    <template #pv-collect>
      <div class="lg-prose">
        <p>{{ t('legal.privacy.s.collect.p1') }}</p>

        <h3 class="lg-h3">{{ t('legal.privacy.s.collect.h1') }}</h3>
        <ul>
          <li v-for="x in strings('legal.privacy.s.collect.account')" :key="x">{{ x }}</li>
        </ul>

        <h3 class="lg-h3">{{ t('legal.privacy.s.collect.h2') }}</h3>
        <ul>
          <li v-for="x in strings('legal.privacy.s.collect.learning')" :key="x">{{ x }}</li>
        </ul>

        <h3 class="lg-h3">{{ t('legal.privacy.s.collect.h3') }}</h3>
        <ul>
          <li v-for="x in strings('legal.privacy.s.collect.payment')" :key="x">{{ x }}</li>
        </ul>
        <p class="notice notice--warning" role="status">
          <AppIcon name="shield" /><span class="notice-body"
            ><b>{{ t('legal.privacy.s.collect.cardTitle') }}</b
            >{{ t('legal.privacy.s.collect.cardText') }}</span
          >
        </p>

        <h3 class="lg-h3">{{ t('legal.privacy.s.collect.h4') }}</h3>
        <ul>
          <li v-for="x in strings('legal.privacy.s.collect.technical')" :key="x">{{ x }}</li>
        </ul>
      </div>
    </template>

    <!-- 3. Purposes and legal bases -->
    <template #pv-purpose>
      <div class="lg-prose">
        <p>{{ t('legal.privacy.s.purpose.p1') }}</p>
        <div class="lg-table-wrap">
          <table class="lg-table">
            <caption class="sr-only">
              {{
                t('legal.privacy.s.purpose.caption')
              }}
            </caption>
            <thead>
              <tr>
                <th v-for="h in strings('legal.privacy.s.purpose.head')" :key="h" scope="col">
                  {{ h }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in grid('legal.privacy.s.purpose.rows')" :key="r[0]">
                <th scope="row">{{ r[0] }}</th>
                <td>{{ r[1] }}</td>
                <td>{{ r[2] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          {{ t('legal.privacy.s.purpose.p2a')
          }}<b>{{ t('legal.privacy.s.purpose.p2b') }}</b
          >{{ t('legal.privacy.s.purpose.p2c') }}
        </p>
      </div>
    </template>

    <!-- 4. Cookies -->
    <template #pv-cookies>
      <div class="lg-prose">
        <p>{{ t('legal.privacy.s.cookies.p1') }}</p>
        <ul>
          <li v-for="x in rows<LeadItem>('legal.privacy.s.cookies.items')" :key="x.b">
            <b>{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
        <p>{{ t('legal.privacy.s.cookies.p2') }}</p>
      </div>
    </template>

    <!-- 5. Third parties -->
    <template #pv-share>
      <div class="lg-prose">
        <p>
          {{ t('legal.privacy.s.share.p1a') }}<b>{{ t('legal.privacy.s.share.p1b') }}</b
          >{{ t('legal.privacy.s.share.p1c') }}
        </p>
        <ul>
          <li v-for="x in rows<LeadItem>('legal.privacy.s.share.items')" :key="x.b">
            <b>{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
        <p>{{ t('legal.privacy.s.share.p2') }}</p>
      </div>
    </template>

    <!-- 6. Retention -->
    <template #pv-retention>
      <div class="lg-prose">
        <p>{{ t('legal.privacy.s.retention.p1') }}</p>
        <div class="lg-table-wrap">
          <table class="lg-table">
            <caption class="sr-only">
              {{
                t('legal.privacy.s.retention.caption')
              }}
            </caption>
            <thead>
              <tr>
                <th v-for="h in strings('legal.privacy.s.retention.head')" :key="h" scope="col">
                  {{ h }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in grid('legal.privacy.s.retention.rows')" :key="r[0]">
                <th scope="row">{{ r[0] }}</th>
                <td>{{ r[1] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 7. Your rights -->
    <template #pv-rights>
      <div class="lg-prose">
        <p>{{ t('legal.privacy.s.rights.p1') }}</p>
        <ol>
          <li v-for="x in rows<RightItem>('legal.privacy.s.rights.items')" :key="x.b">
            <b>{{ x.b }}</b
            >{{ x.t }}
            <template v-if="x.link"
              ><RouterLink :to="`/${locale}${x.href}`">{{ x.link }}</RouterLink
              >{{ x.after }}</template
            >
          </li>
        </ol>
        <p>
          <b>{{ t('legal.privacy.s.rights.p2b') }}</b
          >{{ t('legal.privacy.s.rights.p2') }}
        </p>
        <p>{{ t('legal.privacy.s.rights.p3') }}</p>
      </div>
    </template>

    <!-- 8. Security -->
    <template #pv-security>
      <div class="lg-prose">
        <ul>
          <li v-for="x in strings('legal.privacy.s.security.items')" :key="x">{{ x }}</li>
        </ul>
        <p>{{ t('legal.privacy.s.security.p1') }}</p>
      </div>
    </template>

    <!-- 9. Minors -->
    <template #pv-minors>
      <div class="lg-prose">
        <p>{{ t('legal.privacy.s.minors.p1') }}</p>
        <p>{{ t('legal.privacy.s.minors.p2') }}</p>
      </div>
    </template>

    <!-- 10. Changes -->
    <template #pv-changes>
      <div class="lg-prose">
        <p>{{ t('legal.privacy.s.changes.p1') }}</p>
        <p>{{ t('legal.privacy.s.changes.p2') }}</p>
        <LegalRelated :links="related" />
      </div>
    </template>
  </LegalPage>
</template>
