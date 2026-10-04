<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'

/** An article teaser. The media link is hidden from assistive tech because the
 *  heading right below it is the real link to the same place. */
defineProps<{
  article: {
    id: string
    title: string
    desc: string
    category: string
    date: string
    image?: { src?: string; id?: string; alt?: string; fp?: string }
  }
}>()
</script>

<template>
  <article class="ac">
    <a class="ac-media" :href="`#article-${article.id}`" tabindex="-1" aria-hidden="true">
      <CourseImage
        :image="article.image"
        alt=""
        :width="830"
        :height="548"
        art-icon="newspaper"
        :art-palette="4"
      />
    </a>
    <div class="ac-body">
      <div class="ac-meta">
        <span class="badge badge--info">{{ article.category }}</span>
        <span><AppIcon name="calendar" :size="14" /> {{ article.date }}</span>
      </div>
      <h3>{{ article.title }}</h3>
      <p>{{ article.desc }}</p>
      <a class="btn btn--secondary btn--sm" :href="`#article-${article.id}`">
        อ่านบทความ <AppIcon name="arrow-right" />
      </a>
    </div>
  </article>

</template>
