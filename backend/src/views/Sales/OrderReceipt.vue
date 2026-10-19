<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ApiError,
  orders as ordersApi,
  settings as settingsApi,
  type OrderDetail,
  type Seller,
} from '@/lib/api'
import { formatMoney } from '@/lib/money'

/**
 * One order, on paper.
 *
 * A copy, not an original. The buyer's own receipt is the one they print from
 * their account; this exists for the times somebody rings up having lost it,
 * or walks in wanting it stamped — which is why it is reachable from the
 * orders list rather than being another thing to go and find.
 *
 * Outside the admin's shell on purpose. A printed sheet with a sidebar and a
 * breadcrumb down the side of it is not a document, and `@media print` hiding
 * half a layout is how you end up with a blank first page.
 *
 * Two things are conditional, and both for the same reason: a document should
 * not claim more than it is. The issuer block appears only once somebody has
 * filled the school's registered details in, and the sheet is headed
 * "ใบกำกับภาษี" only when a document number has actually been allocated.
 */
const route = useRoute()
const router = useRouter()

const order = ref<OrderDetail | null>(null)
const seller = ref<Seller | null>(null)
const loading = ref(true)
const error = ref('')

const id = computed(() => Number(route.params.id))

onMounted(async () => {
  try {
    const [got, who] = await Promise.all([
      ordersApi.get(id.value),
      // A missing issuer block is a gap in the sheet, not a failure of it.
      settingsApi.seller().then((r) => r.data).catch(() => null),
    ])
    order.value = got.data
    seller.value = who
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not load that order.'
  } finally {
    loading.value = false
  }
})

const isTaxInvoice = computed(() => Boolean(order.value?.invoice?.documentNo))

const buyerName = computed(() => {
  const b = order.value?.buyer
  return b ? `${b.firstName} ${b.lastName}`.trim() || b.email : '—'
})

/** What the line actually came to, after whatever came off it. */
const net = (line: { unitPrice: number; discount: number }) => line.unitPrice - line.discount

/** 0105536091238 → 0-1055-36091-23-8, which is how it is printed. */
function taxId(value: string | null): string {
  if (!value) return ''
  const d = value.replace(/\D/g, '')
  return d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : value
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const when = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : '—')

/** The browser does the work; this exists because a template cannot see
 *  `window`. */
function print(): void {
  window.print()
}

const METHOD: Record<string, string> = {
  card: 'Card',
  promptpay: 'PromptPay',
  bank_transfer: 'Bank transfer',
  free: 'No payment due',
}
</script>

<template>
  <main class="rcp">
    <!-- Everything in here is for the person at the screen, not for the page
         that comes out of the printer. -->
    <div class="rcp-bar">
      <button type="button" class="rcp-btn" @click="router.back()">← Back to orders</button>
      <button v-if="order" type="button" class="rcp-btn rcp-btn--go" @click="print">
        Print
      </button>
    </div>

    <p v-if="loading" class="rcp-note">Loading…</p>
    <p v-else-if="error || !order" class="rcp-note">{{ error || 'No such order.' }}</p>

    <article v-else class="rcp-sheet">
      <header class="rcp-head">
        <div>
          <div v-if="seller?.configured" class="rcp-seller">
            <b>{{ seller.name }}</b>
            <span v-if="seller.address">{{ seller.address }}</span>
            <span v-if="seller.taxId">
              Tax ID {{ taxId(seller.taxId) }}
              <template v-if="seller.branch"> · {{ seller.branch }}</template>
            </span>
          </div>
          <p v-else class="rcp-warn rcp-screen">
            The school's registered details are not filled in, so the issuer block is left off.
            Settings → Seller.
          </p>
        </div>

        <div class="rcp-title">
          <h1>{{ isTaxInvoice ? 'ใบกำกับภาษี / Tax invoice' : 'ใบเสร็จรับเงิน / Receipt' }}</h1>
          <dl>
            <div>
              <dt>Order</dt>
              <dd class="rcp-mono">{{ order.orderNo }}</dd>
            </div>
            <div v-if="order.invoice?.documentNo">
              <dt>Document no.</dt>
              <dd class="rcp-mono">{{ order.invoice.documentNo }}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{{ when(order.paidAt ?? order.createdAt) }}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section class="rcp-parties">
        <div>
          <h2>Billed to</h2>
          <!-- The invoice name where one was asked for: a staff member buying
               on the company's behalf is the usual case, and the company is
               who the document belongs to. -->
          <p><b>{{ order.invoice?.name || buyerName }}</b></p>
          <p v-if="order.invoice?.taxId" class="rcp-mono">Tax ID {{ taxId(order.invoice.taxId) }}</p>
          <p v-if="order.invoice?.address" class="rcp-addr">{{ order.invoice.address }}</p>
          <p v-if="order.buyer">{{ order.buyer.email }}</p>
        </div>
        <div>
          <h2>Payment</h2>
          <p>{{ order.paymentMethod ? (METHOD[order.paymentMethod] ?? order.paymentMethod) : '—' }}</p>
          <p v-if="order.paidAt">Paid {{ when(order.paidAt) }}</p>
          <p v-if="order.status !== 'paid'" class="rcp-warn">
            This order is {{ order.status }}, not paid.
          </p>
        </div>
      </section>

      <table class="rcp-lines">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" class="rcp-num">Price</th>
            <th scope="col" class="rcp-num">Discount</th>
            <th scope="col" class="rcp-num">Net</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in order.items" :key="line.id">
            <td>
              {{ line.titleSnapshot }}
              <small v-if="line.couponCode">Coupon {{ line.couponCode }}</small>
            </td>
            <td class="rcp-num rcp-mono">{{ formatMoney(line.unitPrice, order.currency) }}</td>
            <td class="rcp-num rcp-mono">
              {{ line.discount ? `−${formatMoney(line.discount, order.currency)}` : '—' }}
            </td>
            <td class="rcp-num rcp-mono">{{ formatMoney(net(line), order.currency) }}</td>
          </tr>
        </tbody>
      </table>

      <dl class="rcp-sums">
        <div>
          <dt>Subtotal</dt>
          <dd class="rcp-mono">{{ formatMoney(order.subtotal, order.currency) }}</dd>
        </div>
        <div v-if="order.courseDiscount">
          <dt>Course discounts</dt>
          <dd class="rcp-mono">−{{ formatMoney(order.courseDiscount, order.currency) }}</dd>
        </div>
        <div v-if="order.orderDiscount">
          <dt>
            Order discount
            <small v-if="order.orderCouponCode">{{ order.orderCouponCode }}</small>
          </dt>
          <dd class="rcp-mono">−{{ formatMoney(order.orderDiscount, order.currency) }}</dd>
        </div>
        <div v-if="order.vatAmount">
          <dt>VAT</dt>
          <dd class="rcp-mono">{{ formatMoney(order.vatAmount, order.currency) }}</dd>
        </div>
        <div class="rcp-grand">
          <dt>Total</dt>
          <dd class="rcp-mono">{{ formatMoney(order.total, order.currency) }}</dd>
        </div>
      </dl>

      <footer class="rcp-foot">
        <p v-if="order.invoice && !order.invoice.documentNo" class="rcp-warn">
          A full tax invoice was asked for but no number has been allocated yet, so this sheet is
          a receipt. Issue the number under Sales → Invoices.
        </p>
        <p class="rcp-thanks">Thank you.</p>
      </footer>
    </article>
  </main>
