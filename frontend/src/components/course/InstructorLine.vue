<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import type { Person } from '@/lib/course'

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
    people: Person[]
    courseId: string | number
    size?: 'sm' | 'md' | 'lg'
    /** Use full names instead of the short form. */
    full?: boolean
  }>(),
  { size: 'sm' },
)

const emit = defineEmits<{ open: [courseId: string | number] }>()

const { t } = useI18n()

/** Whoever the data lists first; the order is the one the course was set up
 *  with, so it is the lead instructor rather than an arbitrary pick. */
const lead = computed<Person | null>(() => props.people[0] ?? null)

const name = computed(() => (lead.value ? (props.full ? lead.value.name : lead.value.short) : ''))

/** The label still names everyone, because the button opens all of them and a
 *  screen reader should not be told less than the button does. */
const ariaLabel = computed(() =>
  t('course.instructorsAria', { names: props.people.map((p) => p.name).join(', ') }),
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
