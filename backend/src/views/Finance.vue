<template>
  <AdminLayout>
    <div class="space-y-5">
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div class="xl:col-span-6 2xl:col-span-5">
          <TotalBalanceOverview />
        </div>
        <div class="xl:col-span-6 2xl:col-span-7">
          <FinanceStats />
        </div>
      </div>
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div class="col-span-12 space-y-5 xl:col-span-8">
          <CashflowOverview />
          <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SpendingWidget />
            <QuickSend />
          </div>
        </div>
        <div class="col-span-12 xl:col-span-4">
          <MyCards />
        </div>
      </div>
      <FinanceTransactionTable />
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import TotalBalanceOverview from '../components/finance/TotalBalanceOverview.vue'
import FinanceStats from '../components/finance/FinanceStats.vue'
import CashflowOverview from '../components/finance/CashflowOverview.vue'
import SpendingWidget from '../components/finance/SpendingWidget.vue'
import QuickSend from '../components/finance/QuickSend.vue'
import MyCards from '../components/finance/MyCards.vue'
import FinanceTransactionTable from '../components/finance/FinanceTransactionTable.vue'
import AdminLayout from '@/components/layout/AdminLayout.vue'
</script>