</template>

<style scoped>
/* Its own styles rather than the admin's: this is a sheet of paper that
   happens to be on a screen, and the dark theme has no business on it. */
.rcp {
  min-height: 100vh;
  padding: 24px 16px 48px;
  background: #f3f4f6;
  color: #111827;
  font-size: 14px;
}
.rcp-bar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  max-width: 760px;
  margin: 0 auto 16px;
}
.rcp-btn {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.rcp-btn:hover { background: #f9fafb; }
.rcp-btn--go { border-color: transparent; background: #465fff; color: #fff; }
.rcp-btn--go:hover { background: #3641f5; }
.rcp-note { max-width: 760px; margin: 48px auto; text-align: center; color: #6b7280; }

.rcp-sheet {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .1);
}
.rcp-head {
  display: flex;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
  padding-bottom: 24px;
  border-bottom: 2px solid #111827;
}
.rcp-seller { display: grid; gap: 2px; font-size: 13px; color: #4b5563; max-width: 320px; }
.rcp-seller b { font-size: 16px; color: #111827; }
.rcp-title { text-align: right; }
.rcp-title h1 { margin: 0 0 8px; font-size: 19px; font-weight: 700; }
.rcp-title dl { display: grid; gap: 2px; margin: 0; font-size: 13px; }
.rcp-title dl div { display: flex; justify-content: flex-end; gap: 8px; }
.rcp-title dt { color: #6b7280; }
.rcp-title dd { margin: 0; font-weight: 600; }

.rcp-parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  padding: 24px 0;
  border-bottom: 1px solid #e5e7eb;
}
.rcp-parties h2 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: #6b7280;
}
.rcp-parties p { margin: 0 0 2px; font-size: 13.5px; color: #374151; }
.rcp-addr { white-space: pre-line; }

.rcp-lines { width: 100%; border-collapse: collapse; margin: 24px 0; }
.rcp-lines th {
  padding: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: #6b7280;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}
.rcp-lines td { padding: 12px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
.rcp-lines td small { display: block; margin-top: 2px; font-size: 12px; color: #6b7280; }
.rcp-num { text-align: right; }

.rcp-sums { display: grid; gap: 6px; margin: 0 0 0 auto; max-width: 320px; }
.rcp-sums div { display: flex; justify-content: space-between; gap: 24px; font-size: 13.5px; }
.rcp-sums dt { color: #4b5563; }
.rcp-sums dt small { display: block; font-size: 12px; color: #9ca3af; }
.rcp-sums dd { margin: 0; }
.rcp-grand {
  margin-top: 6px;
  padding-top: 10px;
  border-top: 2px solid #111827;
  font-size: 16px !important;
  font-weight: 700;
}
.rcp-mono { font-variant-numeric: tabular-nums; }

.rcp-foot { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
.rcp-warn { margin: 0 0 8px; font-size: 12.5px; color: #92400e; }
.rcp-thanks { margin: 0; font-size: 13px; color: #6b7280; }

@media print {
  /* The page is the sheet. Everything that was for the screen goes. */
  .rcp { padding: 0; background: #fff; }
  .rcp-bar,
  .rcp-screen { display: none !important; }
  .rcp-sheet { max-width: none; padding: 0; border-radius: 0; box-shadow: none; }
}
</style>
