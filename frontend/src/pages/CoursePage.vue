<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { store, courseView, icon } from '@/vendor'

const route = useRoute()
const id = computed(() => String(route.params.id ?? '').toUpperCase())
const course = computed(() => (store as any).course(id.value))
const view = computed(() => (course.value ? courseView(id.value) : null))
</script>

<template>
  <section class="container" style="padding-block: 40px">
    <h1>ทดสอบ vendor layer</h1>
    <template v-if="course">
      <p class="lead">{{ course.title }}</p>
      <p>หมวด: {{ course.category }} · ราคา {{ course.price }} · CE {{ course.ce }}</p>
      <p>บทเรียน: {{ (store as any).lessons(course).length }} บท</p>
      <p>สถานะจาก courseView: <b>{{ view?.state }}</b></p>
      <p>ปุ่มหลัก: <b>{{ view?.primary?.label }}</b></p>
      <p>badge: {{ view?.badges?.map((b: any) => b.text).join(', ') || '—' }}</p>
      <p>ไอคอนทดสอบ: <span v-html="icon('play-circle', { size: 28 })"></span>
        <span v-html="icon('lock', { size: 28 })"></span>
        <span v-html="icon('award', { size: 28 })"></span></p>
    </template>
    <p v-else class="lead">ไม่พบคอร์ส {{ id }}</p>
  </section>
</template>
