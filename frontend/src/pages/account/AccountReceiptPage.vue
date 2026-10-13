<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import { ApiError, api, type MyOrder, type Seller } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { baht as toBaht } from '@/lib/course'
import { money as fmtMoney, dateLong } from '@/lib/format'

/**
 * One order, as a sheet to keep.
 *
 * There is no PDF service and this does not pretend to be one: it is a page
 * laid out for paper, and the browser's own "print to PDF" produces the file.
 * That is one less thing to run, and the result is a document the buyer made
 * themselves, which is honest about what it is.
 *
 * Two things are deliberately conditional. The issuer block is left out
 * entirely until the school's registered details are set, because a receipt
 * with a blank issuer looks official and says nothing. And it is headed
 * "ใบกำกับภาษี" only once a document number has actually been allocated —
 * before that it is a receipt, and calling it anything else would be claiming
 * a number that does not exist.
 */
const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()

const locale = computed(() => String(route.params.locale ?? 'th'))

/**
 * Every figure on a receipt is in the currency that receipt was paid in.
 *
 * One order, so one currency — the basket refuses to mix them. A receipt that
 * printed 'บาท' over a dollar charge would be a document saying the wrong
 * thing, which matters more here than anywhere else on the site.
 */
const money = (n: number) => fmtMoney(n, order.value?.currency ?? 'THB', locale.value)
const path = (p: string) => `/${locale.value}${p}`
const orderNo = computed(() => String(route.params.orderNo ?? ''))

const order = ref<MyOrder | null>(null)
const seller = ref<Seller | null>(null)
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [mine, who] = await Promise.all([
      api.myOrders(),
      // A missing issuer block is a gap in the sheet, not a failure of it.
      api.seller().then((r) => r.data).catch(() => null),
    ])
    order.value = mine.data.find((o) => o.orderNo === orderNo.value) ?? null
    seller.value = who
    if (!order.value) error.value = t('account.receipt.notFound')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('account.orders.loadFailed')
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** A tax invoice only once the number exists. */
const isTaxInvoice = computed(() => Boolean(order.value?.invoice?.documentNo))

const buyer = computed(() => {
  const o = order.value
  if (o?.invoice) return { name: o.invoice.name, tax: true }
  const u = auth.user
  return { name: u ? `${u.firstName} ${u.lastName}`.trim() : '', tax: false }
})

/** Thai tax IDs are written 0-0000-00000-00-0. */
function taxId(value: string | null): string {
  if (!value || value.length !== 13) return value ?? ''
  return `${value[0]}-${value.slice(1, 5)}-${value.slice(5, 10)}-${value.slice(10, 12)}-${value[12]}`
}

function print(): void {
  window.print()
}
</script>

