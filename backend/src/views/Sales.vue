<template>
  <admin-layout>
    <div class="space-y-6">
      <!-- Top Section -->
      <SalesStats />

      <div class="grid grid-cols-12 gap-4 md:gap-6">
        <!-- Main Chart Section -->
        <div class="col-span-12">
          <UserRevenueAndStatsChart />
        </div>

        <!-- Retention, Channel, Country Section -->
        <div class="col-span-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
          <UserRententionTable />
          <SalesChannel />
          <SalesChannelCountry />
        </div>

        <!-- Top Products Section -->
        <div class="col-span-12">
          <TopProduct />
        </div>
      </div>
    </div>
  </admin-layout>
</template>

<script setup>
import AdminLayout from '../components/layout/AdminLayout.vue'
import SalesStats from '../components/sales/SalesStats.vue'
import UserRevenueAndStatsChart from '../components/sales/UserRevenueAndStatsChart.vue'
import SalesChannel from '../components/sales/SalesChannel.vue'
import SalesChannelCountry from '../components/sales/SalesChannelCountry.vue'
import TopProduct from '../components/sales/TopProduct.vue'
import UserRententionTable from '@/components/sales/UserRententionTable.vue'
</script>
