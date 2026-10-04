<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import CourseCard from '@/components/course/CourseCard.vue'
import CourseRail from '@/components/course/CourseRail.vue'
import AdsSlot from '@/components/ui/AdsSlot.vue'
import { store } from '@/vendor'

const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))

const catalog = computed(
  () => (store as unknown as { catalog: () => { id: string }[] }).catalog(),
)
const newest = computed(
  () => (store as unknown as { newCourses: () => { id: string }[] }).newCourses?.() ?? catalog.value,
)
</script>

<template>
  <section class="container" style="padding-block: 40px">
    <CourseRail
      id="home-new"
      eyebrow="New"
      title="คอร์สมาใหม่"
      sub="คอร์สที่เพิ่งเปิดให้เรียน"
      :more-href="`/${locale}/courses`"
      more-label="ดูคอร์สทั้งหมด"
      :count="newest.length"
    >
      <CourseCard v-for="c in newest" :key="c.id" :course-id="c.id" />
    </CourseRail>
  </section>

  <section class="container" style="padding-block: 24px 48px">
    <AdsSlot />
  </section>
</template>
