<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useRoute } from 'vue-router'

const route = useRoute()
const locale = String(route.params.locale ?? 'th')
</script>

<template>
  <section class="container" style="padding-block: 48px">
    <h1>Minna</h1>
    <p class="lead">หน้านี้เป็นที่ว่างไว้ก่อน งานพอร์ตเริ่มที่หน้ารายละเอียดคอร์ส</p>
    <p>
      <RouterLink class="btn btn--primary" :to="`/${locale}/courses/COURSE-001`">
        ไปหน้ารายละเอียดคอร์ส
      </RouterLink>
    </p>
  </section>
</template>
