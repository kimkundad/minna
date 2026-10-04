<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import LegalPage from '@/components/legal/LegalPage.vue'
import LegalRelated from '@/components/legal/LegalRelated.vue'
import { useLegalText, type LeadItem } from '@/components/legal/text'
import type { LegalMeta, LegalSection } from '@/components/legal/types'

/**
 * Purchase and refund terms.
 *
 * `#pt-refund` is a fixed address: the checkout's terms checkbox links straight
 * to it, so the id stays whatever else moves around it.
 */
const route = useRoute()
const { t, strings, rows, grid } = useLegalText()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const KEYS = [
  'price',
  'payment',
  'coupon',
  'grant',
  'refund',
  'process',
  'transfer',
  'package',
  'complaint',
  'faq',
] as const

const sections = computed<LegalSection[]>(() =>
  KEYS.map((k) => ({
    id: `pt-${k}`,
    toc: t(`legal.purchase.s.${k}.toc`),
    heading: t(`legal.purchase.s.${k}.heading`),
  })),
)

const meta = computed<LegalMeta[]>(() => [
  { icon: 'calendar', text: t('legal.metaEffective') },
  { icon: 'refresh', text: t('legal.metaUpdated') },
  { icon: 'file-text', text: t('legal.metaVersion') },
])

const related = computed(() => [
  { to: '/terms', icon: 'file-text', label: t('footer.terms') },
  { to: '/privacy', icon: 'shield', label: t('footer.privacy') },
])

/** The FAQ opens on its first question, as the reference does. One panel at a
 *  time: these answers are short and a list of ten open ones reads worse. */
const faq = computed(() => rows<{ q: string; a: string }>('legal.purchase.s.faq.items'))
const open = ref(0)
const toggle = (i: number) => (open.value = open.value === i ? -1 : i)
</script>