<template>
  <main class="rc-page">
    <div class="container">
      <div class="rc-bar no-print">
        <RouterLink class="btn btn--ghost btn--sm" :to="path('/account/orders')">
          <AppIcon name="arrow-left" />{{ t('account.receipt.back') }}
        </RouterLink>
        <button v-if="order" type="button" class="btn btn--primary btn--sm" @click="print">
          <AppIcon name="download" />{{ t('account.receipt.print') }}
        </button>
      </div>

      <div v-if="loading" class="state-box state-box--plain">
        <p>{{ t('account.orders.loading') }}</p>
      </div>

      <div v-else-if="error || !order" class="state-box state-box--plain">
        <div class="state-ico"><AppIcon name="alert-circle" /></div>
        <h3>{{ t('account.receipt.notFound') }}</h3>
        <p>{{ error }}</p>
        <div class="state-actions">
          <RouterLink class="btn btn--secondary" :to="path('/account/orders')">
            {{ t('account.receipt.back') }}
          </RouterLink>
        </div>
      </div>

      <article v-else class="rc-sheet">
        <header class="rc-head">
          <div class="rc-brand">
            <BrandLogo class="rc-logo" />
            <div v-if="seller?.configured" class="rc-seller">
              <b>{{ seller.name }}</b>
              <span v-if="seller.address" class="rc-addr">{{ seller.address }}</span>
              <span v-if="seller.taxId">
                {{ t('account.receipt.taxIdLabel') }} {{ taxId(seller.taxId) }}
                <template v-if="seller.branch"> · {{ seller.branch }}</template>
              </span>
            </div>
          </div>
          <div class="rc-title">
            <h1>{{ isTaxInvoice ? t('account.receipt.titleTax') : t('account.receipt.title') }}</h1>
            <dl>
              <div>
                <dt>{{ t('account.orders.order') }}</dt>
                <dd class="tabular">{{ order.orderNo }}</dd>
              </div>
              <div v-if="order.invoice?.documentNo">
                <dt>{{ t('account.receipt.documentNo') }}</dt>
                <dd class="tabular">{{ order.invoice.documentNo }}</dd>
              </div>
              <div>
                <dt>{{ t('account.receipt.issuedAt') }}</dt>
                <dd>{{ dateLong(order.paidAt ?? order.createdAt) }}</dd>
              </div>
            </dl>
          </div>
        </header>

        <section class="rc-parties">
          <div>
            <h2>{{ t('account.receipt.buyer') }}</h2>
            <p><b>{{ buyer.name }}</b></p>
            <p v-if="order.invoice">
              {{ t('account.receipt.taxIdLabel') }}
              <span class="tabular">{{ t('account.receipt.onFile') }}</span>
            </p>
            <p>{{ auth.user?.email }}</p>
          </div>
          <div>
            <h2>{{ t('account.orders.methodLabel') }}</h2>
            <p>{{ order.method ? t(`account.orders.method.${order.method}`) : '—' }}</p>
            <p v-if="order.paidAt">
              {{ t('account.orders.paidAt') }} {{ dateLong(order.paidAt) }}
            </p>
          </div>
        </section>

        <table class="rc-lines">
          <thead>
            <tr>
              <th scope="col">{{ t('account.receipt.item') }}</th>
              <th scope="col" class="rc-num">{{ t('account.receipt.unitPrice') }}</th>
              <th scope="col" class="rc-num">{{ t('account.receipt.discount') }}</th>
              <th scope="col" class="rc-num">{{ t('account.orders.net') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in order.items" :key="line.id">
              <td>
                {{ line.title }}
                <small v-if="line.couponCode">
                  {{ t('account.orders.coupon', { code: line.couponCode }) }}
                </small>
              </td>
              <td class="rc-num tabular">{{ money(toBaht(line.unitPrice)) }}</td>
              <td class="rc-num tabular">{{ line.discount ? `−${money(toBaht(line.discount))}` : '—' }}</td>
              <td class="rc-num tabular">{{ money(toBaht(line.net)) }}</td>
            </tr>
          </tbody>
        </table>

        <dl class="rc-sums">
          <div>
            <dt>{{ t('account.orders.subtotal') }}</dt>
            <dd class="tabular">{{ money(toBaht(order.subtotal)) }}</dd>
          </div>
          <div v-if="order.courseDiscount">
            <dt>{{ t('account.orders.courseDiscount') }}</dt>
            <dd class="tabular">−{{ money(toBaht(order.courseDiscount)) }}</dd>
          </div>
          <div v-if="order.orderDiscount">
            <dt>
              {{ t('account.orders.orderDiscount') }}
              <small v-if="order.orderCouponCode">{{ order.orderCouponCode }}</small>
            </dt>
            <dd class="tabular">−{{ money(toBaht(order.orderDiscount)) }}</dd>
          </div>
          <div v-if="order.vatAmount">
            <dt>{{ t('account.orders.vat') }}</dt>
            <dd class="tabular">{{ money(toBaht(order.vatAmount)) }}</dd>
          </div>
          <div class="rc-grand">
            <dt>{{ t('account.receipt.grandTotal') }}</dt>
            <dd class="tabular">{{ money(toBaht(order.total)) }}</dd>
          </div>
        </dl>

        <footer class="rc-foot">
          <p v-if="!seller?.configured" class="rc-warn no-print">
            <AppIcon name="info" />{{ t('account.receipt.noSeller') }}
          </p>
          <p v-if="order.invoice && !order.invoice.documentNo" class="rc-warn">
            <AppIcon name="info" />{{ t('account.receipt.taxPending') }}
          </p>
          <p class="rc-thanks">{{ t('account.receipt.thanks') }}</p>
        </footer>
      </article>
    </div>
  </main>
</template>
