<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { api, mediaUrl } from '@/lib/api'
import type { AdPlacement, ContentLocale, PublicAd } from '@/lib/api'

/**
 * A reserved advertising block.
 *
 * It renders at full size whether or not anything is sold, so the layout does
 * not shift when a campaign starts — which is also why the empty state is the
 * marked-out box rather than nothing: a box that disappears when unsold means
 * every page moves the day something is bought.
 *
 * Two pictures, one per shape. The box is 4:1 across a desktop and 4:5 on a
 * phone, and `<picture>` lets the browser choose before it fetches, so a phone
 * never downloads the wide one.
 */
const props = defineProps<{ placement: AdPlacement; extraClass?: string }>()

const { t, locale } = useI18n()

const ad = ref<PublicAd | null>(null)

async function load(): Promise<void> {
  try {
    const res = await api.ads([props.placement], String(locale.value) as ContentLocale)
    ad.value = res.data[props.placement] ?? null
  } catch {
    // Nothing sold and a failed request look the same to a reader, and the
    // reserved box is the right answer to both.
    ad.value = null
  }
}

onMounted(load)
watch(() => [props.placement, locale.value], load)

const desktop = computed(() =>
  ad.value?.imageDesktopPath ? mediaUrl(ad.value.imageDesktopPath) : null,
)
const mobile = computed(() =>
  ad.value?.imageMobilePath ? mediaUrl(ad.value.imageMobilePath) : null,
)

/** Only once there is something to show. A campaign with no artwork uploaded
 *  yet is still a draft as far as the page is concerned. */
const live = computed(() => Boolean(ad.value && (desktop.value || mobile.value)))
</script>

<template>
  <aside class="ads" :class="extraClass" :aria-label="t('ads.region')">
    <!-- `sponsored` on the link, and the label stays visible: a reader is
         entitled to know which part of the page was paid for. -->
    <a
      v-if="live && ad"
      class="ads-box ads-box--live"
      :href="ad.href"
      target="_blank"
      rel="sponsored noopener noreferrer"
      :data-ad="ad.id"
    >
      <picture>
        <source v-if="mobile" media="(max-width: 767px)" :srcset="mobile" />
        <img :src="desktop ?? mobile ?? ''" :alt="ad.imageAlt ?? ''" loading="lazy" />
      </picture>
      <span class="ads-label">{{ t('ads.label') }}</span>
    </a>

    <div v-else class="ads-box">
      <span class="ads-label">{{ t('ads.label') }}</span>
      <div class="ads-inner">
        <span class="ads-title">{{ t('ads.emptyTitle') }}</span>
        <span class="ads-size">{{ t('ads.emptySize') }}</span>
      </div>
    </div>
  </aside>
</template>
