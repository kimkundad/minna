<template>
  <router-link to="/" class="xl:hidden">
    <AppLogo />
  </router-link>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
</script>
