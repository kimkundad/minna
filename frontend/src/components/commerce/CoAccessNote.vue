<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue'
import type { AccessNote } from './types'

/**
 * The one line under a cart or order line that says what the buyer gets: how
 * long access lasts, that a free course needs no payment, that a repurchase
 * keeps the progress already made, or that this course does not need buying at
 * all because a package or an earlier order already covers it.
 *
 * The messages carry markup — a bold percentage, a link to the package page —
 * so they are composed through `<i18n-t>` slots rather than interpolated into
 * a string, which keeps them translatable without handing raw HTML to v-html.
 */
defineProps<{ note: AccessNote; id?: string }>()
</script>

<template>
  <p class="co-note" :class="`co-note--${note.tone}`" :id="id">
    <AppIcon :name="note.icon" />
    <span>
      <template v-if="note.kind === 'blocked'">{{ note.text }}</template>

      <i18n-t v-else-if="note.kind === 'blocked-link'" keypath="commerce.note.blockedLink">
        <template #text>{{ note.text }}</template>
        <template #link>
          <a class="link" :href="note.link?.href">{{ note.link?.label }}</a>
        </template>
      </i18n-t>

      <template v-else-if="note.kind === 'free'">{{ $t('commerce.note.free') }}</template>

      <i18n-t
        v-else-if="note.kind === 'renew' || note.kind === 'renew-short'"
        :keypath="note.kind === 'renew' ? 'commerce.note.renew' : 'commerce.note.renewShort'"
      >
        <template #pct><b>{{ note.pct }}%</b></template>
        <template #days>{{ note.days }}</template>
      </i18n-t>

      <i18n-t v-else-if="note.kind === 'access-pkg'" keypath="commerce.note.accessWithPackage">
        <template #days>{{ note.days }}</template>
        <template #link>
          <a class="link" :href="note.link?.href">{{ note.link?.label }}</a>
        </template>
      </i18n-t>

      <template v-else>{{ $t('commerce.note.access', { days: note.days }) }}</template>
    </span>
  </p>
</template>
