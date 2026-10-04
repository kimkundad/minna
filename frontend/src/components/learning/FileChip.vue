
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { bytes } from './learning'
import type { AttachedFile } from './types'

/**
 * One attached file, as a chip with its name and size.
 *
 * The prototype stores a name, a size and a type and never the bytes, so the
 * download link goes nowhere on purpose — `data-proto-link` marks it as one of
 * the prototype's dead ends rather than a broken link.
 */
const props = defineProps<{
  file: AttachedFile
  /** `qz-chip` on the quiz, `rs-chip` on the result page. */
  extraClass?: string
  change?: boolean
  remove?: boolean
  download?: boolean
}>()

const emit = defineEmits<{ pick: []; remove: [] }>()

const { t } = useI18n()

const isImage = computed(
  () => /^image\//.test(props.file.type ?? '') || /\.(png|jpe?g)$/i.test(props.file.name ?? ''),
)
</script>

<template>
  <div class="file-chip" :class="props.extraClass">
    <span class="fc-ico"><AppIcon :name="isImage ? 'image' : 'file-text'" /></span>
    <span class="fc-name">{{ props.file.name }}</span>
    <span class="fc-size">{{ bytes(props.file.size) }}</span>
    <button
      v-if="props.change"
      type="button"
      class="btn btn--ghost btn--sm"
      data-pick
      @click="emit('pick')"
    >
      <AppIcon name="refresh" /><span class="hide-sm">{{ t('learning.attach.change') }}</span>
    </button>
    <button
      v-if="props.remove"
      type="button"
      class="icon-btn icon-btn--ghost icon-btn--sm"
      data-remove-file
      :aria-label="t('learning.attach.removeNamed', { name: props.file.name })"
      @click="emit('remove')"
    >
      <AppIcon name="trash" />
    </button>
    <a
      v-if="props.download"
      class="icon-btn icon-btn--ghost icon-btn--sm"
      href="#download-file"
      data-proto-link
      :aria-label="t('learning.attach.downloadNamed', { name: props.file.name })"
    >
      <AppIcon name="download" />
    </a>
  </div>
</template>
