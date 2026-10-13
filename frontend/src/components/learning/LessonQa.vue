<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppAvatar from '@/components/ui/AppAvatar.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import LessonGate from './LessonGate.vue'
import type { Course, Lesson } from './types'
import { ApiError, api, mediaUrl, type QaPost, type QaThread } from '@/lib/api'
import CaptchaBox from '@/components/ui/CaptchaBox.vue'
import { isCaptchaEnabled } from '@/lib/captcha'
import { initialsOf } from '@/lib/course'
import { num, relative } from '@/lib/format'

/**
 * The questions on the course.
 *
 * Course-wide, not per lesson: a question is asked from wherever somebody was
 * and keeps that as its label, but hunting through lessons for the thread an
 * answer might be under is how the same question gets asked four times. Newest
 * at the top, because that is the conversation still happening.
 *
 * Everybody on the course reads the same page, and anybody on it can answer —
 * a classmate as readily as the teacher. That is the decision the whole panel
 * rests on: a question asked out loud is usually one several people had, and
 * answering it where they can all read it answers it once.
 *
 * A teacher's reply is badged, and only a teacher's clears the question off the
 * school's queue. A classmate's answer is welcome and often right, but it does
 * not settle what the school owes an answer to.
 *
 * Posting is rate limited on the server — ten minutes between questions, two
 * between replies — and the refusal comes back as a sentence under the box
 * saying how long is left, rather than a button that silently does nothing.
 */
const props = defineProps<{
  course: Course
  lesson: Lesson
  loggedIn: boolean
  /** The slug or id the API resolves the course by. */
  courseRef: string
}>()

const emit = defineEmits<{
  changed: []
  /** How many threads the course has, for the number on the tab. */
  count: [n: number]
}>()

const { t } = useI18n()

const MAX = 500

const threads = ref<QaThread[]>([])
const loading = ref(true)

const text = ref('')
const sending = ref(false)
const error = ref('')

/** Which thread has its reply box open, and what is in it. */
const replyingTo = ref<number | null>(null)
const replyText = ref('')
const replyError = ref('')
const replySending = ref(false)

/**
 * The checkbox's token, one per form.
 *
 * Google expires these after a couple of minutes and refuses a second use, so
 * the box is cleared after every send and the next post ticks it again. That is
 * the point of the visible one: it is obvious what is being asked for.
 */
const askCaptcha = ref('')
const replyCaptcha = ref('')
const captchaOn = isCaptchaEnabled()

const total = computed(() => threads.value.length)

async function load(): Promise<void> {
  loading.value = true
  try {
    threads.value = (await api.courseQuestions(props.courseRef)).data
  } catch {
    // No access, or the request failed. An empty panel with its form is a
    // truthful enough answer; nothing here is worth an error box.
    threads.value = []
  } finally {
    loading.value = false
    emit('count', threads.value.length)
  }
}

// Keyed on the course, not the lesson: the list does not change as somebody
// moves between lessons, and reloading it on every move would be a request for
// the same answer.
watch(() => props.courseRef, () => void load(), { immediate: true })

function photoOf(post: QaPost): string | null {
  return post.author.avatarPath ? mediaUrl(post.author.avatarPath) : null
}

/** A stable colour per person, so the same classmate keeps the same avatar
 *  through a thread. */
function colorOf(post: QaPost): number {
  return post.author.id % 6
}

function messageFrom(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback

  // The cooldown comes back as a code and a number of minutes, so the sentence
  // is written here in the reader's language rather than relayed from the API.
  if (err.code === 'qa_cooldown') {
    return t('learning.qa.cooldown', { n: Number(err.fields.body ?? 1) })
  }
  // Everything else puts its message under the box it belongs to.
  return err.fields.body ?? err.message
}

async function submit(): Promise<void> {
  const value = text.value.trim()
  if (!value) {
    error.value = t('learning.qa.required')
    return
  }
  // Said here rather than letting the server refuse it: the box is on screen
  // and unticked, so the reason is already in front of them.
  if (captchaOn && !askCaptcha.value) {
    error.value = t('common.captchaRequired')
    return
  }
  error.value = ''
  sending.value = true
  try {
    await api.askQuestion(Number(props.lesson.id), value, askCaptcha.value || undefined)
    text.value = ''
    await load()
    emit('changed')
  } catch (err) {
    error.value = messageFrom(err, t('learning.qa.failed'))
  } finally {
    sending.value = false
    // Spent either way: a refused token is not reusable, and nor is a used one.
    askCaptcha.value = ''
  }
}

/**
 * Editing happens in place: the post becomes a box with the same words in it.
 * One at a time, because two open boxes in a thread is two drafts to lose.
 */
