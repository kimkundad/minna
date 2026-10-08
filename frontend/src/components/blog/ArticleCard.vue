<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import type { ArticleView } from '@/lib/article'

/**
 * One article, as a tile in the blog grid and in the home page's band.
 *
 * Everything it draws arrives prepared in one object, the same way a course
 * card works — so the card, the article page and the home page describe an
 * article identically.
 *
 * The whole tile is not a link: the title and the "read" line are. A card-sized
 * link swallows text selection and makes the category badge, which goes
 * somewhere else, impossible to reach.
 */
defineProps<{ article: ArticleView; eager?: boolean }>()

const { t } = useI18n()
</script>

<template>
  <article class="ac" :data-slug="article.slug">
    <RouterLink class="ac-media" :to="article.href" tabindex="-1" aria-hidden="true">
      <CourseImage
        :image="article.image"
        :width="640"
        :height="360"
        :art-icon="article.categoryIcon"
        :art-palette="article.categoryPalette"
        :eager="eager"
      />
    </RouterLink>

    <!-- Outside the media link, not inside it: a link inside a link is invalid
         and the category goes somewhere else from the article. -->
    <RouterLink v-if="article.categoryHref" class="ac-cat chip" :to="article.categoryHref">
      <AppIcon :name="article.categoryIcon" />
      <span>{{ article.categoryName }}</span>
    </RouterLink>

    <div class="ac-body">
      <div class="ac-meta">
        <span v-if="article.authorName"><AppIcon name="user" />{{ article.authorName }}</span>
        <span><AppIcon name="calendar" />{{ article.dateLabel }}</span>
      </div>

      <h3 class="ac-title">
        <RouterLink :to="article.href">{{ article.title }}</RouterLink>
      </h3>

      <p v-if="article.excerpt" class="ac-desc clamp-3">{{ article.excerpt }}</p>

      <div class="ac-foot">
        <RouterLink class="ac-read" :to="article.href">
          {{ t('blog.readMore') }}<AppIcon name="arrow-right" />
          <span class="sr-only">: {{ article.title }}</span>
        </RouterLink>
      </div>
    </div>
  </article>
</template>
