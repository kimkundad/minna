import { defineStore } from 'pinia'
import { ref } from 'vue'
import { chat } from '@/lib/api'

/**
 * The floating conversation, raised from wherever somebody got stuck.
 *
 * A store rather than a prop, for the same reason the sign-in dialog is one:
 * it is mounted once in the shell, and a lesson, a course page or anything
 * else can raise it without the pages in between knowing it exists.
 *
 * Opening from a lesson carries the lesson with it. Being there is already the
 * answer to "what is this about", so the panel sends that line on open and
 * leaves the learner with one thing to do — write the question.
 */
export const useChatDockStore = defineStore('chatDock', () => {
  const isOpen = ref(false)
  /** Rolled down to the title bar. Stays in the conversation, out of the way. */
  const isMinimised = ref(false)
  /** Said on open, once. The panel clears it as soon as it has it. */
  const pending = ref('')

  /**
   * Messages waiting, for the badge on the header's chat button.
   *
   * Kept here rather than in the panel because the badge has to be right
   * before the panel has ever been opened — that is the whole point of it.
   */
  const unread = ref(0)

  async function refreshUnread(): Promise<void> {
    try {
      unread.value = (await chat.unreadCount()).data.unread
    } catch {
      // A badge is not worth an error on the page. Leave the last number.
    }
  }

  /** Nothing is waiting once they are looking at it. */
  function clearUnread(): void {
    unread.value = 0
  }

  function open(context = ''): void {
    if (context) pending.value = context
    isMinimised.value = false
    isOpen.value = true
    // Reading them is what the panel does next, so the badge goes now rather
    // than a request later.
    clearUnread()
  }

  function takePending(): string {
    const text = pending.value
    pending.value = ''
    return text
  }

  function toggleMinimised(): void {
    isMinimised.value = !isMinimised.value
  }

  /**
   * Closed, and the conversation with it.
   *
   * Nothing is lost: the messages are on the server, and reopening reads them
   * back. What closing ends is the live stream, which there is no reason to
   * hold open behind a panel nobody can see.
   */
  function close(): void {
    isOpen.value = false
    isMinimised.value = false
    pending.value = ''
  }

  return {
    isOpen,
    isMinimised,
    pending,
    unread,
    open,
    takePending,
    toggleMinimised,
    close,
    refreshUnread,
    clearUnread,
  }
})
