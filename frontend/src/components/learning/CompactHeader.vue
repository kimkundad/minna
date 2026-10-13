
<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { data, store } from '@/vendor'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import { useHeaderHeight } from './learning'

/**
 * The compact page chrome the learning room, the quiz and the result page use
 * instead of the site nav: one way back, the mark, what you are looking at, and
 * whatever that page needs on the right.
 *
 * `layout/SiteHeader` does not implement this variant yet — it knows `solid`
 * and `overlay` only — so the bar lives here for now and these three pages hide
 * the site header while they are open. Markup follows `U.renderHeader`'s
 * compact branch element for element, so folding it back into `SiteHeader`
 * later is a move rather than a rewrite.
 *
 * It deliberately leaves out `id="site-header"`: the hidden site header still
 * holds that id, and two of them would make `document.getElementById` a
 * coin toss. Nothing in the CSS keys off it — the sticky offsets read
 * `--lp-hdr` / `--qz-hdr`, which `useHeaderHeight` measures from this element.
 */
const props = defineProps<{
  backTo: string
  backLabel: string
  title: string
  sub?: string
  /** The custom property this bar's measured height is published as. */
  heightVar: string
}>()

const { t } = useI18n()
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))

const s = store as unknown as {
  isLoggedIn: () => boolean
  user: () => { loggedIn: boolean; name?: string; initials?: string }
}

const user = computed(() => s.user())

const root = ref<HTMLElement | null>(null)
useHeaderHeight(props.heightVar, root)
</script>

<template>
  <header ref="root" class="site-header site-header--compact">
    <div class="hdr">
      <div class="container hdr-inner">
        <RouterLink class="hdr-back" :to="props.backTo">
          <AppIcon name="arrow-left" />
          <span class="hide-sm">{{ props.backLabel }}</span>
        </RouterLink>

        <RouterLink
          class="brand hide-sm-brand"
          :to="`/${locale}`"
          :aria-label="t('header.brandHome')"
        >
          <BrandLogo class="brand-logo" />
        </RouterLink>

        <div class="hdr-title">
          {{ props.title }}
          <small v-if="props.sub">{{ props.sub }}</small>
        </div>

        <div class="hdr-actions">
          <slot />
          <RouterLink
            v-if="user.loggedIn"
            class="avatar-btn"
            :to="`/${locale}/account`"
            :aria-label="t('learning.header.myAccount')"
            style="padding-right: 4px"
          >
            <AppAvatar
              size="md"
              :name="user.name"
              :initials="user.initials"
              :photo="data.memberPhoto"
            />
          </RouterLink>
        </div>
      </div>
    </div>
  </header>
</template>
