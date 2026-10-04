
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { num, relative } from '@/lib/format'
import { data, store } from '@/vendor'
import { call, LESSON_ICON } from './learning'
import LessonGate from './LessonGate.vue'
import type { Course, Lesson, Person, Question } from './types'

/**
 * Questions to the instructor, asked from the lesson you are on.
 *
 * Your own questions come first and stay marked as awaiting an answer: in the
 * prototype nobody ever answers them, and pretending otherwise would be the
 * one piece of this page that lies. The seeded conversation below them carries
 * the instructor's replies and shows what the panel looks like in use.
 */
const props = defineProps<{ course: Course; lesson: Lesson; loggedIn: boolean }>()

const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()

const MAX = 500

const text = ref('')
const sending = ref(false)
const error = ref('')
/** Bumped after a successful ask so the list recomputes off the store. */
const tick = ref(0)

const s = store as unknown as {
  instructor: (id: string) => Person
  user: () => { name?: string; initials?: string }
}

const instructor = computed(() => s.instructor(props.course.instructors[0]!.id))
const user = computed(() => s.user())

const mine = computed(() => {
  void tick.value
  return props.loggedIn ? call<Question[]>('questions', props.course.id) : []
})

/** The prototype strips titles off a name to find a usable initial: "สพ.ญ.
 *  อรอุมา ท." should read as อ, not ส. */
function initialOf(name: string): string {
  const bare = String(name ?? '')
    .replace(/^(รศ\.|ผศ\.|สพ\.ญ\.|น\.สพ\.|ดร\.|\s)+/g, '')
    .replace(/^[เแโใไ]/, '')
  return bare.charAt(0) || '?'
}

interface SeedQa {
  by: string
  ago: number
  q: string
  answer: string
}

const seeded = computed(() => (data as unknown as { qaTemplate: SeedQa[] }).qaTemplate)

const total = computed(() => mine.value.length + seeded.value.length)

function daysAgo(n: number): string {
  return (store as unknown as { date: { daysFromNow: (n: number) => string } }).date.daysFromNow(-n)
}

function lessonOf(lid: string): Lesson | null {
  return call<Lesson | null>('lesson', props.course, lid)
}

async function submit() {
  const value = text.value.trim()
  if (!value) {
    error.value = t('learning.qa.required')
    return
  }
  error.value = ''
  sending.value = true
  // The prototype waits 450ms before committing, so the button's loading state
  // is visible rather than a flicker.
  await new Promise((r) => setTimeout(r, 450))
  const ok = call<boolean | null>('askQuestion', props.course.id, props.lesson.id, value)
  sending.value = false
  if (!ok) return
  text.value = ''
  tick.value += 1
  emit('changed')
}
</script>

<template>
  <div class="lp-qa">
    <form
      v-if="props.loggedIn"
      class="lp-qa-form"
      novalidate
      data-lp-qa
      :class="{ 'has-error': !!error }"
      @submit.prevent="submit"
    >
      <div class="field" :class="{ 'has-error': !!error }">
        <label class="label" for="lp-qa-text" id="lp-qa-label">
          {{ t('learning.qa.label', { title: props.lesson.title }) }}
        </label>
        <textarea
          v-model="text"
          class="textarea"
          id="lp-qa-text"
          name="question"
          rows="3"
          :maxlength="MAX"
          :aria-invalid="error ? 'true' : undefined"
          :placeholder="t('learning.qa.placeholder')"
        />
        <div class="field-row">
          <span class="field-help">{{ t('learning.qa.help') }}</span>
          <span class="counter" :class="{ 'is-near': text.length >= 450 }" id="lp-qa-count">
            {{ num(text.length) }} / {{ num(MAX) }}
          </span>
        </div>
        <p v-if="error" class="field-error">
          <AppIcon name="alert-circle" /><span>{{ error }}</span>
        </p>
      </div>
      <div class="lp-qa-actions">
        <button type="submit" class="btn btn--primary btn--sm" :class="{ 'is-loading': sending }">
          <AppIcon name="send" />{{ sending ? t('learning.qa.sending') : t('learning.qa.send') }}
        </button>
      </div>
    </form>

    <LessonGate
      v-else
      :title="t('learning.qa.gateTitle')"
      :text="t('learning.qa.gateText')"
    />

    <div class="lp-qa-listwrap" id="lp-qa-list">
      <h2 class="lp-pan-h">
        {{ t('learning.qa.listTitle') }}
        <span class="lp-pan-count">{{ t('learning.qa.itemCount', { n: total }) }}</span>
      </h2>
      <ul class="lp-qa-list" role="list">
        <li v-for="(q, i) in mine" :key="`mine-${i}`" class="lp-qa-item is-mine">
          <div class="lp-qa-head">
            <AppAvatar
              size="sm"
              :color="0"
              :name="user.name"
              :initials="user.initials"
              :photo="data.memberPhoto"
            />
            <div class="lp-qa-who">
              <b>{{ t('learning.qa.byYou', { name: q.by }) }}</b>
              <span>{{ relative(q.at) }}</span>
            </div>
            <span class="badge badge--pending">
              <AppIcon name="hourglass" />{{ t('learning.qa.awaiting') }}
            </span>
          </div>
          <p v-if="lessonOf(q.lid)" class="lp-qa-ref">
            <AppIcon :name="LESSON_ICON[lessonOf(q.lid)!.type]" />{{
              t('learning.qa.inLesson', { title: lessonOf(q.lid)!.title })
            }}
          </p>
          <p class="lp-qa-q">{{ q.text }}</p>
        </li>

        <li v-for="(item, i) in seeded" :key="`seed-${i}`" class="lp-qa-item">
          <div class="lp-qa-head">
            <AppAvatar
              size="sm"
              :color="(i + 2) % 6"
              :name="item.by"
              :initials="initialOf(item.by)"
            />
            <div class="lp-qa-who">
              <b>{{ item.by }}</b>
              <span>{{ relative(daysAgo(item.ago)) }}</span>
            </div>
          </div>
          <p class="lp-qa-q">{{ item.q }}</p>
          <div class="lp-qa-ans">
            <AppAvatar
              size="sm"
              :color="instructor.color"
              :name="instructor.name"
              :initials="instructor.initials"
              :photo="instructor.photo"
            />
            <div>
              <p class="lp-qa-by">
                <b>{{ instructor.name }}</b>
                <span class="badge badge--info">{{ t('learning.qa.instructor') }}</span>
              </p>
              <p>{{ item.answer }}</p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