const editingId = ref<number | null>(null)
const editText = ref('')
const editError = ref('')
const editSending = ref(false)
const editCaptcha = ref('')

function openEdit(post: QaPost): void {
  editingId.value = post.id
  editText.value = post.body
  editError.value = ''
  editCaptcha.value = ''
  replyingTo.value = null
}

async function saveEdit(postId: number): Promise<void> {
  const value = editText.value.trim()
  if (!value) {
    editError.value = t('learning.qa.required')
    return
  }
  if (captchaOn && !editCaptcha.value) {
    editError.value = t('common.captchaRequired')
    return
  }
  editError.value = ''
  editSending.value = true
  try {
    await api.editQuestion(postId, value, editCaptcha.value || undefined)
    editingId.value = null
    await load()
    emit('changed')
  } catch (err) {
    editError.value = messageFrom(err, t('learning.qa.failed'))
  } finally {
    editSending.value = false
    editCaptcha.value = ''
  }
}

function openReply(id: number): void {
  replyingTo.value = replyingTo.value === id ? null : id
  replyText.value = ''
  replyError.value = ''
  replyCaptcha.value = ''
  editingId.value = null
}

async function sendReply(id: number): Promise<void> {
  const value = replyText.value.trim()
  if (!value) {
    replyError.value = t('learning.qa.required')
    return
  }
  if (captchaOn && !replyCaptcha.value) {
    replyError.value = t('common.captchaRequired')
    return
  }
  replyError.value = ''
  replySending.value = true
  try {
    await api.replyToQuestion(id, value, replyCaptcha.value || undefined)
    replyingTo.value = null
    replyText.value = ''
    await load()
    emit('changed')
  } catch (err) {
    replyError.value = messageFrom(err, t('learning.qa.failed'))
  } finally {
    replySending.value = false
    replyCaptcha.value = ''
  }
}

