<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useChatThread } from '@/composables/useChatThread'
import { sizeOf as size, timelineOf, timeOf } from '@/composables/chatTime'
import { useAuthStore } from '@/stores/auth'

/**
 * Asking the school something, with room to read back.
 *
 * The same conversation the floating panel shows — both run on
 * `useChatThread`, so nothing said in one is missing from the other. What this
 * page adds is space: the whole history, scrolled properly, rather than a
 * corner of the screen.
 *
 * It is with the school and never with a teacher. A question about a course
 * reaches the person who teaches it only if a member of staff decides to pass
 * it on, and what travels is the question without the asker. That is
 * deliberate: a teacher who knows whose work they are about to mark can be
 * offered something for the answer.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const scroller = ref<HTMLElement | null>(null)
const composer = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const {
  messages,
  hasOlder,
  loading,
  loadingOlder,
  error,
  sendError,
  draft,
  sending,
  uploadPct,
  links,
  threadId,
  load,
  older,
  say,
  attach: send,
  open,
  onScroll,
  onMediaLoad,
  toBottom,
} = useChatThread({ t, scroller })

/** Each message with the day heading above it. */
const timeline = computed(() => timelineOf(messages.value, t))

async function start(): Promise<void> {
  if (!auth.isLoggedIn) {
    loading.value = false
    return
  }
  await load()
  await openWithContext()
}

/**
 * An old link that still carries `?send=`.
 *
 * The buttons on the lessons raise the floating panel now, but a link already
 * sent or bookmarked should still do what it said it would. The query is
 * cleared first, so a refresh cannot post it twice, and a repeat of the newest
 * message is skipped — coming back is not asking again.
 */
async function openWithContext(): Promise<void> {
  const text = String(route.query.send ?? '').trim()
  if (!text || !threadId.value) return
  await router.replace({ path: route.path, query: {} })

  const newest = messages.value[messages.value.length - 1]
  if (!(newest?.mine && newest.body?.trim() === text)) await say(text)

  void nextTick(() => {
    const box = composer.value
    box?.focus()
    box?.setSelectionRange(box.value.length, box.value.length)
  })
}

function onKey(event: KeyboardEvent): void {
  // Enter sends, Shift+Enter makes a line, which is what every chat does.
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void say()
  }
}

function attach(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void send(file)
}

void start()
void toBottom
</script>

<template>
  <AccountShell page="messages">
    <div v-if="loading" class="state-box state-box--plain">
      <p>{{ t('messages.loading') }}</p>
    </div>

    <div v-else-if="error" class="state-box state-box--plain">
      <div class="state-ico"><AppIcon name="alert-circle" /></div>
      <h3>{{ t('messages.loadFailed') }}</h3>
      <p>{{ error }}</p>
      <div class="state-actions">
        <button type="button" class="btn btn--secondary" @click="load">
          {{ t('course.retry') }}
        </button>
      </div>
    </div>

    <div v-else class="acct-card chat-panel">
      <div ref="scroller" class="chat-scroll" @scroll.passive="onScroll">
        <div v-if="hasOlder" style="text-align: center; margin-bottom: 14px">
          <button type="button" class="btn btn--ghost btn--sm" :disabled="loadingOlder" @click="older">
            {{ loadingOlder ? t('messages.loading') : t('messages.showEarlier') }}
          </button>
        </div>

        <p v-if="!messages.length" class="chat-day">{{ t('messages.emptyText') }}</p>

        <div v-for="entry in timeline" :key="entry.message.id">
          <p v-if="entry.heading" class="chat-day">{{ entry.heading }}</p>

          <div class="chat-row" :class="{ 'is-mine': entry.message.mine }">
            <div class="chat-col">
              <!-- Only the other side is named: who you are is not news. -->
              <p v-if="!entry.message.mine" class="chat-who">{{ t('messages.school') }}</p>

              <div class="chat-bubble">
                <template v-if="entry.message.attachment?.kind === 'image'">
                  <img
                    v-if="links[entry.message.id]"
                    :src="links[entry.message.id]"
                    :alt="entry.message.attachment.name"
                    @load="onMediaLoad"
                    @click="open(entry.message)"
                  />
                  <span v-else class="chat-shade" :title="entry.message.attachment.name"></span>
                </template>

                <button
                  v-else-if="entry.message.attachment"
                  type="button"
                  class="chat-file"
                  @click="open(entry.message)"
                >
                  <AppIcon name="file-text" />
                  <span>
                    <b>{{ entry.message.attachment.name }}</b>
                    <small>{{ size(entry.message.attachment.sizeBytes) }}</small>
                  </span>
                </button>

                <p v-if="entry.message.body" style="margin: 0">{{ entry.message.body }}</p>
              </div>

              <p class="chat-at">
                <time :datetime="entry.message.createdAt">{{ timeOf(entry.message.createdAt) }}</time>
              </p>
            </div>
          </div>
        </div>
      </div>

      <p v-if="sendError" class="chat-note" role="alert" style="color: var(--c-danger)">
        {{ sendError }}
      </p>
      <p v-else-if="uploadPct !== null" class="chat-note">
        {{ t('messages.uploading', { pct: uploadPct }) }}
      </p>
      <p v-else class="chat-note">{{ t('messages.privacyNote') }}</p>

      <div class="chat-compose">
        <input
          ref="fileInput"
          type="file"
          hidden
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
          @change="attach"
        />
        <button
          type="button"
          class="chat-clip"
          :disabled="uploadPct !== null"
          :aria-label="t('messages.attach')"
          @click="fileInput?.click()"
        >
          <AppIcon name="paperclip" />
        </button>

        <label class="sr-only" for="chat-draft">{{ t('messages.placeholder') }}</label>
        <textarea
          id="chat-draft"
          ref="composer"
          v-model="draft"
          rows="1"
          :placeholder="t('messages.placeholder')"
          @keydown="onKey"
        ></textarea>

        <button
          type="button"
          class="btn btn--primary"
          :disabled="sending || !draft.trim()"
          @click="say()"
        >
          {{ sending ? t('messages.sending') : t('messages.send') }}
        </button>
      </div>
    </div>
  </AccountShell>
</template>
