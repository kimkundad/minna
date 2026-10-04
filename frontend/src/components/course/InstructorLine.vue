<script setup lang="ts">
import { computed } from 'vue'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import { store } from '@/vendor'

/**
 * The row of instructor faces and names under a course title.
 *
 * It shows at most three avatars and two names, with "และอีก N ท่าน" standing
 * in for the rest — a card has to stay one height whether a course has one
 * teacher or six. The whole row is a button because it opens the full list.
 */
const props = withDefaults(
  defineProps<{
    instructors: { id: string }[]
    courseId: string
    size?: 'sm' | 'md' | 'lg'
    /** Use full names instead of the short form. */
    full?: boolean
  }>(),
  { size: 'sm' },
)

const emit = defineEmits<{ open: [courseId: string] }>()

interface Person {
  id: string
  name: string
  short: string
  initials: string
  color: number
  photo?: string | null
}

const people = computed<Person[]>(() =>
  props.instructors.map(
    (i) => (store as unknown as { instructor: (id: string) => Person }).instructor(i.id),
  ),
)

const shown = computed(() => people.value.slice(0, 3))
const names = computed(() =>
  people.value
    .slice(0, 2)
    .map((p) => (props.full ? p.name : p.short))
    .join(', '),
)
const extra = computed(() => Math.max(0, people.value.length - 2))
const ariaLabel = computed(
  () => `ผู้สอน ${people.value.map((p) => p.name).join(', ')} — ดูรายชื่อผู้สอนทั้งหมด`,
)
</script>

<template>
  <button
    type="button"
    class="inst-line"
    :data-cid="courseId"
    :aria-label="ariaLabel"
    @click="emit('open', courseId)"
  >
    <span class="avatar-stack">
      <AppAvatar
        v-for="p in shown"
        :key="p.id"
        :name="p.name"
        :initials="p.initials"
        :color="p.color"
        :photo="p.photo"
        :size="size"
      />
    </span>
    <span class="inst-names clamp-2">
      {{ names }}<span v-if="extra" class="more"> และอีก {{ extra }} ท่าน</span>
    </span>
  </button>
</template>
