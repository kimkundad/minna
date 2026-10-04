<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * A horizontally scrolling row with its own arrows.
 *
 * The arrows disable themselves at each end instead of disappearing, so the
 * controls never shift position while you page through. Scrolling is by 90% of
 * the visible width, which keeps a sliver of the previous card on screen as a
 * hint that the row continues.
 *
 * The head and the track are siblings, as in the design: the heading needs the
 * page gutter while the track runs edge to edge on small screens.
 */
const props = defineProps<{
  id: string
  title: string
  eyebrow?: string
  sub?: string
  moreHref?: string
  moreLabel?: string
  /** Arrows only make sense once there is more than one item. */
  count: number
}>()

const track = ref<HTMLElement | null>(null)
const atStart = ref(true)
const atEnd = ref(false)

function update() {
  const el = track.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth - 4
  atStart.value = el.scrollLeft <= 4
  atEnd.value = el.scrollLeft >= max
}

function scrollBy(direction: -1 | 1) {
  const el = track.value
  if (!el) return
  el.scrollBy({ left: el.clientWidth * 0.9 * direction, behavior: 'smooth' })
}

onMounted(async () => {
  await nextTick()
  update()
  window.addEventListener('resize', update)
})
onBeforeUnmount(() => window.removeEventListener('resize', update))
watch(() => props.count, () => nextTick(update))
</script>

<template>
  <div class="rail-head">
    <div>
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h2 :id="`${id}-h`">{{ title }}</h2>
      <p v-if="sub" class="rail-sub">{{ sub }}</p>
    </div>
    <div class="rail-tools">
      <slot name="tools" />
      <a v-if="moreHref" class="link-arrow" :href="moreHref">
        {{ moreLabel }}<AppIcon name="arrow-right" />
      </a>
      <template v-if="count > 1">
        <button
          type="button"
          class="icon-btn icon-btn--sm"
          aria-label="เลื่อนรายการไปทางซ้าย"
          :disabled="atStart"
          @click="scrollBy(-1)"
        >
          <AppIcon name="chevron-left" />
        </button>
        <button
          type="button"
          class="icon-btn icon-btn--sm"
          aria-label="เลื่อนรายการไปทางขวา"
          :disabled="atEnd"
          @click="scrollBy(1)"
        >
          <AppIcon name="chevron-right" />
        </button>
      </template>
    </div>
  </div>

  <div v-if="count" class="rail">
    <div
      ref="track"
      class="rail-track"
      :id="`rail-${id}`"
      tabindex="0"
      role="group"
      :aria-labelledby="`${id}-h`"
      @scroll.passive="update"
    >
      <slot />
    </div>
  </div>
  <slot v-else name="empty" />
</template>