<template>
  <LegalPage
    heading-id="pt-h"
    :title="t('legal.purchase.title')"
    :crumb="t('legal.purchase.crumb')"
    :lead="t('legal.purchase.lead')"
    :meta="meta"
    :intro-title="t('legal.protoTitle')"
    :intro-text="t('legal.protoText')"
    :sections="sections"
  >
    <!-- 1. Price and tax -->
    <template #pt-price>
      <div class="lg-prose">
        <ul>
          <li>
            <b>{{ t('legal.purchase.s.price.leadB') }}</b
            >{{ t('legal.purchase.s.price.leadT') }}
          </li>
          <li v-for="x in strings('legal.purchase.s.price.items')" :key="x">{{ x }}</li>
        </ul>
      </div>
    </template>

    <!-- 2. How to pay, and tax invoices -->
    <template #pt-payment>
      <div class="lg-prose">
        <p>{{ t('legal.purchase.s.payment.p1') }}</p>
        <ul>
          <li v-for="x in rows<LeadItem>('legal.purchase.s.payment.methods')" :key="x.b">
            <b>{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
        <p>
          {{ t('legal.purchase.s.payment.p2a')
          }}<b>{{ t('legal.purchase.s.payment.p2b') }}</b>
        </p>
        <h3 class="lg-h3">{{ t('legal.purchase.s.payment.h1') }}</h3>
        <ul>
          <li>
            {{ t('legal.purchase.s.payment.receiptA')
            }}<RouterLink :to="path('/account/orders')">{{
              t('legal.purchase.s.payment.receiptLink')
            }}</RouterLink
            >{{ t('legal.purchase.s.payment.receiptB') }}
          </li>
          <li>
            <b>{{ t('legal.purchase.s.payment.invoiceB') }}</b
            >{{ t('legal.purchase.s.payment.invoiceT') }}
          </li>
          <li>{{ t('legal.purchase.s.payment.correction') }}</li>
        </ul>
      </div>
    </template>

    <!-- 3. Coupons -->
    <template #pt-coupon>
      <div class="lg-prose">
        <ul>
          <li v-for="x in rows<LeadItem>('legal.purchase.s.coupon.items')" :key="x.t">
            <b v-if="x.b">{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
      </div>
    </template>

    <!-- 4. When access starts -->
    <template #pt-grant>
      <div class="lg-prose">
        <ul>
          <li v-for="x in rows<LeadItem>('legal.purchase.s.grant.items')" :key="x.t">
            <b v-if="x.b">{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
      </div>
    </template>

    <!-- 5. Refunds — the id the checkout links to -->
    <template #pt-refund>
      <div class="lg-prose">
        <p>{{ t('legal.purchase.s.refund.p1') }}</p>
        <div class="lg-table-wrap">
          <table class="lg-table">
            <caption class="sr-only">
              {{
                t('legal.purchase.s.refund.caption')
              }}
            </caption>
            <thead>
              <tr>
                <th v-for="h in strings('legal.purchase.s.refund.head')" :key="h" scope="col">
                  {{ h }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in grid('legal.purchase.s.refund.rows')" :key="r[0]">
                <th scope="row">{{ r[0] }}</th>
                <td>{{ r[1] }}</td>
                <td>{{ r[2] }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 class="lg-h3">{{ t('legal.purchase.s.refund.h1') }}</h3>
        <p>{{ t('legal.purchase.s.refund.p2') }}</p>
        <ul>
          <li>
            {{ t('legal.purchase.s.refund.alwaysA')
            }}<b>{{ t('legal.purchase.s.refund.alwaysB') }}</b
            >{{ t('legal.purchase.s.refund.alwaysC') }}
          </li>
          <li v-for="x in strings('legal.purchase.s.refund.always')" :key="x">{{ x }}</li>
        </ul>

        <h3 class="lg-h3">{{ t('legal.purchase.s.refund.h2') }}</h3>
        <ul>
          <li v-for="x in strings('legal.purchase.s.refund.neverBefore')" :key="x">{{ x }}</li>
          <li>
            {{ t('legal.purchase.s.refund.neverLinkA')
            }}<RouterLink :to="`${path('/terms')}#tm-prohibited`">{{
              t('footer.terms')
            }}</RouterLink
            >{{ t('legal.purchase.s.refund.neverLinkB') }}
          </li>
          <li v-for="x in strings('legal.purchase.s.refund.neverAfter')" :key="x">{{ x }}</li>
        </ul>
      </div>
    </template>

    <!-- 6. How a refund is handled -->
    <template #pt-process>
      <div class="lg-prose">
        <ol>
          <li v-for="x in rows<LeadItem>('legal.purchase.s.process.steps')" :key="x.b">
            <b>{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ol>
        <p class="notice notice--info" role="status">
          <AppIcon name="info" /><span class="notice-body"
            ><b>{{ t('legal.purchase.s.process.noticeTitle') }}</b
            >{{ t('legal.purchase.s.process.noticeText') }}</span
          >
        </p>
        <p>{{ t('legal.purchase.s.process.p1') }}</p>
      </div>
    </template>

    <!-- 7. Changing or transferring access -->
    <template #pt-transfer>
      <div class="lg-prose">
        <ul>
          <li v-for="x in rows<LeadItem>('legal.purchase.s.transfer.items')" :key="x.t">
            <b v-if="x.b">{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
      </div>
    </template>

    <!-- 8. Packages and renewal -->
    <template #pt-package>
      <div class="lg-prose">
        <ul>
          <li v-for="x in rows<LeadItem>('legal.purchase.s.package.items')" :key="x.t">
            <b v-if="x.b">{{ x.b }}</b
            >{{ x.t }}
          </li>
        </ul>
      </div>
    </template>

    <!-- 9. Complaints -->
    <template #pt-complaint>
      <div class="lg-prose">
        <p>{{ t('legal.purchase.s.complaint.p1') }}</p>
        <dl class="lg-dl">
          <template v-for="r in rows<LeadItem>('legal.purchase.s.complaint.contact')" :key="r.b">
            <dt>{{ r.b }}</dt>
            <dd>{{ r.t }}</dd>
          </template>
        </dl>
        <p>{{ t('legal.purchase.s.complaint.p2') }}</p>
      </div>
    </template>

    <!-- 10. FAQ -->
    <template #pt-faq>
      <div class="acc">
        <div v-for="(f, i) in faq" :key="f.q" class="acc-item">
          <button
            type="button"
            class="acc-btn"
            :aria-expanded="open === i"
            :aria-controls="`pt-faq-${i + 1}`"
            @click="toggle(i)"
          >
            <span class="acc-title">{{ f.q }}</span
            ><span class="acc-chev"><AppIcon name="chevron-down" /></span>
          </button>
          <div class="acc-panel" :id="`pt-faq-${i + 1}`" :hidden="open !== i">
            <div class="lg-prose lg-acc-body">{{ f.a }}</div>
          </div>
        </div>
      </div>
      <LegalRelated :links="related" />
    </template>
  </LegalPage>
</template>
