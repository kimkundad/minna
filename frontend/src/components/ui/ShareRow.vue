<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useShare } from '@/composables/useShare'

/**
 * The four ways to pass this page along: LINE, Facebook, X, and the address.
 *
 * Markup and logic in one place so the article page and the course page offer
 * the same four, in the same order, with the same labels. They had a copy
 * each, which is how one of them ends up a service behind.
 *
 * `label` is a prop because the two pages name the thing being shared —
 * "share this article" against "share this course" — and that reads better
 * than a word that covers both.
 */
const props = defineProps<{
  /** What is being shared, for the text X prefills. */
  title?: string | undefined
  /** The heading beside the buttons. */
  label: string
}>()

const { t } = useI18n()
const { shareLinks, copied, copyLink } = useShare(toRef(props, 'title'))

const copyLabel = computed(() => (copied.value ? t('blog.copied') : t('blog.copyLink')))
</script>

<template>
  <div class="bl-share">
    <span class="bl-share-label">{{ props.label }}</span>
    <ul class="bl-share-list" role="list">
      <li v-for="s in shareLinks" :key="s.key">
        <a
          class="bl-share-btn"
          :href="s.href"
          target="_blank"
          rel="noopener noreferrer"
          :data-share="s.key"
        >
          <AppIcon :name="s.icon" />{{ s.label }}
        </a>
      </li>
      <li>
        <button
          type="button"
          class="bl-share-btn"
          :class="{ 'is-done': copied }"
          data-share="copy"
          @click="copyLink"
        >
          <AppIcon :name="copied ? 'check' : 'link'" />{{ copyLabel }}
        </button>
      </li>
    </ul>
  </div>
</template>
