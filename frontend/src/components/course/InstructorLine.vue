<script setup lang="ts">
import { computed } from 'vue'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import { store } from '@/vendor'

/**
 * The row of instructor face and name under a course title.
 *
 * One person, even when a course has several: the card is a glance, and a
 * stack of faces with "และอีก N ท่าน" after it spent two lines saying something
 * nobody decides on from a card. The full list is on the course page, and the
 * row stays a button that opens it.
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

/** Whoever the data lists first; the order is the one the course was set up
 *  with, so it is the lead instructor rather than an arbitrary pick. */
const lead = computed<Person | null>(() => people.value[0] ?? null)

const name = computed(() => (lead.value ? (props.full ? lead.value.name : lead.value.short) : ''))

/** The label still names everyone, because the button opens all of them and a
 *  screen reader should not be told less than the button does. */
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
        v-if="lead"
        :name="lead.name"
        :initials="lead.initials"
        :color="lead.color"
        :photo="lead.photo"
        :size="size"
      />
    </span>
    <span class="inst-names clamp-2">{{ name }}</span>
  </button>
</template>
