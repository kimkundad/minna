<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useChatThread } from '@/composables/useChatThread'
import { sizeOf, timelineOf, timeOf } from '@/composables/chatTime'
import { useAuthStore } from '@/stores/auth'
import { useChatDockStore } from '@/stores/chatDock'

/**
 * The conversation, floating over whatever somebody was doing.
 *
 * It exists so that asking a question does not cost a lesson. Sending them to
 * the account page to ask meant leaving the video, losing the place and
 * finding their way back; a panel in the corner is the same conversation
 * without any of that.
 *
 * It is the same conversation, not a second one: both this and the full page
 * run on `useChatThread`, so what is said here is on that page when they next
 * open it, and the unread count is one number rather than two.
 */
const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const dock = useChatDockStore()

const scroller = ref<HTMLElement | null>(null)
const composer = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const chat = useChatThread({ t, scroller })

const locale = () => String(route.params.locale ?? 'th')

/** Opened fresh, or reopened after being closed. */
async function begin(): Promise<void> {
  if (!auth.isLoggedIn) return
  if (!chat.threadId.value) await chat.load()
  else await chat.toBottom()

  // Whatever raised the panel said what it was about. Send that, once.
  const context = dock.takePending()
  if (context) {
    const newest = chat.messages.value[chat.messages.value.length - 1]
    // Coming back to the same lesson is not asking about it again.
    if (!(newest?.mine && newest.body?.trim() === context)) await chat.say(context)
  }
  focusComposer()
}

function focusComposer(): void {
  void nextTick(() => composer.value?.focus())
}

watch(
  () => dock.isOpen,
  (open) => {
    if (open) void begin()
    else chat.close()
  },
  { immediate: true },
)

// Raised again while already open — from another lesson, say. The panel is
// there, so only the new context has to be said.
watch(
  () => dock.pending,
  (text) => {
    if (text && dock.isOpen && !dock.isMinimised) void begin()
  },
)

watch(
  () => dock.isMinimised,
  (down) => {
    if (!down) {
      void chat.toBottom()
      void chat.markRead()
      focusComposer()
    }
  },
)

function onKey(event: KeyboardEvent): void {
  // Enter sends, Shift+Enter makes a line, as every chat does.
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void chat.say()
  }
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void chat.attach(file)
}

/** Escape closes it, like every other layer on the site. */
function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && dock.isOpen) dock.close()
}
onMounted(() => document.addEventListener('keydown', onEscape))
onBeforeUnmount(() => document.removeEventListener('keydown', onEscape))
</script>

<template>
  <div
    v-if="dock.isOpen && auth.isLoggedIn"
    class="chat-dock"
    :class="{ 'is-min': dock.isMinimised }"
    role="dialog"
    aria-labelledby="chat-dock-h"
  >
    <header class="chat-dock-bar">
      <button
        type="button"
        class="chat-dock-title"
        :aria-expanded="!dock.isMinimised"
        @click="dock.toggleMinimised()"
      >
        <span class="chat-dock-ava"><AppIcon name="headset" /></span>
        <span id="chat-dock-h">{{ t('messages.school') }}</span>
      </button>
      <button
        type="button"
        class="chat-dock-act"
        :aria-label="dock.isMinimised ? t('messages.dockExpand') : t('messages.dockMinimise')"
        @click="dock.toggleMinimised()"
      >
        <AppIcon :name="dock.isMinimised ? 'chevron-up' : 'minus'" />
      </button>
      <button
        type="button"
        class="chat-dock-act"
        :aria-label="t('messages.dockClose')"
        @click="dock.close()"
      >
        <AppIcon name="x" />
      </button>
    </header>

    <div v-show="!dock.isMinimised" class="chat-dock-body">
      <div ref="scroller" class="chat-scroll" @scroll.passive="chat.onScroll">
        <p v-if="chat.loading.value" class="chat-day">{{ t('messages.loading') }}</p>
        <p v-else-if="chat.error.value" class="chat-day">{{ chat.error.value }}</p>

        <template v-else>
          <div v-if="chat.hasOlder.value" style="text-align: center; margin-bottom: 12px">
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="chat.loadingOlder.value"
              @click="chat.older()"
            >
              {{ chat.loadingOlder.value ? t('messages.loading') : t('messages.showEarlier') }}
            </button>
          </div>

          <p v-if="!chat.messages.value.length" class="chat-day">{{ t('messages.emptyText') }}</p>

          <div v-for="entry in timelineOf(chat.messages.value, t)" :key="entry.message.id">
            <p v-if="entry.heading" class="chat-day">{{ entry.heading }}</p>

            <div class="chat-row" :class="{ 'is-mine': entry.message.mine }">
              <div class="chat-col">
                <p v-if="!entry.message.mine" class="chat-who">{{ t('messages.school') }}</p>

                <div class="chat-bubble">
                  <template v-if="entry.message.attachment?.kind === 'image'">
                    <img
                      v-if="chat.links.value[entry.message.id]"
                      :src="chat.links.value[entry.message.id]"
                      :alt="entry.message.attachment.name"
                      @load="chat.onMediaLoad"
                      @click="chat.open(entry.message)"
                    />
                    <span v-else class="chat-shade" :title="entry.message.attachment.name"></span>
                  </template>

                  <button
                    v-else-if="entry.message.attachment"
                    type="button"
                    class="chat-file"
                    @click="chat.open(entry.message)"
                  >
                    <AppIcon name="file-text" />
                    <span>
                      <b>{{ entry.message.attachment.name }}</b>
                      <small>{{ sizeOf(entry.message.attachment.sizeBytes) }}</small>
                    </span>
                  </button>

                  <p v-if="entry.message.body" style="margin: 0">{{ entry.message.body }}</p>
                </div>

                <p class="chat-at">
                  <time :datetime="entry.message.createdAt">
                    {{ timeOf(entry.message.createdAt) }}
                  </time>
                </p>
              </div>
            </div>
          </div>
        </template>
      </div>

      <p v-if="chat.sendError.value" class="chat-note" role="alert" style="color: var(--c-danger)">
        {{ chat.sendError.value }}
      </p>
      <p v-else-if="chat.uploadPct.value !== null" class="chat-note">
        {{ t('messages.uploading', { pct: chat.uploadPct.value }) }}
      </p>
      <p v-else class="chat-note">
        {{ t('messages.privacyNote') }}
        <RouterLink class="link" :to="`/${locale()}/account/messages`">
          {{ t('messages.dockOpenFull') }}
        </RouterLink>
      </p>

      <div class="chat-compose">
        <input
          ref="fileInput"
          type="file"
          hidden
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
          @change="onPick"
        />
        <button
          type="button"
          class="chat-clip"
          :disabled="chat.uploadPct.value !== null"
          :aria-label="t('messages.attach')"
          @click="fileInput?.click()"
        >
          <AppIcon name="paperclip" />
        </button>

        <label class="sr-only" for="chat-dock-draft">{{ t('messages.placeholder') }}</label>
        <textarea
          id="chat-dock-draft"
          ref="composer"
          v-model="chat.draft.value"
          rows="1"
          :placeholder="t('messages.placeholder')"
          @keydown="onKey"
        ></textarea>

        <button
          type="button"
          class="btn btn--primary btn--sm"
          :disabled="chat.sending.value || !chat.draft.value.trim()"
          @click="chat.say()"
        >
          {{ chat.sending.value ? t('messages.sending') : t('messages.send') }}
        </button>
      </div>
    </div>
  </div>
</template>
