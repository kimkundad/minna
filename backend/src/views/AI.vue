<template>
  <admin-layout>
    <div class="space-y-4 md:space-y-6">
      <div class="space-y-6">
        <!-- AI Stats Section -->
        <AiStats />
        <div class="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div class="xl:col-span-8">
            <UserRevenueAndStatistics />
          </div>
          <div class="xl:col-span-4">
            <ApiToken />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <UserAnalytics />
          <Projectanalytics />
        </div>
        <AiRecentTransaction />
      </div>
    </div>
  </admin-layout>
</template>

<script setup>
import AdminLayout from '../components/layout/AdminLayout.vue'
import UserAnalytics from '@/components/ai-dashboard/UserAnalytics.vue'
import Projectanalytics from '@/components/ai-dashboard/Projectanalytics.vue'
import ApiToken from '@/components/ai-dashboard/ApiToken.vue'
import AiStats from '@/components/ai-dashboard/AiStats.vue'
import UserRevenueAndStatistics from '@/components/ai-dashboard/UserRevenueAndStatistics.vue'
import AiRecentTransaction from '@/components/ai-dashboard/AiRecentTransaction.vue'
</script>
