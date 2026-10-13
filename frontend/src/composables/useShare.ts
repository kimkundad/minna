import { computed, onBeforeUnmount, ref, type Ref } from 'vue'

/**
 * Passing a page along.
 *
 * Four ways out: LINE, Facebook, X, and the address itself. The first three
 * are links a browser follows; the fourth is a button, because copying is
 * something that happens here rather than somewhere else.
 *
 * Written once and used by the article page and the course page. It was the
 * article's alone, and the course page would otherwise have got a second copy
 * — which is how one of them ends up missing a service, or keeps a label the
 * other has changed.
 *
 * What the shared link then *looks like* is not decided here. These services
 * fetch the page themselves and read its tags, and this site is a single-page
 * app whose tags arrive empty — so nginx sends crawlers to the API instead
 * (`api/src/modules/content/og.routes.ts`). Nothing on this side can affect
 * the preview; the buttons only hand over the address.
 */
export interface ShareLink {
  key: 'line' | 'facebook' | 'x'
  label: string
  icon: string
  href: string
}

export function useShare(title: Ref<string | undefined>) {
  /**
   * The address as the reader has it, including the language in the path. A
   * link shared from the English page should open in English.
   */
  const shareUrl = computed(() => (typeof window === 'undefined' ? '' : window.location.href))

  const copied = ref(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  const shareLinks = computed<ShareLink[]>(() => {
    const url = encodeURIComponent(shareUrl.value)
    const text = encodeURIComponent(title.value ?? '')
    return [
      // LINE first: it is how most of this site's readers pass a link along.
      {
        key: 'line',
        label: 'LINE',
        icon: 'message',
        href: `https://social-plugins.line.me/lineit/share?url=${url}`,
      },
      {
        key: 'facebook',
        label: 'Facebook',
        icon: 'facebook',
        href: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      },
      {
        key: 'x',
        label: 'X',
        icon: 'share',
        href: `https://x.com/intent/post?url=${url}&text=${text}`,
      },
    ]
  })

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareUrl.value)
      copied.value = true
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => (copied.value = false), 2000)
    } catch {
      // Denied, or no clipboard at all. The address bar still has the link,
      // and saying "could not copy" helps nobody do anything about it.
    }
  }

  onBeforeUnmount(() => clearTimeout(copyTimer))

  return { shareUrl, shareLinks, copied, copyLink }
}