async function remove(postId: number, replies = 0): Promise<void> {
  const message = replies
    ? t('learning.qa.removeWithReplies', { n: replies })
    : t('learning.qa.removeConfirm')
  if (!window.confirm(message)) return
  try {
    await api.deleteQuestion(postId)
    await load()
    emit('changed')
  } catch {
    // Refused, or gone already. Reloading shows which.
    await load()
  }
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
        <p v-if="error" class="field-error" data-qa-error>
          <AppIcon name="alert-circle" /><span>{{ error }}</span>
        </p>
      </div>
      <div class="lp-qa-actions">
        <CaptchaBox v-model="askCaptcha" />
        <button
          type="submit"
          class="btn btn--primary btn--sm"
          :class="{ 'is-loading': sending }"
          :disabled="sending"
        >
          <AppIcon name="send" />{{ sending ? t('learning.qa.sending') : t('learning.qa.send') }}
        </button>
      </div>
    </form>

    <LessonGate v-else :title="t('learning.qa.gateTitle')" :text="t('learning.qa.gateText')" />

    <div class="lp-qa-listwrap" id="lp-qa-list">
      <h2 class="lp-pan-h">
        {{ t('learning.qa.listTitle') }}
        <span class="lp-pan-count">{{ t('learning.qa.itemCount', { n: total }) }}</span>
      </h2>

      <p v-if="loading" class="lp-qa-empty">{{ t('learning.qa.loading') }}</p>

      <p v-else-if="!threads.length" class="lp-qa-empty">
        <AppIcon name="message-square" />{{ t('learning.qa.empty') }}
      </p>

      <ul v-else class="lp-qa-list" role="list">
        <li
          v-for="q in threads"
          :key="q.id"
          class="lp-qa-item"
          :class="{ 'is-mine': q.mine }"
          :data-qa="q.id"
        >
          <div class="lp-qa-head">
            <AppAvatar
              size="sm"
              :color="colorOf(q)"
              :name="q.author.name"
              :initials="initialsOf(q.author.name)"
              :photo="photoOf(q)"
            />
            <div class="lp-qa-who">
              <b>{{ q.mine ? t('learning.qa.byYou', { name: q.author.name }) : q.author.name }}</b>
              <span
                >{{ relative(q.createdAt)
                }}<template v-if="q.lesson">
                  · {{ t('learning.qa.inLesson', { title: q.lesson.title }) }}</template
                ></span
              >
            </div>
            <span v-if="!q.answeredAt" class="badge badge--pending">
              <AppIcon name="hourglass" />{{ t('learning.qa.awaiting') }}
            </span>
            <!-- Your own post's controls, on the right of its own line: they
                 belong to the person who wrote it, not to the conversation. -->
            <span v-if="q.canDelete" class="lp-qa-own">
              <button type="button" class="lp-qa-link" @click="openEdit(q)">
                {{ t('learning.qa.edit') }}
              </button>
              <button
                type="button"
                class="lp-qa-link is-danger"
                @click="remove(q.id, q.replyCount)"
              >
                {{ t('learning.qa.remove') }}
              </button>
            </span>
          </div>

          <form
            v-if="editingId === q.id"
            class="lp-qa-editform"
            novalidate
            @submit.prevent="saveEdit(q.id)"
          >
            <div class="field" :class="{ 'has-error': !!editError }">
              <textarea v-model="editText" class="textarea" rows="2" :maxlength="MAX" />
              <p v-if="editError" class="field-error">
                <AppIcon name="alert-circle" /><span>{{ editError }}</span>
              </p>
            </div>
            <div class="lp-qa-actions">
              <CaptchaBox v-model="editCaptcha" />
              <span class="lp-qa-actions-btns">
                <button
                  type="submit"
                  class="btn btn--primary btn--sm"
                  :class="{ 'is-loading': editSending }"
                  :disabled="editSending"
                >
                  {{ t('learning.qa.save') }}
                </button>
                <button type="button" class="btn btn--ghost btn--sm" @click="editingId = null">
                  {{ t('common.cancel') }}
                </button>
              </span>
            </div>
          </form>

          <p v-else class="lp-qa-q">{{ q.body }}</p>

          <div v-for="r in q.replies" :key="r.id" class="lp-qa-ans">
            <AppAvatar
              size="sm"
              :color="colorOf(r)"
              :name="r.author.name"
              :initials="initialsOf(r.author.name)"
              :photo="photoOf(r)"
            />
            <div>
              <p class="lp-qa-by">
                <b>{{ r.mine ? t('learning.qa.byYou', { name: r.author.name }) : r.author.name }}</b>
                <span v-if="r.author.isInstructor" class="badge badge--info">
                  {{ t('learning.qa.instructor') }}
                </span>
                <span class="lp-qa-when">{{ relative(r.createdAt) }}</span>
                <span v-if="r.canDelete" class="lp-qa-own">
                  <button type="button" class="lp-qa-link" @click="openEdit(r)">
                    {{ t('learning.qa.edit') }}
                  </button>
                  <button type="button" class="lp-qa-link is-danger" @click="remove(r.id)">
                    {{ t('learning.qa.remove') }}
                  </button>
                </span>
              </p>

              <form
                v-if="editingId === r.id"
                class="lp-qa-editform"
                novalidate
                @submit.prevent="saveEdit(r.id)"
              >
                <div class="field" :class="{ 'has-error': !!editError }">
                  <textarea v-model="editText" class="textarea" rows="2" :maxlength="MAX" />
                  <p v-if="editError" class="field-error">
                    <AppIcon name="alert-circle" /><span>{{ editError }}</span>
                  </p>
                </div>
                <div class="lp-qa-actions">
                  <CaptchaBox v-model="editCaptcha" />
                  <span class="lp-qa-actions-btns">
                    <button
                      type="submit"
                      class="btn btn--primary btn--sm"
                      :disabled="editSending"
                    >
                      {{ t('learning.qa.save') }}
                    </button>
                    <button type="button" class="btn btn--ghost btn--sm" @click="editingId = null">
                      {{ t('common.cancel') }}
                    </button>
                  </span>
                </div>
              </form>
              <p v-else>{{ r.body }}</p>
            </div>
          </div>

          <div v-if="props.loggedIn" class="lp-qa-foot">
            <button
              type="button"
              class="lp-qa-link"
              :data-qa-reply="q.id"
              @click="openReply(q.id)"
            >
              <AppIcon name="message" />{{ t('learning.qa.reply') }}
            </button>
          </div>

          <form
            v-if="replyingTo === q.id"
            class="lp-qa-replyform"
            novalidate
            @submit.prevent="sendReply(q.id)"
          >
            <div class="field" :class="{ 'has-error': !!replyError }">
              <textarea
                v-model="replyText"
                class="textarea"
                rows="2"
                :maxlength="MAX"
                :placeholder="t('learning.qa.replyPlaceholder')"
              />
              <p v-if="replyError" class="field-error">
                <AppIcon name="alert-circle" /><span>{{ replyError }}</span>
              </p>
            </div>
            <div class="lp-qa-actions">
              <CaptchaBox v-model="replyCaptcha" />
              <button
                type="submit"
                class="btn btn--primary btn--sm"
                :class="{ 'is-loading': replySending }"
                :disabled="replySending"
              >
                <AppIcon name="send" />{{
                  replySending ? t('learning.qa.sending') : t('learning.qa.send')
                }}
              </button>
              <button type="button" class="btn btn--ghost btn--sm" @click="replyingTo = null">
                {{ t('common.cancel') }}
              </button>
            </div>
          </form>
        </li>
      </ul>
    </div>
  </div>
</template>
