<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * The four-step order indicator shared by the cart, the order summary and the
 * confirmation page.
 *
 * `current` is 1-based. The success page passes 4 with `allDone`, because
 * there every dot carries a tick — including the one for the step you are on —
 * rather than the number of a step still ahead of you.
 */
const props = withDefaults(defineProps<{ current: number; allDone?: boolean }>(), {
  allDone: false,
})

const { t } = useI18n()

const steps = computed(() => [
  t('commerce.steps.cart'),
  t('commerce.steps.summary'),
  t('commerce.steps.pay'),
  t('commerce.steps.done'),
])

interface Step {
  label: string
  n: number
  state: 'is-done' | 'is-current' | ''
  tick: boolean
}

const items = computed<Step[]>(() =>
  steps.value.map((label, i) => {
    const n = i + 1
    const state = n < props.current ? 'is-done' : n === props.current ? 'is-current' : ''
    return { label, n, state, tick: props.allDone || n < props.current }
  }),
)
</script>

<template>
  <ol class="co-steps" :aria-label="t('commerce.steps.label')">
    <li
      v-for="s in items"
      :key="s.n"
      :class="s.state"
      :aria-current="s.state === 'is-current' ? 'step' : undefined"
    >
      <span class="co-step-dot" aria-hidden="true">
        <AppIcon v-if="s.tick" name="check" />
        <template v-else>{{ s.n }}</template>
      </span>
      <span
        >{{ s.label
        }}<span v-if="s.state === 'is-done'" class="sr-only">{{
          t('commerce.steps.doneSuffix')
        }}</span></span
      >
    </li>
  </ol>
</template>
